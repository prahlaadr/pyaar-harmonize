/**
 * CSV Processing Utilities
 *
 * Handles CSV parsing, validation, and generation for the drug normalizer.
 * Uses PapaParse for robust CSV handling.
 */

import Papa from 'papaparse';
import {
  CSVRow,
  ParsedCSVData,
  NormalizedRow,
  CSVConfig,
  DEFAULT_CSV_CONFIG,
  GENERIC_NAME_COLUMN,
} from './types';
import type { DrugMatch } from './drug-match';

/**
 * Custom error class for CSV processing errors
 */
export class CSVProcessingError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'CSVProcessingError';
  }
}

/**
 * Parse CSV file content
 *
 * @param csvContent - Raw CSV file content as string
 * @param config - Optional CSV configuration
 * @returns Parsed CSV data with rows and columns
 * @throws CSVProcessingError if parsing fails
 *
 * @example
 * ```ts
 * const csvContent = "name,age\nJohn,30\nJane,25";
 * const parsed = parseCSV(csvContent);
 * // parsed.data = [{ name: "John", age: "30" }, { name: "Jane", age: "25" }]
 * // parsed.columns = ["name", "age"]
 * ```
 */
export function parseCSV(
  csvContent: string,
  config: Partial<CSVConfig> = {}
): Promise<ParsedCSVData> {
  if (!csvContent || csvContent.trim() === '') {
    throw new CSVProcessingError('CSV content is empty', 'EMPTY_CONTENT');
  }

  const fullConfig = { ...DEFAULT_CSV_CONFIG, ...config };

  return new Promise((resolve, reject) => {
    Papa.parse<CSVRow>(csvContent, {
      ...fullConfig,
      complete: (results) => {
        // Check for parsing errors
        if (results.errors.length > 0) {
          const errorMessages = results.errors
            .map((err) => `Row ${err.row}: ${err.message}`)
            .join('; ');
          reject(
            new CSVProcessingError(
              `CSV parsing errors: ${errorMessages}`,
              'PARSE_ERROR',
              results.errors
            )
          );
          return;
        }

        // Validate we have data
        if (!results.data || results.data.length === 0) {
          reject(
            new CSVProcessingError(
              'No data found in CSV file',
              'NO_DATA'
            )
          );
          return;
        }

        // Extract column names from first row if headers enabled
        const columns = results.meta.fields || [];

        if (fullConfig.header && columns.length === 0) {
          reject(
            new CSVProcessingError(
              'No column headers found in CSV file',
              'NO_HEADERS'
            )
          );
          return;
        }

        resolve({
          data: results.data,
          columns,
          meta: results.meta,
        });
      },
      error: (error: Error) => {
        reject(
          new CSVProcessingError(
            `Papa Parse error: ${error.message}`,
            'PAPA_PARSE_ERROR',
            error
          )
        );
      },
    });
  });
}

/**
 * Read CSV file from File object
 *
 * @param file - File object from file input
 * @param config - Optional CSV configuration
 * @returns Parsed CSV data
 * @throws CSVProcessingError if file reading or parsing fails
 *
 * @example
 * ```ts
 * const file = event.target.files[0];
 * const parsed = await readCSVFile(file);
 * ```
 */
