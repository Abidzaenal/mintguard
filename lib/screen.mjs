// MintGuard core screening logic — pure JavaScript, no Node.js APIs.
// Shared by the Node server (server.mjs) and the standalone static demo
// (docs/index.html embeds this file). All upstream calls go through an
// injected fetch implementation so the same code can run in a browser.
//
// Sources used (public, keyless only):
//  - BSC public JSON-RPC (eth_getCode / eth_call / eth_getTransaction /
//    eth_getTransactionReceipt / eth_getStorageAt)
//  - Sourcify v2 API (contract verification + source code)
// No simulation, no private data, no paid API.

export const CHAIN_ID = 56;
export const CHAIN_NAME = "BNB Smart Chain";

export const RPC_ENDPOINTS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed1.ninicoin.io",
];

export const SOURCIFY_BASE = "https://sourcify.dev/server";

const FETCH_TIMEOUT_MS = 8000;
const MAX_UINT256 = (1n << 256n) - 1n;

// Function selectors (4 bytes) we look for in deployed bytecode when the
// source is NOT verified. A selector in the dispatcher only proves a
// function with that signature exists; it says nothing about what it does.
// Every such finding is labelled as unverified/uncertain.
const SELECTORS = {
  mint: "40c10f19", // mint(address,uint256)
  mintTo: "6a627842", // mint(address,uint256) (older overload slot, same sig hash is 40c10f19; keep as alias list)
  owner: "8da5cb5b",
  pause: "8456cb59",
  paused: "5c975abb",
  unpause: "3f4ba83a",
  blacklist: "0ad2fa23", // blacklist(address) — one common signature
  setFee: "44b9e1bf", // setFee(uint256) — one common signature
  setTax: "c8c69f5e", // placeholder: not all tax setters share a selector
  approve: "095ea7b3", // approve(address,uint256)
  transfer: "a9059cbb",
  transferFrom: "23b872dd",
};

export const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export function isAddress(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}
export function isTxHash(s) {
  return typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s.trim());
}

export function classifyInput(raw) {
  const s = String(raw || "").trim();
  if (isAddress(s)) return { kind: "address", value: s };
  if (isTxHash(s)) return { kind: "tx", value: s };
  return { kind: "invalid", value: s };
}

function hexToBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

// Decode an eth_call string return (dynamic string) or a bytes32 return.
export function decodeAbiString(hex) {
  if (!hex || hex === "0x" || !hex.startsWith("0x")) return null;
  try {
    const bytes = new Uint8Array(
      hex
        .slice(2)
        .match(/.{2}/g)
        .map((b) => parseInt(b, 16))
    );
    if (bytes.length >= 96) {
      const len = Number(
        bytes.slice(32, 64).reduce((a, b) => (a << 8n) | BigInt(b), 0n)
      );
      if (len >= 0 && len <= bytes.length - 64) {
        return new TextDecoder().decode(bytes.slice(64, 64 + len)).replace(/\0+$/, "");
      }
    }
    // bytes32-style fixed string
    return new TextDecoder().decode(bytes).replace(/\0+$/, "") || null;
  } catch {
    return null;
  }
}

export function decodeAbiAddress(hex) {
  if (!hex || hex.length < 66) return null;
  const addr = "0x" + hex.slice(-40);
  return isAddress(addr) ? addr : null;
}

export function decodeAbiBool(hex) {
  if (!hex) return null;
  return hexToBigInt(hex) !== 0n;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...(options || {}), signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function rpcCall(fetchImpl, method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id: Math.floor(Math.random() * 1e9) });
  let lastError = null;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(fetchImpl, endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const json = await res.json();
      if (json && json.error) throw new Error(json.error.message || "rpc error");
      if (!json || json.result === undefined) throw new Error("empty rpc result");
      return json.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("all RPC endpoints failed");
}

const ethCall = (fetchImpl, to, data) =>
  rpcCall(fetchImpl, "eth_call", [{ to, data }, "latest"]);

