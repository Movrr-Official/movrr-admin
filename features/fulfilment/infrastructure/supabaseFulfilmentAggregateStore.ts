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
import type { TokenType } from "@/features/fulfilment/application/commands/tokenService";
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
      pointsCost: Number(engineRaw.pointsCost ?? 0),
      correlationId: String(engineRaw.correlationId ?? ""),
      tokenType: (engineRaw.tokenType ?? "qr") as TokenType,
    },
  };
}

function mergeMetadata(
  publicMeta: Record<string, unknown>,
  engine: EngineMeta,
): Record<string, unknown> {
  return {
    ...publicMeta,
    [ENGINE_META_KEY]: engine,
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
    metadata: publicMeta,
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

async function loadEvents(
  fulfilmentId: string,
): Promise<FulfilmentEvent[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("fulfilment_event")
    .select("id, fulfilment_id, from_state, to_state, reason, occurred_at")
    .eq("fulfilment_id", fulfilmentId)
    .order("occurred_at", { ascending: true });
  throwOnError(error, "loadEvents");
  return ((data ?? []) as EventRow[]).map(mapEvent);
}

/** Durable FulfilmentAggregateStore backed by public.fulfilment + fulfilment_event. */
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
      return mapRow(data as FulfilmentRow, events);
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

    async save(aggregate) {
      const supabase = createSupabaseAdminClient();
      const { fulfilment } = aggregate;
      const metadata = mergeMetadata(fulfilment.metadata, {
        resourceId: aggregate.resourceId,
        pointsCost: aggregate.pointsCost,
        correlationId: aggregate.correlationId,
        tokenType: aggregate.tokenType,
      });

      const row = {
        id: fulfilment.id,
        redemption_id: fulfilment.redemptionId,
        rider_id: fulfilment.riderId,
        catalog_item_id: fulfilment.catalogItemId,
        fulfilment_type: fulfilment.fulfilmentType,
        state: fulfilment.state,
        outcome: fulfilment.outcome,
        version: fulfilment.version,
        partner_org_id: fulfilment.partnerOrgId,
        idempotency_key: fulfilment.idempotencyKey,
        expires_at: fulfilment.expiresAt,
        completed_at: fulfilment.completedAt,
        metadata,
        updated_at: new Date().toISOString(),
      };

      const { data: existing, error: existingError } = await supabase
        .from("fulfilment")
        .select("id, version")
        .eq("id", fulfilment.id)
        .maybeSingle();
      throwOnError(existingError, "fulfilment.save.lookup");

      if (!existing) {
        const { error: insertError } = await supabase
          .from("fulfilment")
          .insert(row);
        throwOnError(insertError, "fulfilment.save.insert");
      } else {
        const dbVersion = (existing as { version: number }).version;
        // Allow save of current version (idempotent) or next version (advance).
        const { data: updated, error: updateError } = await supabase
          .from("fulfilment")
          .update(row)
          .eq("id", fulfilment.id)
          .in("version", [dbVersion])
          .select("id")
          .maybeSingle();
        throwOnError(updateError, "fulfilment.save.update");
        if (!updated) {
          throw new Error(
            `fulfilment.save concurrency conflict for ${fulfilment.id} (db v${dbVersion}, agg v${fulfilment.version})`,
          );
        }
      }

      const existingEvents = await loadEvents(fulfilment.id);
      const known = new Set(existingEvents.map((e) => e.id));
      const toInsert = fulfilment.events.filter((e) => !known.has(e.id));
      if (toInsert.length > 0) {
        const { error: eventError } = await supabase
          .from("fulfilment_event")
          .insert(
            toInsert.map((e) => ({
              id: e.id,
              fulfilment_id: e.fulfilmentId,
              from_state: e.fromState,
              to_state: e.toState,
              reason: e.reason,
              correlation_id: aggregate.correlationId,
              payload: {},
              occurred_at: e.occurredAt,
            })),
          );
        throwOnError(eventError, "fulfilment.save.events");
      }
    },

    async list() {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("fulfilment")
        .select(
          "id, redemption_id, rider_id, catalog_item_id, fulfilment_type, state, outcome, version, partner_org_id, idempotency_key, expires_at, completed_at, metadata",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      throwOnError(error, "fulfilment.list");
      const rows = (data ?? []) as FulfilmentRow[];
      const aggregates: StoredFulfilmentAggregate[] = [];
      for (const row of rows) {
        const events = await loadEvents(row.id);
        aggregates.push(mapRow(row, events));
      }
      return aggregates;
    },
  };
}
