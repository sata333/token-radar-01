// Token Launch Radar — valuation model and board builder.
//
// The model keeps two numbers strictly separate for every protocol:
//
//   Implied FDV  — what a token would plausibly be worth if it launched,
//                  from TVL, the category's tokenized-peer mcap/TVL median,
//                  7-day momentum, listing age and chain footprint.
//   EV (expected launch value) = Implied FDV x P_launch, where P_launch is
//                  the probability that a launch ever happens. The board is
//                  ranked by EV, so a giant institutional curator with no
//                  token intent ranks below a smaller protocol with a live
//                  points program — which is the ranking a launch radar
//                  exists to produce.
//
// Everything is computed from the frozen snapshot's own fields. The only
// hand-made inputs are the category multiples below (anchored to the
// snapshot's tokenized-peer medians, with fee take-rate haircuts where a
// category has almost no tokenized peers) and the curated overrides in
// lib/curated.ts for the 40 watchlist protocols.

import { CURATED, type FarmStatus } from './curated.ts';

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface RadarRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  listedAt: string | null;
  ageMonths: number | null;
  mBase: number;
  fGrowth: number;
  fAge: number;
  fChain: number;
  impliedFdv: number;
  pAuto: number;
  pCat: number;
  dAge: number;
  dEco: number;
  dMom: number;
  p: number;
  ev: number;
  rank: number;
  tier: number;
  curated: boolean;
  badges: string[];
  farmStatus: FarmStatus;
  verdict: string;
  note: string;
  steps: string[];
  catMedian7d: number | null;
}

export interface BoardMeta {
  asOf: string;
  source: string;
  floorUsd: number;
  totalProtocols: number;
  rows: number;
  curatedCount: number;
  extendedCount: number;
  cleanTvlUsd: number;
  aggregateEvUsd: number;
  highConvictionCount: number;
  highConvictionAvgFdvUsd: number;
  trapCount: number;
  categoryEv: { category: string; evUsd: number; fdvUsd: number }[];
}

export interface Board {
  rows: RadarRow[];
  meta: BoardMeta;
}

/** Circulating-to-FDV lift: mature peers carry a ~62.5% median float. */
export const K_FDV = 1.6;

/** Category base multiples (tokenized-peer median mcap/TVL from the snapshot). */
export const M_BASE: Record<string, number> = {
  Lending: 0.132,
  Dexs: 0.342,
  Yield: 0.18,
  RWA: 0.275,
  'Basis Trading': 0.654,
  CDP: 0.169,
  Privacy: 0.969,
  // n=2 raw median 2.162 shrunk halfway toward Dexs to dampen the outlier.
  Derivatives: 1.252,
  // Curators own neither the base liquidity nor the contracts their TVL sits
  // in; they capture ~5-15% performance fees on gross lending yield.
  'Risk Curators': 0.045,
  // Allocators own the vault rail and distribution, a stronger moat than a
  // pure curator, but still layered above base money markets.
  'Onchain Capital Allocator': 0.108,
  // Shared-security layers: midpoint of Lending and Dexs.
  'Collateral Markets': 0.237,
  Restaking: 0.237,
  Chain: 0.342,
  Insurance: 0.169,
  CeDeFi: 0.135,
  'Governance Incentives': 0.132,
  Payments: 0.132,
  'Staking Pool': 0.09,
  'Stablecoin Wrapper': 0.085,
};

export const M_BASE_FALLBACK = 0.18;

/** Category baselines for the automated launch-likelihood heuristic. */
export const P_CAT: Record<string, number> = {
  'Basis Trading': 0.75,
  Yield: 0.75,
  Lending: 0.75,
  Derivatives: 0.75,
  Restaking: 0.75,
  'Collateral Markets': 0.75,
  'Onchain Capital Allocator': 0.75,
  Dexs: 0.65,
  CDP: 0.65,
  Insurance: 0.65,
  Privacy: 0.65,
  'Governance Incentives': 0.65,
  RWA: 0.45,
  CeDeFi: 0.45,
  'Stablecoin Wrapper': 0.45,
  Chain: 0.45,
  'Staking Pool': 0.25,
  'Risk Curators': 0.2,
  Payments: 0.05,
};

export const P_CAT_FALLBACK = 0.45;

