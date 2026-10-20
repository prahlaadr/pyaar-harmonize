/**
 * Low-level RxNav (NIH / NLM) HTTP client shared by every harmonizer.
 *
 * - Rate limited to stay under NLM's published 20 requests/second per IP.
 * - Small concurrency pool so large name lists finish in minutes, not hours.
 * - Retries timeouts, 429s and 5xx with backoff; never retries other 4xx.
 * - Caches every response by path, so repeated lookups are free.
 *
 * Works in the browser and in Node 18+ (both have fetch + AbortController).
 */

export const RXNAV_BASE_URL = 'https://rxnav.nlm.nih.gov/REST';

export interface RxNavSettings {
  /** Upper bound on request starts per second. NLM allows 20; stay under it. */
  requestsPerSecond: number;
  /** Requests allowed in flight at once. */
  maxConcurrent: number;
  timeoutMs: number;
  retries: number;
}

const settings: RxNavSettings = {
  requestsPerSecond: 15,
  maxConcurrent: 6,
  timeoutMs: 15000,
  retries: 3,
};

export function configureRxNav(overrides: Partial<RxNavSettings>): void {
  Object.assign(settings, overrides);
}

export class RxNavError extends Error {
  constructor(
    message: string,
    public status?: number,
    public path?: string
  ) {
    super(message);
    this.name = 'RxNavError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Limiter: caps in-flight requests and spaces out request starts.
// ---------------------------------------------------------------------------

let inFlight = 0;
let nextStartAt = 0;
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  while (inFlight >= settings.maxConcurrent) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  inFlight++;
  const interval = 1000 / settings.requestsPerSecond;
  const now = Date.now();
  const startAt = Math.max(now, nextStartAt);
  nextStartAt = startAt + interval;
  if (startAt > now) await sleep(startAt - now);
}

function releaseSlot(): void {
  inFlight--;
  const next = waiting.shift();
  if (next) next();
}

// ---------------------------------------------------------------------------
// Fetch with timeout + retry
// ---------------------------------------------------------------------------

async function fetchOnce(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${RXNAV_BASE_URL}${path}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= settings.retries; attempt++) {
    await acquireSlot();
    try {
      const response = await fetchOnce(url);
      if (response.ok) {
        return (await response.json()) as T;
      }
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new RxNavError(`HTTP ${response.status} from RxNav`, response.status, path);
      if (!retryable) throw lastError;
    } catch (error) {
      if (error instanceof RxNavError && error.status && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
    } finally {
      releaseSlot();
    }
    if (attempt < settings.retries) await sleep(800 * 2 ** attempt);
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new RxNavError(`RxNav request failed after ${settings.retries + 1} attempts: ${message}`, undefined, path);
}

const responseCache = new Map<string, Promise<unknown>>();

/**
 * GET a RxNav REST path (starting with "/"), cached by path.
 * Failed requests are evicted so a later call can try again.
 */
export function rxnavGet<T>(path: string): Promise<T> {
  const cached = responseCache.get(path);
  if (cached) return cached as Promise<T>;
  const pending = fetchJson<T>(path).catch((error) => {
    responseCache.delete(path);
    throw error;
  });
  responseCache.set(path, pending);
  return pending;
}

export function clearRxNavCache(): void {
  responseCache.clear();
}

export const q = (value: string) => encodeURIComponent(value);
