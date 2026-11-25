// Token Launch Radar — dashboard logic. Renders window.RADAR_DATA (written
// beside this page by main.ts) into the KPI strip, radar scatter, category
// bars, the ranked board and the per-protocol detail drawer. No network.

const D = window.RADAR_DATA;
const ROWS = D.rows;
const META = D.meta;
const bySlug = new Map(ROWS.map((r) => [r.slug, r]));

const state = {
  preset: 'all',
  query: '',
  cat: 'All',
  chain: 'All',
  tvl: 'all',
  like: 'all',
  farm: 'all',
  showTraps: false,
  sortKey: 'ev',
  sortDir: -1,
};

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtUsd(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}
function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
function fmtProb(p) {
  return `${Math.round(p * 100)}%`;
}
function probTier(p) {
  if (p >= 0.7) return ['HIGH', 'good'];
  if (p >= 0.35) return ['MED', 'warn'];
  if (p >= 0.1) return ['LOW', 'info'];
  return ['TRAP', 'trap'];
}
function isTrapRow(r) {
  return r.p <= 0.05;
}
function badgeClass(b) {
  if (/TRAP|LIVE TOKEN|NO-TGE|SEC/.test(b)) return 'trap';
  if (/PARENT|WRAPPER|DOUBLE|INSTITUTIONAL/.test(b)) return 'warn';
  return 'info';
}

const CAT_COLORS = [
  '#22D3EE', '#10B981', '#F59E0B', '#A78BFA', '#F472B6', '#60A5FA', '#34D399',
  '#FBBF24', '#F87171', '#38BDF8', '#4ADE80', '#E879F9', '#FACC15', '#93C5FD',
  '#FDA4AF', '#5EEAD4', '#C4B5FD', '#FDBA74',
];
const catColor = (() => {
  const cats = [...new Set(ROWS.map((r) => r.category))].sort();
  const map = new Map(cats.map((c, i) => [c, CAT_COLORS[i % CAT_COLORS.length]]));
  return (c) => map.get(c) ?? '#94A3B8';
})();

// ---------------------------------------------------------------- KPIs
function renderKpis() {
  const cards = [
    ['Tracked Pre-TGE Protocols', `<em>${META.rows}</em>`, `${META.curatedCount} Watchlist Curated · ${META.extendedCount} Extended`],
    ['Clean Pre-TGE TVL', fmtUsd(META.cleanTvlUsd), 'Excl. Token Traps &amp; Non-TGE Infra'],
    ['Aggregate Expected Launch FDV', fmtUsd(META.aggregateEvUsd), 'Sum of Implied FDV × P_launch'],
    ['High-Conviction Targets (P ≥ 70%)', `<em>${META.highConvictionCount}</em> Protocols`, `Avg. Implied FDV: ${fmtUsd(META.highConvictionAvgFdvUsd)}`],
  ];
  $('kpis').innerHTML = cards
    .map(([l, v, s]) => `<div class="kpi"><div class="k-label">${l}</div><div class="k-value">${v}</div><div class="k-sub">${s}</div></div>`)
    .join('');
  $('feedBadge').textContent = `SNAPSHOT: ${META.asOf} · DEFILLAMA ${META.totalProtocols} → ${META.rows} PRE-TGE TARGETS`;
  updateTrapPill();
}
function updateTrapPill() {
  $('trapPill').textContent = state.showTraps
    ? `${META.trapCount} trap / non-TGE rows shown`
    : `${META.trapCount} Traps & Non-TGE Hidden · Show Traps to Inspect`;
  $('cleanBtn').classList.toggle('active', !state.showTraps);
  $('trapsBtn').classList.toggle('active', state.showTraps);
}

