/**
 * Crosswalk builder: distinct drug names -> RxNorm match + ATC classes,
 * flattened into CSV-ready rows, plus a class rollup.
 *
 * Shared by the Drug Classes page and the evaluation script, so the numbers in
 * the README come from the same code the browser runs.
 */

import { DrugMatch, MatchType, matchDrug } from './drug-match';
import { AtcAssignment, AtcLevel, classifyDrug, loadAtcHierarchy } from './atc';

export interface CrosswalkEntry {
  key: string;
  name: string;
  backup: string | null;
  /** Rows in the source file with this name (and backup). */
  rowCount: number;
  /** Sum of the chosen metric column across those rows (null if none chosen). */
  metric: number | null;
  match: DrugMatch;
  atc: AtcAssignment;
}

export const CROSSWALK_COLUMNS = [
  'MATCH_TYPE',
  'MATCHED_ON',
  'MATCH_SCORE',
  'RXCUI',
  'RXNORM_NAME',
  'RXNORM_TTY',
  'INGREDIENTS',
  'INGREDIENT_RXCUIS',
  'ATC_SOURCE',
  'ATC1_CODE',
  'ATC1_NAME',
  'ATC2_CODE',
  'ATC2_NAME',
  'ATC3_CODE',
  'ATC3_NAME',
  'ATC4_CODE',
  'ATC4_NAME',
  'ATC4_ALL',
  'MATCH_NOTE',
] as const;

export type CrosswalkColumn = (typeof CROSSWALK_COLUMNS)[number];

export function entryKey(name: string, backup: string | null): string {
  return `${name.trim().toLowerCase()}\u0001${(backup ?? '').trim().toLowerCase()}`;
}

/** The appended columns for one entry. */
export function crosswalkFields(entry: Pick<CrosswalkEntry, 'match' | 'atc'>): Record<CrosswalkColumn, string> {
  const { match, atc } = entry;
  const p = atc.primary;
  return {
    MATCH_TYPE: match.matchType,
    MATCHED_ON: match.matchedOn ?? '',
    MATCH_SCORE: match.score !== null ? match.score.toFixed(1) : '',
    RXCUI: match.rxcui ?? '',
    RXNORM_NAME: match.conceptName ?? '',
    RXNORM_TTY: match.tty ?? '',
    INGREDIENTS: match.ingredients.map((i) => i.name).join(' / '),
    INGREDIENT_RXCUIS: match.ingredients.map((i) => i.rxcui).join('|'),
    ATC_SOURCE: atc.source,
    ATC1_CODE: p[1]?.code ?? '',
    ATC1_NAME: p[1]?.name ?? '',
    ATC2_CODE: p[2]?.code ?? '',
    ATC2_NAME: p[2]?.name ?? '',
    ATC3_CODE: p[3]?.code ?? '',
    ATC3_NAME: p[3]?.name ?? '',
    ATC4_CODE: p[4]?.code ?? '',
    ATC4_NAME: p[4]?.name ?? '',
    ATC4_ALL: atc.classes.map((c) => c.code).join('|'),
    MATCH_NOTE: match.note ?? '',
  };
}

/** One row per distinct name, with the source columns first. */
export function crosswalkRows(
  entries: CrosswalkEntry[],
  nameColumn: string,
  backupColumn: string | null,
  metricColumn: string | null
): Record<string, string | number>[] {
  return entries.map((e) => {
    const row: Record<string, string | number> = { [nameColumn]: e.name };
    if (backupColumn) row[backupColumn] = e.backup ?? '';
    row.SOURCE_ROWS = e.rowCount;
    if (metricColumn) row[`${metricColumn}_SUM`] = e.metric ?? 0;
    return { ...row, ...crosswalkFields(e) };
  });
}

export interface DistinctName {
  name: string;
  backup: string | null;
  rowCount: number;
  metric: number | null;
}

export interface BuildProgress {
  done: number;
  total: number;
  current: string;
}

/**
 * Match and classify every distinct name. Runs a few names at once; the RxNav
 * client underneath enforces the rate limit.
 */
export async function buildCrosswalk(
  names: DistinctName[],
  onProgress?: (progress: BuildProgress) => void,
  concurrency = 6,
  signal?: { cancelled: boolean }
): Promise<CrosswalkEntry[]> {
  await loadAtcHierarchy();
  const results: CrosswalkEntry[] = new Array(names.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < names.length) {
      if (signal?.cancelled) return;
      const index = next++;
      const item = names[index];
      const match = await matchDrug(item.name, item.backup);
      let atc: AtcAssignment;
      try {
        atc = await classifyDrug(match);
      } catch {
        atc = { classes: [], primary: { 1: null, 2: null, 3: null, 4: null }, source: 'none' };
        match.note = [match.note, 'ATC lookup failed'].filter(Boolean).join('. ');
      }
      results[index] = {
        key: entryKey(item.name, item.backup),
        name: item.name,
        backup: item.backup,
        rowCount: item.rowCount,
        metric: item.metric,
        match,
        atc,
      };
      done++;
      onProgress?.({ done, total: names.length, current: item.name });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, worker));
  return results.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface MatchSummaryRow {
  matchType: MatchType;
  names: number;
  rows: number;
  metric: number;
}

export function summarizeMatches(entries: CrosswalkEntry[]): MatchSummaryRow[] {
  const order: MatchType[] = ['exact', 'combination', 'brand', 'cleaned', 'approximate', 'supply', 'not_found', 'error'];
  const byType = new Map<MatchType, MatchSummaryRow>();
  for (const e of entries) {
    const t = e.match.matchType;
    const row = byType.get(t) ?? { matchType: t, names: 0, rows: 0, metric: 0 };
    row.names++;
    row.rows += e.rowCount;
    row.metric += e.metric ?? 0;
    byType.set(t, row);
  }
  return order.filter((t) => byType.has(t)).map((t) => byType.get(t)!);
}

export interface RollupRow {
  code: string;
  name: string;
  names: number;
  rows: number;
  metric: number;
}

export const UNCLASSIFIED_CODE = '(unclassified)';
export const SUPPLY_CODE = '(supplies)';

/** Roll every entry up to its primary ATC class at the chosen level. */
export function rollup(entries: CrosswalkEntry[], level: AtcLevel): RollupRow[] {
  const groups = new Map<string, RollupRow>();
  for (const e of entries) {
    let code: string;
    let name: string;
    const cls = e.atc.primary[level];
    if (cls) {
      code = cls.code;
      name = cls.name;
    } else if (e.match.matchType === 'supply') {
      code = SUPPLY_CODE;
      name = 'Medical supplies (not drugs)';
    } else {
      code = UNCLASSIFIED_CODE;
      name = e.match.ingredients.length ? 'Matched, no ATC class' : 'No RxNorm match';
    }
    const groupKey = `${code}|${name}`;
    const row = groups.get(groupKey) ?? { code, name, names: 0, rows: 0, metric: 0 };
    row.names++;
    row.rows += e.rowCount;
    row.metric += e.metric ?? 0;
    groups.set(groupKey, row);
  }
  return [...groups.values()];
}
