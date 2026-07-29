# Reward Fulfilment Engine — Implementation Programme

**Status:** Awaiting final review of Plans 1–4 before execution  
**Spec:** `docs/superpowers/specs/2026-07-28-reward-fulfilment-engine-design.md`  
**Execution mode:** Subagent-Driven (Approach 1), sequential phases

## One programme, four sequential phases

| Phase | Plan | Deliverable | Repo |
|-------|------|-------------|------|
| **1** | [Plan 1](./2026-07-28-reward-fulfilment-engine-plan-1-foundation-engine.md) | Foundation + Fulfilment Engine + `/api/v1` | movrr-admin |
| **2** | [Plan 2](./2026-07-28-reward-fulfilment-engine-plan-2-admin-ops-ui.md) | Operations UI consuming Platform APIs | movrr-admin |
| **3** | [Plan 3](./2026-07-28-reward-fulfilment-engine-plan-3-mobile-integration.md) | Mobile integration & RPC→API migration | movrr-mobile |
| **4** | [Plan 4](./2026-07-28-reward-fulfilment-engine-plan-4-partner-workspace.md) | Reward Partner workspace | movrr-app |

## Continuity rules

1. Each phase builds only on the previous phase’s delivered contracts (especially `/api/v1` read models and commands from Plan 1).
2. No business logic in UI repositories — clients are thin Platform API consumers.
3. Do not re-implement settlement, state machine, handlers, or RBAC in Plans 2–4.
4. After Plans 1–4 are approved, execute phases sequentially **without** further approval between phases unless:
   - an architectural change is required,
   - work conflicts with the approved specification, or
   - an unforeseen technical constraint requires a design decision.
5. Prefer Subagent-Driven Development per task; review between tasks within a phase.
6. Feature flags gate mobile RPC cutover (Plan 3) and any dual-path reads during Admin migration (Plan 2).

## Definition of programme done

Satisfies spec §13 Definition of Done across engine + Admin ops + mobile + Partner workspace, with automated tests from each plan green and no duplicated fulfilment business rules in clients.