// ---------------------------------------------------------------------------
// Sourcify v2
// ---------------------------------------------------------------------------
export async function sourcifyCheck(fetchImpl, address) {
  // Sourcify API v2. Default response: { match, creationMatch, runtimeMatch,
  // verifiedAt, ... } where match is "match" | "partial" | null.
  // ?fields=sources adds { sources: { "File.sol": { content } } }.
  const url = `${SOURCIFY_BASE}/v2/contract/${CHAIN_ID}/${address}?fields=sources`;
  try {
    const res = await fetchWithTimeout(fetchImpl, url, {
      headers: { Accept: "application/json" },
    }, 10000);
    if (res.status === 404) return { verified: false, status: 404, error: "not found" };
    if (!res.ok) return { verified: false, status: res.status, error: `http ${res.status}` };
    const json = await res.json();
    const match = (json && (json.match || json.runtimeMatch || json.creationMatch)) || null;
    if (match !== "match" && match !== "partial") {
      return { verified: false, status: res.status, match, error: "no match" };
    }
    const sources = (json && json.sources) || {};
    const entries = Object.entries(sources)
      .map(([path, f]) => ({ path, content: (f && f.content) || "" }))
      .sort((a, b) => b.content.length - a.content.length);
    const mainSource = entries[0] || null;
    return {
      verified: true,
      match,
      name: mainSource ? mainSource.path.replace(/\.sol$/i, "").split("/").pop() : null,
      contractPath: mainSource ? mainSource.path : null,
      sources,
      mainSource,
      verifiedAt: json.verifiedAt || null,
    };
  } catch (e) {
    return { verified: false, error: `sourcify unreachable: ${String(e && e.message || e)}` };
  }
}

// ---------------------------------------------------------------------------
// honeypot.is simulation (public, keyless). Only meaningful for ERC-20-like
// tokens WITH a DEX pair. Best-effort: any failure means "not checked", never
// a penalty.
// ---------------------------------------------------------------------------
export async function honeypotCheck(fetchImpl, address) {
  const url = `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${CHAIN_ID}`;
  try {
    const res = await fetchWithTimeout(fetchImpl, url, {
      headers: { Accept: "application/json" },
    }, 10000);
    if (res.status === 404) {
      return { checked: true, applicable: false, reason: "no DEX pair — simulation not applicable" };
    }
    if (!res.ok) return { checked: false, reason: `http ${res.status}` };
    const json = await res.json();
    const hp = json && json.honeypotResult;
    const summary = json && json.summary;
    const sim = json && json.simulationResult;
    return {
      checked: true,
      applicable: true,
      isHoneypot: hp ? !!hp.isHoneypot : null,
      honeypotReason: hp ? hp.honeypotReason || null : null,
      simulationSuccess: json ? json.simulationSuccess : null,
      risk: summary ? summary.risk : null,
      riskLevel: summary ? summary.riskLevel : null,
      flags: summary && Array.isArray(summary.flags)
        ? summary.flags.map((f) => (typeof f === "string" ? f : f.flag || f.description || "")).filter(Boolean)
        : [],
      buyTax: sim ? sim.buyTax : null,
      sellTax: sim ? sim.sellTax : null,
      transferTax: sim ? sim.transferTax : null,
      token: json && json.token ? { name: json.token.name, symbol: json.token.symbol, holders: json.token.totalHolders } : null,
    };
  } catch (e) {
    return { checked: false, reason: `unreachable: ${String(e && e.message || e)}` };
  }
}