// ---------------------------------------------------------------- scatter
function baseRows() {
  return ROWS.filter((r) => state.showTraps || state.preset === 'traps' || !isTrapRow(r));
}
function renderScatter() {
  const W = 720, H = 330, L = 46, R = 12, T = 12, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const xMin = 6, xMax = 9; // log10 USD: $1M to $1B
  const X = (v) => L + ((Math.log10(Math.max(v, 1e6)) - xMin) / (xMax - xMin)) * iw;
  const Y = (p) => T + (1 - p) * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Launch radar scatter">`;
  s += `<rect x="${X(5e7)}" y="${Y(1)}" width="${X(1e9) - X(5e7)}" height="${Y(0.65) - Y(1)}" fill="rgba(16,185,129,0.06)"/>`;
  s += `<text x="${X(5e7) + 8}" y="${Y(1) + 16}" fill="#10B981" font-size="10.5" font-weight="700">PRIME FARM ZONE</text>`;
  for (const gx of [1e6, 1e7, 1e8, 1e9]) {
    s += `<line x1="${X(gx)}" y1="${T}" x2="${X(gx)}" y2="${T + ih}" stroke="#1E293B" stroke-width="1"/>`;
    s += `<text x="${X(gx)}" y="${H - 8}" fill="#475569" font-size="10" text-anchor="middle" font-family="var(--mono)">${fmtUsd(gx)}</text>`;
  }
  for (const gy of [0, 0.25, 0.5, 0.75, 1]) {
    s += `<line x1="${L}" y1="${Y(gy)}" x2="${L + iw}" y2="${Y(gy)}" stroke="#1E293B" stroke-width="1"/>`;
    s += `<text x="${L - 6}" y="${Y(gy) + 3}" fill="#475569" font-size="10" text-anchor="end" font-family="var(--mono)">${gy * 100}%</text>`;
  }
  for (const r of baseRows()) {
    const rad = Math.min(13, 2.5 + Math.sqrt(r.tvlUsd) / 5200);
    const ring = r.curated ? 'stroke="#F1F5F9" stroke-width="1.1" stroke-dasharray="3 2"' : '';
    s += `<circle cx="${X(r.impliedFdv).toFixed(1)}" cy="${Y(r.p).toFixed(1)}" r="${rad.toFixed(1)}" fill="${catColor(r.category)}" fill-opacity="0.72" ${ring} data-slug="${esc(r.slug)}" style="cursor:pointer"><title>${esc(r.name)} · TVL ${fmtUsd(r.tvlUsd)} · Implied FDV ${fmtUsd(r.impliedFdv)} · EV ${fmtUsd(r.ev)} · ${esc(r.farmStatus)}</title></circle>`;
  }
  s += '</svg>';
  $('scatter').innerHTML = s;
  $('scatter').querySelectorAll('circle[data-slug]').forEach((c) => {
    c.addEventListener('click', () => openDrawer(c.getAttribute('data-slug')));
  });
}

// ---------------------------------------------------------------- category bars
function renderCatBars() {
  const maxFdv = Math.max(...META.categoryEv.map((c) => c.fdvUsd), 1);
  $('catBars').innerHTML = META.categoryEv
    .map((c) => {
      const ghost = ((c.fdvUsd / maxFdv) * 100).toFixed(1);
      const solid = ((c.evUsd / maxFdv) * 100).toFixed(1);
      return `<div class="cat-row"><span class="c-name">${esc(c.category)}</span><span class="cat-bar"><span class="ghost" style="width:${ghost}%"></span><span class="solid" style="width:${solid}%"></span></span><span class="c-val">${fmtUsd(c.evUsd)}</span></div>`;
    })
    .join('');
}

