import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  createFulfilment,
  type Fulfilment,
  type FulfilmentEvent,
  type FulfilmentType,
} from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentState } from "@/features/fulfilment/domain/states";
import type { FulfilmentOutcome } from "@/features/fulfilment/domain/outcome";
type TokenType = string;
import type {
  FulfilmentAggregateStore,
  StoredFulfilmentAggregate,
} from "@/features/fulfilment/application/contracts/FulfilmentAggregateStore";

const ENGINE_META_KEY = "_engine";

type EngineMeta = {
  resourceId: string;
  pointsCost: number;
  correlationId: string;
  tokenType: TokenType;
};

type FulfilmentRow = {
  id: string;
  redemption_id: string;
  rider_id: string;
  catalog_item_id: string;
  fulfilment_type: FulfilmentType;
  state: FulfilmentState;
  outcome: FulfilmentOutcome | null;
  version: number;
  partner_org_id: string | null;
  idempotency_key: string;
  expires_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type EventRow = {
  id: string;
  fulfilment_id: string;
  from_state: string;
  to_state: string;
  reason: string | null;
  occurred_at: string;
};

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new Error(`${action}: ${error.message}`);
  }
}

function splitMetadata(metadata: Record<string, unknown> | null | undefined): {
  publicMeta: Record<string, unknown>;
  engine: EngineMeta;
} {
  const raw = { ...(metadata ?? {}) };
  const engineRaw = (raw[ENGINE_META_KEY] ?? {}) as Partial<EngineMeta>;
  delete raw[ENGINE_META_KEY];
  return {
    publicMeta: raw,
    engine: {
      resourceId: String(engineRaw.resourceId ?? ""),
      pointsCost: Number(engineRaw.pointsCost ?? NaN),
      correlationId: String(engineRaw.correlationId ?? ""),
      tokenType: (engineRaw.tokenType ?? "qr") as TokenType,
    },
  };
}

function mapEvent(row: EventRow): FulfilmentEvent {
  return {
    id: row.id,
    fulfilmentId: row.fulfilment_id,
    fromState: row.from_state as FulfilmentState,
    toState: row.to_state as FulfilmentState,
    reason: row.reason ?? "",
    occurredAt: row.occurred_at,
  };
}

function mapRow(
  row: FulfilmentRow,
  events: FulfilmentEvent[],
  recovery: Record<string, unknown> | null = null,
): StoredFulfilmentAggregate {
  const { publicMeta, engine } = splitMetadata(row.metadata);
  const fulfilment = createFulfilment({
    id: row.id,
    redemptionId: row.redemption_id,
    riderId: row.rider_id,
    catalogItemId: row.catalog_item_id,
    fulfilmentType: row.fulfilment_type,
    state: row.state,
    outcome: row.outcome,
    version: row.version,
    partnerOrgId: row.partner_org_id,
    idempotencyKey: row.idempotency_key,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    metadata: { ...publicMeta, pointsSpent: engine.pointsCost, recovery },
    events,
  });
  return {
    fulfilment,
    resourceId: engine.resourceId,
    pointsCost: engine.pointsCost,
    correlationId: engine.correlationId,
    tokenType: engine.tokenType,
  };
}

async function loadEvents(fulfilmentId: string): Promise<FulfilmentEvent[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("fulfilment_event")
    .select("id, fulfilment_id, from_state, to_state, reason, occurred_at")
    .eq("fulfilment_id", fulfilmentId)
    .order("occurred_at", { ascending: true });
  throwOnError(error, "loadEvents");
  return ((data ?? []) as EventRow[]).map(mapEvent);
}

/** Read-only projection. Lifecycle writes belong exclusively to shop_* SQL commands. */
export function createSupabaseFulfilmentAggregateStore(): FulfilmentAggregateStore {
  return {
    async get(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("fulfilment")
        .select(
          "id, redemption_id, rider_id, catalog_item_id, fulfilment_type, state, outcome, version, partner_org_id, idempotency_key, expires_at, completed_at, metadata",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throwOnError(error, "fulfilment.get");
      if (!data) return null;
      const events = await loadEvents(id);
      const { data: recovery, error: recoveryError } = await supabase.from("shop_recovery").select("attempts, available_at, last_error").eq("fulfilment_id", id).maybeSingle();
      throwOnError(recoveryError, "fulfilment.recovery");
      return mapRow(data as FulfilmentRow, events, recovery ? { attempts: recovery.attempts, availableAt: recovery.available_at, lastError: recovery.last_error } : null);
    },

    async exists(id) {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("fulfilment")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (error) throwOnError(error, "fulfilment.exists");
      return Boolean(data);
    },

    async list() {
      const supabase = createSupabaseAdminClient();
      const rows: FulfilmentRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("fulfilment").select("id, redemption_id, rider_id, catalog_item_id, fulfilment_type, state, outcome, version, partner_org_id, idempotency_key, expires_at, completed_at, metadata").order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
        throwOnError(error, "fulfilment.list");
        rows.push(...(data ?? []) as FulfilmentRow[]);
        if ((data?.length ?? 0) < 1000) break;
      }
      const aggregates: StoredFulfilmentAggregate[] = [];
      for (const row of rows) aggregates.push(mapRow(row, await loadEvents(row.id)));
      return aggregates;
    },
  };
}