// ---------------------------------------------------------------------------
// Source-pattern scan (verified contracts only). Every pattern is a
// heuristic: it flags that the function exists, not that it is malicious.
// ---------------------------------------------------------------------------
const SOURCE_PATTERNS = [
  {
    id: "mint",
    re: /\bmint\s*\(/i,
    label: "Owner-mintable supply",
    severity: "high",
    points: 35,
    detail:
      "Contract source contains a mint() function. The owner (or a minter role) can create new tokens. This is normal for NFT mints and many tokens, but it means supply is not fixed.",
  },
  {
    id: "blacklist",
    re: /\b(blacklist|blocklist|denyList|isBlacklisted)\b/i,
    label: "Blacklist / trading block",
    severity: "high",
    points: 25,
    detail:
      "Source references a blacklist or blocklist. The owner may be able to block addresses from trading or transferring.",
  },
  {
    id: "fee-tax",
    re: /\b(setFee|setTax|setBuyFee|setSellFee|_taxFee|marketingFee|liquidityFee)\b/i,
    label: "Adjustable fee / tax",
    severity: "high",
    points: 25,
    detail:
      "Source contains fee/tax setters. The owner may be able to change buy/sell taxes, which can make a token unsellable or heavily taxed.",
  },
  {
    id: "pause",
    re: /\b(pause\s*\(|onlyOwner[^\n]{0,80}pause|whenNotPaused)\b/i,
    label: "Pausable by owner",
    severity: "medium",
    points: 10,
    detail:
      "Contract can be paused. Transfers can be frozen by the owner while paused.",
  },
  {
    id: "max-tx",
    re: /\b(setMaxTxAmount|maxTxAmount|setMaxWallet|maxWalletAmount)\b/i,
    label: "Max transaction / wallet limits",
    severity: "medium",
    points: 10,
    detail:
      "Source contains max-transaction or max-wallet limits that the owner can change.",
  },
  {
    id: "proxy-admin",
    re: /\b(upgradeTo|upgradeToAndCall|_authorizeUpgrade)\b/i,
    label: "Upgradeable (proxy admin)",
    severity: "medium",
    points: 10,
    detail:
      "Source contains an upgrade function. The logic contract can be replaced by the proxy admin.",
  },
  {
    id: "ownership",
    re: /\b(onlyOwner|Ownable|owner\s*\(\s*\))/i,
    label: "Owner-controlled functions",
    severity: "info",
    points: 0,
    detail:
      "Contract has owner-only functions. Ownership itself is normal; what matters is which powers the owner holds (see other findings).",
  },
];

export function scanSource(sourceText) {
  const findings = [];
  for (const p of SOURCE_PATTERNS) {
    if (p.re.test(sourceText)) {
      findings.push({
        id: `src:${p.id}`,
        label: p.label,
        severity: p.severity,
        points: p.points,
        detail: p.detail,
        evidence: "source code (verified on Sourcify)",
      });
    }
  }
  return findings;
}

// Bytecode selector presence (unverified contracts only). Heuristic.
export function scanBytecodeSelectors(code) {
  const findings = [];
  if (!code || code === "0x") return findings;
  const flat = code.toLowerCase();
  const has = (sel) => flat.includes(sel);
  if (has(SELECTORS.mint)) {
    findings.push({
      id: "byte:mint",
      label: "Possible mint function (bytecode)",
      severity: "medium",
      points: 15,
      detail:
        "Deployed bytecode contains the mint(address,uint256) selector. Source is NOT verified, so the behaviour cannot be confirmed — this is a flag, not proof.",
      evidence: "bytecode selector scan (source unverified)",
    });
  }
  if (has(SELECTORS.blacklist)) {
    findings.push({
      id: "byte:blacklist",
      label: "Possible blacklist function (bytecode)",
      severity: "medium",
      points: 10,
      detail:
        "Bytecode contains a blacklist(address) selector. Source is NOT verified, so this cannot be confirmed.",
      evidence: "bytecode selector scan (source unverified)",
    });
  }
  if (has(SELECTORS.pause) || has(SELECTORS.paused)) {
    findings.push({
      id: "byte:pausable",
      label: "Possibly pausable (bytecode)",
      severity: "info",
      points: 5,
      detail: "Bytecode contains pause/paused selectors. Source is NOT verified.",
      evidence: "bytecode selector scan (source unverified)",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main screening
// ---------------------------------------------------------------------------
function scoreToVerdict(score) {
  if (score >= 65) return "BLOCK";
  if (score >= 30) return "CAUTION";
  return "ALLOW";
}

export async function screenAddress(fetchImpl, address, cache) {
  const started = Date.now();
  const findings = [];
  let score = 0;
  const add = (f) => {
    findings.push(f);
    score += f.points || 0;
  };
  const meta = { address, chainId: CHAIN_ID };

  // 1. Code present?
  let code;
  try {
    code = await rpcCall(fetchImpl, "eth_getCode", [address, "latest"]);
  } catch (e) {
    return failClosed(address, `BSC RPC unreachable (${String(e && e.message || e)})`, started);
  }
  if (!code || code === "0x") {
    return {
      input: address,
      kind: "address",
      verdict: "BLOCK",
      score: 100,
      failClosed: true,
      findings: [
        {
          id: "no-code",
          label: "No contract code at this address",
          severity: "high",
          points: 100,
          detail:
            "This address holds no contract code — it is an externally owned account (EOA) or an empty address. MintGuard cannot screen it as a contract, so it fails closed.",
          evidence: "eth_getCode (BSC RPC)",
        },
      ],
      metadata: { address, chainId: CHAIN_ID, isContract: false },
      limits: LIMITS,
      durationMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  }
  meta.isContract = true;
  meta.codeBytes = (code.length - 2) / 2;

  // 2. Token metadata (best effort; NFTs and custom contracts may not respond)
  try {
    const [nm, sy, dc, ts] = await Promise.all([
      ethCall(fetchImpl, address, "0x06fdde03").catch(() => null),
      ethCall(fetchImpl, address, "0x95d89b41").catch(() => null),
      ethCall(fetchImpl, address, "0x313ce567").catch(() => null),
      ethCall(fetchImpl, address, "0x18160ddd").catch(() => null),
    ]);
    const name = decodeAbiString(nm);
    const symbol = decodeAbiString(sy);
    const decimals = dc && dc.length > 2 ? Number(hexToBigInt(dc)) : null;
    const totalSupply = ts ? hexToBigInt(ts).toString() : null;
    meta.name = name;
    meta.symbol = symbol;
    meta.decimals = decimals;
    meta.totalSupply = totalSupply;
  } catch {
    // metadata is best-effort only
  }

  // 2b. Honeypot simulation (ERC-20-like tokens only, best effort).
  // A confirmed honeypot is the strongest single signal MintGuard has.
  if (meta.decimals !== null && meta.decimals !== undefined) {
    const hp = await honeypotCheck(fetchImpl, address);
    meta.honeypot = hp;
    // honeypot.is has known false positives: its headline label has flagged
    // legitimate tokens with transfer restrictions (e.g. Binance-peg WBTC).
    // So MintGuard trusts the SIMULATION outcome, not the label alone:
    // a failed sell simulation or a punitive sell tax is strong evidence;
    // a "honeypot" label on a simulation that succeeded with low taxes is
    // only a warning, and says so in plain language.
    if (hp.checked && hp.applicable && hp.isHoneypot === true) {
      const sellFails = hp.simulationSuccess === false;
      const punitiveTax = typeof hp.sellTax === "number" && hp.sellTax >= 50;
      if (sellFails || punitiveTax) {
        add({
          id: "honeypot",
          label: "Confirmed honeypot — selling fails in simulation",
          severity: "high",
          points: 40,
          detail:
            `A buy/sell simulation against the token's DEX pair shows it cannot be sold${punitiveTax ? ` (sell tax ${hp.sellTax}%)` : " (sell simulation failed)"}. This is the classic honeypot pattern.`,
          evidence: "honeypot.is simulation API",
        });
      } else {
        add({
          id: "honeypot-flag",
          label: "Third-party simulator flags this token (possible false positive)",
          severity: "medium",
          points: 15,
          detail:
            `honeypot.is labels this token a honeypot (${hp.honeypotReason || "no reason given"}; flags: ${(hp.flags || []).join(", ") || "none"}), BUT its own sell simulation succeeded with sell tax ${hp.sellTax ?? "?"}%. This pattern also occurs on legitimate tokens with transfer restrictions. Treat it as a warning and verify independently — MintGuard does not call it a honeypot on this evidence alone.`,
          evidence: "honeypot.is simulation API",
        });
      }
    } else if (hp.checked && hp.applicable && (hp.riskLevel >= 4 || hp.risk === "high")) {
      add({
        id: "honeypot-high-risk",
        label: `High-risk token (honeypot.is risk ${hp.risk || hp.riskLevel})`,
        severity: "high",
        points: 20,
        detail: `Sell simulation flags this token as high risk (risk level ${hp.riskLevel}, buy tax ${hp.buyTax}%, sell tax ${hp.sellTax}%).`,
        evidence: "honeypot.is simulation API",
      });
    } else if (hp.checked && hp.applicable && hp.isHoneypot === false) {
      add({
        id: "honeypot-clean",
        label: "Sell simulation passes (not a honeypot)",
        severity: "info",
        points: -5,
        detail: `Buy/sell simulation succeeds; sell tax ${hp.sellTax ?? "?"}%, buy tax ${hp.buyTax ?? "?"}%. Simulation is not a guarantee — taxes can change.`,
        evidence: "honeypot.is simulation API",
      });
    } else if (hp.checked && !hp.applicable) {
      findings.push({
        id: "honeypot-na",
        label: "No DEX pair — honeypot simulation not applicable",
        severity: "info",
        points: 0,
        detail:
          "This token has no liquidity pair on a DEX, so a buy/sell simulation cannot run. That is normal for NFT/mint contracts and new tokens.",
        evidence: "honeypot.is",
      });
    }
    // If honeypot.is is unreachable, no finding: "not checked" is recorded
    // in metadata.honeypot and never counts as a penalty.
  }

  // 3. Owner + paused (best effort)
  try {
    const ownerHex = await ethCall(fetchImpl, address, "0x8da5cb5b").catch(() => null);
    const owner = decodeAbiAddress(ownerHex);
    if (owner) meta.owner = owner;
  } catch {}
  try {
    const pausedHex = await ethCall(fetchImpl, address, "0x5c975abb").catch(() => null);
    const paused = decodeAbiBool(pausedHex);
    if (paused !== null) meta.paused = paused;
  } catch {}

  // 4. Proxy detection (EIP-1967 implementation slot)
  let implementation = null;
  try {
    const slot = await rpcCall(fetchImpl, "eth_getStorageAt", [address, EIP1967_IMPL_SLOT, "latest"]);
    const impl = decodeAbiAddress(slot);
    if (impl && impl !== "0x0000000000000000000000000000000000000000") {
      implementation = impl;
      meta.implementation = impl;
    }
  } catch {}

  // 5. Sourcify verification + source scan
  const sourcify = await sourcifyCheck(fetchImpl, address);
  meta.verified = !!sourcify.verified;
  if (sourcify.verified) {
    meta.verificationMatch = sourcify.match || null;
    meta.contractName = sourcify.name || null;
    add({
      id: "verified",
      label: "Source code verified on Sourcify",
      severity: "info",
      points: -10,
      detail: `Contract source is published and matches the deployed bytecode (${sourcify.match || "match"}). Anyone can read what it does.`,
      evidence: "Sourcify v2 API",
    });
    const srcText = sourcify.mainSource ? sourcify.mainSource.content : "";
    if (srcText) {
      for (const f of scanSource(srcText)) add(f);
    }
  } else {
    add({
      id: "unverified",
      label: "Source code NOT verified",
      severity: "high",
      points: 30,
      detail:
        "No matching source on Sourcify, so what this contract does cannot be audited from source. MintGuard will not say ALLOW for a contract it cannot read, so this alone puts it in CAUTION.",
      evidence: "Sourcify v2 API",
    });
    for (const f of scanBytecodeSelectors(code)) add(f);
  }

  // 6. Proxy finding (needs Sourcify status of the implementation)
  if (implementation) {
    let implVerified = false;
    try {
      const implCheck = await sourcifyCheck(fetchImpl, implementation);
      implVerified = !!implCheck.verified;
    } catch {}
    if (implVerified) {
      add({
        id: "proxy-verified-impl",
        label: "Proxy with verified implementation",
        severity: "medium",
        points: 10,
        detail:
          "This is an EIP-1967 proxy. Its implementation contract is verified, but the proxy admin can still upgrade the logic.",
        evidence: "eth_getStorageAt (EIP-1967 slot) + Sourcify",
      });
    } else {
      add({
        id: "proxy-unverified-impl",
        label: "Proxy with UNVERIFIED implementation",
        severity: "high",
        points: 20,
        detail:
          "This is an EIP-1967 proxy whose implementation contract is NOT verified. The code that actually runs cannot be audited.",
        evidence: "eth_getStorageAt (EIP-1967 slot) + Sourcify",
      });
    }
  }

  // 7. Currently paused?
  if (meta.paused === true) {
    add({
      id: "paused-now",
      label: "Contract is currently paused",
      severity: "high",
      points: 15,
      detail: "The contract reports paused = true right now. Transfers/mints are frozen until unpaused.",
      evidence: "eth_call paused()",
    });
  }

  // Final score is the sum of finding points, floored at 0 (trust findings
  // like "verified" carry negative points and offset risk points).
  score = Math.max(0, score);
  const verdict = scoreToVerdict(score);
  return {
    input: address,
    kind: "address",
    verdict,
    score,
    findings,
    metadata: meta,
    limits: LIMITS,
    durationMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  };
}

function failClosed(input, reason, started) {
  return {
    input,
    kind: "address",
    verdict: "CAUTION",
    score: 50,
    failClosed: true,
    findings: [
      {
        id: "upstream-down",
        label: "Could not verify — upstream unreachable",
        severity: "high",
        points: 50,
        detail: `${reason}. MintGuard fails closed: it cannot confirm this contract is safe, so it will not say ALLOW.`,
        evidence: "upstream error",
      },
    ],
    metadata: { address: input, chainId: CHAIN_ID },
    limits: LIMITS,
    durationMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  };
}

export const LIMITS = [
  "No transaction simulation: MintGuard does not run your transaction against chain state, so it cannot detect honeypots that only trigger on sell, or slippage/tax behaviour at execution time.",
  "No off-chain reputation: it checks code and on-chain data only. A verified-looking contract can still be a scam, and an unverified one can be legitimate.",
  "Bytecode selector checks are heuristics: a selector proves a function signature exists, not what it does.",
  "Sourcify coverage: a contract verified on BscScan but not on Sourcify shows as unverified here.",
  "No private data is read and no wallet is ever connected.",
];

const APPROVE_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925".toLowerCase();

export async function screenTransaction(fetchImpl, txHash) {
  const started = Date.now();
  let tx;
  let receipt = null;
  try {
    tx = await rpcCall(fetchImpl, "eth_getTransactionByHash", [txHash]);
  } catch (e) {
    return failClosed(txHash, `BSC RPC unreachable (${String(e && e.message || e)})`, started);
  }
  if (!tx) {
    return {
      input: txHash,
      kind: "tx",
      verdict: "BLOCK",
      score: 100,
      failClosed: true,
      findings: [
        {
          id: "tx-not-found",
          label: "Transaction not found on BSC",
          severity: "high",
          points: 100,
          detail: "No transaction with this hash exists on BNB Smart Chain (yet). Check the hash and network.",
          evidence: "eth_getTransactionByHash (BSC RPC)",
        },
      ],
      metadata: { txHash, chainId: CHAIN_ID },
      limits: LIMITS,
      durationMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
    };
  }
  try {
    receipt = await rpcCall(fetchImpl, "eth_getTransactionReceipt", [txHash]).catch(() => null);
  } catch {}

  const findings = [];
  let score = 0;
  const add = (f) => {
    findings.push(f);
    score += f.points || 0;
  };

  const to = (tx.to || "").toLowerCase();
  const inputData = (tx.input || "0x").toLowerCase();
  const meta = {
    txHash,
    chainId: CHAIN_ID,
    from: tx.from || null,
    to: tx.to || null,
    valueWei: tx.value ? hexToBigInt(tx.value).toString() : "0",
    status: receipt ? (receipt.status === "0x1" ? "success" : "failed") : "pending/unknown",
  };

  if (!tx.to) {
    add({
      id: "tx-contract-creation",
      label: "Contract creation transaction",
      severity: "medium",
      points: 20,
      detail: "This transaction deploys a new contract (no recipient). There is nothing to screen as a target.",
      evidence: "eth_getTransactionByHash",
    });
  } else {
    // Approve call inside the tx input?
    if (inputData.startsWith("0x095ea7b3") && inputData.length >= 138) {
      const spender = "0x" + inputData.slice(34, 74);
      const amount = hexToBigInt("0x" + inputData.slice(74, 138));
      meta.approval = { token: tx.to, spender, amount: amount.toString(), unlimited: amount === MAX_UINT256 };
      if (amount === MAX_UINT256) {
        add({
          id: "tx-unlimited-approval",
          label: "Unlimited token approval in this transaction",
          severity: "high",
          points: 20,
          detail: `This transaction approves spender ${spender} for an unlimited amount (2^256-1). Unlimited approvals let the spender move all of your tokens of this type until you revoke it.`,
          evidence: "tx input data (approve selector)",
        });
      } else {
        add({
          id: "tx-limited-approval",
          label: "Limited token approval in this transaction",
          severity: "info",
          points: 0,
          detail: `This transaction approves ${spender} for a limited amount.`,
          evidence: "tx input data (approve selector)",
        });
      }
    }
    // Screen the target contract itself — unless it is an EOA, in which
    // case this is a plain transfer and there is no contract to screen.
    const targetCode = await rpcCall(fetchImpl, "eth_getCode", [tx.to, "latest"]).catch(() => null);
    if (targetCode === "0x" || targetCode === null) {
      const hasCalldata = inputData && inputData !== "0x";
      if (hasCalldata) {
        add({
          id: "tx-calldata-to-eoa",
          label: "Call data sent to an account with no code",
          severity: "medium",
          points: 10,
          detail:
            "This transaction carries call data but its recipient holds no contract code — the data will not execute. That is unusual and worth double-checking before signing a similar transaction.",
          evidence: "eth_getCode (BSC RPC)",
        });
      } else {
        add({
          id: "tx-plain-transfer",
          label: "Plain BNB transfer to an externally owned account",
          severity: "info",
          points: 0,
          detail:
            "The recipient holds no contract code, so no contract runs in this transaction. The only risk is sending BNB to the wrong address.",
          evidence: "eth_getCode (BSC RPC)",
        });
      }
      meta.target = { address: tx.to, isContract: false };
      meta.targetVerdict = "ALLOW";
      meta.targetScore = 0;
    } else {
      const target = await screenAddress(fetchImpl, tx.to, null);
      findings.push(...target.findings.map((f) => ({ ...f, id: `target:${f.id}` })));
      score += target.score;
      meta.target = target.metadata;
      meta.targetVerdict = target.verdict;
      meta.targetScore = target.score;
    }
  }

  // Approvals emitted in logs (any Approval events in this tx)
  if (receipt && Array.isArray(receipt.logs)) {
    const approvals = receipt.logs.filter(
      (l) => l.topics && l.topics[0] && l.topics[0].toLowerCase() === APPROVE_TOPIC
    );
    if (approvals.length > 0) {
      meta.approvalsEmitted = approvals.length;
      add({
        id: "tx-approvals-emitted",
        label: `${approvals.length} Approval event(s) emitted`,
        severity: "info",
        points: 0,
        detail: "This transaction emitted Approval event(s). Check the spender and amount in the report above.",
        evidence: "eth_getTransactionReceipt logs",
      });
    }
  }

  score = Math.max(0, score);
  const verdict = scoreToVerdict(score);
  return {
    input: txHash,
    kind: "tx",
    verdict,
    score,
    findings,
    metadata: meta,
    limits: LIMITS,
    durationMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  };
}

export async function screenInput(fetchImpl, rawInput) {
  const c = classifyInput(rawInput);
  if (c.kind === "address") return screenAddress(fetchImpl, c.value);
  if (c.kind === "tx") return screenTransaction(fetchImpl, c.value);
  return {
    input: String(rawInput || ""),
    kind: "invalid",
    verdict: "BLOCK",
    score: 100,
    failClosed: true,
    findings: [
      {
        id: "invalid-input",
        label: "Not a valid address or transaction hash",
        severity: "high",
        points: 100,
        detail:
          "MintGuard accepts a BSC contract address (0x + 40 hex characters) or a transaction hash (0x + 64 hex characters). This input is neither.",
        evidence: "input validation",
      },
    ],
    metadata: { chainId: CHAIN_ID },
    limits: LIMITS,
    durationMs: 0,
    checkedAt: new Date().toISOString(),
  };
}
