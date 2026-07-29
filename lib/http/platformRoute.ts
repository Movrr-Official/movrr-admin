import { NextResponse } from "next/server";
import type { ApplicationResult } from "@/lib/result/ApplicationResult";
import type { Capability, RequestContext } from "@/features/identity/domain/Principal";
import type { AuthenticateRequestDeps } from "@/features/identity/application/contracts/AuthenticateRequest";
import { authenticateRequest } from "@/features/identity/application/commands/authenticateRequest";
import { authorisationService } from "@/features/organisations/application/commands/authorisationService";
import type { AuthorisationService } from "@/features/organisations/application/contracts/AuthorisationService";

export type PlatformRouteConfig<T> = {
  request: Request;
  capability: Capability;
  authDeps: AuthenticateRequestDeps;
  handle: (
    ctx: RequestContext,
    request: Request,
  ) => Promise<ApplicationResult<T>>;
  authenticate?: typeof authenticateRequest;
  authorisation?: AuthorisationService;
};

/**
 * Map ApplicationResult failure kinds to HTTP status codes.
 * Routes must not invent business rules — only this mechanical mapping.
 */
export function applicationResultToHttpStatus(kind: string): number {
  switch (kind) {
    case "unauthenticated":
    case "unrecognised_principal":
      return 401;
    case "permission_denied":
      return 403;
    case "ConcurrencyConflict":
      return 409;
    case "validation":
    case "validation_failed":
      return 400;
    case "not_found":
      return 404;
    case "not_implemented":
    case "fulfilment_type_not_implemented":
      return 501;
    case "InfrastructureFailure":
    case "infra":
      return 500;
    default:
      return 422;
  }
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function errorResponse(
  result: Extract<ApplicationResult<unknown>, { ok: false }>,
  correlationId?: string,
): NextResponse {
  const status = applicationResultToHttpStatus(result.kind);
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (correlationId) {
    headers["x-correlation-id"] = correlationId;
  }
  return NextResponse.json(
    {
      error: { kind: result.kind, message: result.message },
      correlationId: correlationId ?? null,
    },
    { status, headers },
  );
}

/**
 * Thin HTTP pipeline: AuthN → withPermissions → assertCapability → handle → map result.
 * No business rules live here.
 */
export async function platformRoute<T>(
  config: PlatformRouteConfig<T>,
): Promise<Response> {
  const authenticate = config.authenticate ?? authenticateRequest;
  const authorisation = config.authorisation ?? authorisationService;

  const accessToken = extractBearerToken(config.request);
  const correlationIdHeader = config.request.headers.get("x-correlation-id");

  const auth = await authenticate(
    { accessToken, correlationIdHeader },
    config.authDeps,
  );
  if (!auth.ok) {
    return errorResponse(auth);
  }

  const ctx = authorisation.withPermissions(auth.value);
  const guard = authorisation.assertCapability(ctx, config.capability);
  if (!guard.ok) {
    return errorResponse(guard, ctx.correlationId);
  }

  const result = await config.handle(ctx, config.request);
  if (!result.ok) {
    return errorResponse(result, ctx.correlationId);
  }

  return NextResponse.json(
    { data: result.value, correlationId: ctx.correlationId },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-correlation-id": ctx.correlationId,
      },
    },
  );
}
