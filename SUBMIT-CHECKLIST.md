# MintGuard — Agent Games Wildcard submission checklist

Season 01 · Wildcard track · 100,000 VFY per track (1st 50,000 / 2nd 30,000 / 3rd 20,000)
Deadline: **2026-11-21** (all tracks close 21 Nov 2026)

## Current status (2026-11-15)

- ✅ Agent built, tested end-to-end on real BSC mainnet data (see `TEST-RESULTS.md`)
- ✅ Demo UI built — works via the server AND standalone (`docs/index.html`)
- ✅ README, demo cases, test results, zkVerify design note all written
- ✅ **Public demo live:** https://abidzaenal.github.io/mintguard/ (GitHub Pages, docs/ folder)  
- ✅ Repo pushed: https://github.com/Abidzaenal/mintguard, Pages enabled on docs/
- ⏳ Submission form not yet filled (needs Abid, from his phone)

## Public endpoint

| Link | Status |
|---|---|
| Live API (Node server) | **NOT PUBLIC YET.** Server runs locally (`http://localhost:8787`) and is tested. `scripts/restart-tunnel.sh` re-establishes a public tunnel on any machine with direct internet — on this VM both cloudflared and localtunnel are blocked by the egress proxy (cloudflared: TLS handshake failure to `api.trycloudflare.com`; localtunnel: control plane unreachable; SSH tunnels: port 22 reset). |
| Static demo (no server needed) | `docs/index.html` in this repo — full agent, runs in the visitor's browser against public BSC RPC + Sourcify + honeypot.is (all allow cross-origin requests). **This is the link to submit until the repo is pushed and Pages is enabled.** |

After the repo is pushed: enable GitHub Pages on the `docs/` folder and the
public demo URL becomes `https://<abidzaenal>.github.io/<repo>/` — put THAT in
the form as the Agent Link, and the tunnel URL (once obtained) as the Public
Endpoint. If the tunnel is still unavailable, put the Pages URL in both
fields and say so in the Build Context (the static demo is a working agent,
not a screenshot).

## Submission fields (copy-paste ready)

### Agent Link
> `https://abidzaenal.github.io/mintguard/`
> (Until then: the repo itself once pushed — `https://github.com/Abidzaenal/mintguard`)

### Public Endpoint
> Live API: _(fill in after running `bash scripts/restart-tunnel.sh` on a machine with direct internet, or after deploying `server.mjs` to a free Node host)_
> Static demo (works now): `https://abidzaenal.github.io/mintguard/`

### Use Case
> Free-mint hunters on BNB Chain sign mints and token approvals every day, and the wallet only shows a hex address — not that the contract's source is unverified, that the owner can mint unlimited supply, that it can be paused, or that you are about to grant an unlimited approval. MintGuard screens any BSC contract address, approval, or transaction hash and returns a verdict — ALLOW / CAUTION / BLOCK — with plain-language evidence for every point: code and metadata from public BSC RPC, source verification and owner-power scan from Sourcify, and a buy/sell simulation from honeypot.is. It is built for people who mint daily and for reviewers who want a reproducible, evidence-linked screening instead of a black-box "safe / scam" label. No wallet connection, no keys, no signup.

### Build Context
> Node 22, standard library only — no npm dependencies, no API keys anywhere. One pure screening module (`lib/screen.mjs`, injected `fetch`) is shared by the Node server (`POST /api/screen`, `GET /health`, demo UI) and the standalone static demo (`docs/index.html`), which runs the same checks in the visitor's browser and falls back automatically if the server is unreachable. Scoring is transparent and documented in the README: risk points per finding (unverified source +30, owner-mint +35, confirmed honeypot +40, unlimited approval +20, …) minus trust points (verified −10, clean simulation −5); ALLOW < 30, CAUTION 30–64, BLOCK ≥ 65; upstream outages fail closed to CAUTION instead of guessing. Tested live against 10 real mainnet contracts (WBNB ALLOW 0; CAKE/USDT ALLOW 20 with their real owner-mint power shown; HOPKIN CAUTION 50; BAGENT CAUTION 45; the five real free-mint NFT contracts all CAUTION because they are unverified on Sourcify), 3 real transactions including an unlimited WBTC approval, and 4 fail-closed edge cases — full results in `TEST-RESULTS.md`. Key decision: the agent trusts the honeypot simulation outcome over the headline label, because the label has false positives — it flagged Binance-peg WBTC while its own sell simulation succeeded at 0% tax. Limits are stated in the UI and README: no transaction simulation, no off-chain reputation, bytecode selectors are heuristics. zkVerify: see below.

### zkVerify (optional)
> **Designed, not shipped — no proof reference exists and none is claimed.** The checkable claim MintGuard would prove: "This report (verdict, score, findings) for contract C at time T was computed from exactly these upstream responses (Sourcify verification status + source hash, BSC RPC code/metadata, honeypot.is simulation) — i.e. the evidence quoted is what the public sources actually returned." How: zkTLS attestation of the three upstream HTTPS responses as the agent fetches them, then proof submission via Kurier (`register-vk` → `submit-proof` → poll `job-status` to `Finalized` on zkVerify) with the job id shown in the report. What it still needs: a TLSN prover integration for the upstream calls, a registered verification key, and a Kurier API key (kurier.xyz account) — a multi-day integration, deliberately left as a documented design so the core agent ships solid. Shipped instead: reproducible evidence — every report carries `checkedAt`, per-finding evidence labels and full metadata, and `node tests/screen-test.mjs` reproduces the verdicts against mainnet.

## Steps only Abid can do

1. **Push the repo to GitHub** (from his machine, his GitHub auth):
   ```bash
   cd ~/workspace/agent-games-wildcard   # or wherever the folder lands
   git remote add origin https://github.com/Abidzaenal/mintguard.git
   git push -u origin main
   ```
   The repo is already committed locally (`git log` to check). A `README.md` with the full write-up is included.
2. **Enable GitHub Pages** on the repo → Settings → Pages → deploy from `docs/` on `main`. Copy the Pages URL into the Agent Link field above (and the endpoint fields once known).
3. **(Optional, for the live API)** run `bash scripts/restart-tunnel.sh` from a machine with direct internet, or deploy `server.mjs` to a free Node host — then paste that URL as the Public Endpoint.
4. **Submit from his phone** at the Agent Games registration/events page
   (the form is the same account he registered with). Paste the fields above.
5. **Share publicly (bonus points):** post the build on X as @Abidzaenal6 — draft below.
6. **If the tunnel URL changes** (VM restart), the Pages demo keeps working; update the public-endpoint field only if the form allows editing, otherwise leave it — the Pages link is the durable one.

## X share draft (bonus)

> Built MintGuard 🛡 for @zkVerify Agent Games Wildcard — a wallet & transaction guard for BSC.
>
> Paste any contract or tx hash → ALLOW / CAUTION / BLOCK with real evidence: Sourcify source scan, owner powers, sell simulation. No wallet connect, no keys.
>
> Try it: <pages-URL>
> Repo: https://github.com/Abidzaenal/mintguard
>
> Built for everyone minting free NFTs daily — check before you sign.
