import type {
  PlatformApiResult,
  PlatformErrorBody,
  PlatformRequestOptions,
  PlatformSuccessBody,
} from "@/lib/platformApi/types";

function resolveCorrelationId(incoming?: string): string {
  const trimmed = incoming?.trim();
  if (trimmed) return trimmed;
  return crypto.randomUUID();
}

function readCorrelationId(
  response: Response,
  body: { correlationId?: string | null },
  fallback: string,
): string {
  return (
    response.headers.get("x-correlation-id")?.trim() ||
    body.correlationId?.trim() ||
    fallback
  );
}

/**
 * Map HTTP status to structured failure kinds used by Admin ops UI.
 * Status mapping only — no domain logic.
 */
function kindForStatus(status: number, bodyKind?: string): string {
  if (status === 409) return "ConcurrencyConflict";
  if (status === 403) return "PermissionFailure";
  if (bodyKind?.trim()) return bodyKind.trim();
  return "HttpError";
}

/** Default AuthN: Supabase browser session access_token (lazy import avoids env at module load). */
async function defaultGetAccessToken(): Promise<string | null> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase-client");
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token?.trim() || null;
}

async function platformRequest<T>(
  method: "GET" | "POST",
  path: string,
  options: PlatformRequestOptions = {},
): Promise<PlatformApiResult<T>> {
  const correlationId = resolveCorrelationId(options.correlationId);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Correlation-Id", correlationId);
  if (method === "POST" && options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (!headers.has("Authorization")) {
    const getAccessToken = options.getAccessToken ?? defaultGetAccessToken;
    const token = await getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetchImpl(path, {
    method,
    credentials: "same-origin",
    headers,
    body:
      method === "POST" && options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  let payload: PlatformSuccessBody<T> | PlatformErrorBody = {};
  try {
    payload = (await response.json()) as
      | PlatformSuccessBody<T>
      | PlatformErrorBody;
  } catch {
    // Non-JSON body — treat as empty payload
  }

  const responseCorrelationId = readCorrelationId(
    response,
    payload,
    correlationId,
  );

  if (response.ok) {
    const success = payload as PlatformSuccessBody<T>;
    if (!("data" in success) || success.data === undefined) {
      return {
        ok: false,
        kind: "HttpError",
        message: "Platform API response missing data",
        status: response.status,
        correlationId: responseCorrelationId,
      };
    }
    return {
      ok: true,
      value: success.data,
      correlationId: responseCorrelationId,
    };
  }

  const errorBody = payload as PlatformErrorBody;
  const message =
    errorBody.error?.message?.trim() ||
    `Platform API request failed (${response.status})`;

  return {
    ok: false,
    kind: kindForStatus(response.status, errorBody.error?.kind),
    message,
    status: response.status,
    correlationId: responseCorrelationId,
  };
}

/** Authenticated same-origin GET against `/api/v1` (Bearer from Supabase session). */
export function platformGet<T>(
  path: string,
  options?: PlatformRequestOptions,
): Promise<PlatformApiResult<T>> {
  return platformRequest<T>("GET", path, options);
}

/** Authenticated same-origin POST against `/api/v1` (Bearer from Supabase session). */
export function platformPost<T>(
  path: string,
  options?: PlatformRequestOptions,
): Promise<PlatformApiResult<T>> {
  return platformRequest<T>("POST", path, options);
}
