'use client';

import { useState } from 'react';
import Link from 'next/link';
import { readCSVFile, downloadCSV, generateCSV, addGenericNameColumn, detectMedicationColumn } from '@/lib/csv-processor';
import { normalizeDrugNameBatch } from '@/lib/rxnorm-client';
import { CSVRow, NormalizedRow, ParsedCSVData } from '@/lib/types';

export default function DrugNames() {
  const [csvData, setCSVData] = useState<ParsedCSVData | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, drugName: '' });
  const [normalizedData, setNormalizedData] = useState<NormalizedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load sample data
  const loadSample = async () => {
    try {
      setError(null);
      const response = await fetch('/realistic-sample.csv');
      const text = await response.text();

      const Papa = await import('papaparse');
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const columns = results.meta.fields || [];
          setCSVData({
            data: results.data as CSVRow[],
            columns,
            meta: results.meta,
          });

          const detected = detectMedicationColumn(columns);
          if (detected) {
            setSelectedColumn(detected);
          }
        },
      });
    } catch (err) {
      setError(`Failed to load sample: ${err}`);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const parsed = await readCSVFile(file);
      setCSVData(parsed);

      const detected = detectMedicationColumn(parsed.columns);
      if (detected) {
        setSelectedColumn(detected);
      }
    } catch (err) {
      setError(`Failed to parse CSV: ${err}`);
    }
  };

  // Normalize drugs
  const handleNormalize = async () => {
    if (!csvData || !selectedColumn) return;

    try {
      setProcessing(true);
      setError(null);

      const drugNames = csvData.data.map(row => String(row[selectedColumn] || '').trim()).filter(Boolean);
      const uniqueDrugs = Array.from(new Set(drugNames));

      const results = await normalizeDrugNameBatch(
        uniqueDrugs,
        (completed, total, current) => {
          setProgress({ current: completed, total, drugName: current });
        }
      );

      const genericMap = new Map<string, string>();
      results.forEach(result => {
        genericMap.set(result.originalName, result.genericName || 'NOT_FOUND');
      });

      const normalized = addGenericNameColumn(csvData.data, selectedColumn, genericMap);
      setNormalizedData(normalized);
    } catch (err) {
      setError(`Normalization failed: ${err}`);
    } finally {
      setProcessing(false);
    }
  };

  // Download results
  const handleDownload = () => {
    if (!normalizedData) return;
    const csv = generateCSV(normalizedData);
    downloadCSV(csv, 'normalized-medications.csv');
  };

  return (
    <div className="px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-foreground"
        >
          &larr; All harmonizers
        </Link>

        {/* Header */}
        <header className="mt-8 mb-10">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            RxNorm
          </span>
          <h1 className="font-serif-display mt-3 text-4xl leading-[1.05] text-foreground md:text-5xl">
            Drug Name <em>Normalization</em>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary md:text-lg">
            Map brand names, abbreviations, and variations to a single generic
            ingredient using the NIH RxNorm API. Everything runs in your browser,
            your data never leaves your device.
          </p>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border border-accent bg-accent-light px-4 py-3 text-sm text-accent">
            {error}
          </div>
        )}

        {/* Upload Section */}
        {!csvData && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            {/* Instructions */}
            <div className="mb-8 rounded-lg border border-border bg-background p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">How it works</h2>
              <ol className="mt-4 space-y-2 text-sm text-secondary">
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">1.</span>
                  <span><strong>Upload your data:</strong> click &ldquo;Try sample data&rdquo; to test with example medications, or upload your own CSV with a medication-name column.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">2.</span>
                  <span><strong>Select column:</strong> choose which column holds the medication names.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">3.</span>
                  <span><strong>Process:</strong> RxNorm resolves brand names and variations to standardized generic names.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2 font-semibold text-accent">4.</span>
                  <span><strong>Download:</strong> get your enriched CSV with a new GENERIC_NAME column.</span>
                </li>
              </ol>
              <p className="mt-4 text-xs text-muted">
                All processing happens in your browser, your data never leaves your device.
              </p>
            </div>

            <div className="space-y-6">
              <button
                onClick={loadSample}
                className="focus-ring w-full rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90"
              >
                Try sample data (15 medications)
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-surface px-2 text-muted">or</span>
                </div>
              </div>

              <label className="block">
                <div className="cursor-pointer rounded-lg border-2 border-dashed border-border p-12 text-center transition-colors hover:border-accent">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <p className="font-medium text-foreground">Click to upload your CSV file</p>
                  <p className="mt-2 text-sm text-muted">or drag and drop</p>
                  <p className="mt-2 text-xs text-muted">Maximum file size: 10MB</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Column Selection */}
        {csvData && !normalizedData && !processing && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground">Select medication column</h2>
            <p className="mt-2 text-sm text-secondary">
              Found {csvData.data.length} rows with {csvData.columns.length} columns.
            </p>

            <p className="mt-2 text-sm text-secondary">
              Click a column header to choose which one holds the medication names.
            </p>

            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {csvData.columns.map((col) => {
                      const selected = col === selectedColumn;
                      return (
                        <th key={col} className="border-b border-border p-0">
                          <button
                            onClick={() => setSelectedColumn(col)}
                            className={`focus-ring w-full whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider transition-colors ${
                              selected
                                ? 'bg-accent text-accent-foreground'
                                : 'bg-background text-secondary hover:bg-foreground/5'
                            }`}
                          >
                            {col}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {csvData.data.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {csvData.columns.map((col) => (
                        <td
                          key={col}
                          title={String(row[col] ?? '')}
                          className={`max-w-[220px] truncate whitespace-nowrap px-3 py-2 ${
                            col === selectedColumn
                              ? 'bg-accent-light text-foreground'
                              : 'text-secondary'
                          }`}
                        >
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(() => {
              if (!selectedColumn) return null;
              const names = csvData.data
                .map((row) => String(row[selectedColumn] || '').trim())
                .filter(Boolean);
              const uniqueNames = Array.from(new Set(names));
              return (
                <div className="mt-6 rounded-lg border border-border bg-background p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Preview: {uniqueNames.length} unique names to normalize
                  </h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {uniqueNames.slice(0, 30).map((name) => (
                      <li
                        key={name}
                        className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-secondary"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                  {uniqueNames.length > 30 && (
                    <p className="mt-3 text-xs text-muted">
                      Showing 30 of {uniqueNames.length} unique names.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleNormalize}
                disabled={!selectedColumn}
                className="focus-ring flex-1 rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Normalize drug names
              </button>
              <button
                onClick={() => {
                  setCSVData(null);
                  setSelectedColumn('');
                  setError(null);
                }}
                className="focus-ring rounded-lg border border-border px-8 py-4 font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {/* Processing Status */}
        {processing && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground">Processing…</h2>
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-sm text-secondary tabular-nums">
                <span>Progress: {progress.current} / {progress.total}</span>
                <span>{Math.round((progress.current / progress.total) * 100)}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-surface-alt">
                <div
                  className="h-3 rounded-full bg-accent transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
            {progress.drugName && (
              <p className="mt-3 text-sm text-muted">
                Processing: {progress.drugName}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {normalizedData && (
          <div className="rounded-xl border border-border bg-surface p-6 md:p-8">
            <h2 className="text-xl font-semibold text-foreground">Normalization complete</h2>
            <p className="mt-2 text-sm text-secondary">
              Successfully processed {normalizedData.length} medications.
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left font-semibold text-foreground">Original</th>
                    <th className="p-3 text-left font-semibold text-foreground">Generic name</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedData.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="p-3 text-secondary">{String(row[selectedColumn])}</td>
                      <td className="p-3 font-medium text-accent">{row.GENERIC_NAME}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {normalizedData.length > 10 && (
                <p className="mt-2 text-sm text-muted">
                  Showing 10 of {normalizedData.length} rows.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleDownload}
                className="focus-ring flex-1 rounded-lg bg-accent px-6 py-4 font-medium uppercase tracking-wider text-accent-foreground transition-colors hover:opacity-90"
              >
                Download normalized CSV
              </button>
              <button
                onClick={() => {
                  setCSVData(null);
                  setNormalizedData(null);
                  setSelectedColumn('');
                }}
                className="focus-ring flex-1 rounded-lg border border-border px-6 py-4 font-medium uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/5"
              >
                Process another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
