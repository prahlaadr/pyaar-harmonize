/**
 * Type definitions for Drug Name Normalizer
 */

// ============================================================================
// RxNorm API Response Types
// ============================================================================

/**
 * Response from RxNorm approximateTerm.json endpoint
 * Used for fuzzy drug name matching
 */
export interface RxNormApproximateResponse {
  approximateGroup: {
    inputTerm: string | null;
    candidate: Array<{
      rxcui: string;
      rxaui?: string;
      score: string;
      rank: string;
      name?: string;
      source?: string;
    }>;
  };
}

/**
 * Response from RxNorm rxcui/{id}/related.json endpoint
 * Used to get drug ingredients (generic names)
 */
export interface RxNormRelatedResponse {
  relatedGroup: {
    rxcui: string | null;
    conceptGroup: Array<{
      tty: string;
      conceptProperties?: Array<{
        rxcui: string;
        name: string;
        synonym?: string;
        tty: string;
        language: string;
        suppress: string;
        umlscui?: string;
      }>;
    }>;
  };
}

// ============================================================================
// CSV Data Types
// ============================================================================

/**
 * Parsed CSV row (generic object with string keys)
 */
export type CSVRow = Record<string, string | number | null>;

/**
 * Parsed CSV data structure
 */
export interface ParsedCSVData {
  data: CSVRow[];
  columns: string[];
  meta: {
    delimiter: string;
    linebreak: string;
    aborted: boolean;
    truncated: boolean;
    cursor: number;
  };
}

// ============================================================================
// Normalization Processing Types
// ============================================================================

/**
 * Result of normalizing a single drug name
 */
export interface NormalizationResult {
  originalName: string;
  genericName: string | null;
  rxcui: string | null;
  status: 'success' | 'not_found' | 'error';
  errorMessage?: string;
}

/**
 * Progress information during batch normalization
 */
export interface NormalizationProgress {
  total: number;
  completed: number;
  current: string;
  percentage: number;
}

/**
 * Complete normalized row with original data + generic name
 */
export interface NormalizedRow extends CSVRow {
  GENERIC_NAME: string;
  RXCUI: string;
  MATCH_TYPE: string;
}

// ============================================================================
// Component State Types
// ============================================================================

/**
 * Application workflow states
 */
export type WorkflowState =
  | 'idle'           // Initial state, no file loaded
  | 'file-loaded'    // CSV file loaded, waiting for column selection
  | 'processing'     // Normalization in progress
  | 'completed'      // Normalization completed successfully
  | 'error';         // Error occurred

/**
 * Main application state
 */
export interface AppState {
  workflowState: WorkflowState;
  originalData: CSVRow[] | null;
  normalizedData: NormalizedRow[] | null;
  selectedColumn: string | null;
  columns: string[];
  progress: NormalizationProgress | null;
  error: string | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * RxNorm API client configuration
 */
export interface RxNormConfig {
  baseUrl: string;
  timeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

/**
 * CSV processing configuration
 */
export interface CSVConfig {
  delimiter: string;
  header: boolean;
  skipEmptyLines: boolean;
  dynamicTyping: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic API error structure
 */
export interface APIError {
  message: string;
  code?: string;
  details?: unknown;
}

/**
 * Result type for operations that can succeed or fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// ============================================================================
// Constants
// ============================================================================

/**
 * Default RxNorm API configuration
 */
export const DEFAULT_RXNORM_CONFIG: RxNormConfig = {
  baseUrl: 'https://rxnav.nlm.nih.gov/REST',
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
};

/**
 * Default CSV parsing configuration
 */
export const DEFAULT_CSV_CONFIG: CSVConfig = {
  delimiter: ',',
  header: true,
  skipEmptyLines: true,
  dynamicTyping: false,
};

/**
 * Column name for the added generic name field
 */
export const GENERIC_NAME_COLUMN = 'GENERIC_NAME' as const;

/**
 * Status messages for normalization results
 */
export const NORMALIZATION_STATUS = {
  SUCCESS: 'success',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
} as const;
