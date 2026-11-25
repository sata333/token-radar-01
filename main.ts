// Token Launch Radar — entry program.
//
// Reads the frozen DefiLlama snapshot, builds the ranked launch-radar board
// with the model in lib/model.ts, and writes the full output set:
//   board.json            the ranked board (implied value = expected launch
//                         value, so implied_value_usd falls as rank ascends)
//   dashboard/            the static page, plus radar-data.js written beside it
//   screenshots/          the three dashboard captures shipped in the repo
//   dossier.json          built by the kit's own buildDossier, byte for byte
//
// Node 22+, standard library only. Input defaults to /input/snapshot.json
// (override with --input <path>); output defaults to /output (override with
// the MAKEFUN_OUTPUT_DIR environment variable).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = dirname(fileURLToPath(import.meta.url));

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const inputPath = resolve(argValue('--input') ?? '/input/snapshot.json');
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
const board = buildBoard(snapshot);

mkdirSync(outDir, { recursive: true });

// --- board.json -------------------------------------------------------------
const boardJson = {
  generated_from: snapshot.source,
  as_of: snapshot.as_of,
  model:
    'Implied FDV = TVL x category peer multiple x 1.60 FDV lift x momentum x age x chain factors; ' +
    'implied_value_usd is the expected launch value (Implied FDV x launch probability), the board rank key.',
  rows: board.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.ev,
    implied_fdv_usd: r.impliedFdv,
    launch_probability: r.p,
    tvl_usd: r.tvlUsd,
    category: r.category,
    farm_steps: r.steps,
  })),
};
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(boardJson, null, 2)}\n`);

// --- dashboard --------------------------------------------------------------
const dashOut = join(outDir, 'dashboard');
rmSync(dashOut, { recursive: true, force: true });
cpSync(join(here, 'dashboard'), dashOut, { recursive: true });
const dataJs = `window.RADAR_DATA = ${JSON.stringify({ meta: board.meta, rows: board.rows })};\n`;
writeFileSync(join(dashOut, 'radar-data.js'), dataJs);

// --- screenshots ------------------------------------------------------------
const shotsSrc = join(here, 'screenshots');
const shotsOut = join(outDir, 'screenshots');
rmSync(shotsOut, { recursive: true, force: true });
if (existsSync(shotsSrc)) {
  cpSync(shotsSrc, shotsOut, { recursive: true });
} else {
  mkdirSync(shotsOut, { recursive: true });
  console.error('warning: no screenshots/ directory in the repository; dossier will refuse an empty set');
}

// --- dossier ------------------------------------------------------------------
const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(
  `token-radar-01: ${board.rows.length} rows (${board.meta.curatedCount} curated, ` +
    `${board.meta.extendedCount} auto-scored), aggregate EV $${(board.meta.aggregateEvUsd / 1e6).toFixed(1)}M, ` +
    `dossier ${dossier.length} bytes -> ${outDir}`,
);
