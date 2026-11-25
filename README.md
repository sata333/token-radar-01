[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sata333/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sata333/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A launch radar for protocols whose token does not exist yet — built for the
make.fun **token-radar-01** bounty ("Build the best token launch radar").

From the frozen DefiLlama snapshot (2026-11-14, 758 protocols at $5M+ TVL),
the radar tracks **186 pre-TGE protocols**: all 40 on the snapshot's own
watchlist, plus 146 more found by a deterministic sweep of the protocols
below the floor. Every row carries an implied value and a concrete farm
plan, and the dashboard renders the whole board with a radar scatter, a
detail drawer per protocol, and full sorting and filtering — completely
offline.

## The model

Two numbers, kept strictly separate:

- **Conditional Implied FDV** — what a token would plausibly be worth if it
  launched: `TVL × M_base(category) × 1.60 × F_growth × F_age × F_chain`.
  `M_base` is the category's tokenized-peer median mcap/TVL from the
  snapshot itself, with fee take-rate haircuts where a category has almost
  no tokenized peers (Risk Curators 0.045×, Onchain Capital Allocators
  0.108× — their TVL sits inside Morpho/Euler/Kamino and is already counted
  at the lending layer). The 1.60 factor lifts circulating mcap to FDV;
  momentum (0.80×–1.25×), age (0.85×–1.05×) and chain footprint (scored on
  the three primary deployments) adjust from there.
- **Expected Launch Value (EV)** — Implied FDV × **P_launch**, the
  probability a launch ever happens. The board ranks by EV, so Steakhouse
  Financial's $2.75B of curator TVL does **not** top the board: with a
  take-rate multiple and a 0.20 launch probability its EV is ≈ $46.6M,
  below Symbiotic's ≈ $75.6M. The Lightning Network, an open-source
  protocol with no issuer, sits at ≈ $0.8M.

P_launch is two-layered: a transparent heuristic from snapshot fields
(category baseline + age, frontier-chain and momentum adjustments), with
hand-researched **curated overrides** for the 40 watchlist protocols. The
overrides are where the traps live: USDD is an already-live stablecoin,
Plume Vaults / Hive / Mezo Earn are modules of tokens that already trade,
Doppler's XDP is live, and Lightning Network and Reti Pooling are
non-tokenizable public goods. None of them is silently dropped — each is
kept on the board with a TOKEN TRAP / PARENT TOKEN / NO-TGE flag, a capped
probability, and a farm plan that says what to do instead.

## The board

Selection is a deterministic pipeline (`lib/model.ts`): Stage-1 cleanliness
(no recorded token, not a wrapped/staked/bridged derivative, not a child
deployment of a tokenized family, not a drained zombie), then tiers —
watchlist (40) → clean ≥ $25M TVL → clean $10–25M with model likelihood
≥ 0.45 → $5–10M hidden gems with likelihood ≥ 0.65 and momentum or a
frontier chain → a final sweep at likelihood ≥ 0.35. Watchlist rows carry
Curated Intel (verified likelihoods and bespoke four-step farm plans);
extended rows are Auto-Scored from snapshot fields with templated plans,
and are labelled as such.

## Run it

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22+, standard library only. In the sealed harness the program reads
`/input/snapshot.json` and writes `/output`. Outputs:

- `board.json` — the ranked board (rank key = expected launch value, so
  `implied_value_usd` never rises as rank ascends)
- `dashboard/` — the static page plus `radar-data.js` written beside it
- `screenshots/` — board, detail and filtered captures shipped in this repo
- `dossier.json` — produced by the kit's own `buildDossier`

Open `out/dashboard/index.html` in a browser to use the radar. Deep links:
`#p=<slug>` opens a protocol's detail drawer; `#preset=<key>` applies a
preset filter.

## Layout

- `main.ts` — entry program (I/O only)
- `lib/model.ts` — valuation model, board selection, templated farm plans
- `lib/curated.ts` — hand-researched overrides and farm plans for the 40
  watchlist protocols
- `dashboard/` — the Terminal-Noir page (no network, system font stacks)
- `vendor/makefun-board.ts` — the kit's dossier library, byte-identical

## License

MIT — see `LICENSE`.

---

Entered in [make.fun · token-radar-01](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · referral code `jfcxrq51`
