/**
 * Evaluate the Drug Classes matcher on real CMS Part D drug names.
 *
 * Pulls the national rows of "Medicare Part D Prescribers - by Geography and
 * Drug" (every distinct Brnd_Name / Gnrc_Name pair with national claim counts),
 * runs them through the same crosswalk code the browser uses, and reports how
 * many names and how many claims land in each match type.
 *
 *   npx tsx scripts/eval-partd.ts                 # 2024 data from the CMS API
 *   npx tsx scripts/eval-partd.ts path/to/file.csv  # any CSV with Gnrc_Name, Brnd_Name, Tot_Clms
 *
 * Writes scripts/out/partd-crosswalk.csv and scripts/out/partd-summary.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import {
  buildCrosswalk,
  crosswalkRows,
  rollup,
  summarizeMatches,
  DistinctName,
} from '../lib/crosswalk';

// Medicare Part D Prescribers - by Geography and Drug, data year 2024.
const CMS_DATASET = 'c8ea3f8e-3a09-4fea-86f2-8902fb4b0920';

type Row = Record<string, string>;

async function loadRows(path?: string): Promise<Row[]> {
  if (path) {
    const parsed = Papa.parse<Row>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true });
    return parsed.data;
  }
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 5000) {
    const url =
      `https://data.cms.gov/data-api/v1/dataset/${CMS_DATASET}/data` +
      `?filter%5BPrscrbr_Geo_Lvl%5D=National&size=5000&offset=${offset}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CMS API returned ${response.status}`);
    const batch = (await response.json()) as Row[];
    rows.push(...batch);
    if (batch.length < 5000) break;
  }
  return rows;
}

function pct(part: number, whole: number): string {
  return whole ? `${((100 * part) / whole).toFixed(1)}%` : '0%';
}

async function main() {
  const rows = await loadRows(process.argv[2]);
  const distinct = new Map<string, DistinctName>();
  for (const r of rows) {
    const name = (r.Gnrc_Name ?? '').trim();
    const backup = (r.Brnd_Name ?? '').trim() || null;
    const key = `${name}\u0001${backup}`;
    const metric = Number(r.Tot_Clms ?? 0) || 0;
    const entry = distinct.get(key) ?? { name, backup, rowCount: 0, metric: 0 };
    entry.rowCount++;
    entry.metric = (entry.metric ?? 0) + metric;
    distinct.set(key, entry);
  }
  const names = [...distinct.values()];
  console.error(`${rows.length} rows, ${names.length} distinct brand/generic pairs`);

  const started = Date.now();
  let lastLog = 0;
  const entries = await buildCrosswalk(names, ({ done, total }) => {
    if (Date.now() - lastLog > 5000 || done === total) {
      lastLog = Date.now();
      console.error(`  ${done}/${total} (${Math.round((Date.now() - started) / 1000)}s)`);
    }
  });

  const totalClaims = entries.reduce((s, e) => s + (e.metric ?? 0), 0);
  const summary = summarizeMatches(entries).map((s) => ({
    ...s,
    namesPct: pct(s.names, entries.length),
    claimsPct: pct(s.metric, totalClaims),
  }));
  const classified = entries.filter((e) => e.atc.primary[4]);
  const classifiedClaims = classified.reduce((s, e) => s + (e.metric ?? 0), 0);
  const drugClaims = entries
    .filter((e) => e.match.matchType !== 'supply')
    .reduce((s, e) => s + (e.metric ?? 0), 0);

  const top = rollup(entries, 4)
    .sort((a, b) => b.metric - a.metric)
    .slice(0, 15)
    .map((r) => ({ code: r.code, name: r.name, claimsPct: pct(r.metric, totalClaims) }));

  const report = {
    pairs: entries.length,
    totalClaims,
    seconds: Math.round((Date.now() - started) / 1000),
    byMatchType: summary,
    atcClassified: {
      pairs: classified.length,
      claimsPctOfAll: pct(classifiedClaims, totalClaims),
      claimsPctOfDrugs: pct(classifiedClaims, drugClaims),
    },
    topClassesByClaims: top,
  };

  const outDir = join(process.cwd(), 'scripts', 'out');
  mkdirSync(outDir, { recursive: true });
  const sorted = [...entries].sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));
  writeFileSync(
    join(outDir, 'partd-crosswalk.csv'),
    Papa.unparse(crosswalkRows(sorted, 'Gnrc_Name', 'Brnd_Name', 'Tot_Clms'))
  );
  writeFileSync(join(outDir, 'partd-summary.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
