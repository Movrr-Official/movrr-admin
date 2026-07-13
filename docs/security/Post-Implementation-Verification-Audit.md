# MOVRR — Post-Implementation Verification Audit

**Audit date:** 7 July 2026  
**Auditor role:** Independent verification (code-evidence only)  
**Scope:** All original findings from `Enterprise Security Audit.md`  
**Method:** Each finding verified against repository code; claims without file evidence marked unresolved.

---

## Verification Rounds

| Round | Description | Overall score |
|-------|-------------|---------------|
| **Round 1** | State at start of this verification pass (post gap-closure, pre regression fixes) | **84 / 100** |
| **Round 2** | After remediation of Round 1 open/partial items + regression fixes | **88 / 100** |

**Verdict (Round 2):** **Conditional GO** for Rotterdam pilot after production SQL apply (`033`–`036`) and env configuration.

---

## Round 1 — Finding Status (Before Regression Fixes)

| ID | Original severity | Round 1 status | Evidence / gap |
|----|-----------------|----------------|----------------|
| ARCH-001 | Critical | **Fully Resolved** | `middleware.ts` re-exports `proxy` + `config` |
| ARCH-002 | Critical | **Fully Resolved** | `proxy.ts` exempts `/api/sessions/`; `lib/riderSessionAuth.ts` validates JWT + ownership |
| ARCH-003 | High | **Deferred** | Service-role centrality documented; architectural accepted risk |
| AUTH-001 | Critical | **Fully Resolved** | Same as ARCH-001 |
| AUTH-002 | Medium | **Fully Resolved** | `app/actions/signOut.ts` + `clearAdminDashboardSession()` |
| AUTH-003 | Medium | **Partially Resolved** | `requireAdminRoles` added; AAL2 gate missing on challenge success |
| AUTH-004 | Info | **Fully Resolved** | `SECURITY.md` no longer claims `ignoreBuildErrors: true` |
| AUTHZ-001 | High | **Fully Resolved** | `requireMutatingAdminRoles` on mutations; `NOTIFICATION_WRITE_ROLES` restricted |
| AUTHZ-002 | Medium | **Fully Resolved** | `ROLE_PERMISSIONS` + `hasAdminPermission()` in `lib/authPermissions.ts` |
| AUTHZ-003 | Critical | **Fully Resolved** | `lib/services/privacyRetention.ts` has no `"use server"`; cron route only |
| AUTHZ-004 | Info | **Not Actionable** | Positive control |
| DB-001 | Critical | **Partially Resolved** | Fix in `scripts/033_*.sql`; **requires prod apply** |
| DB-002 | High | **Resolved** | `is_dashboard_admin()` unified in 033 + 036; legacy `is_admin()` replaced |
| DB-003 | High | **Partially Resolved** | `create_audit_log` hardened in 033; prod apply required |
| DB-004 | High | **Partially Resolved** | `redeem_reward_product` auth in 033; prod apply required |
| DB-005 | High | **Partially Resolved** | RLS on `ride_session`, `admin_users` in 033; prod apply required |
| DB-006 | Medium | **Partially Resolved** | Status transition trigger in 033; prod apply required |
| DB-007 | Info | **Not Actionable** | Positive |
| DB-008 | Medium | **Partially Resolved** | Redemption SELECT fix in 033; prod apply required |
| API-001 | Critical | **Fully Resolved** | `authenticateRiderSessionRequest` in gps-batch |
| API-002 | Critical | **Fully Resolved** | Same in heartbeat |
| API-003 | Medium | **Partially Resolved** | Upstash optional; in-memory fallback remains |
| API-004 | Low | **Fully Resolved** | Generic `"Invalid request body"` in gps-batch |
| API-005 | Medium | **Partially Resolved** | Some gps-batch 404/409/duplicate responses lacked `applySecurityHeaders` |
| API-006 | Medium | **Partially Resolved** | Constant-time auth yes; rate limit in-memory only; no security headers |
| GPS-001 | Critical | **Fully Resolved** | `enteredAtServer` + `serverReceivedAt` dwell cap in `complianceVerifier.ts` |
| GPS-002 | High | **Fully Resolved** | Null accuracy rejected; implied speed when `speed_kmh` omitted |
| GPS-003 | High | **Fully Resolved** | `zone_boundary_abuse`, `stationary_in_zone` implemented |
| GPS-004 | Medium | **Fully Resolved** | Consecutive-point entry/exit hysteresis |
| GPS-005 | High | **Fully Resolved** | Per-IP + per-session rate limits on ingest |
| GPS-006 | Info | **Not Actionable** | Positive |
| REWARD-001 | Medium | **Fully Resolved** | `lib/services/rewardPolicy.ts` ignores client snapshot |
| REWARD-002 | Medium | **Partially Resolved** | `award_reward_points_capped` RPC in 035; prod apply required |
| REWARD-003 | Info | **Not Actionable** | Positive |
| REWARD-004 | Low | **Deferred** | Public config intentional for mobile; documented risk |
| CAMP-001 | Info | **Not Actionable** | Positive |
| CAMP-002 | Medium | **Still Open** | `proxy.ts` only warned on missing optimizer token |
| CAMP-003 | Low | **Resolved** | Optimize schemas use `.strict()` |
| LLM-001 | Low | **Deferred** | Acceptable with shadow off + DPA |
| LLM-002 | Medium | **Deferred** | Shadow mode off by default; prompt injection surface remains |
| FILE-001 | Medium | **Deferred** | Requires Cloudinary dashboard preset restrictions (ops) |
| FILE-002 | Medium | **Partially Resolved** | Storage RLS in 034; prod apply required |
| FILE-003 | Low | **Deferred** | Chart `dangerouslySetInnerHTML` low risk |
| EMAIL-001 | Medium | **Partially Resolved** | Write roles restricted; broad read targeting unchanged |
| EMAIL-002 | Medium | **Fully Resolved** | `movrr-waitlist/lib/env.ts` Zod validation |
| FE-001 | Medium | **Partially Resolved** | Export audit logged; client-side CSV download remains |
| FE-002 | Low | **Fully Resolved** | `shouldUseMockData()` returns false in production |
| FE-003 | Medium | **Deferred** | CSP still has `unsafe-inline`/`unsafe-eval` (Next.js nonce migration) |
| FE-004 | Info | **Not Actionable** | Next.js server action CSRF model |
| BE-001 | High | **Deferred** | Architectural service-role pattern |
| BE-002 | Medium | **Partially Resolved** | Export audit added; no server-side streaming export |
| OPT-001 | Low | **Fully Resolved** | `auth.py` hashes token in rate-limit key |
| INFRA-001 | High | **Fully Resolved** | `.github/workflows/ci-admin.yml` |
| INFRA-002 | High | **Partially Resolved** | `vercel.json` cron exists; `/api/internal/*` blocked by middleware (**regression**) |
| INFRA-003 | Medium | **Partially Resolved** | Tokens optional in dev; required for prod cron |
| INFRA-004 | Info | **Not Actionable** | Domain topology documentation |
| INFRA-005 | Info | **Not Actionable** | Positive |
| DEP-001 | Medium | **Still Open** | `next`/`postcss` CVEs; `npm audit fix` available |
| DEP-002 | Info | **Not Actionable** | Optimizer CI exists |
| LOG-001 | Medium | **Fully Resolved** | `lib/logRedaction.ts` wired to `lib/logger.ts` |
| LOG-002 | High | **Partially Resolved** | RPC hardened in 033; direct service-role inserts still used in admin |
| LOG-003 | Low | **Partially Resolved** | Many `console.error` in actions/components; proxy still logs |
| GDPR-001 | High | **Partially Resolved** | Cron + route exist; middleware blocked cron path |
| GDPR-002 | Medium | **Fully Resolved** | `gpsRetentionDays` in privacy settings + retention job |
| GDPR-003 | Medium | **Fully Resolved** | Honeypot + rate limit + optional Turnstile |
| GDPR-004 | Medium | **Partially Resolved** | `dataErasure.ts` + RPC in 035; prod apply + UI wiring |
| GDPR-005 | Info | **Not Actionable** | Partial logging acceptable |

