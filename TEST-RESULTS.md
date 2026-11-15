# MintGuard — live test results

Tested: 2026-11-14T18:14:24.005Z (UTC) against BSC mainnet (chain 56) via public RPC, Sourcify v2 and honeypot.is. All addresses and transactions below are real mainnet data.

## Contract screening (9 real contracts)

| Contract | Verdict | Score | Findings |
|---|---|---|---|
| CAKE (PancakeSwap Token) | **ALLOW** | 20 | honeypot-clean, verified, src:mint, src:ownership |
| WBNB (Wrapped BNB) | **ALLOW** | 0 | honeypot-clean, verified |
| USDT (Tether USD, BSC) | **ALLOW** | 20 | honeypot-clean, verified, src:mint, src:ownership |
| BAGENT (BOND AGENT token) | **CAUTION** | 45 | honeypot-na, unverified, byte:mint |
| HOPKIN GENESIS (free-mint NFT) | **CAUTION** | 50 | unverified, byte:mint, byte:pausable |
| Pokechain (free-mint NFT) | **CAUTION** | 30 | unverified |
| PICKAXE (free-mint NFT) | **CAUTION** | 35 | unverified, byte:pausable |
| SVN / SEVENFOLD (free-mint NFT) | **CAUTION** | 30 | unverified |
| DRIFTWIRE (free-mint NFT) | **CAUTION** | 30 | unverified |
| WBTC (Binance-peg Wrapped BTC) | **ALLOW** | 5 | honeypot-flag, verified, src:ownership |

- **CAKE (PancakeSwap Token)** `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` — verified=True, name='PancakeSwap Token', symbol='Cake', decimals=18, owner=0x73feaa1ee314f8c655e354234017be2193c9e24e, implementation=None, honeypot: checked=True applicable=True isHoneypot=False risk=low(1) sellTax=0%, 4697 ms
- **WBNB (Wrapped BNB)** `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` — verified=True, name='Wrapped BNB', symbol='WBNB', decimals=18, owner=None, implementation=None, honeypot: checked=True applicable=True isHoneypot=False risk=low(1) sellTax=0%, 1453 ms
- **USDT (Tether USD, BSC)** `0x55d398326f99059fF775485246999027B3197955` — verified=True, name='Tether USD', symbol='USDT', decimals=18, owner=0xf68a4b64162906eff0ff6ae34e2bb1cd42fef62d, implementation=None, honeypot: checked=True applicable=True isHoneypot=False risk=low(1) sellTax=0%, 1150 ms
- **BAGENT (BOND AGENT token)** `0xb50dC583cC6F83750c36789F52d51E12dA664444` — verified=False, name='BOND AGENT', symbol='BAGENT', decimals=18, owner=0x0000000000000000000000000000000000000000, implementation=None, honeypot: checked=True applicable=False isHoneypot=None risk=None(None) sellTax=None%, 4148 ms
- **HOPKIN GENESIS (free-mint NFT)** `0x2728c134D79D34A977d6D35D8A3014AbB5C97ed4` — verified=False, name='HOPKIN GENESIS', symbol='HOPKIN', decimals=None, owner=0x4ee94abf93d1728ca2f97ab4dedd21cc9ff48061, implementation=None, honeypot: n/a, 2044 ms
- **Pokechain (free-mint NFT)** `0x4EF929aF00cB93993c3D01834C4DA79200d31e32` — verified=False, name='Pokechain', symbol='POKECHAIN', decimals=None, owner=0xf379a6070eb04e3e9d8ea28f11f04bd8ff452b59, implementation=None, honeypot: n/a, 2446 ms
- **PICKAXE (free-mint NFT)** `0xc2beaad13ef2833d976957e41b03b6b2661cfab0` — verified=False, name='Pickgrid Pickaxe', symbol='PICKAXE', decimals=None, owner=0x72d0d1c285c5aea222e618924410ee3ffd6b28a4, implementation=None, honeypot: n/a, 1057 ms
- **SVN / SEVENFOLD (free-mint NFT)** `0x4ca724a354db4f743607ecc1a5f117b2e617c8ae` — verified=False, name='SEVENFOLD', symbol='SVN', decimals=None, owner=None, implementation=None, honeypot: n/a, 1774 ms
- **DRIFTWIRE (free-mint NFT)** `0x485be9daa4620fcee4e2baed7cc85ea57acb44b0` — verified=False, name='DRIFTWIRE', symbol='DRIFT', decimals=None, owner=None, implementation=None, honeypot: n/a, 1735 ms
- **WBTC (Binance-peg Wrapped BTC)** `0x0555e30da8f98308edb960aa94c0db47230d2b9c` — verified=True, name='Wrapped BTC', symbol='WBTC', decimals=8, owner=0xc5a7622582b2958e3f8ab0c18489d21b2d125fec, implementation=None, honeypot: checked=True applicable=True isHoneypot=True risk=honeypot(100) sellTax=0%, 2081 ms

## Transaction screening (real on-chain transactions)

- **latest-block tx** `0x3781e614258b9706d9e93771b04546e599380d237f808f3de9607d6cc1c7a7df` → **ALLOW** (0) — findings: tx-plain-transfer
- **approve tx (if found)** `0x6fa22aec93e5c275f8ddce64095581879c97e1b6354f1a0dc5289ac8c9246724` → **CAUTION** (50) — findings: tx-unlimited-approval, target:honeypot-na, target:unverified, tx-approvals-emitted
  - approval: {"token": "0xb8d3ed02fc554512555ba39ce1b2c4e0cc367777", "spender": "0x000000000022d473030f116ddee9f6b43ac78ba3", "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935", "unlimited": true}; target verdict CAUTION (score 30)
- **fixed unlimited-approve tx (WBTC -> PancakeSwap router)** `0x613993a2b67300d309f30cce999bcf2ff7980d08e9f008c83136e60bb3babfc6` → **ALLOW** (25) — findings: tx-unlimited-approval, target:honeypot-flag, target:verified, target:src:ownership, tx-approvals-emitted
  - approval: {"token": "0x0555e30da8f98308edb960aa94c0db47230d2b9c", "spender": "0x000000000022d473030f116ddee9f6b43ac78ba3", "amount": "115792089237316195423570985008687907853269984665640564039457584007913129639935", "unlimited": true}; target verdict ALLOW (score 5)

## Edge cases (fail-closed behaviour)

- EOA (Abid's wallet, no code) (`0x0EB78e4c2CBeaeddF2658B98Dc6f203862d734B8`) → **BLOCK** (100) — no-code
- garbage input (`hello world`) → **BLOCK** (100) — invalid-input
- nonexistent tx hash (`0x0000000000000000000000000000000000000000000000000000000000000000`) → **BLOCK** (100) — tx-not-found
- empty input (``) → **BLOCK** (100) — invalid-input

## Notes

- The honeypot.is label flagged Binance-peg WBTC as a honeypot (`low_fail_rate`) while its own sell simulation succeeded with 0% sell tax. MintGuard therefore trusts the simulation outcome over the label: that case is a +15 warning, not a +40 confirmation. See README 'Key decisions'.
- CAKE and USDT are verified and legitimate, yet their sources contain an owner-only `mint()` (MasterChef mints CAKE; Tether mints USDT). MintGuard reports that power honestly instead of hiding it — that is the point of the tool.
- All free-mint NFT contracts in the test set (HOPKIN, Pokechain, PICKAXE, SVN, DRIFT) are NOT verified on Sourcify, so all score CAUTION. That is the honest result: the guard cannot read their source.
