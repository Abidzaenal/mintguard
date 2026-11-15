# MintGuard — a wallet & transaction guard for BNB Chain

**zkVerify Agent Games, Season 01 — Wildcard track**

Paste a contract address, a token approval, or a transaction hash. MintGuard
returns a verdict — **ALLOW / CAUTION / BLOCK** — with plain-language evidence
for every point it makes. Built for people who mint free NFTs and sign
approvals every day on BNB Smart Chain, and who currently have to guess
whether the contract in front of them is safe.

- 🌐 **Live demo:** https://abidzaenal.github.io/mintguard/ — the full agent, running with no server at all. The demo also runs locally: `docs/index.html`
- 🧪 **Try it with no server:** `docs/index.html` runs the same checks in your browser (open the file or serve it statically)
- 📋 **Test results:** [`TEST-RESULTS.md`](TEST-RESULTS.md) — 10 real mainnet contracts, 3 real transactions, 4 edge cases, all live

## The problem

Free-mint season on BSC means signing mints and token approvals constantly.
The wallet shows you a hex address and a function name; it does not tell you
that the contract's source is unverified, that the owner can mint unlimited
supply, that the contract can be paused, or that you are about to grant an
*unlimited* approval to a stranger's contract. The usual advice — "DYOR" —
means opening three block explorers and knowing Solidity.

MintGuard does that reading for you, in seconds, and shows its work.

## Who it helps

- **Free-mint hunters** checking a mint contract before they sign.
- **Anyone about to approve a token spend** — unlimited approvals are the
  single most common way wallets get drained, and MintGuard flags them.
- **Reviewers and researchers** who want a reproducible, evidence-linked
  screening instead of a black-box "safe / scam" label.

## What it checks

All sources are public and keyless. No wallet is ever connected; no private
data is read; nothing is signed.

| # | Check | Source |
|---|---|---|
| 1 | Is there code at this address? How big is it? | BSC public RPC (`eth_getCode`) |
| 2 | Token facts: name, symbol, decimals, total supply, owner, paused? | BSC public RPC (`eth_call`) |
| 3 | Is it a proxy? Is the implementation verified? | EIP-1967 slot (`eth_getStorageAt`) + Sourcify |
| 4 | Is the source verified, and what powers does it give the owner? | Sourcify v2 API (source scan: mint, blacklist, adjustable fee/tax, pause, upgrade) |
| 5 | Does a sell simulation succeed, and at what tax? | honeypot.is (tokens with a DEX pair only) |
| 6 | If the input is a transaction: what does it call, what does it approve, and what is the target contract? | BSC public RPC (tx + receipt + logs) |

### Verdicts and scoring

Every finding carries points; trust findings subtract them. The score is the
sum, floored at 0. **ALLOW < 30 · CAUTION 30–64 · BLOCK ≥ 65.**

| Finding | Points |
|---|---|
| Source NOT verified on Sourcify | +30 |
| Owner-mintable supply (verified source) | +35 |
| Blacklist / trading block (verified source) | +25 |
| Adjustable fee / tax (verified source) | +25 |
| Upgradeable proxy, unverified implementation | +20 |
| Mint selector in bytecode (source unverified) | +15 |
| Confirmed honeypot (sell simulation fails or sell tax ≥ 50%) | +40 |
| Unlimited token approval in a transaction | +20 |
| Contract currently paused | +15 |
| Source verified on Sourcify | −10 |
| Sell simulation passes (not a honeypot) | −5 |

If an upstream (BSC RPC / Sourcify) is unreachable, MintGuard **fails
closed** — it returns CAUTION and says so, instead of guessing ALLOW.

### Demo cases

| Case | Input | Expected |
|---|---|---|
| Clearly safe — Wrapped BNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | ALLOW (0) |
| Mixed — PancakeSwap Token (CAKE) | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | ALLOW (20) — verified, but owner can mint |
| Clearly risky — HOPKIN GENESIS mint | `0x2728c134D79D34A977d6D35D8A3014AbB5C97ed4` | CAUTION (50) — unverified + mint + pausable |
| Risky — BAGENT token | `0xb50dC583cC6F83750c36789F52d51E12dA664444` | CAUTION (45) — unverified + mint, no DEX pair |
| Fail-closed — a plain wallet address | `0x0EB78e4c2CBeaeddF2658B98Dc6f203862d734B8` | BLOCK (100) — no contract code |
| Transaction — unlimited WBTC approval | `0x613993a2b67300d309f30cce999bcf2ff7980d08e9f008c83136e60bb3babfc6` | ALLOW (25) — approval flagged, target screened |

Full live results: [`TEST-RESULTS.md`](TEST-RESULTS.md).

## How to run it

```bash
# Node 22+ required. No dependencies to install.
node server.mjs            # listens on http://localhost:8787
# POST /api/screen  {"input": "0x..."}   -> verdict + evidence
# GET  /health      -> service status
# GET  /api/demo    -> built-in demo cases
# GET  /           -> demo web UI
```

Re-run the live tests (real mainnet data, takes ~30 s):

```bash
node tests/screen-test.mjs   # writes tests/results.json
```

Rebuild the demo UI after changing the screening logic:

```bash
node scripts/build-ui.mjs    # public/index.html + docs/index.html
```

## Key decisions

1. **Evidence over labels.** Every finding names its source (RPC, Sourcify,
   honeypot.is) and says what it does and does not prove. A bytecode
   "mint selector" is reported as *possible* mint, never as proof.
2. **Unverified means CAUTION.** If the source cannot be read, MintGuard
   will not say ALLOW. In the live test set, all five real free-mint NFT
   contracts are unverified on Sourcify — so all score CAUTION. That is the
   honest result, not a bug.
