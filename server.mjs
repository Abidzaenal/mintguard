// MintGuard agent server — Node 22, standard library only (node:http).
// No npm dependencies, no secrets, no wallet connection.
//
// Routes:
//   GET  /            -> demo web UI
//   GET  /health      -> { status, chainId, uptimeSeconds, version }
//   GET  /api/demo    -> built-in demo cases (label, input, expectation)
//   POST /api/screen  -> { input } or { address } or { txHash }
//                        -> verdict + score + findings + metadata + limits
//
// Behaviour contract:
//   - Bad/invalid input -> HTTP 200 with verdict BLOCK and a clear finding
//     (the API never crashes on user input; malformed JSON -> 400).
//   - Upstream (BSC RPC / Sourcify) unreachable -> fail closed with
//     verdict CAUTION and an explicit finding, never ALLOW.
//   - In-memory result cache (TTL 180 s) + per-IP rate limit (30/min).

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { screenInput, classifyInput } from "./lib/screen.mjs";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const VERSION = "0.1.0";
const CACHE_TTL_MS = 180_000;
const RATE_LIMIT_PER_MIN = 30;
const MAX_BODY_BYTES = 10_240;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cache = new Map(); // key -> { at, result }
const rate = new Map(); // ip -> { windowStart, count }

function log(...a) {
  console.error(new Date().toISOString(), ...a);
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || now - entry.windowStart >= 60_000) {
    rate.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_PER_MIN;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleScreen(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  if (rateLimited(ip)) {
    return sendJson(res, 429, {
      error: "rate_limited",
      message: `Too many requests from this IP (${RATE_LIMIT_PER_MIN}/min). Please wait a moment and try again.`,
    });
  }
  let bodyText;
  try {
    bodyText = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: "bad_body", message: String(e.message || e) });
  }
  let payload;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {
    return sendJson(res, 400, {
      error: "bad_json",
      message: "Request body must be valid JSON, e.g. {\"input\": \"0x...\"}",
    });
  }
  const raw = (payload.input ?? payload.address ?? payload.txHash ?? "").toString();
  const kind = classifyInput(raw).kind;
  if (kind === "invalid" && raw.trim() === "") {
    return sendJson(res, 400, {
      error: "missing_input",
      message: "Provide \"input\": a BSC contract address (0x + 40 hex) or a transaction hash (0x + 64 hex).",
    });
  }
  const key = raw.trim().toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return sendJson(res, 200, { ...hit.result, cached: true });
  }
  let result;
  try {
    result = await screenInput(fetch, raw);
  } catch (e) {
    // screenInput is designed not to throw; this is the last-resort guard.
    log("screenInput threw:", e);
    result = {
      input: raw,
      kind: "invalid",
      verdict: "CAUTION",
      score: 50,
      failClosed: true,
      findings: [
        {
          id: "internal-error",
          label: "Internal screening error (fail closed)",
          severity: "high",
          points: 50,
          detail: "MintGuard hit an unexpected error and fails closed instead of guessing.",
          evidence: "internal",
        },
      ],
      metadata: { chainId: 56 },
      limits: [],
      durationMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }
  cache.set(key, { at: now, result });
  if (cache.size > 500) {
    for (const [k, v] of cache) {
      if (now - v.at >= CACHE_TTL_MS) cache.delete(k);
    }
  }
  return sendJson(res, 200, { ...result, cached: false });
}

let demoCases = [];
try {
  demoCases = JSON.parse(await readFile(path.join(__dirname, "demo-cases.json"), "utf8"));
} catch (e) {
  log("demo-cases.json not loaded yet:", e.message);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, {
        status: "ok",
        service: "mintguard",
        version: VERSION,
        chainId: 56,
        chain: "BNB Smart Chain",
        uptimeSeconds: Math.floor(process.uptime()),
        time: new Date().toISOString(),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/demo") {
      return sendJson(res, 200, { demoCases });
    }
    if (req.method === "POST" && url.pathname === "/api/screen") {
      return await handleScreen(req, res);
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = await readFile(path.join(__dirname, "public", "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    return sendJson(res, 404, { error: "not_found", message: "Use GET / or POST /api/screen" });
  } catch (e) {
    log("request error:", e);
    if (!res.headersSent) return sendJson(res, 500, { error: "internal", message: "Unexpected server error" });
  }
});

server.listen(PORT, HOST, () => {
  log(`MintGuard listening on http://${HOST}:${PORT} (chain 56, version ${VERSION})`);
});

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
