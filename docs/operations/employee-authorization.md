# Employee Authorization — Operations

| | |
|--|--|
| **Purpose** | Operate, monitor, troubleshoot, and recover Admin employee authorization in production |
| **Audience** | Operations, Support, Security, SRE, on-call engineers |
| **Status** | Active |
| **Last updated** | 2026-07-30 |
| **Owner** | Platform Operations / Admin Engineering |
| **Slug** | `employee-authorization` |

## Related documents

| Perspective | Document |
|-------------|----------|
| Product | [product/employee-authorization.md](../product/employee-authorization.md) |
| Architecture | [architecture/employee-authorization.md](../architecture/employee-authorization.md) |
| Implementation | [implementation/employee-authorization.md](../implementation/employee-authorization.md) |
| Diagnostics UI | `/authorization` (requires `authz.inspect`) |
| Re-audit | [security/Authorization Post-Implementation Re-Audit.md](../security/Authorization%20Post-Implementation%20Re-Audit.md) |

## Table of contents

- [Service overview](#service-overview)
- [Role assignment runbook](#role-assignment-runbook)
- [Monitoring](#monitoring)
- [Alerting](#alerting)
- [Dashboards & signals](#dashboards--signals)
- [Troubleshooting](#troubleshooting)
- [Failure recovery](#failure-recovery)
- [Dependencies](#dependencies)
- [Future evolution](#future-evolution)
- [References](#references)

---

## Service overview

**Healthy** means:

- Employees with a valid `admin_users` row and employee role can sign in (MFA per policy).
- Sidebar, search, and pages match the role’s capabilities (no false links; no hidden legitimate tools).
- Mutations without capability fail closed.
- Privileged role assignment cannot be performed by ordinary ops managers.
- SoD blocks same-actor approval on campaign / reward / route / partner activation when initiator is known.
- Operational exports write `audit_log` (or equivalent) with correlation metadata.
- Authorization diagnostics are available to security/ops leads.

Authorization is **application-layer** on service-role Supabase for Admin. Do not “fix” access by weakening RLS without Security review.

---

## Role assignment runbook

### Prefer canonical roles

| Need | Assign |
|------|--------|
| Day-to-day cross-module ops | `operations_manager` |
| Campaigns only | `campaign_manager` |
| Fulfilment / partners | `partner_operations_manager` |
| Fraud queue | `fraud_analyst` |
| Support desk | `support_agent` / `support_lead` |
| Read-only compliance | `compliance_analyst` |
| Programme oversight | `programme_operations_manager` |
| Exec dashboards | `executive_viewer` |
| Jobs / health | `platform_operator` or `engineering_operations` |
| Privileged security | `security_admin` (rare) |
| Break-glass | `super_admin` (rarest) |

Avoid assigning legacy `admin` for new hires; keep it only for unmigrated accounts.

### Privileged promotion

1. Confirm business need and time-bound intent.
2. Assignee must have `users.role.approve` (`security_admin` or `super_admin`).
3. Prefer temporary elevation once persistence ships; until then, schedule revoke manually.
4. Record ticket / reason in internal change log.

### Revoking access

1. Set `public.user` inactive **or** change role to non-employee / delete `admin_users` row via existing Users flows.
2. Confirm user cannot open Admin (expect `/unauthorized` or sign-in redirect).
3. Invalidate sessions if security incident (sign-out / revoke refresh as per MFA/session runbooks).

---

## Monitoring

| Signal | Why it matters |
|--------|----------------|
| Spike in `/unauthorized` for active staff | Role/capability misbundle or bad deploy |
| Failed `Data Export` / export errors | Capability missing or rate limit |
| SoD rejection messages in support tickets | Expected for same-actor; watch for process confusion |
| Sudden `super_admin` count increase | Privileged assignment abuse / mistake |
| Auth / MFA challenge failures | Identity path, not AuthZ bundles |
| `admin_audit_log` gaps on approve paths | Initiator recording regression |

Prefer existing `audit_log` / `admin_audit_log` and support themes until dedicated AuthZ dashboards exist.

---

## Alerting

| Condition | Severity | Action |
|-----------|----------|--------|
| Mass unauthorized for many roles after deploy | High | Rollback Admin deploy; verify capability registry/bundles |
| New `super_admin` without security ticket | High | Investigate assigner; revoke if unapproved |
| Export audit insert failures widespread | Medium | Check DB `audit_log` writability; degrade exports closed |
| SoD incorrectly blocking *all* approvals (no second actor possible) | Medium | Confirm at least two people hold approve caps; adjust staffing not code |
| Single user locked out | Low | Support troubleshooting (table below) |

---

## Dashboards & signals

Until dedicated dashboards ship:

1. **Authorization** role simulator (`/authorization` — compare expected nav vs complaints).
2. Support macros: role string on `admin_users`, screenshot of sidebar, exact error text.
3. Audit tables: export actions, role assignment updates, entity initiator rows (`*.create`).
4. Deploy notes: AuthZ-related commits must mention capability/bundle changes.

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| User lands on `/unauthorized` for home | Not in `admin_users` or role not in employee set | Confirm `admin_users.role`; fix role; ensure MFA/session OK |
| Sees sidebar link but page unauthorized | Stale client / mismatch (should be rare post-fix) | Hard refresh; verify registry page↔capability; check role bundle |
| Cannot see expected module | Role lacks capability | Use simulator; assign correct role or extend bundle intentionally |
| “Separation of Duties” on approve | Same user created the entity | Another approver must act |
| Cannot assign Super Admin | Missing `users.role.approve` | Security Admin performs assignment |
| Export button missing / fails | Missing `exports.execute` or rate limit | Confirm role; wait / retry; check audit errors |
| Fraud Verify buttons missing | Missing `fraud.resolve` | Assign Fraud Analyst / Operations Manager |
| Legacy `admin` behaves like Operations Manager | Expected alias | Educate; migrate label when convenient |
| Partner activation blocked | Needs `partners.approve` + SoD | Partner Ops Manager / Operations Manager who is not creator |

---

## Failure recovery

1. **Do not** share Super Admin credentials to “unblock” SoD.
2. **Staffing first:** ensure two people hold initiate vs approve where required.
3. **Misbundled role after deploy:** roll back or hotfix bundle; re-verify with simulator.
4. **Accidental privileged grant:** revoke role immediately; rotate sessions; security review.
5. **Export outage:** fail closed (no silent client export). Restore audit writability before re-enabling.
6. **Break-glass:** `super_admin` only; document reason; revoke when incident ends (persistence TBD).

---

## Dependencies

| Dependency | Notes |
|------------|-------|
| Supabase Auth + `admin_users` | Source of employee role |
| MFA / session policy | Enforced in `lib/admin` path |
| `admin_audit_log` | SoD initiator + verification audits |
| `audit_log` | Export governance |
| Next.js `proxy.ts` | Login gate (Next 16 network boundary) |
| Platform API AuthZ | Separate principal path; shared capability strings |

**No SQL migration required** for AuthZ day-1.

---

## Future evolution

- Persist temporary access / break-glass with mandatory reason + expiry alerts
- ABAC filters for programme / region / assignment queues
- AuthZ metrics dashboard (unauthorized rate, SoD blocks, privileged grants)
- Formal role-request ticket workflow in Admin

---

## References

- Product role matrix: [product/employee-authorization.md](../product/employee-authorization.md)
- Engineer module checklist: [implementation/employee-authorization.md](../implementation/employee-authorization.md)
- Post-implementation re-audit: `docs/security/Authorization Post-Implementation Re-Audit.md`