// ---------------------------------------------------------------- controls
const PRESETS = [
  ['all', 'All Eligible'],
  ['watchlist', 'Watchlist (40)'],
  ['prime', 'Prime Targets (P ≥ 70%)'],
  ['points', 'Active Points'],
  ['gems', 'Hidden Gems ($5M–$50M)'],
  ['traps', 'Token Traps & Flagged'],
];
function renderChips() {
  $('presetChips').innerHTML = PRESETS.map(
    ([k, label]) => `<button type="button" class="chip${state.preset === k ? ' active' : ''}" data-preset="${k}">${label}</button>`,
  ).join('');
  $('presetChips').querySelectorAll('[data-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      state.preset = b.getAttribute('data-preset');
      renderChips();
      renderAll();
    });
  });
}
function renderSelects() {
  const cats = [...new Set(ROWS.map((r) => r.category))].sort();
  $('catSel').innerHTML = '<option>All</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(ROWS.flatMap((r) => r.chains))].sort();
  $('chainSel').innerHTML = '<option>All</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

// ---------------------------------------------------------------- filtering + table
function presetOk(r) {
  switch (state.preset) {
    case 'watchlist': return r.curated;
    case 'prime': return r.p >= 0.7;
    case 'points': return r.farmStatus === 'active-points';
    case 'gems': return r.tvlUsd >= 5e6 && r.tvlUsd < 50e6;
    case 'traps': return r.badges.length > 0 || isTrapRow(r);
    default: return true;
  }
}
function visibleRows() {
  let out = baseRows().filter(presetOk);
  const q = state.query.trim().toLowerCase();
  if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
  if (state.cat !== 'All') out = out.filter((r) => r.category === state.cat);
  if (state.chain !== 'All') out = out.filter((r) => r.chains.includes(state.chain));
  if (state.tvl !== 'all') {
    const bands = { 500: [500e6, Infinity], 100: [100e6, 500e6], 25: [25e6, 100e6], 5: [5e6, 25e6] };
    const [lo, hi] = bands[state.tvl];
    out = out.filter((r) => r.tvlUsd >= lo && r.tvlUsd < hi);
  }
  if (state.like !== 'all') {
    out = out.filter((r) => {
      if (state.like === 'high') return r.p >= 0.7;
      if (state.like === 'med') return r.p >= 0.35 && r.p < 0.7;
      if (state.like === 'low') return r.p >= 0.1 && r.p < 0.35;
      return r.p < 0.1;
    });
  }
  if (state.farm !== 'all') out = out.filter((r) => r.farmStatus === state.farm);
  const k = state.sortKey;
  const dir = state.sortDir;
  out.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir;
  });
  return out;
}

function renderTable() {
  const rows = visibleRows();
  $('rowCount').textContent = `${rows.length} of ${META.rows} protocols`;
  $('boardBody').innerHTML = rows
    .map((r) => {
      const trap = isTrapRow(r);
      const [tierLabel, tierClass] = probTier(r.p);
      const gaugeColor = r.p >= 0.7 ? 'var(--emerald)' : r.p >= 0.35 ? 'var(--amber)' : r.p >= 0.1 ? 'var(--cyan)' : 'var(--crimson)';
      const chg = r.change7d;
      const barW = chg === null ? 0 : Math.min(100, Math.abs(chg) * 4);
      const chainPills = r.chains.slice(0, 3).map((c) => `<span class="pill chain">${esc(c)}</span>`).join('')
        + (r.chains.length > 3 ? `<span class="pill chain">+${r.chains.length - 3}</span>` : '');
      const badges = r.badges.map((b) => `<span class="pill ${badgeClass(b)}">${esc(b)}</span>`).join('');
      return `<tr class="${trap ? 'trap-row' : ''}" data-slug="${esc(r.slug)}">
        <td class="rank">${trap ? '–' : String(r.rank).padStart(2, '0')}</td>
        <td><span class="p-name">${esc(r.name)}${r.curated ? ' <span class="star" title="Curated watchlist">★</span>' : ''}</span><span class="pills"><span class="pill cat">${esc(r.category)}</span>${badges}</span></td>
        <td><span class="pills" style="margin-left:0">${chainPills}</span></td>
        <td class="num">${fmtUsd(r.tvlUsd)}</td>
        <td class="num ${chg === null ? '' : chg >= 0 ? 'pos' : 'neg'}">${fmtPct(chg)}<span class="dbar"><i style="left:${chg !== null && chg < 0 ? `${100 - barW}%` : '0'};width:${barW}%;background:${chg !== null && chg < 0 ? 'var(--crimson)' : 'var(--emerald)'}"></i></span></td>
        <td class="num">${r.ageMonths === null ? '<span style="color:var(--muted)">Unknown</span>' : `${r.ageMonths.toFixed(1)}m`}</td>
        <td class="num fdv" title="Base multiple ${r.mBase}× TVL, 1.60 FDV lift, momentum/age/chain adjusted">${fmtUsd(r.impliedFdv)}</td>
        <td><span class="gauge"><i style="width:${Math.round(r.p * 100)}%;background:${gaugeColor}"></i></span><span class="prob">${fmtProb(r.p)}</span> <span class="pill ${tierClass}">${tierLabel}</span></td>
        <td class="num ev">${fmtUsd(r.ev)}</td>
        <td><span class="status ${r.farmStatus}">${esc(r.farmStatus.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()))}</span><button type="button" class="view-btn" data-view="${esc(r.slug)}">View →</button></td>
      </tr>`;
    })
    .join('');
  $('boardBody').querySelectorAll('[data-view]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer(b.getAttribute('data-view'));
    });
  });
  $('boardBody').querySelectorAll('tr[data-slug]').forEach((tr) => {
    tr.addEventListener('click', () => openDrawer(tr.getAttribute('data-slug')));
  });
}

