/**
 * Route Intelligence Service — LLM shadow layer.
 *
 * This module orchestrates all LLM-powered analysis of route optimizer inputs
 * and outputs. It is the ONLY entry point for LLM capabilities in the platform.
 *
 * Non-negotiable invariants:
 * 1. LLM output NEVER influences route selection, rewards, or verification.
 * 2. All outputs are schema-validated before persistence; rejects store null.
 * 3. Every code path is wrapped in try/catch — failures are always a no-op.
 * 4. Feature flags are re-checked at call time, not at import time.
 * 5. Shadow execution is fire-and-forget; it must never block the live path.
 * 6. No sensitive rider PII is sent to the LLM — data is minimized to
 *    aggregate metadata (counts, bounding boxes, metrics summaries).
 *
 * SHADOW MODE ONLY. Import this module only from:
 * - app/api/optimize/route/route.ts (shadow hook)
 * - app/api/internal/route-intelligence/route.ts (diagnostics read-only)
 */

import { callLLM, extractJson, getLLMModelName, isLLMConfigured } from "@/lib/llmProvider";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getResolvedPlatformSettingsValues } from "@/lib/platformSettings";
import {
  type IntelligenceCapability,
  type RouteExplanationInput,
  routeExplanationInputSchema,
  routeExplanationOutputSchema,
  type RouteExplanationOutput,
  type RouteIntelligenceLogRecord,
  type RouteSuggestionInput,
  routeSuggestionInputSchema,
  routeSuggestionOutputSchema,
  type RouteSuggestionOutput,
  type PolicyTranslationInput,
  policyTranslationInputSchema,
  policyTranslationOutputSchema,
  type PolicyTranslationOutput,
  type ValidationStatus,
} from "@/schemas/routeIntelligence";

// ─── Feature flag gate ────────────────────────────────────────────────────────

interface LLMFlags {
  llmGlobalDisable: boolean;
  llmShadowModeEnabled: boolean;
  llmRouteSuggestionsEnabled: boolean;
  llmRouteExplanationsEnabled: boolean;
  llmPolicyTranslationEnabled: boolean;
}

async function getLLMFlags(): Promise<LLMFlags> {
  try {
    const values = await getResolvedPlatformSettingsValues();
    const f = values.features;
    return {
      llmGlobalDisable: f.llmGlobalDisable ?? true,
      llmShadowModeEnabled: f.llmShadowModeEnabled ?? false,
      llmRouteSuggestionsEnabled: f.llmRouteSuggestionsEnabled ?? false,
      llmRouteExplanationsEnabled: f.llmRouteExplanationsEnabled ?? false,
      llmPolicyTranslationEnabled: f.llmPolicyTranslationEnabled ?? false,
    };
  } catch {
    // Safe default: everything disabled
    return {
      llmGlobalDisable: true,
      llmShadowModeEnabled: false,
      llmRouteSuggestionsEnabled: false,
      llmRouteExplanationsEnabled: false,
      llmPolicyTranslationEnabled: false,
    };
  }
}

