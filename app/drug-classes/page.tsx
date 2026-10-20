'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import {
  CrosswalkEntry,
  CROSSWALK_COLUMNS,
  buildCrosswalk,
  crosswalkFields,
  crosswalkRows,
  entryKey,
  rollup,
  summarizeMatches,
  SUPPLY_CODE,
  UNCLASSIFIED_CODE,
} from '@/lib/crosswalk';
import { AtcLevel, ATC_LEVEL_LABELS } from '@/lib/atc';
import { MATCH_TYPE_LABELS, MatchType, needsReview } from '@/lib/drug-match';
import {
  FilePreview,
  RETAIN_ROWS_MAX_BYTES,
  StreamRow,
  collectDistinctNames,
  guessBackupColumn,
  guessMetricColumn,
  guessNameColumn,
  previewCSV,
} from '@/lib/csv-stream';
import { downloadCSV } from '@/lib/csv-processor';

type Phase = 'idle' | 'configure' | 'reading' | 'matching' | 'done';

interface Config {
  nameColumn: string;
  backupColumn: string;
  metricColumn: string;
}

const NUMBER = new Intl.NumberFormat('en-US');
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function share(part: number, whole: number): string {
  if (!whole) return '0%';
  const p = (100 * part) / whole;
  return p > 0 && p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`;
}

const MATCH_TONE: Record<MatchType, string> = {
  exact: 'bg-accent-secondary/30 text-brand-green',
  combination: 'bg-accent-secondary/30 text-brand-green',
  brand: 'bg-accent-secondary/30 text-brand-green',
  cleaned: 'bg-accent-secondary/20 text-brand-green',
  approximate: 'bg-saffron/30 text-foreground',
  supply: 'bg-surface-alt text-secondary',
  not_found: 'bg-accent-light text-accent',
  error: 'bg-accent-light text-accent',
};

function MatchBadge({ type }: { type: MatchType }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${MATCH_TONE[type]}`}
    >
      {MATCH_TYPE_LABELS[type]}
    </span>
  );
}

function ColumnSelect({
  label,
  hint,
  value,
  onChange,
  columns,
  optional,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  columns: string[];
  optional?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{hint}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
      >
        {optional && <option value="">None</option>}
        {!optional && !value && <option value="">Choose a column</option>}
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div className="h-3 w-full rounded-full bg-surface-alt">
      <div
        className="h-3 rounded-full bg-accent transition-all"
        style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
      />
    </div>
  );
}