// ---------------------------------------------------------------- drawer
const T1 = new Set(['Ethereum', 'Solana', 'Base', 'Arbitrum', 'Optimism', 'Bitcoin']);
const T2 = new Set(['Monad', 'Sui', 'Avalanche', 'Binance', 'Ink', 'Tron', 'Berachain', 'Plume', 'Flare', 'Stellar', 'Plasma', 'Mezo', 'Ripple', 'Noble', 'Robinhood Chain', 'Arc']);
const chainTierLabel = (c) => (T1.has(c) ? 'Tier 1' : T2.has(c) ? 'Tier 2' : 'Tier 3');

function verdictClass(r) {
  if (r.badges.some((b) => /TRAP|LIVE TOKEN|NO-TGE/.test(b)) || r.farmStatus === 'no-route') return 'bad';
  if (r.farmStatus === 'institutional') return 'warn';
  if (r.farmStatus === 'active-points') return 'good';
  return 'info';
}
function stepTag(step) {
  if (/^(Avoid|Do not|Never)/.test(step)) return ['AVOID', 'avoid'];
  if (/^(Deposit|Supply|Connect|Bridge|Mint|Acquire|Fund|Route|Choose|Pick|Locate|Target|Use|Make|Restake|Stake|Lock|Delegate|Enroll|Participate)/.test(step)) return ['ACT', ''];
  if (/^(Check|Verify|Monitor|Track|Review|Inspect|Re-check|Note|Recognize|Understand)/.test(step)) return ['VERIFY', ''];
  return ['STEP', ''];
}
function wfRow(label, value, max, dim) {
  const w = Math.max(3, Math.min(100, ((Math.log10(Math.max(value, 1)) - 5) / (Math.log10(3e9) - 5)) * 100));
  return `<div class="wf-row${dim ? ' total' : ''}"><span class="w-label">${label}</span><span class="wf-bar"><i style="width:${w.toFixed(1)}%"></i></span><span class="w-val">${fmtUsd(value)}</span></div>`;
}