function isEnabled(flags: LLMFlags, capability: IntelligenceCapability): boolean {
  if (flags.llmGlobalDisable) return false;
  if (!flags.llmShadowModeEnabled) return false;
  switch (capability) {
    case "route_suggestion":
      return flags.llmRouteSuggestionsEnabled;
    case "route_explanation":
      return flags.llmRouteExplanationsEnabled;
    case "policy_translation":
      return flags.llmPolicyTranslationEnabled;
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function persistLog(record: RouteIntelligenceLogRecord): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("route_intelligence_logs").insert({
      trace_id: record.traceId,
      capability: record.capability,
      input_summary: record.inputSummary,
      deterministic_output_summary: record.deterministicOutputSummary ?? null,
      llm_output: record.llmOutput ?? null,
      validation_status: record.validationStatus,
      latency_ms: record.latencyMs,
      model_name: record.modelName,
      error_message: record.errorMessage,
    });
  } catch (err) {
    // Persistence failure must never propagate — just log to console
    console.warn("[RouteIntelligence] Log persistence failed", {
      capability: record.capability,
      traceId: record.traceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Capability: Route Suggestion ─────────────────────────────────────────────

const SUGGESTION_SYSTEM_PROMPT = `You are a cycling route strategy analyst for an urban mobility platform called Movrr.
Your task: given a cluster of GPS waypoints described by aggregate metadata, suggest a compelling cycling route concept.
Return ONLY valid JSON matching the following schema — no markdown, no prose, no code fences:
{
  "candidateRouteName": string (max 200 chars, descriptive, cyclist-friendly),
  "strategySummary": string (max 600 chars, what makes this route valuable for cyclists and advertisers),
  "estimatedValueClassification": "low"|"medium"|"high"|"very_high",
  "confidence": number (0.0–1.0, your confidence in this suggestion given the limited data),
  "warnings": string[] (up to 5, known data limitations or concerns),
  "limitations": string[] (up to 5, what you cannot know from this input alone)
}
Do not hallucinate specific street names, landmarks, or businesses unless they appear in the input.
Be honest about uncertainty.`;

async function suggestRoute(
  input: RouteSuggestionInput,
  traceId: string | null,
): Promise<RouteSuggestionOutput | null> {
  const validatedInput = routeSuggestionInputSchema.safeParse(input);
  if (!validatedInput.success) {
    console.warn("[RouteIntelligence] suggestRoute: invalid input", validatedInput.error.issues);
    return null;
  }

  const d = validatedInput.data;
  const userPrompt = JSON.stringify({
    locations_count: d.locationsCount,
    bounding_box: d.boundingBox ?? null,
    city: d.city ?? null,
    preferences: d.preferences ?? null,
    campaign: d.campaignContext ?? null,
  });

  const startedAt = Date.now();
  const result = await callLLM({
    systemPrompt: SUGGESTION_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 512,
  });

  const latencyMs = Date.now() - startedAt;
  const modelName = getLLMModelName();

  let validationStatus: ValidationStatus = "success";
  let llmOutput: RouteSuggestionOutput | null = null;
  let errorMessage: string | null = null;

  if (!result.ok) {
    validationStatus = "llm_error";
    errorMessage = result.errorMessage.slice(0, 400);
  } else {
    try {
      const raw = extractJson(result.content);
      const parsed = routeSuggestionOutputSchema.safeParse(raw);
      if (parsed.success) {
        llmOutput = parsed.data;
      } else {
        validationStatus = "validation_failed";
        errorMessage = parsed.error.issues.map((i) => i.message).join("; ").slice(0, 400);
      }
    } catch (err) {
      validationStatus = "validation_failed";
      errorMessage = err instanceof Error ? err.message.slice(0, 400) : "JSON extraction failed";
    }
  }

  await persistLog({
    traceId,
    capability: "route_suggestion",
    inputSummary: { locationsCount: d.locationsCount, city: d.city ?? null, hasBbox: Boolean(d.boundingBox) },
    deterministicOutputSummary: null,
    llmOutput,
    validationStatus,
    latencyMs: result.ok ? result.latencyMs : latencyMs,
    modelName,
    errorMessage,
  });

  return llmOutput;
}

// ─── Capability: Route Explanation ────────────────────────────────────────────

const EXPLANATION_SYSTEM_PROMPT = `You are a cycling route analyst for Movrr, an urban mobility platform.
Your task: given summary metrics from a deterministic route optimizer, produce a clear human-readable explanation of why this computed route may be valuable.
Return ONLY valid JSON matching the following schema — no markdown, no prose, no code fences:
{
  "shortExplanation": string (max 400 chars, 1–2 sentences, suitable for an admin summary card),
  "reasons": string[] (up to 6, each max 300 chars, concrete reasons the route performs well),
  "assumptions": string[] (up to 6, each max 300 chars, assumptions or data you relied on),
  "confidence": number (0.0–1.0, your confidence in this explanation)
}
Base your analysis only on the provided metrics. Do not invent specific locations or business names.`;

async function explainRoute(
  input: RouteExplanationInput,
  deterministicSummary: Record<string, unknown>,
  traceId: string | null,
): Promise<RouteExplanationOutput | null> {
  const validatedInput = routeExplanationInputSchema.safeParse(input);
  if (!validatedInput.success) {
    console.warn("[RouteIntelligence] explainRoute: invalid input", validatedInput.error.issues);
    return null;
  }

  const d = validatedInput.data;
  const userPrompt = JSON.stringify({
    locations_count: d.locationsCount,
    distance_km: d.distanceKm ?? null,
    distance_meters: d.distanceMeters ?? null,
    solver_status: d.solverStatus ?? null,
    impressions_estimate: d.impressionsEstimate ?? null,
    city: d.city ?? null,
    campaign: d.campaignContext ?? null,
  });

  const startedAt = Date.now();
  const result = await callLLM({
    systemPrompt: EXPLANATION_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 512,
  });

  const latencyMs = Date.now() - startedAt;
  const modelName = getLLMModelName();

  let validationStatus: ValidationStatus = "success";
  let llmOutput: RouteExplanationOutput | null = null;
  let errorMessage: string | null = null;

  if (!result.ok) {
    validationStatus = "llm_error";
    errorMessage = result.errorMessage.slice(0, 400);
  } else {
    try {
      const raw = extractJson(result.content);
      const parsed = routeExplanationOutputSchema.safeParse(raw);
      if (parsed.success) {
        llmOutput = parsed.data;
      } else {
        validationStatus = "validation_failed";
        errorMessage = parsed.error.issues.map((i) => i.message).join("; ").slice(0, 400);
      }
    } catch (err) {
      validationStatus = "validation_failed";
      errorMessage = err instanceof Error ? err.message.slice(0, 400) : "JSON extraction failed";
    }
  }

  await persistLog({
    traceId,
    capability: "route_explanation",
    inputSummary: {
      locationsCount: d.locationsCount,
      distanceKm: d.distanceKm ?? null,
      solverStatus: d.solverStatus ?? null,
    },
    deterministicOutputSummary: deterministicSummary,
    llmOutput,
    validationStatus,
    latencyMs: result.ok ? result.latencyMs : latencyMs,
    modelName,
    errorMessage,
  });

  return llmOutput;
}

// ─── Capability: Policy Translation ──────────────────────────────────────────

const POLICY_TRANSLATION_SYSTEM_PROMPT = `You are a configuration assistant for Movrr, an urban cycling route optimization platform.
Your task: given a natural-language planning policy statement from an admin, extract structured optimizer preferences.
Return ONLY valid JSON matching the following schema — no markdown, no prose, no code fences:
{
  "normalizedPreferences": {
    "max_duration_minutes": integer 5–720 (optional),
    "avoid_traffic": boolean (optional),
    "include_rest_stops": boolean (optional),
    "weather_consideration": boolean (optional),
    "time_of_day": string max 32 chars (optional, e.g. "morning", "evening"),
    "priority": string max 32 chars (optional, e.g. "scenic", "fast", "safe")
  },
  "suggestedConstraints": object (additional structured constraints, may be empty {}),
  "warnings": string[] (up to 6, ambiguities or things you could not reliably extract),
  "ambiguous": boolean (true if the input was unclear or contained contradictions)
}
Only set fields you can reliably extract. Omit fields that are ambiguous rather than guessing.`;

async function translatePolicy(
  input: PolicyTranslationInput,
  traceId: string | null,
): Promise<PolicyTranslationOutput | null> {
  const validatedInput = policyTranslationInputSchema.safeParse(input);
  if (!validatedInput.success) {
    console.warn("[RouteIntelligence] translatePolicy: invalid input", validatedInput.error.issues);
    return null;
  }

  const d = validatedInput.data;
  const userPrompt = JSON.stringify({
    natural_language_policy: d.naturalLanguagePolicy,
    context: d.context ?? null,
  });

  const startedAt = Date.now();
  const result = await callLLM({
    systemPrompt: POLICY_TRANSLATION_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 512,
  });

  const latencyMs = Date.now() - startedAt;
  const modelName = getLLMModelName();

  let validationStatus: ValidationStatus = "success";
  let llmOutput: PolicyTranslationOutput | null = null;
  let errorMessage: string | null = null;

  if (!result.ok) {
    validationStatus = "llm_error";
    errorMessage = result.errorMessage.slice(0, 400);
  } else {
    try {
      const raw = extractJson(result.content);
      const parsed = policyTranslationOutputSchema.safeParse(raw);
      if (parsed.success) {
        llmOutput = parsed.data;
      } else {
        validationStatus = "validation_failed";
        errorMessage = parsed.error.issues.map((i) => i.message).join("; ").slice(0, 400);
      }
    } catch (err) {
      validationStatus = "validation_failed";
      errorMessage = err instanceof Error ? err.message.slice(0, 400) : "JSON extraction failed";
    }
  }

  await persistLog({
    traceId,
    capability: "policy_translation",
    inputSummary: {
      policyLength: d.naturalLanguagePolicy.length,
      hasContext: Boolean(d.context),
    },
    deterministicOutputSummary: null,
    llmOutput,
    validationStatus,
    latencyMs: result.ok ? result.latencyMs : latencyMs,
    modelName,
    errorMessage,
  });

  return llmOutput;
}

// ─── Shadow Execution Entry Point ─────────────────────────────────────────────

/**
 * Context from the live optimizer request, used to build LLM inputs.
 * All fields must be aggregate/metadata — never raw GPS coordinates of riders
 * or other sensitive data.
 */
export interface OptimizerRequestContext {
  traceId: string;
  /** Number of locations in the optimization request. */
  locationsCount: number;
  /** Optional bounding box computed from location coordinates. */
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  /** City name from campaign context, if present. */
  city?: string;
  /** Optimizer preferences passed in the request. */
  preferences?: Record<string, unknown>;
  /** Sanitized campaign context (id, name, type only). */
  campaignContext?: {
    id?: string;
    name?: string;
    campaignType?: string;
  };
}

/**
 * Sanitized summary of the live optimizer's output.
 */
export interface OptimizerResponseSummary {
  solverStatus?: string | null;
  distanceKm?: number | null;
  distanceMeters?: number | null;
  impressionsEstimate?: number | null;
  solverTimeSeconds?: number | null;
}

/**
 * Main shadow execution orchestrator.
 *
 * Call this AFTER the live optimizer response has been returned to the client.
 * This function is designed to be called as `void runShadowIntelligence(...)`.
 * It will never throw — all errors are caught internally.
 *
 * What it does:
 * 1. Loads feature flags from the DB (async — doesn't block live path)
 * 2. If llmGlobalDisable or shadow mode is off → logs "disabled" and exits
 * 3. Runs enabled capabilities in parallel
 * 4. Stores validated outputs (or explicit failure records) in the log table
 *
 * What it NEVER does:
 * - Return a value that influences routing
 * - Write to reward_transactions, ride_sessions, or any user-facing table
 * - Throw or propagate errors
 */
export async function runShadowIntelligence(
  requestCtx: OptimizerRequestContext,
  responseSummary: OptimizerResponseSummary,
): Promise<void> {
  try {
    const flags = await getLLMFlags();

    if (flags.llmGlobalDisable) {
      // Global disable is the default state — don't log noise for every request
      return;
    }

    if (!flags.llmShadowModeEnabled) {
      return;
    }

    if (!isLLMConfigured()) {
      console.warn("[RouteIntelligence] Shadow mode enabled but LLM_API_KEY is not set");
      return;
    }

    const { traceId, locationsCount, boundingBox, city, preferences, campaignContext } =
      requestCtx;

    const tasks: Promise<unknown>[] = [];

    // Route suggestion — runs when enabled
    if (isEnabled(flags, "route_suggestion")) {
      tasks.push(
        suggestRoute(
          { locationsCount, boundingBox, city, preferences, campaignContext },
          traceId,
        ).catch((err) => {
          console.warn("[RouteIntelligence] suggestRoute error", err instanceof Error ? err.message : String(err));
        }),
      );
    }

    // Route explanation — runs when enabled and optimizer produced a result
    if (isEnabled(flags, "route_explanation") && responseSummary.solverStatus === "solved") {
      const deterministicSummary: Record<string, unknown> = {
        solverStatus: responseSummary.solverStatus,
        distanceKm: responseSummary.distanceKm,
        distanceMeters: responseSummary.distanceMeters,
        impressionsEstimate: responseSummary.impressionsEstimate,
        solverTimeSeconds: responseSummary.solverTimeSeconds,
      };
      tasks.push(
        explainRoute(
          {
            locationsCount,
            distanceKm: responseSummary.distanceKm ?? undefined,
            distanceMeters: responseSummary.distanceMeters ?? undefined,
            solverStatus: responseSummary.solverStatus ?? undefined,
            impressionsEstimate: responseSummary.impressionsEstimate ?? undefined,
            city,
            campaignContext: campaignContext
              ? { name: campaignContext.name, campaignType: campaignContext.campaignType }
              : undefined,
          },
          deterministicSummary,
          traceId,
        ).catch((err) => {
          console.warn("[RouteIntelligence] explainRoute error", err instanceof Error ? err.message : String(err));
        }),
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    // Top-level safety net — shadow execution must never propagate
    console.error("[RouteIntelligence] Unhandled shadow execution error", {
      traceId: requestCtx.traceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Policy translation — exposed for use by an admin-facing API endpoint.
 *
 * This is not part of the optimizer shadow flow; it's invoked explicitly when
 * an admin submits a natural-language policy string for structured extraction.
 *
 * Returns null if LLM is disabled, not configured, or output is invalid.
 * Logs the attempt either way.
 */
export async function translatePolicyIfEnabled(
  input: PolicyTranslationInput,
  traceId: string | null = null,
): Promise<PolicyTranslationOutput | null> {
  try {
    const flags = await getLLMFlags();

    if (!isEnabled(flags, "policy_translation")) {
      await persistLog({
        traceId,
        capability: "policy_translation",
        inputSummary: { policyLength: input.naturalLanguagePolicy?.length ?? 0 },
        llmOutput: null,
        validationStatus: "disabled",
        latencyMs: 0,
        modelName: null,
        errorMessage: "Policy translation is not enabled",
      });
      return null;
    }

    if (!isLLMConfigured()) {
      return null;
    }

    return await translatePolicy(input, traceId);
  } catch (err) {
    console.warn("[RouteIntelligence] translatePolicyIfEnabled error", err instanceof Error ? err.message : String(err));
    return null;
  }
}