export default function DrugClasses() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [config, setConfig] = useState<Config>({ nameColumn: '', backupColumn: '', metricColumn: '' });
  const [error, setError] = useState<string | null>(null);

  const [readFraction, setReadFraction] = useState(0);
  const [rowsRead, setRowsRead] = useState(0);
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0, current: '' });
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const [entries, setEntries] = useState<CrosswalkEntry[] | null>(null);
  const [sourceRows, setSourceRows] = useState<StreamRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [level, setLevel] = useState<AtcLevel>(4);
  const [showAllClasses, setShowAllClasses] = useState(false);

  const cancelRef = useRef({ cancelled: false });

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  const openFile = async (f: File) => {
    try {
      setError(null);
      const p = await previewCSV(f);
      const nameColumn = guessNameColumn(p.columns) ?? '';
      setFile(f);
      setPreview(p);
      setConfig({
        nameColumn,
        backupColumn: guessBackupColumn(p.columns, nameColumn) ?? '',
        metricColumn: guessMetricColumn(p.columns) ?? '',
      });
      setPhase('configure');
    } catch (err) {
      setError(`Could not read that file: ${err instanceof Error ? err.message : err}`);
    }
  };

  const loadSample = async () => {
    try {
      const response = await fetch('/sample-partd-prescribers.csv');
      const text = await response.text();
      await openFile(new File([text], 'sample-partd-prescribers.csv', { type: 'text/csv' }));
    } catch (err) {
      setError(`Failed to load the sample: ${err}`);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) openFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) openFile(f);
  };

  const reset = () => {
    cancelRef.current.cancelled = true;
    setPhase('idle');
    setFile(null);
    setPreview(null);
    setEntries(null);
    setSourceRows(null);
    setError(null);
    setShowAllClasses(false);
  };

  // -------------------------------------------------------------------------
  // Processing
  // -------------------------------------------------------------------------

  const run = async () => {
    if (!file || !config.nameColumn) return;
    const signal = { cancelled: false };
    cancelRef.current = signal;
    setError(null);
    setEntries(null);
    const started = Date.now();
    setStartedAt(started);

    try {
      setPhase('reading');
      setReadFraction(0);
      setRowsRead(0);
      const streamed = await collectDistinctNames(file, {
        nameColumn: config.nameColumn,
        backupColumn: config.backupColumn || null,
        metricColumn: config.metricColumn || null,
        onProgress: (fraction, rows) => {
          setReadFraction(fraction);
          setRowsRead(rows);
        },
        signal,
      });
      if (signal.cancelled) return;
      if (streamed.names.length === 0) {
        setError(`No values found in "${config.nameColumn}".`);
        setPhase('configure');
        return;
      }

      setTotalRows(streamed.rowsRead);
      setSourceRows(streamed.rows);
      setPhase('matching');
      setMatchProgress({ done: 0, total: streamed.names.length, current: '' });
      const result = await buildCrosswalk(
        streamed.names,
        (p) => setMatchProgress(p),
        6,
        signal
      );
      if (signal.cancelled) return;
      setEntries(result);
      setElapsed(Math.max(1, Math.round((Date.now() - started) / 1000)));
      setPhase('done');
    } catch (err) {
      if (signal.cancelled) return;
      setError(`Processing failed: ${err instanceof Error ? err.message : err}`);
      setPhase('configure');
    }
  };

  const cancel = () => {
    cancelRef.current.cancelled = true;
    setPhase('configure');
  };

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  const hasMetric = !!config.metricColumn;
  const measureLabel = hasMetric ? config.metricColumn : 'Rows';
  const weight = (x: { metric: number | null; rowCount?: number; rows?: number }) =>
    hasMetric ? x.metric ?? 0 : x.rowCount ?? x.rows ?? 0;

  const summary = useMemo(() => (entries ? summarizeMatches(entries) : []), [entries]);

  const totals = useMemo(() => {
    if (!entries) return null;
    const all = entries.reduce((s, e) => s + weight(e), 0);
    const classified = entries.filter((e) => e.atc.primary[4]).reduce((s, e) => s + weight(e), 0);
    const review = entries.filter((e) => needsReview(e.match.matchType));
    return { all, classified, reviewCount: review.length, reviewWeight: review.reduce((s, e) => s + weight(e), 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, hasMetric]);

  const rollupRows = useMemo(() => {
    if (!entries) return [];
    return rollup(entries, level)
      .map((r) => ({ ...r, value: hasMetric ? r.metric : r.rows }))
      .sort((a, b) => {
        const special = (c: string) => (c === UNCLASSIFIED_CODE || c === SUPPLY_CODE ? 1 : 0);
        return special(a.code) - special(b.code) || b.value - a.value;
      });
  }, [entries, level, hasMetric]);

  const reviewList = useMemo(
    () =>
      entries
        ? entries
            .filter((e) => needsReview(e.match.matchType))
            .sort((a, b) => weight(b) - weight(a))
            .slice(0, 15)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, hasMetric]
  );

  const maxRollup = rollupRows.reduce((m, r) => Math.max(m, r.value), 0);

  const baseName = (file?.name ?? 'drugs').replace(/\.csv$/i, '');

  const downloadCrosswalk = () => {
    if (!entries) return;
    const rows = crosswalkRows(
      [...entries].sort((a, b) => weight(b) - weight(a)),
      config.nameColumn,
      config.backupColumn || null,
      config.metricColumn || null
    );
    downloadCSV(Papa.unparse(rows), `${baseName}-drug-class-crosswalk.csv`);
  };

  const downloadRollup = () => {
    const rows = rollupRows.map((r) => ({
      [`ATC${level}_CODE`]: r.code,
      [`ATC${level}_NAME`]: r.name,
      DISTINCT_NAMES: r.names,
      SOURCE_ROWS: r.rows,
      ...(hasMetric ? { [`${config.metricColumn}_SUM`]: r.metric } : {}),
      SHARE: totals ? share(r.value, totals.all) : '',
    }));
    downloadCSV(Papa.unparse(rows), `${baseName}-atc${level}-rollup.csv`);
  };

  const downloadEnriched = () => {
    if (!entries || !sourceRows) return;
    const byKey = new Map(entries.map((e) => [e.key, crosswalkFields(e)]));
    const blank = Object.fromEntries(CROSSWALK_COLUMNS.map((c) => [c, '']));
    const rows = sourceRows.map((row) => {
      const name = String(row[config.nameColumn] ?? '').trim();
      const backup = config.backupColumn ? String(row[config.backupColumn] ?? '').trim() || null : null;
      return { ...row, ...(byKey.get(entryKey(name, backup)) ?? blank) };
    });
    downloadCSV(Papa.unparse(rows), `${baseName}-with-drug-classes.csv`);
  };

  const etaSeconds =
    phase === 'matching' && matchProgress.done > 10
      ? Math.round(((Date.now() - startedAt) / matchProgress.done) * (matchProgress.total - matchProgress.done) / 1000)
      : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">
          &larr; All harmonizers
        </Link>

        <header className="mt-8 mb-10">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">RxNorm → ATC</span>
          <h1 className="font-serif-display mt-3 text-4xl leading-[1.05] text-foreground md:text-5xl">
            Drug Class <em>Rollup</em>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary md:text-lg">
            Roll drug names up to WHO ATC drug classes. Built for claims extracts like the CMS Part D
            prescriber files, which carry brand and generic names but no drug codes. Your file stays in
            your browser; only the distinct drug names are sent to the NIH RxNav API.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-accent bg-accent-light px-4 py-3 text-sm text-accent">
            {error}
          </div>
        )}

        {/* ---------------------------------------------------------- Upload */}
        {phase === 'idle' && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <div className="mb-8 rounded-lg border border-border bg-background p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">How it works</h2>
              <ol className="mt-4 space-y-2 text-sm text-secondary">
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">1.</span>
                  <span>
                    <strong>Drop in a CSV of any size.</strong> A full Part D prescriber file is several
                    gigabytes; it is streamed in your browser, never uploaded.
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">2.</span>
                  <span>
                    <strong>Pick the columns:</strong> the drug name (Gnrc_Name), an optional backup name
                    (Brnd_Name), and an optional measure to total (Tot_Clms).
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">3.</span>
                  <span>
                    <strong>Each distinct name is matched once</strong>, exact first. Fuzzy matches are a last
                    resort and are flagged for review. Diabetic supplies are labeled, not forced onto a drug.
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">4.</span>
                  <span>
                    <strong>Download</strong> a crosswalk (one row per name, with RxCUI, ingredients and ATC
                    levels 1 to 4) to join back in SQL, plus a rollup by class.
                  </span>
                </li>
              </ol>
            </div>

            <div className="space-y-6">
              <button
                onClick={loadSample}
                className="focus-ring w-full rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90"
              >
                Try a Part D sample (synthetic prescribers)
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-surface px-2 text-muted">or</span>
                </div>
              </div>

              <label className="block" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
                <div className="cursor-pointer rounded-lg border-2 border-dashed border-border p-12 text-center transition-colors hover:border-accent">
                  <input type="file" accept=".csv,text/csv" onChange={handleFileInput} className="hidden" />
                  <p className="font-medium text-foreground">Click to choose a CSV file</p>
                  <p className="mt-2 text-sm text-muted">or drag and drop it here</p>
                  <p className="mt-2 text-xs text-muted">
                    Any size. Files under {RETAIN_ROWS_MAX_BYTES / (1024 * 1024)} MB also get an enriched copy
                    with the class columns appended.
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- Configure */}
        {phase === 'configure' && preview && file && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground">Choose columns</h2>
            <p className="mt-2 text-sm text-secondary">
              {file.name} · {formatBytes(file.size)} · {preview.columns.length} columns
            </p>

            <div className="mt-5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {preview.columns.map((col) => {
                      const role =
                        col === config.nameColumn
                          ? 'name'
                          : col === config.backupColumn
                            ? 'backup'
                            : col === config.metricColumn
                              ? 'measure'
                              : null;
                      return (
                        <th
                          key={col}
                          className={`whitespace-nowrap border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider ${
                            role ? 'bg-accent text-accent-foreground' : 'bg-background text-secondary'
                          }`}
                        >
                          {col}
                          {role && <span className="ml-1 font-normal normal-case opacity-80">({role})</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {preview.columns.map((col) => (
                        <td
                          key={col}
                          title={String(row[col] ?? '')}
                          className="max-w-[220px] truncate whitespace-nowrap px-3 py-2 text-secondary"
                        >
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
              <ColumnSelect
                label="Drug name"
                hint="Matched first. For Part D, the generic name (Gnrc_Name)."
                value={config.nameColumn}
                onChange={(v) => setConfig({ ...config, nameColumn: v })}
                columns={preview.columns}
              />
              <ColumnSelect
                label="Backup name"
                hint="Tried when the drug name fails, e.g. truncated combinations. For Part D, Brnd_Name."
                value={config.backupColumn}
                onChange={(v) => setConfig({ ...config, backupColumn: v })}
                columns={preview.columns.filter((c) => c !== config.nameColumn)}
                optional
              />
              <ColumnSelect
                label="Measure to total"
                hint="Summed per class in the rollup, e.g. Tot_Clms or Tot_Drug_Cst. Rows are counted if none."
                value={config.metricColumn}
                onChange={(v) => setConfig({ ...config, metricColumn: v })}
                columns={preview.columns.filter((c) => c !== config.nameColumn && c !== config.backupColumn)}
                optional
              />
            </div>

            {file.size > RETAIN_ROWS_MAX_BYTES && (
              <p className="mt-5 rounded-lg border border-border bg-background px-4 py-3 text-sm text-secondary">
                This file is large, so you will get the crosswalk and rollup but not an enriched copy of every
                row. Join the crosswalk back on {config.nameColumn || 'the drug name'}
                {config.backupColumn ? ` + ${config.backupColumn}` : ''} in your warehouse.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={run}
                disabled={!config.nameColumn}
                className="focus-ring flex-1 rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Build drug class crosswalk
              </button>
              <button
                onClick={reset}
                className="focus-ring rounded-lg border border-border px-8 py-4 font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------ Processing */}
        {(phase === 'reading' || phase === 'matching') && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground">
              {phase === 'reading' ? 'Reading your file…' : 'Matching drug names…'}
            </h2>

            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 flex justify-between text-sm tabular-nums text-secondary">
                  <span>1. Read file · {NUMBER.format(rowsRead)} rows</span>
                  <span>{Math.round((phase === 'reading' ? readFraction : 1) * 100)}%</span>
                </div>
                <ProgressBar fraction={phase === 'reading' ? readFraction : 1} />
              </div>
              <div className={phase === 'reading' ? 'opacity-40' : ''}>
                <div className="mb-2 flex justify-between text-sm tabular-nums text-secondary">
                  <span>
                    2. Match distinct names · {NUMBER.format(matchProgress.done)} /{' '}
                    {NUMBER.format(matchProgress.total)}
                  </span>
                  <span>
                    {matchProgress.total ? Math.round((matchProgress.done / matchProgress.total) * 100) : 0}%
                  </span>
                </div>
                <ProgressBar fraction={matchProgress.total ? matchProgress.done / matchProgress.total : 0} />
              </div>
            </div>

            {phase === 'matching' && (
              <p className="mt-4 text-sm text-muted">
                {matchProgress.current && <>Last matched: {matchProgress.current}. </>}
                {etaSeconds !== null && etaSeconds > 5 && <>About {Math.ceil(etaSeconds / 60)} min left. </>}
                NIH asks clients to stay under 20 requests a second, so a full Part D file takes several
                minutes. Keep this tab open.
              </p>
            )}

            <button
              onClick={cancel}
              className="focus-ring mt-6 rounded-lg border border-border px-6 py-3 text-sm font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
            >
              Cancel
            </button>
          </div>
        )}

        {/* --------------------------------------------------------- Results */}
        {phase === 'done' && entries && totals && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
              <h2 className="text-xl font-semibold text-foreground">Crosswalk ready</h2>
              <p className="mt-2 text-sm text-secondary">
                {NUMBER.format(totalRows)} rows · {NUMBER.format(entries.length)} distinct names · {elapsed}s
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wider text-muted">Classified (ATC)</p>
                  <p className="font-serif-display mt-1 text-3xl text-foreground tabular-nums">
                    {share(totals.classified, totals.all)}
                  </p>
                  <p className="mt-1 text-xs text-muted">of {hasMetric ? config.metricColumn : 'rows'}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wider text-muted">Needs review</p>
                  <p className="font-serif-display mt-1 text-3xl text-foreground tabular-nums">
                    {NUMBER.format(totals.reviewCount)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    names · {share(totals.reviewWeight, totals.all)} of {hasMetric ? config.metricColumn : 'rows'}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wider text-muted">{measureLabel}</p>
                  <p className="font-serif-display mt-1 text-3xl text-foreground tabular-nums">
                    {COMPACT.format(totals.all)}
                  </p>
                  <p className="mt-1 text-xs text-muted">total in file</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={downloadCrosswalk}
                  className="focus-ring flex-1 rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90"
                >
                  Download crosswalk
                </button>
                {sourceRows && (
                  <button
                    onClick={downloadEnriched}
                    className="focus-ring flex-1 rounded-lg border border-accent px-6 py-4 font-medium uppercase tracking-wider text-accent transition-colors hover:bg-accent-light"
                  >
                    Download file + classes
                  </button>
                )}
                <button
                  onClick={reset}
                  className="focus-ring rounded-lg border border-border px-6 py-4 font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
                >
                  New file
                </button>
              </div>
            </div>

            {/* Rollup */}
            <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Rollup by drug class</h2>
                  <p className="mt-1 max-w-xl text-sm text-secondary">
                    Each name counts once, under its primary class. Drugs in more than one class (timolol
                    tablets and eye drops, for example) go to the class most of their products carry; every
                    class is listed in ATC4_ALL.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
                  {([1, 2, 3, 4] as AtcLevel[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      title={ATC_LEVEL_LABELS[l]}
                      aria-label={`Level ${l}`}
                      className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                        level === l ? 'bg-accent text-accent-foreground' : 'text-secondary hover:bg-foreground/5'
                      }`}
                    >
                      <span className="sm:hidden">L{l}</span>
                      <span className="hidden sm:inline">Level {l}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">{ATC_LEVEL_LABELS[level]}</p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-semibold text-foreground">Code</th>
                      <th className="py-2 pr-3 font-semibold text-foreground">Class</th>
                      <th className="py-2 pr-3 text-right font-semibold text-foreground">Names</th>
                      <th className="py-2 pr-3 text-right font-semibold text-foreground">{measureLabel}</th>
                      <th className="w-1/4 py-2 font-semibold text-foreground">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllClasses ? rollupRows : rollupRows.slice(0, 20)).map((r) => (
                      <tr key={`${r.code}|${r.name}`} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs text-secondary">
                          {r.code.startsWith('(') ? '' : r.code}
                        </td>
                        <td
                          className={`py-2 pr-3 ${r.code.startsWith('(') ? 'italic text-muted' : 'text-foreground'}`}
                        >
                          {r.name}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-secondary">{NUMBER.format(r.names)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-secondary">
                          {NUMBER.format(Math.round(r.value))}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-surface-alt">
                              <div
                                className={`h-2 rounded-full ${r.code.startsWith('(') ? 'bg-muted' : 'bg-accent'}`}
                                style={{ width: `${maxRollup ? (100 * r.value) / maxRollup : 0}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-xs tabular-nums text-muted">
                              {share(r.value, totals.all)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {rollupRows.length > 20 && (
                  <button
                    onClick={() => setShowAllClasses(!showAllClasses)}
                    className="focus-ring text-sm font-medium text-accent hover:underline"
                  >
                    {showAllClasses ? 'Show top 20' : `Show all ${rollupRows.length} classes`}
                  </button>
                )}
                <button onClick={downloadRollup} className="focus-ring text-sm font-medium text-accent hover:underline">
                  Download this rollup (CSV)
                </button>
              </div>
            </div>

            {/* Match quality */}
            <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
              <h2 className="text-xl font-semibold text-foreground">How names were matched</h2>
              <p className="mt-1 max-w-2xl text-sm text-secondary">
                Exact, combination, brand and cleaned matches are string matches against RxNorm. Fuzzy matches
                passed a sanity check (the result shares a word stem with the input) but deserve a look.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-3 font-semibold text-foreground">Match type</th>
                      <th className="py-2 pr-3 text-right font-semibold text-foreground">Names</th>
                      <th className="py-2 pr-3 text-right font-semibold text-foreground">Rows</th>
                      {hasMetric && (
                        <th className="py-2 text-right font-semibold text-foreground">Share of {measureLabel}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((s) => (
                      <tr key={s.matchType} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3">
                          <MatchBadge type={s.matchType} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-secondary">{NUMBER.format(s.names)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-secondary">{NUMBER.format(s.rows)}</td>
                        {hasMetric && (
                          <td className="py-2 text-right tabular-nums text-secondary">
                            {share(s.metric, totals.all)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {reviewList.length > 0 && (
                <>
                  <h3 className="mt-8 text-sm font-semibold uppercase tracking-wider text-foreground">
                    Largest names to review
                  </h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="py-2 pr-3 font-semibold text-foreground">Name</th>
                          <th className="py-2 pr-3 font-semibold text-foreground">Matched to</th>
                          <th className="py-2 pr-3 font-semibold text-foreground">Class</th>
                          <th className="py-2 text-right font-semibold text-foreground">{measureLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewList.map((e) => (
                          <tr key={e.key} className="border-b border-border align-top last:border-0">
                            <td className="py-2 pr-3">
                              <div className="text-foreground">{e.name || e.backup}</div>
                              {e.backup && e.name && <div className="text-xs text-muted">{e.backup}</div>}
                            </td>
                            <td className="py-2 pr-3">
                              <MatchBadge type={e.match.matchType} />
                              <div className="mt-1 text-xs text-secondary">
                                {e.match.ingredients.map((i) => i.name).join(' / ') || e.match.note}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-xs text-secondary">
                              {e.atc.primary[4] ? `${e.atc.primary[4].code} ${e.atc.primary[4].name}` : ''}
                            </td>
                            <td className="py-2 text-right tabular-nums text-secondary">
                              {NUMBER.format(Math.round(weight(e)))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    The full list is in the crosswalk: filter MATCH_TYPE to approximate or not_found.
                  </p>
                </>
              )}
            </div>

            <p className="text-xs leading-relaxed text-muted">
              Classes come from the WHO ATC system as published in NLM RxClass (product-level ATCPROD first,
              ingredient-level ATC as the fallback). For data processing and analytics only, not for clinical
              decisions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