function openDrawer(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  const base = r.tvlUsd * r.mBase;
  const afterLift = base * 1.6;
  const afterGrowth = afterLift * r.fGrowth;
  const afterAge = afterGrowth * r.fAge;
  const effMult = (r.impliedFdv / r.tvlUsd).toFixed(3);
  const benchMult = (r.mBase * 1.6).toFixed(3);
  const benchMax = Math.max(Number(effMult), Number(benchMult), 0.01);
  const momMax = Math.max(Math.abs(r.change7d ?? 0), Math.abs(r.catMedian7d ?? 0), 1);
  const momBar = (v) =>
    v === null
      ? '<span style="color:var(--muted)">n/a</span>'
      : `<span class="wf-bar" style="display:inline-block;width:130px;vertical-align:middle"><i style="width:${Math.min(100, (Math.abs(v) / momMax) * 100).toFixed(0)}%;background:${v >= 0 ? 'var(--emerald)' : 'var(--crimson)'}"></i></span> <span class="mono">${fmtPct(v)}</span>`;
  const override =
    r.curated && Math.abs(r.p - r.pAuto) > 0.001
      ? `<span class="pl">Curated override → P_final</span><span>${fmtProb(r.p)}</span>`
      : `<span class="pl">P_final (= P_auto, ${r.curated ? 'curated value confirmed' : 'auto-scored'})</span><span>${fmtProb(r.p)}</span>`;
  $('drawer').innerHTML = `
    <button class="btn ghost d-close" id="drawerClose" type="button">Close ✕</button>
    <h2>${esc(r.name)}</h2>
    <div class="d-sub">${esc(r.category)} · Rank #${r.rank} by Expected FDV · ${r.curated ? '★ Curated Intel (watchlist)' : 'Auto-Scored (extended board)'} · Tier ${r.tier} · Listed ${r.listedAt ?? 'unknown date'}${r.ageMonths === null ? ' · Undated' : ` · ${r.ageMonths.toFixed(1)} months tracked`}</div>
    <div class="pills" style="margin-left:0">${r.chains.map((c) => `<span class="pill chain">${esc(c)} · ${chainTierLabel(c)}</span>`).join('')}</div>
    <div class="verdict ${verdictClass(r)}">${esc(r.verdict)}</div>
    <div class="d-sec"><h3>Valuation Waterfall — snapshot fields only</h3>
      ${wfRow(`Base Mcap (TVL × ${r.mBase})`, base)}
      ${wfRow('× 1.60 FDV lift', afterLift)}
      ${wfRow(`× F_growth ${r.fGrowth.toFixed(3)} (7d ${fmtPct(r.change7d)})`, afterGrowth)}
      ${wfRow(`× F_age ${r.fAge.toFixed(2)}`, afterAge)}
      ${wfRow(`× F_chain ${r.fChain.toFixed(3)}`, r.impliedFdv)}
      <div class="wf-row total"><span class="w-label">= Conditional Implied FDV</span><span></span><span class="w-val">${fmtUsd(r.impliedFdv)}</span></div>
      <div class="wf-row total"><span class="w-label">× P_launch ${fmtProb(r.p)} = Expected FDV</span><span></span><span class="w-val" style="color:var(--cyan)">${fmtUsd(r.ev)}</span></div>
    </div>
    <div class="d-sec bench">
      <div><div class="b-title">Effective multiple vs category benchmark</div>
        <div class="wf-row"><span class="w-label">Implied FDV / TVL</span><span class="wf-bar"><i style="width:${((Number(effMult) / benchMax) * 100).toFixed(0)}%"></i></span><span class="w-val">${effMult}×</span></div>
        <div class="wf-row"><span class="w-label">Benchmark (M_base × 1.60)</span><span class="wf-bar"><i style="width:${((Number(benchMult) / benchMax) * 100).toFixed(0)}%;background:rgba(148,163,184,.45)"></i></span><span class="w-val">${benchMult}×</span></div>
      </div>
      <div><div class="b-title">7d momentum vs category median</div>
        <div class="wf-row"><span class="w-label">${esc(r.name)}</span><span>${momBar(r.change7d)}</span><span></span></div>
        <div class="wf-row"><span class="w-label">${esc(r.category)} median</span><span>${momBar(r.catMedian7d)}</span><span></span></div>
      </div>
    </div>
    <div class="d-sec"><h3>Launch-Likelihood Breakdown</h3>
      <div class="pbreak">
        <span class="pl">Category baseline (P_cat)</span><span>${fmtProb(r.pCat)}</span>
        <span class="pl">Age adjustment (Δ_age)</span><span>${r.dAge >= 0 ? '+' : ''}${Math.round(r.dAge * 100)}%</span>
        <span class="pl">Frontier-chain catalyst (Δ_eco)</span><span>${r.dEco >= 0 ? '+' : ''}${Math.round(r.dEco * 100)}%</span>
        <span class="pl">Momentum catalyst (Δ_mom)</span><span>${r.dMom >= 0 ? '+' : ''}${Math.round(r.dMom * 100)}%</span>
        <span class="pl tot">= P_auto (model heuristic)</span><span class="tot">${fmtProb(r.pAuto)}</span>
        ${override}
      </div>
    </div>
    <div class="d-sec"><h3>Farm Playbook</h3>
      ${r.steps.map((s, i) => { const [tag, cls] = stepTag(s); return `<label class="step"><input type="checkbox"><span class="s-num">${i + 1}</span><span class="s-tag ${cls}">${tag}</span><p>${esc(s)}</p></label>`; }).join('')}
    </div>
    <div class="note-box"><b>Data integrity &amp; risk:</b> ${esc(r.note)}</div>`;
  $('drawer').hidden = false;
  $('scrim').hidden = false;
  $('drawerClose').addEventListener('click', closeDrawer);
  history.replaceState(null, '', `#p=${encodeURIComponent(slug)}`);
}
function closeDrawer() {
  $('drawer').hidden = true;
  $('scrim').hidden = true;
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------------------------------------------------------------- wiring
function renderAll() {
  renderScatter();
  renderTable();
}
function bindControls() {
  $('searchBox').addEventListener('input', (e) => { state.query = e.target.value; renderTable(); });
  $('catSel').addEventListener('change', (e) => { state.cat = e.target.value; renderTable(); });
  $('chainSel').addEventListener('change', (e) => { state.chain = e.target.value; renderTable(); });
  $('tvlSel').addEventListener('change', (e) => { state.tvl = e.target.value; renderTable(); });
  $('likeSel').addEventListener('change', (e) => { state.like = e.target.value; renderTable(); });
  $('farmSel').addEventListener('change', (e) => { state.farm = e.target.value; renderTable(); });
  $('cleanBtn').addEventListener('click', () => { state.showTraps = false; updateTrapPill(); renderAll(); });
  $('trapsBtn').addEventListener('click', () => { state.showTraps = true; updateTrapPill(); renderAll(); });
  $('scrim').addEventListener('click', closeDrawer);
  $('methodBtn').addEventListener('click', () => { $('methodModal').hidden = false; });
  $('methodClose').addEventListener('click', () => { $('methodModal').hidden = true; });
  $('methodModal').addEventListener('click', (e) => { if (e.target === $('methodModal')) $('methodModal').hidden = true; });
  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = key === 'ageMonths' ? 1 : -1;
      }
      document.querySelectorAll('th.sortable').forEach((h) => {
        const base = h.textContent.replace(/ [↓↑]$/, '');
        h.textContent = base + (h === th ? (state.sortDir === -1 ? ' ↓' : ' ↑') : '');
      });
      renderTable();
    });
  });
}

renderKpis();
renderCatBars();
renderChips();
renderSelects();
bindControls();
renderAll();

// Deep links (used for the detail and filtered screenshots, handy for readers):
//   #p=<slug> opens that protocol's drawer; #preset=<key> applies a preset.
(() => {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const preset = params.get('preset');
  if (preset && PRESETS.some(([k]) => k === preset)) {
    state.preset = preset;
    renderChips();
    renderAll();
  }
  const slug = params.get('p');
  if (slug) openDrawer(slug);
})();
