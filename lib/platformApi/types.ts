/**
 * Client-side types for Platform API (`/api/v1`) HTTP envelope.
 * No business rules — transport shapes only.
 */

export type PlatformApiSuccess<T> = {
  ok: true;
  value: T;
  correlationId: string | null;
};

export type PlatformApiFailure = {
  ok: false;
  kind: string;
  message: string;
  status: number;
  correlationId: string | null;
};

export type PlatformApiResult<T> = PlatformApiSuccess<T> | PlatformApiFailure;

export type PlatformRequestOptions = {
  /** Propagated as `X-Correlation-Id`; generated when omitted. */
  correlationId?: string;
  /** Extra request headers (e.g. Idempotency-Key, Authorization). */
  headers?: Record<string, string>;
  /** JSON body for POST (and similar). */
  body?: unknown;
  /** Injected fetch for tests; defaults to globalThis.fetch. */
  fetch?: typeof fetch;
};

/** Success envelope returned by `platformRoute`. */
export type PlatformSuccessBody<T> = {
  data: T;
  correlationId?: string | null;
};

/** Error envelope returned by `platformRoute`. */
export type PlatformErrorBody = {
  error?: {
    kind?: string;
    message?: string;
  };
  correlationId?: string | null;
};
