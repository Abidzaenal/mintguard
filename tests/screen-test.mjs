// MintGuard live test: screens real BSC mainnet contracts + real transactions.
// Writes tests/results.json (raw) — TEST-RESULTS.md is generated from it.
import { screenInput } from "../lib/screen.mjs";
import { writeFile } from "node:fs/promises";

const RPC = "https://bsc-dataseed.bnbchain.org";
async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  const j = await res.json();
  return j.result;
}

const ADDRESSES = [
  ["CAKE (PancakeSwap Token)", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"],
  ["WBNB (Wrapped BNB)", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"],
  ["USDT (Tether USD, BSC)", "0x55d398326f99059fF775485246999027B3197955"],
  ["BAGENT (BOND AGENT token)", "0xb50dC583cC6F83750c36789F52d51E12dA664444"],
  ["HOPKIN GENESIS (free-mint NFT)", "0x2728c134D79D34A977d6D35D8A3014AbB5C97ed4"],
  ["Pokechain (free-mint NFT)", "0x4EF929aF00cB93993c3D01834C4DA79200d31e32"],
  ["PICKAXE (free-mint NFT)", "0xc2beaad13ef2833d976957e41b03b6b2661cfab0"],
  ["SVN / SEVENFOLD (free-mint NFT)", "0x4ca724a354db4f743607ecc1a5f117b2e617c8ae"],
  ["DRIFTWIRE (free-mint NFT)", "0x485be9daa4620fcee4e2baed7cc85ea57acb44b0"],
  ["WBTC (Binance-peg Wrapped BTC)", "0x0555e30da8f98308edb960aa94c0db47230d2b9c"],
];

const results = { testedAt: new Date().toISOString(), addresses: [], txs: [], edge: [] };

for (const [label, addr] of ADDRESSES) {
  console.log(`screening ${label} ...`);
  const r = await screenInput(fetch, addr);
  results.addresses.push({ label, address: addr, verdict: r.verdict, score: r.score, findings: r.findings.map(f => ({ id: f.id, label: f.label, severity: f.severity, points: f.points })), metadata: r.metadata, durationMs: r.durationMs });
  console.log(`  -> ${r.verdict} score=${r.score} findings=${r.findings.map(f => f.id).join(",")}`);
}

// Real transactions from the latest blocks
const block = await rpc("eth_getBlockByNumber", ["latest", true]);
const txs = (block.transactions || []).filter(t => t.to);
console.log(`latest block ${block.number} has ${txs.length} txs with a recipient`);
const plainTx = txs.find(t => t.input === "0x" || t.input === "0x0") || txs[0];
const approveTx = txs.find(t => (t.input || "").toLowerCase().startsWith("0x095ea7b3"));
// Fixed case: a real unlimited approve() tx found on-chain (WBTC -> PancakeSwap router v2).
const FIXED_APPROVE_TX = "0x613993a2b67300d309f30cce999bcf2ff7980d08e9f008c83136e60bb3babfc6";
for (const [label, tx] of [["latest-block tx", plainTx], ["approve tx (if found)", approveTx]]) {
  if (!tx) { console.log(`${label}: none in this block`); continue; }
  console.log(`screening ${label} ${tx.hash} ...`);
  const r = await screenInput(fetch, tx.hash);
  results.txs.push({ label, hash: tx.hash, to: tx.to, verdict: r.verdict, score: r.score, findings: r.findings.map(f => ({ id: f.id, label: f.label, severity: f.severity, points: f.points })), metadata: r.metadata, durationMs: r.durationMs });
  console.log(`  -> ${r.verdict} score=${r.score}`);
}
console.log(`screening fixed unlimited-approve tx ${FIXED_APPROVE_TX} ...`);
{
  const r = await screenInput(fetch, FIXED_APPROVE_TX);
  results.txs.push({ label: "fixed unlimited-approve tx (WBTC -> PancakeSwap router)", hash: FIXED_APPROVE_TX, verdict: r.verdict, score: r.score, findings: r.findings.map(f => ({ id: f.id, label: f.label, severity: f.severity, points: f.points })), metadata: r.metadata, durationMs: r.durationMs });
  console.log(`  -> ${r.verdict} score=${r.score}`);
}

// Edge cases
for (const [label, input] of [
  ["EOA (Abid's wallet, no code)", "0x0EB78e4c2CBeaeddF2658B98Dc6f203862d734B8"],
  ["garbage input", "hello world"],
  ["nonexistent tx hash", "0x" + "00".repeat(32)],
  ["empty input", ""],
]) {
  const r = await screenInput(fetch, input);
  results.edge.push({ label, input, verdict: r.verdict, score: r.score, findings: r.findings.map(f => f.id) });
  console.log(`${label}: ${r.verdict} score=${r.score} (${r.findings.map(f => f.id).join(",")})`);
}

await writeFile(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));
console.log("wrote tests/results.json");