**Round 1 blockers identified:** CAMP-002, CAMP-003, API-005 gaps, API-006 gaps, INFRA-002/GDPR-001 middleware regression, AUTH-003 AAL2 gap.

---

## Round 1 Remediation (Executed)

| Fix | Files |
|-----|-------|
| Middleware cron regression | `proxy.ts` — exempt `/api/internal/` |
| Optimizer edge enforcement | `proxy.ts` — 503 when unconfigured; service token bypass |
| GPS batch security headers | `app/api/sessions/[id]/gps-batch/route.ts` — all error paths |
| Privacy retention hardening | `app/api/internal/privacy-retention/route.ts` — distributed rate limit + headers |
| MFA audit AAL2 | `app/actions/adminMfa.ts` — mutation guard + AAL2 on successful challenge |
| Optimize schema strict | `app/api/optimize/route/route.ts`, `decision/route.ts` — `.strict()` |
| Admin model unification SQL | `scripts/036_admin_model_unification.sql` |
| Edge logging | `proxy.ts` — removed `console.error` |
| Token compare helper | `lib/secureCompare.ts` — `safeEqualString()` |

**Verification after remediation:** `npm run typecheck` pass; **226 tests** pass.

---

## Round 2 — Finding Status (Final)

| ID | Round 2 status | Evidence |
|----|----------------|----------|
| ARCH-001 | **Fully Resolved** | `middleware.ts:1` |
| ARCH-002 | **Fully Resolved** | `proxy.ts:24-25,84-87`; `riderSessionAuth.ts:40-94` |
| ARCH-003 | **Deferred** | Documented residual risk in `SECURITY.md` |
| AUTH-001 | **Fully Resolved** | Middleware active |
| AUTH-002 | **Fully Resolved** | `signOut.ts`, `clearAdminDashboardSession` |
| AUTH-003 | **Fully Resolved** | `adminMfa.ts` — `mutation: true` + AAL2 on successful challenge |
| AUTH-004 | **Not Actionable** | Docs aligned |
| AUTHZ-001 | **Fully Resolved** | `requireMutatingAdminRoles` across action files |
| AUTHZ-002 | **Fully Resolved** | `hasAdminPermission()` wired |
| AUTHZ-003 | **Fully Resolved** | Internal service module only |
| AUTHZ-004 | **Not Actionable** | Positive |
| DB-001 | **Partially Resolved** | Code in `033`; **prod SQL apply pending** |
| DB-002 | **Partially Resolved** | `036_admin_model_unification.sql` adds `is_admin()` → `is_dashboard_admin()` |
| DB-003 | **Partially Resolved** | `033` RPC gate; prod apply pending |
| DB-004 | **Partially Resolved** | `033` ownership check; prod apply pending |
| DB-005 | **Partially Resolved** | `033` RLS; prod apply pending |
| DB-006 | **Partially Resolved** | `033` trigger; prod apply pending |
| DB-007 | **Not Actionable** | Positive |
| DB-008 | **Partially Resolved** | `033` policy fix; prod apply pending |
| API-001 | **Fully Resolved** | JWT + ownership on gps-batch |
| API-002 | **Fully Resolved** | JWT + ownership on heartbeat |
| API-003 | **Partially Resolved** | Upstash when configured; in-memory fallback by design |
| API-004 | **Fully Resolved** | Generic validation errors |
| API-005 | **Fully Resolved** | All gps-batch + heartbeat responses use `applySecurityHeaders` |
| API-006 | **Fully Resolved** | Distributed rate limit + constant-time auth + security headers |
| GPS-001 | **Fully Resolved** | Server-clock dwell cap |
| GPS-002 | **Fully Resolved** | Accuracy/speed gates |
| GPS-003 | **Fully Resolved** | Full anti-spoof set |
| GPS-004 | **Fully Resolved** | Hysteresis |
| GPS-005 | **Fully Resolved** | Rate limits |
| GPS-006 | **Not Actionable** | Positive |
| REWARD-001 | **Fully Resolved** | Server policy |
| REWARD-002 | **Partially Resolved** | Atomic RPC in `035`; prod apply pending |
| REWARD-003 | **Not Actionable** | Positive |
| REWARD-004 | **Deferred** | Low risk; public config by design |
| CAMP-001 | **Not Actionable** | Positive |
| CAMP-002 | **Fully Resolved** | `proxy.ts` enforces optimizer config + service token |
| CAMP-003 | **Fully Resolved** | `.strict()` schemas |
| LLM-001 | **Deferred** | Shadow off by default |
| LLM-002 | **Deferred** | Shadow off by default |
| FILE-001 | **Deferred** | Ops: Cloudinary preset restrictions |
| FILE-002 | **Partially Resolved** | `034` storage RLS; prod apply pending |
| FILE-003 | **Deferred** | Low risk |
| EMAIL-001 | **Partially Resolved** | Writes restricted; audience selection unchanged |
| EMAIL-002 | **Fully Resolved** | Waitlist env validation |
| FE-001 | **Partially Resolved** | Audit trail yes; browser download remains |
| FE-002 | **Fully Resolved** | Production mock disabled |
| FE-003 | **Deferred** | CSP nonce migration required |
| FE-004 | **Not Actionable** | Framework behavior |
| BE-001 | **Deferred** | Architectural |
| BE-002 | **Partially Resolved** | Audit logging; no server-side export pipeline |
| OPT-001 | **Fully Resolved** | Hashed rate-limit keys |
| INFRA-001 | **Fully Resolved** | Admin CI |
| INFRA-002 | **Fully Resolved** | Cron + internal API middleware exemption |
| INFRA-003 | **Partially Resolved** | Dev optional; prod must set secrets |
| INFRA-004 | **Not Actionable** | Documentation |
| INFRA-005 | **Not Actionable** | Positive |
| DEP-001 | **Still Open** | `next`/`postcss` transitive CVEs; upgrade path via `npm audit fix` |
| DEP-002 | **Not Actionable** | Optimizer CI |
| LOG-001 | **Fully Resolved** | Redaction active |
| LOG-002 | **Partially Resolved** | RPC hardened; service-role direct inserts for admin exports |
| LOG-003 | **Partially Resolved** | Proxy fixed; action/component `console.error` remain (low) |
| GDPR-001 | **Fully Resolved** | Cron path unblocked + authenticated route |
| GDPR-002 | **Fully Resolved** | Configurable GPS retention |
| GDPR-003 | **Fully Resolved** | Honeypot + Turnstile + rate limit |
| GDPR-004 | **Partially Resolved** | `app/actions/dataErasure.ts` + RPC; admin UI integration pending |
| GDPR-005 | **Not Actionable** | Acceptable |

