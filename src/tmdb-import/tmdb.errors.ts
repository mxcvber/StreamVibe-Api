/**
 * One request failed after its retries. The import records the id as failed
 * and carries on; the id gets one more chance in the retry pass at the end.
 */
export class TmdbRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TmdbRequestError';
  }
}

/**
 * Every further request would fail the same way (rejected access token,
 * TMDB unreachable), so the run stops immediately instead of recording 150k
 * failures.
 */
export class TmdbFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TmdbFatalError';
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