3. **The simulation beats the label.** honeypot.is flagged Binance-peg WBTC
   as a "honeypot" while its own sell simulation succeeded at 0% tax — a
   known false-positive pattern on restricted tokens. MintGuard trusts the
   simulation outcome (failed sell / punitive tax = strong evidence) and
   treats a label on a passing simulation as a +15 warning that says so.
4. **One logic, two runtimes.** `lib/screen.mjs` is pure JavaScript with an
   injected `fetch`. The Node server and the standalone `docs/index.html`
   run the same code — the demo survives even if the hosted endpoint is
   down, and the UI falls back to in-browser checks automatically.
5. **Stdlib only, no secrets.** Node's built-in `http` + global `fetch`;
   no npm install, no API keys anywhere in the repo.

## Limits — read this before trusting a verdict

- **No transaction simulation.** MintGuard does not run your transaction
  against chain state, so it cannot detect honeypots that only trigger on
  sell, or tax/slippage behaviour at execution time.
- **No off-chain reputation.** It checks code and on-chain data only. A
  verified-looking contract can still be a scam; an unverified one can be
  legitimate.
- **Bytecode selectors are heuristics.** A selector proves a function
  signature exists, not what it does.
- **Sourcify coverage.** A contract verified on BscScan but not on Sourcify
  shows as unverified here.
- **honeypot.is only covers tokens with a DEX pair**, and its labels have
  false positives (see WBTC above).
- **ALLOW is not a guarantee.** It means "no specific risk was found".
  Never grant an unlimited approval you do not understand.

## zkVerify angle — designed, not shipped

**Status: design documented; no proof has been generated or submitted.
Nothing in this repo claims otherwise.**

The checkable claim MintGuard *would* prove is:

> "This report (verdict, score, findings) for contract `C` at time `T` was
> computed from exactly these upstream responses: Sourcify verification
> status + source hash, BSC RPC code/metadata responses, and the honeypot.is
> simulation result — i.e. the evidence quoted in the report is what the
> public sources actually returned, not edited afterwards."

How it would be built (honest plan, not a claim of completion):

1. **zkTLS attestation** of the three upstream HTTPS responses (Sourcify,
   BSC RPC, honeypot.is) as the agent fetches them — proving what the agent
   saw on the web, the "strong optional way to earn the verifiability plus".
2. **Proof submission via Kurier** (REST API at `api.kurier.xyz`):
   register the verification key (`POST /register-vk`), submit the proof
   (`POST /submit-proof`), poll `GET /job-status` until `Finalized` on
   zkVerify, and display the job id + aggregation reference in the report.
3. What it needs that this build does not have: a TLSN prover integration
   for the upstream calls, a registered verification key, and a Kurier API
   key (account at kurier.xyz). That is a multi-day integration, not a
   one-evening add-on, so it was deliberately left as a documented design
   rather than a half-working demo.

What **is** shipped instead: reproducible evidence. Every report carries
`checkedAt`, per-finding evidence labels, and the full metadata; anyone can
re-run `node tests/screen-test.mjs` against mainnet and reproduce the
verdicts in [`TEST-RESULTS.md`](TEST-RESULTS.md).

## Deployment

**Current status (2026-11-15): the public demo is live at https://abidzaenal.github.io/mintguard/ (GitHub Pages, `docs/`).** There is still no public tunnel URL for the API server — it runs and is fully tested locally (`http://localhost:8787`), and the static demo (`docs/index.html`) is a complete, working agent that runs from any static host with no backend.
 But the two free no-account tunnels
were both blocked by this build VM's egress proxy:

- **Cloudflare quick tunnel** (`cloudflared`): fails with `tls: first record
  does not look like a TLS handshake` when POSTing to
  `api.trycloudflare.com`.
- **localtunnel**: the client process dies silently; its control plane
  (`server.localtunnel.me`) is unreachable from here.
- **SSH-based tunnels** (localhost.run / serveo): outbound port 22 is reset
  by the proxy.

`scripts/restart-tunnel.sh` tries cloudflared, then localtunnel, verifies the
URL serves `/health`, and logs it to `ENDPOINT_URL.txt` — on any machine
with direct internet it should work as-is. On this VM it reports the failure
clearly instead of printing a fake URL.

**Two real paths to a public endpoint (one step each):**

1. **Static demo (recommended, no backend needed):** live at https://abidzaenal.github.io/mintguard/ (GitHub Pages on `docs/`).
    The page runs the full screening in the visitor's
   browser (all three upstream APIs allow cross-origin requests) and falls
   back from the server API automatically.
2. **Live API:** run `bash scripts/restart-tunnel.sh` from a machine with
   direct internet, or deploy `server.mjs` to any free Node host (it has no
   dependencies), then put that URL in the submission form.

**Honest note on restarts:** a tunnel URL lives only as long as its process.
If the host restarts, the tunnel dies and a new one gets a *different* URL.
That is why the submission lists both the tunnel URL and the static demo —
a stale tunnel URL never leaves reviewers with nothing to try.

## Repo layout

```
server.mjs              Node 22 stdlib-only agent server (GET /health, POST /api/screen, UI)
lib/screen.mjs          Pure screening logic (shared by server + static demo)
public/index.html       Demo UI served by the server
docs/index.html         Same UI, standalone — works from any static host
demo-cases.json         Built-in demo cases (safe / mixed / risky / fail-closed / tx)
tests/screen-test.mjs   Live test against real BSC mainnet contracts + txs
tests/results.json      Raw output of the last test run
TEST-RESULTS.md         Human-readable test results
scripts/build-ui.mjs    Builds public/ + docs/ UI from template + lib
scripts/restart-tunnel.sh  Re-establishes the public tunnel, logs the URL
SUBMIT-CHECKLIST.md     Exact submission fields + remaining steps
```

## License

MIT — see `LICENSE`.