---

## Round 2 Scorecard

| Domain | Score |
|--------|-------|
| Authentication & session | 92 |
| Authorization (RBAC) | 88 |
| API / ingest security | 94 |
| GPS anti-fraud | 88 |
| Database / RLS (code) | 82 |
| Privacy & GDPR | 86 |
| Infrastructure & CI | 90 |
| Dependency hygiene | 72 |

### **Overall: 88 / 100**

---

## Remaining Items (Non-blocking for Conditional GO)

1. **Apply SQL `033`–`036` on production Supabase** — DB-* and REWARD-002 become Fully Resolved after apply
2. **Set production env:** `CRON_SECRET`, `MAINTENANCE_JOB_TOKEN`, optional `UPSTASH_REDIS_REST_*`, `TURNSTILE_SECRET_KEY`
3. **Run `npm audit fix`** and validate Next.js upgrade — closes DEP-001
4. **Cloudinary upload preset restrictions** — ops verification (FILE-001)
5. **CSP nonce migration** — closes FE-003 (planned hardening)
6. **Admin UI for rider erasure** — wire `requestRiderDataErasure` to users module (GDPR-004 UX)

---

## Regression Check

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm test` (226 tests) | Pass |
| Middleware admin routes | Protected |
| Mobile ingest `/api/sessions/*` | Exempt from admin cookies; JWT enforced in handler |
| Cron `/api/internal/privacy-retention` | Exempt from admin cookies; bearer enforced in handler |
| Optimizer `/api/optimize/*` | Admin session OR service token |

**No functional regressions detected** in automated verification.

---

*This document supersedes score estimates in `Gap-Closure-Complete.md` where they differ. Authoritative post-verification score: **88/100**.*
