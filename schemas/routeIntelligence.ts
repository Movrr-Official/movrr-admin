/**
 * Route Intelligence — structured output contracts.
 *
 * These schemas define exactly what the LLM is allowed to produce and what
 * the persistence layer will accept. Any LLM output that fails validation is
 * rejected before it touches any other system.
 *
 * SHADOW MODE ONLY. None of these outputs may influence live routing, rewards,
 * or user-visible behavior.
 */

import { z } from "zod";

// ─── Capability identifiers ───────────────────────────────────────────────────

export const intelligenceCapabilitySchema = z.enum([
  "route_suggestion",
  "route_explanation",
  "policy_translation",
]);

export type IntelligenceCapability = z.infer<typeof intelligenceCapabilitySchema>;

// ─── Shared primitives ────────────────────────────────────────────────────────

const confidence = z.number().min(0).max(1);
const boundedStringArray = z.array(z.string().trim().max(400)).max(12).default([]);

// ─── Output: Route Suggestion ─────────────────────────────────────────────────
//
// The LLM is given a cluster of GPS locations (as a bounding box + count +
// optional city) and asked to suggest a cyclist-friendly route concept.
// It returns a name, strategy summary, and value estimate — NOT a geometry.
// The OR-Tools optimizer remains the only entity that computes actual routes.

export const routeSuggestionInputSchema = z.object({
  locationsCount: z.number().int().min(2).max(200),
  boundingBox: z
    .object({
      minLat: z.number().finite(),
      maxLat: z.number().finite(),
      minLng: z.number().finite(),
      maxLng: z.number().finite(),
    })
    .optional(),
  city: z.string().trim().max(100).optional(),
  preferences: z.record(z.unknown()).optional(),
  campaignContext: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      campaignType: z.string().optional(),
    })
    .optional(),
});

export const routeSuggestionOutputSchema = z.object({
  candidateRouteName: z.string().trim().min(1).max(200),
  strategySummary: z.string().trim().min(1).max(600),
  estimatedValueClassification: z.enum(["low", "medium", "high", "very_high"]),
  confidence,
  warnings: boundedStringArray,
  limitations: boundedStringArray,
});

export type RouteSuggestionInput = z.infer<typeof routeSuggestionInputSchema>;
export type RouteSuggestionOutput = z.infer<typeof routeSuggestionOutputSchema>;

// ─── Output: Route Explanation ────────────────────────────────────────────────
//
// The LLM is given deterministic optimizer metrics and asked to produce a
// human-readable explanation of why the computed route may be valuable.
// The explanation is purely informational — it cannot change the route.

export const routeExplanationInputSchema = z.object({
  locationsCount: z.number().int().min(2),
  distanceKm: z.number().min(0).optional(),
  distanceMeters: z.number().min(0).optional(),
  solverStatus: z.string().max(32).optional(),
  impressionsEstimate: z.number().int().min(0).optional(),
  city: z.string().trim().max(100).optional(),
  campaignContext: z
    .object({
      name: z.string().optional(),
      campaignType: z.string().optional(),
    })
    .optional(),
});

export const routeExplanationOutputSchema = z.object({
  shortExplanation: z.string().trim().min(1).max(400),
  reasons: boundedStringArray,
  assumptions: boundedStringArray,
  confidence,
});

export type RouteExplanationInput = z.infer<typeof routeExplanationInputSchema>;
export type RouteExplanationOutput = z.infer<typeof routeExplanationOutputSchema>;

// ─── Output: Policy Translation ───────────────────────────────────────────────
//
// The LLM is given a natural-language planning intent (e.g. "avoid busy roads
// in the morning rush") and asked to convert it to structured optimizer
// preferences. These are never automatically applied — they are stored for
// admin review only.

export const policyTranslationInputSchema = z.object({
  naturalLanguagePolicy: z.string().trim().min(1).max(1000),
  context: z.record(z.unknown()).optional(),
});

const normalisedPreferencesSchema = z.object({
  max_duration_minutes: z.number().int().min(5).max(720).optional(),
  avoid_traffic: z.boolean().optional(),
  include_rest_stops: z.boolean().optional(),
  weather_consideration: z.boolean().optional(),
  time_of_day: z.string().max(32).optional(),
  priority: z.string().max(32).optional(),
});

export const policyTranslationOutputSchema = z.object({
  normalizedPreferences: normalisedPreferencesSchema,
  suggestedConstraints: z.record(z.unknown()).default({}),
  warnings: boundedStringArray,
  ambiguous: z.boolean().default(false),
});

export type PolicyTranslationInput = z.infer<typeof policyTranslationInputSchema>;
export type PolicyTranslationOutput = z.infer<typeof policyTranslationOutputSchema>;

// ─── Log record ───────────────────────────────────────────────────────────────
//
// Written to route_intelligence_logs for every shadow execution.
// Only validated LLM outputs are stored in llm_output; failures store null.

export const validationStatusSchema = z.enum([
  "success",
  "validation_failed",
  "llm_error",
  "disabled",
  "skipped",
]);

export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export interface RouteIntelligenceLogRecord {
  traceId: string | null;
  capability: IntelligenceCapability;
  inputSummary: Record<string, unknown>;
  deterministicOutputSummary?: Record<string, unknown> | null;
  llmOutput: unknown | null;
  validationStatus: ValidationStatus;
  latencyMs: number | null;
  modelName: string | null;
  errorMessage: string | null;
}
