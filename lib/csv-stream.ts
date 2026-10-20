/**
 * Browser CSV streaming for files of any size.
 *
 * PapaParse reads a File in chunks, so a multi-gigabyte CMS extract never has
 * to sit in memory. One pass collects the distinct drug names (and the sum of
 * a measure column per name); rows are kept only when the file is small enough
 * to hand back as an enriched CSV.
 */

import Papa from 'papaparse';
import { DistinctName, entryKey } from './crosswalk';

export type StreamRow = Record<string, string>;

/** Files up to this size keep their rows so the enriched CSV can be downloaded. */
export const RETAIN_ROWS_MAX_BYTES = 25 * 1024 * 1024;

export interface FilePreview {
  columns: string[];
  rows: StreamRow[];
}

export function previewCSV(file: File, rowLimit = 25): Promise<FilePreview> {
  return new Promise((resolve, reject) => {
    Papa.parse<StreamRow>(file, {
      header: true,
      skipEmptyLines: true,
      preview: rowLimit,
      complete: (results) => {
        const columns = (results.meta.fields ?? []).filter((c) => c !== '');
        if (columns.length === 0) {
          reject(new Error('No column headers found. The first row of the CSV must hold column names.'));
          return;
        }
        resolve({ columns, rows: results.data });
      },
      error: (error) => reject(error),
    });
  });
}

export function parseMeasure(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface StreamOptions {
  nameColumn: string;
  backupColumn: string | null;
  metricColumn: string | null;
  onProgress?: (fraction: number, rowsRead: number) => void;
  signal?: { cancelled: boolean };
}

export interface StreamResult {
  names: DistinctName[];
  rowsRead: number;
  /** Present only for files under RETAIN_ROWS_MAX_BYTES. */
  rows: StreamRow[] | null;
}

export function collectDistinctNames(file: File, options: StreamOptions): Promise<StreamResult> {
  const { nameColumn, backupColumn, metricColumn, onProgress, signal } = options;
  const retain = file.size <= RETAIN_ROWS_MAX_BYTES;
  const rows: StreamRow[] = [];
  const distinct = new Map<string, DistinctName>();
  let rowsRead = 0;

  return new Promise((resolve, reject) => {
    Papa.parse<StreamRow>(file, {
      header: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        if (signal?.cancelled) {
          parser.abort();
          return;
        }
        for (const row of results.data) {
          rowsRead++;
          if (retain) rows.push(row);
          const name = String(row[nameColumn] ?? '').trim();
          const backup = backupColumn ? String(row[backupColumn] ?? '').trim() || null : null;
          if (!name && !backup) continue;
          const key = entryKey(name, backup);
          let entry = distinct.get(key);
          if (!entry) {
            entry = { name, backup, rowCount: 0, metric: metricColumn ? 0 : null };
            distinct.set(key, entry);
          }
          entry.rowCount++;
          if (metricColumn) entry.metric = (entry.metric ?? 0) + parseMeasure(row[metricColumn]);
        }
        const cursor = results.meta.cursor ?? 0;
        onProgress?.(file.size ? Math.min(1, cursor / file.size) : 1, rowsRead);
      },
      complete: () => {
        resolve({
          names: [...distinct.values()].sort((a, b) => (b.metric ?? b.rowCount) - (a.metric ?? a.rowCount)),
          rowsRead,
          rows: retain ? rows : null,
        });
      },
      error: (error) => reject(error),
    });
  });
}

/** Pick a column whose lowercase name is in `preferred`, else one that contains a hint. */
export function guessColumn(columns: string[], preferred: string[], hints: string[] = []): string | null {
  const lower = columns.map((c) => c.toLowerCase());
  for (const p of preferred) {
    const i = lower.indexOf(p);
    if (i !== -1) return columns[i];
  }
  for (const h of hints) {
    const i = lower.findIndex((c) => c.includes(h));
    if (i !== -1) return columns[i];
  }
  return null;
}

export function guessNameColumn(columns: string[]): string | null {
  return guessColumn(
    columns,
    ['gnrc_name', 'generic_name', 'generic', 'drug_generic_name', 'ingredient'],
    ['gnrc', 'generic', 'medication', 'drug', 'description', 'med']
  );
}

export function guessBackupColumn(columns: string[], nameColumn: string | null): string | null {
  const found = guessColumn(columns, ['brnd_name', 'brand_name', 'brand', 'drug_name'], ['brnd', 'brand']);
  return found && found !== nameColumn ? found : null;
}

export function guessMetricColumn(columns: string[]): string | null {
  return guessColumn(
    columns,
    ['tot_clms', 'total_claim_count', 'claims', 'claim_count', 'tot_30day_fills', 'tot_drug_cst', 'total_drug_cost'],
    ['clms', 'claim', 'fills', 'cost', 'cst', 'quantity', 'qty']
  );
}
