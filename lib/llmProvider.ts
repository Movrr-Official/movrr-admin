/**
 * LLM Provider — single-boundary abstraction over the Anthropic Messages API.
 *
 * ALL external LLM communication flows through this module. Callers must not
 * import any LLM SDK or call any AI API endpoint directly.
 *
 * Design rules:
 * - API key is never logged (redacted in all log output)
 * - Structured JSON output is the only accepted response format
 * - Timeout, retry, and error handling are fully contained here
 * - Returns a typed result union — callers always get success|error, never throw
 *
 * SHADOW MODE ONLY. This module is imported exclusively by routeIntelligence.ts.
 * It must never be imported from live routing, reward, or verification paths.
 */

import { LLM_API_BASE_URL, LLM_API_KEY, LLM_MAX_RETRIES, LLM_MODEL, LLM_TIMEOUT_MS } from "@/lib/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LLMRequest {
  /** System-level instruction for the model. Must be clear and bounded. */
  systemPrompt: string;
  /** Task-specific user prompt. Must not contain secrets or sensitive PII. */
  userPrompt: string;
  /** Maximum output tokens. Keep small for structured JSON responses. */
  maxTokens?: number;
}

export type LLMSuccess = {
  ok: true;
  content: string;
  modelName: string;
  latencyMs: number;
};

export type LLMError = {
  ok: false;
  errorCode:
    | "no_api_key"
    | "timeout"
    | "upstream_error"
    | "empty_response"
    | "unexpected";
  errorMessage: string;
  latencyMs: number;
};

export type LLMResult = LLMSuccess | LLMError;

// ─── Internal helpers ─────────────────────────────────────────────────────────

const ANTHROPIC_MESSAGES_URL = `${LLM_API_BASE_URL}/v1/messages`;
const ANTHROPIC_API_VERSION = "2023-06-01";

function redactKey(key: string): string {
  if (key.length < 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

async function callOnce(request: LLMRequest): Promise<LLMResult> {
  const startedAt = Date.now();

  if (!LLM_API_KEY) {
    return {
      ok: false,
      errorCode: "no_api_key",
      errorMessage: "LLM_API_KEY is not configured",
      latencyMs: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      model: LLM_MODEL,
      max_tokens: request.maxTokens ?? 512,
      system: request.systemPrompt,
      messages: [{ role: "user", content: request.userPrompt }],
    });

    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": LLM_API_KEY,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body,
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      return {
        ok: false,
        errorCode: "upstream_error",
        errorMessage: `Anthropic API returned ${res.status}: ${errorBody.slice(0, 200)}`,
        latencyMs,
      };
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
    };

    const text = json.content?.find((b) => b.type === "text")?.text ?? "";

    if (!text.trim()) {
      return {
        ok: false,
        errorCode: "empty_response",
        errorMessage: "LLM returned an empty text block",
        latencyMs,
      };
    }

    return {
      ok: true,
      content: text,
      modelName: json.model ?? LLM_MODEL,
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startedAt;
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      errorCode: isAbort ? "timeout" : "unexpected",
      errorMessage: isAbort
        ? `LLM call timed out after ${LLM_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err),
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call the configured LLM with retry.
 *
 * Retries are attempted only for transient upstream errors (not for timeout,
 * invalid key, or empty response). The retry count is capped by LLM_MAX_RETRIES.
 *
 * API key is never written to any log. errorMessage from upstream errors is
 * truncated to 400 characters before returning.
 */
export async function callLLM(request: LLMRequest): Promise<LLMResult> {
  const maxAttempts = 1 + Math.max(0, LLM_MAX_RETRIES);

  let lastResult: LLMResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await callOnce(request);

    if (result.ok) return result;

    // Don't retry on non-transient errors
    if (
      result.errorCode === "no_api_key" ||
      result.errorCode === "timeout" ||
      result.errorCode === "empty_response"
    ) {
      return result;
    }

    lastResult = result;

    // Brief backoff before retry (50ms × attempt)
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  return lastResult!;
}

/**
 * Extract a JSON object from an LLM text response.
 *
 * The model is prompted to return pure JSON. This helper handles the common
 * case where the model wraps it in a code fence despite instructions.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  // Try raw parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try stripping a markdown code fence
    const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(fenced);
    } catch {
      // Try extracting first {...} block
      const match = trimmed.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // fall through
        }
      }
      throw new Error(`Could not extract JSON from LLM response (length=${text.length})`);
    }
  }
}

/** Returns true only when the LLM API key is configured. */
export function isLLMConfigured(): boolean {
  return Boolean(LLM_API_KEY);
}

/** Returns a safe string identifying the configured model for logging. */
export function getLLMModelName(): string {
  return LLM_MODEL;
}

// Expose the configured model name for log records without leaking the key.
export const _redactedKeyHint = LLM_API_KEY ? redactKey(LLM_API_KEY) : "(not set)";