const TIER1_CHAINS = new Set(['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'Bitcoin']);
const TIER2_CHAINS = new Set([
  'Monad', 'Sui', 'Avalanche', 'Binance', 'Ink', 'Tron', 'Berachain', 'Plume',
  'Flare', 'Stellar', 'Plasma', 'Mezo', 'Ripple', 'Noble', 'Robinhood Chain', 'Arc',
]);
const FRONTIER_CHAINS = new Set([
  'Monad', 'Ink', 'Plasma', 'Berachain', 'Plume', 'Flare', 'Mezo', 'Pharos', 'Arc',
]);

/**
 * Chain footprint is scored on a protocol's three primary deployments (the
 * snapshot lists chains primary-first). Long-tail listings beyond the third
 * are usually bridge dust rather than real liquidity, and the worked
 * valuations in the design research were computed on the primary three.
 */
export const PRIMARY_CHAIN_LIMIT = 3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function ageMonths(p: Protocol, asOfMs: number): number | null {
  if (!p.listed_at) return null;
  const t = Date.parse(`${p.listed_at}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return (asOfMs - t) / 86400000 / 30.4375;
}

export function fGrowth(change7d: number | null): number {
  if (change7d === null) return 1;
  return clamp(1 + 0.01 * change7d, 0.8, 1.25);
}

export function fAge(age: number | null): number {
  if (age === null) return 0.9;
  if (age < 3) return 0.85;
  if (age < 6) return 0.95;
  if (age <= 18) return 1.05;
  if (age <= 36) return 1;
  return 0.9;
}

function chainTier(chain: string): number {
  if (TIER1_CHAINS.has(chain)) return 1.05;
  if (TIER2_CHAINS.has(chain)) return 1.0;
  return 0.9;
}

export function fChain(chains: string[]): number {
  const primary = chains.slice(0, PRIMARY_CHAIN_LIMIT);
  if (primary.length === 0) return 0.9;
  const scores = primary.map(chainTier);
  const q = 0.7 * Math.max(...scores) + 0.3 * (scores.reduce((a, b) => a + b, 0) / scores.length);
  const breadth = primary.length === 1 ? 0 : primary.length === 2 ? 0.05 : 0.1;
  return clamp(q + breadth, 0.8, 1.25);
}

export interface PParts {
  pCat: number;
  dAge: number;
  dEco: number;
  dMom: number;
  pAuto: number;
}

export function pAutoParts(p: Protocol, age: number | null): PParts {
  const category = p.category ?? '';
  const pCat = P_CAT[category] ?? P_CAT_FALLBACK;
  let dAge = 0;
  if (age === null) dAge = -0.15;
  else if (age > 36) dAge = -0.25;
  else if (age >= 24) dAge = -0.05;
  else if (age >= 3 && age <= 18) dAge = 0.1;
  const primary = p.chains.slice(0, PRIMARY_CHAIN_LIMIT);
  const dEco = primary.some((c) => FRONTIER_CHAINS.has(c)) ? 0.08 : 0;
  let dMom = 0;
  if (p.change_7d !== null) {
    if (p.change_7d >= 5) dMom = 0.05;
    else if (p.change_7d <= -15) dMom = -0.05;
  }
  return { pCat, dAge, dEco, dMom, pAuto: clamp(pCat + dAge + dEco + dMom, 0.02, 0.95) };
}

export interface Scored {
  age: number | null;
  mBase: number;
  fGrowth: number;
  fAge: number;
  fChain: number;
  condMcap: number;
  impliedFdv: number;
  parts: PParts;
}

export function score(p: Protocol, asOfMs: number): Scored {
  const age = ageMonths(p, asOfMs);
  const mBase = M_BASE[p.category ?? ''] ?? M_BASE_FALLBACK;
  const fg = fGrowth(p.change_7d);
  const fa = fAge(age);
  const fc = fChain(p.chains);
  const condMcap = p.tvl_usd * mBase * fg * fa * fc;
  return {
    age,
    mBase,
    fGrowth: fg,
    fAge: fa,
    fChain: fc,
    condMcap,
    impliedFdv: condMcap * K_FDV,
    parts: pAutoParts(p, age),
  };
}

// ---------------------------------------------------------------------------
// Board selection: a deterministic pipeline over the snapshot.
//   Tier 0 — the snapshot's own watchlist, all 40, unconditionally.
//   Tier 1 — every remaining clean protocol with TVL at or above $25M.
//   Tier 2 — clean, $10M-$25M, automated launch likelihood at least 0.45,
//            and no worse than a -35% seven-day drawdown.
//   Tier 3 — clean, $5M-$10M hidden gems: likelihood at least 0.65 and real
//            momentum (+5% on the week) or a frontier-chain deployment.
//   Tier 4 — radar sweep: the remaining clean protocols the heuristic still
//            scores at 0.35 or better. The frozen snapshot's clean mid-band
//            is thinner than the design estimate, so this sweep keeps the
//            board inside its 150-200 row target without admitting a single
//            tokenized, wrapped or drained protocol.
// "Clean" means Stage-1 clean: records no token, is not a wrapped, staked or
// bridged derivative, is not a child deployment of a tokenized protocol
// family, and is not a drained zombie.
// ---------------------------------------------------------------------------

const EXCLUDED_CATEGORIES = new Set([
  'CEX', 'Canonical Bridge', 'Bridge', 'Cross Chain Bridge', 'Tokenized Assets',
  'Treasury Manager', 'Launchpad', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC',
]);

function isTokenless(p: Protocol): boolean {
  return p.symbol === null && p.gecko_id === null && !(p.mcap_usd !== null && p.mcap_usd > 0);
}

function isDerivative(p: Protocol): boolean {
  if (/^(wrapped|bridged|staked|liquid-staked)-/.test(p.slug)) return true;
  if (/-(buidl|etf|t-bill-wrapper)$/.test(p.slug)) return true;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return true;
  return false;
}

function isParentChild(p: Protocol, tokenizedNames: Set<string>): boolean {
  const m = p.name.match(/^(.*?)\s+(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/);
  return m !== null && tokenizedNames.has(m[1].toLowerCase());
}

export function isStage1Clean(p: Protocol, tokenizedNames: Set<string>): boolean {
  if (!isTokenless(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (isDerivative(p)) return false;
  if (isParentChild(p, tokenizedNames)) return false;
  if (p.change_7d !== null && p.change_7d <= -50 && p.tvl_usd < 15_000_000) return false;
  return true;
}

export function selectBoard(snapshot: Snapshot): { proto: Protocol; tier: number; scored: Scored }[] {
  const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`);
  const watchlist = new Set(snapshot.watchlist);
  const tokenizedNames = new Set(
    snapshot.protocols
      .filter((p) => p.symbol !== null || p.gecko_id !== null)
      .map((p) => p.name.toLowerCase()),
  );
  const picked = new Map<string, { proto: Protocol; tier: number; scored: Scored }>();
  const add = (p: Protocol, tier: number) => {
    if (!picked.has(p.slug)) picked.set(p.slug, { proto: p, tier, scored: score(p, asOfMs) });
  };
  for (const p of snapshot.protocols) if (watchlist.has(p.slug)) add(p, 0);
  const rest = snapshot.protocols.filter((p) => !watchlist.has(p.slug) && isStage1Clean(p, tokenizedNames));
  for (const p of rest) if (p.tvl_usd >= 25_000_000) add(p, 1);
  for (const p of rest) {
    if (picked.has(p.slug)) continue;
    const s = score(p, asOfMs);
    if (
      p.tvl_usd >= 10_000_000 && p.tvl_usd < 25_000_000 &&
      s.parts.pAuto >= 0.45 && (p.change_7d === null || p.change_7d > -35)
    ) add(p, 2);
  }
  for (const p of rest) {
    if (picked.has(p.slug)) continue;
    const s = score(p, asOfMs);
    if (
      p.tvl_usd >= 5_000_000 && p.tvl_usd < 10_000_000 && s.parts.pAuto >= 0.65 &&
      ((p.change_7d !== null && p.change_7d >= 5) || p.chains.some((c) => FRONTIER_CHAINS.has(c)))
    ) add(p, 3);
  }
  for (const p of rest) {
    if (picked.has(p.slug)) continue;
    const s = score(p, asOfMs);
    if (s.parts.pAuto >= 0.35) add(p, 4);
  }
  return [...picked.values()];
}

// ---------------------------------------------------------------------------
// Templated farm plans for auto-scored rows. Each step names the protocol,
// its primary chain and a concrete action with a cost or time frame; the
// category action varies so plans are not one slogan repeated 149 times.
// ---------------------------------------------------------------------------

const CATEGORY_ACTION: Record<string, string> = {
  Lending:
    'Supply blue-chip collateral (USDC, WETH or wstETH) and borrow conservatively below 60% LTV, so both supply-side and borrow-side activity count if a points program opens.',
  Dexs:
    'Provide liquidity in the deepest pool pair (usually the main stablecoin or ETH pair) and stay in range; concentrated positions earn more fees but need a weekly rebalance of about 15 minutes.',
  Yield:
    'Stake the vault receipt token wherever the app offers a boost or lock option; time-weighted balances are what most vault points programs reward.',
  'Yield Aggregator':
    'Stake the vault receipt token wherever the app offers a boost or lock option; time-weighted balances are what most vault points programs reward.',
  RWA:
    'Complete any KYC the mint flow requires (about 15 minutes with ID ready) before depositing, and confirm the redemption window matches your time horizon before sizing up.',
  CDP:
    'Mint the stablecoin against overcollateralized collateral at a conservative ratio (150% or higher) and park it in the protocol\'s own stability or staking pool.',
  'Algo-Stables':
    'Mint the stablecoin against overcollateralized collateral at a conservative ratio (150% or higher) and park it in the protocol\'s own stability or staking pool.',
  'Basis Trading':
    'Fund the delta-neutral vault rather than trading manually; the strategy harvests funding-rate spreads while keeping directional market exposure near zero.',
  Derivatives:
    'Fund the delta-neutral or options vault rather than trading manually; the strategy harvests funding and volatility spreads while keeping directional exposure near zero.',
  Synthetics:
    'Fund the delta-neutral vault rather than trading manually; the strategy harvests funding-rate spreads while keeping directional market exposure near zero.',
  Restaking:
    'Restake wstETH or rETH through a curated vault and pick operators with a public slashing record; expect an unbonding queue of seven days or more on exit.',
  'Collateral Markets':
    'Restake wstETH or rETH through a curated vault and pick operators with a public slashing record; expect an unbonding queue of seven days or more on exit.',
  Chain:
    'Bridge a working balance (about $250) onto the chain, then use two or three native apps every week so the wallet shows organic, repeated activity rather than one deposit.',
  Privacy:
    'Make small, regular private deposits and withdrawals through the official interface; consistent usage over weeks is what any retroactive program can actually measure.',
  Insurance:
    'Underwrite cover in the lowest-risk pool first, and note that staked capital stays locked against claims for the whole cover period.',
  CeDeFi:
    'Deposit only an amount whose custody risk you accept: CeDeFi yield routes through off-chain venues, so verify the custodian named in the documentation first.',
  'Risk Curators':
    'Choose the vault whose collateral whitelist you recognize end to end, and compare its performance fee (typically 5-15%) against Gauntlet or Steakhouse equivalents before depositing.',
  'Onchain Capital Allocator':
    'Pick the vault strategy that matches your base asset and hold through full epochs; allocator points, where they exist, are time-weighted rather than size-weighted.',
  'Governance Incentives':
    'Lock or stake the position the incentive contract rewards, and vote in at least one governance round per month so the wallet stays visibly active.',
  'Staking Pool':
    'Delegate to a pool with published uptime and a commission under 10%; native staking rewards pay per epoch, with no points program assumed.',
  Payments:
    'Route one real payment through the network (a small amount, a few cents in fees) and, if you run a node, keep its channels funded and balanced.',
  'Stablecoin Wrapper':
    'Mint the wrapped dollar only against the stated reserve asset, and check the wrapper\'s attestation or reserve page before holding any size.',
};

const DEFAULT_ACTION =
  'Use the protocol\'s core product the way a regular user would — one real transaction a week beats a single large deposit under most retroactive criteria.';

export function templatedSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its home chain';
  const category = p.category ?? 'DeFi';
  const action = CATEGORY_ACTION[category] ?? DEFAULT_ACTION;
  return [
    `Deposit USDC or ETH into ${p.name}'s main ${category} markets on ${chain} through its official app; start with a test amount (about $100, five minutes) before sizing up.`,
    action,
    `Re-check the position weekly (about 10 minutes): track ${p.name}'s TVL trend, its rewards or points page, and official announcements for any token, season or snapshot news.`,
    `Avoid leverage above 2x and keep an exit buffer: ${category} positions can queue withdrawals for days, and an unannounced snapshot rewards duration held, not last-minute size.`,
  ];
}

function autoVerdict(p: number): string {
  if (p >= 0.65) return 'PRE-TGE FARM — Model-Scored Opportunity';
  if (p >= 0.4) return 'MODEL-SCORED — Moderate Launch Likelihood';
  if (p >= 0.15) return 'MODEL-SCORED — Low Launch Likelihood';
  return 'MODEL-SCORED — Token Launch Unlikely';
}

function autoFarmStatus(p: Protocol, pLaunch: number): FarmStatus {
  if (p.category === 'Risk Curators') return 'institutional';
  if (pLaunch < 0.15) return 'no-route';
  return 'retail-open';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildBoard(snapshot: Snapshot): Board {
  const selected = selectBoard(snapshot);
  const rows: RadarRow[] = selected.map(({ proto: p, tier, scored: s }) => {
    const curated = CURATED[p.slug];
    const pLaunch = curated ? curated.pFinal : Math.round(s.parts.pAuto * 100) / 100;
    const badges = curated
      ? [...curated.badges]
      : [
          ...(p.category === 'Risk Curators' || p.category === 'Onchain Capital Allocator'
            ? ['DOUBLE-COUNT']
            : []),
        ];
    return {
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorized',
      chains: p.chains,
      tvlUsd: p.tvl_usd,
      change7d: p.change_7d,
      listedAt: p.listed_at,
      ageMonths: s.age === null ? null : Math.round(s.age * 10) / 10,
      mBase: s.mBase,
      fGrowth: Math.round(s.fGrowth * 10000) / 10000,
      fAge: s.fAge,
      fChain: Math.round(s.fChain * 10000) / 10000,
      impliedFdv: Math.round(s.impliedFdv),
      pAuto: Math.round(s.parts.pAuto * 100) / 100,
      pCat: s.parts.pCat,
      dAge: s.parts.dAge,
      dEco: s.parts.dEco,
      dMom: s.parts.dMom,
      p: pLaunch,
      ev: Math.round(s.impliedFdv * pLaunch),
      rank: 0,
      tier,
      curated: curated !== undefined,
      badges,
      farmStatus: curated ? curated.farmStatus : autoFarmStatus(p, pLaunch),
      verdict: curated ? curated.verdict : autoVerdict(pLaunch),
      note: curated
        ? curated.note
        : 'Auto-scored from snapshot fields only (TVL, category, chains, 7-day momentum, listing age); not hand-audited.',
      steps: curated ? curated.steps : templatedSteps(p),
      catMedian7d: null,
    };
  });
  rows.sort((a, b) => b.ev - a.ev || b.impliedFdv - a.impliedFdv || a.slug.localeCompare(b.slug));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  const byCategory = new Map<string, number[]>();
  for (const r of rows) {
    if (r.change7d === null) continue;
    const list = byCategory.get(r.category) ?? [];
    list.push(r.change7d);
    byCategory.set(r.category, list);
  }
  const overallMedian = median(rows.map((r) => r.change7d).filter((v): v is number => v !== null));
  for (const r of rows) {
    const m = byCategory.get(r.category);
    r.catMedian7d = m && m.length >= 2 ? Math.round(median(m)! * 100) / 100 : overallMedian;
  }
  const clean = rows.filter((r) => r.p > 0.05);
  const high = rows.filter((r) => r.p >= 0.7);
  const catEv = new Map<string, { ev: number; fdv: number }>();
  for (const r of rows) {
    const entry = catEv.get(r.category) ?? { ev: 0, fdv: 0 };
    entry.ev += r.ev;
    entry.fdv += r.impliedFdv;
    catEv.set(r.category, entry);
  }
  const meta: BoardMeta = {
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
    totalProtocols: snapshot.protocols.length,
    rows: rows.length,
    curatedCount: rows.filter((r) => r.curated).length,
    extendedCount: rows.filter((r) => !r.curated).length,
    cleanTvlUsd: clean.reduce((a, r) => a + r.tvlUsd, 0),
    aggregateEvUsd: rows.reduce((a, r) => a + r.ev, 0),
    highConvictionCount: high.length,
    highConvictionAvgFdvUsd: high.length
      ? Math.round(high.reduce((a, r) => a + r.impliedFdv, 0) / high.length)
      : 0,
    trapCount: rows.filter((r) => r.p <= 0.05).length,
    categoryEv: [...catEv.entries()]
      .map(([category, v]) => ({ category, evUsd: v.ev, fdvUsd: v.fdv }))
      .sort((a, b) => b.evUsd - a.evUsd)
      .slice(0, 8),
  };
  return { rows, meta };
}
