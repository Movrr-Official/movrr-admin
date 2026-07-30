# Platform Capability Registry

Canonical inventory governing cross-app parity. Source of truth: `features/platform/capabilityRegistry.ts`.

## Rules

1. No backend capability ships without a registry entry.
2. Each entry declares: API routes, admin/web/mobile consumers, actors, lifecycle owner, permissions.
3. Domain logic lives only in movrr-admin Platform services — consumers are thin UI/API clients.

## Architecture

```
Backend (movrr-admin domain) → Platform API (/api/v1) → Admin | Product Web | Mobile
```

## Capabilities

| ID | Primary actor | Admin | Web | Mobile |
|----|---------------|-------|-----|--------|
| campaigns.crud | advertiser | full | full | partial |
| campaigns.join | rider | full | full | full |
| rewards.redeem | rider | full | full | full |
| wallet.ledger | rider | full | full | full |
| fulfilment.ops | partner | full | partial | partial |
| rides.sessions | rider | full | partial | full |
| community.rides | rider | full | full | full |
| partner.rewards.catalog | partner | full | full | n/a |
| government.programmes | government | partial | full | n/a |
| fraud.risk | administrator | partial | none | partial |
| incidents.ops | administrator | full | none | none |
| platform.jobs | administrator | partial | none | none |
| platform.health | administrator | partial | none | none |
| billing.ops | advertiser | partial | partial | none |
| feature.flags | administrator | full | partial | partial |
| notifications.broadcast | administrator | full | partial | full |
| search.global | administrator | full | none | none |

## Vocabulary

Shared status enums: `features/platform/vocabulary.ts`

Billing connection states: `not_connected | handoff | connected | degraded`

## Adding a capability

1. Add entry to `PLATFORM_CAPABILITY_REGISTRY`
2. Add capabilities to `CapabilityCatalog.ts` if new permissions
3. Implement Platform API handler in `composePlatformApi.ts`
4. Wire admin and/or product web consumers
5. Update this document