export async function readCSVFile(
  file: File,
  config: Partial<CSVConfig> = {}
): Promise<ParsedCSVData> {
  if (!file) {
    throw new CSVProcessingError('No file provided', 'NO_FILE');
  }

  // Validate file type
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    throw new CSVProcessingError(
      'File must be a CSV file (.csv)',
      'INVALID_FILE_TYPE',
      { fileName: file.name, fileType: file.type }
    );
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new CSVProcessingError(
      `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
      'FILE_TOO_LARGE',
      { fileSize: file.size, maxSize }
    );
  }

  try {
    const csvContent = await file.text();
    return await parseCSV(csvContent, config);
  } catch (error) {
    if (error instanceof CSVProcessingError) {
      throw error;
    }
    throw new CSVProcessingError(
      `Failed to read CSV file: ${error}`,
      'FILE_READ_ERROR',
      error
    );
  }
}

/**
 * Validate that a column exists in the parsed data
 *
 * @param columns - Array of column names
 * @param columnName - Column name to validate
 * @returns true if column exists
 * @throws CSVProcessingError if column doesn't exist
 */
export function validateColumn(
  columns: string[],
  columnName: string
): boolean {
  if (!columns.includes(columnName)) {
    throw new CSVProcessingError(
      `Column "${columnName}" not found in CSV file`,
      'COLUMN_NOT_FOUND',
      { availableColumns: columns, requestedColumn: columnName }
    );
  }
  return true;
}

/**
 * Extract unique values from a specific column
 *
 * @param data - Parsed CSV data
 * @param columnName - Column name to extract from
 * @returns Array of unique non-null values
 *
 * @example
 * ```ts
 * const drugNames = extractColumnValues(parsedData, 'DESCRIPTION');
 * // Returns: ["Tylenol", "Advil", "Lipitor", ...]
 * ```
 */
export function extractColumnValues(
  data: CSVRow[],
  columnName: string
): string[] {
  const values = new Set<string>();

  for (const row of data) {
    const value = row[columnName];
    if (value !== null && value !== undefined && value !== '') {
      values.add(String(value).trim());
    }
  }

  return Array.from(values);
}

/**
 * Add generic name column to CSV data
 *
 * @param originalData - Original CSV rows
 * @param columnName - Column containing drug names
 * @param genericNames - Map of original drug name to generic name
 * @returns Normalized rows with GENERIC_NAME column added
 *
 * @example
 * ```ts
 * const genericMap = new Map([
 *   ["Tylenol", "acetaminophen"],
 *   ["Advil", "ibuprofen"]
 * ]);
 * const normalized = addGenericNameColumn(data, "DESCRIPTION", genericMap);
 * ```
 */
export function addGenericNameColumn(
  originalData: CSVRow[],
  columnName: string,
  genericNames: Map<string, string>
): NormalizedRow[] {
  return originalData.map((row) => {
    const drugName = String(row[columnName] || '').trim();
    const genericName = genericNames.get(drugName) || 'NOT_FOUND';

    return {
      ...row,
      [GENERIC_NAME_COLUMN]: genericName,
    } as NormalizedRow;
  });
}

/**
 * Append GENERIC_NAME (all active ingredients, " / " separated), RXCUI and
 * MATCH_TYPE columns from matcher results keyed by the original name.
 */
export function addMatchColumns(
  originalData: CSVRow[],
  columnName: string,
  matches: Map<string, DrugMatch>
): NormalizedRow[] {
  return originalData.map((row) => {
    const drugName = String(row[columnName] || '').trim();
    const match = matches.get(drugName);
    const ingredients = match?.ingredients.map((i) => i.name).join(' / ');
    return {
      ...row,
      [GENERIC_NAME_COLUMN]: ingredients || (match?.matchType === 'supply' ? 'SUPPLY' : 'NOT_FOUND'),
      RXCUI: match?.rxcui ?? '',
      MATCH_TYPE: match?.matchType ?? 'not_found',
    } as NormalizedRow;
  });
}

/**
 * Convert data back to CSV format
 *
 * @param data - Array of data rows
 * @param config - Optional CSV configuration
 * @returns CSV string
 *
 * @example
 * ```ts
 * const csvString = generateCSV(normalizedData);
 * // Returns: "PATIENT,DESCRIPTION,GENERIC_NAME\n001,Tylenol,acetaminophen\n..."
 * ```
 */
export function generateCSV(
  data: CSVRow[] | NormalizedRow[],
  config: Partial<CSVConfig> = {}
): string {
  if (!data || data.length === 0) {
    throw new CSVProcessingError('No data to generate CSV', 'NO_DATA');
  }

  const fullConfig = { ...DEFAULT_CSV_CONFIG, ...config };

  return Papa.unparse(data, {
    delimiter: fullConfig.delimiter,
    header: fullConfig.header,
  });
}

/**
 * Trigger CSV file download in browser
 *
 * @param csvContent - CSV string content
 * @param filename - Name for the downloaded file
 *
 * @example
 * ```ts
 * downloadCSV(csvString, 'normalized-medications.csv');
 * ```
 */
export function downloadCSV(csvContent: string, filename: string): void {
  if (!csvContent) {
    throw new CSVProcessingError(
      'Cannot download empty CSV content',
      'NO_CONTENT'
    );
  }

  try {
    // Create blob from CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new CSVProcessingError(
      `Failed to download CSV: ${error}`,
      'DOWNLOAD_ERROR',
      error
    );
  }
}

/**
 * Detect likely medication column from column names
 *
 * Common medication column names in healthcare data
 */
const MEDICATION_COLUMN_KEYWORDS = [
  'medication',
  'drug',
  'medicine',
  'description',
  'name',
  'med',
  'rx',
  'prescription',
];

/**
 * Attempt to auto-detect the medication column
 *
 * @param columns - Array of column names
 * @returns Suggested column name or null if no good match
 *
 * @example
 * ```ts
 * const columns = ['PATIENT', 'DESCRIPTION', 'DATE'];
 * const suggested = detectMedicationColumn(columns);
 * // Returns: "DESCRIPTION"
 * ```
 */
export function detectMedicationColumn(columns: string[]): string | null {
  // Normalize column names for comparison
  const normalizedColumns = columns.map((col) => col.toLowerCase());

  // Try exact matches first
  for (const keyword of MEDICATION_COLUMN_KEYWORDS) {
    const index = normalizedColumns.indexOf(keyword);
    if (index !== -1) {
      return columns[index];
    }
  }

  // Try partial matches
  for (const keyword of MEDICATION_COLUMN_KEYWORDS) {
    const index = normalizedColumns.findIndex((col) => col.includes(keyword));
    if (index !== -1) {
      return columns[index];
    }
  }

  return null;
}

/**
 * Get CSV file statistics
 *
 * @param data - Parsed CSV data
 * @returns Object with statistics
 *
 * @example
 * ```ts
 * const stats = getCSVStats(parsedData);
 * // Returns: { rowCount: 100, columnCount: 5, ... }
 * ```
 */
export function getCSVStats(data: ParsedCSVData): {
  rowCount: number;
  columnCount: number;
  columns: string[];
  hasHeaders: boolean;
  isEmpty: boolean;
} {
  return {
    rowCount: data.data.length,
    columnCount: data.columns.length,
    columns: data.columns,
    hasHeaders: data.columns.length > 0,
    isEmpty: data.data.length === 0,
  };
}

/**
 * Validate CSV structure for drug normalization
 *
 * @param parsedData - Parsed CSV data
 * @returns Validation result
 *
 * @example
 * ```ts
 * const validation = validateCSVStructure(parsedData);
 * if (!validation.isValid) {
 *   console.error(validation.errors);
 * }
 * ```
 */
export function validateCSVStructure(parsedData: ParsedCSVData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for data
  if (parsedData.data.length === 0) {
    errors.push('CSV file contains no data rows');
  }

  // Check for columns
  if (parsedData.columns.length === 0) {
    errors.push('CSV file contains no columns');
  }

  // Check if we can detect a medication column
  if (parsedData.columns.length > 0) {
    const detectedColumn = detectMedicationColumn(parsedData.columns);
    if (!detectedColumn) {
      warnings.push(
        'Could not auto-detect medication column - manual selection required'
      );
    }
  }

  // Check for very large files
  if (parsedData.data.length > 1000) {
    warnings.push(
      `Large file detected (${parsedData.data.length} rows) - processing may take several minutes`
    );
  }

  // Check for potential duplicates in data
  if (parsedData.data.length > 10) {
    const sample = parsedData.data.slice(0, 10);
    const firstRowKeys = Object.keys(sample[0]);
    const hasConsistentKeys = sample.every(
      (row) => Object.keys(row).length === firstRowKeys.length
    );

    if (!hasConsistentKeys) {
      warnings.push('Inconsistent number of columns detected across rows');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
