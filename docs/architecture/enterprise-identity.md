Product model authority: a User exists independently, with no required Rider profile, organisation membership or internal Staff grant. See [User and independent relationships](../product/user-and-relationships.md) and [source remediation / 078 release requirements](../release/user-relationships-simplification.md). Dated release statements below are historical evidence, not account requirements.

Current release: approved SQL and pinned Admin/web are deployed; ID-25 blocks complete external API acceptance. See [production release evidence](../release/enterprise-identity-production.md). Earlier preflight descriptions below are historical.

# Enterprise identity remediation — 21 October 2026

The approved production rollout subsequently stopped in read-only preflight. Revisions to 071 and 075 correct two installation defects; see the [stopped-rollout report](../release/enterprise-identity-rollout-stopped.md). Production acceptance is still outstanding; the original approval does not cover the revised SQL checksums.

Source implementation and isolated acceptance are separate from production acceptance. Migrations 071–076 and the changed applications have **not** been released. The production snapshot still ends at migration 070. No production identity, membership, financial record, permission or operating gate was changed during this investigation.

## Canonical model

| Concept | Authority | Meaning |
| --- | --- | --- |
| Authentication | `auth.users` | One sign-in identity, verified email, MFA factors, Auth bans/deletion |
| User account | Matching `auth.users.id` and `public.user.id` | Independent account; zero Rider profiles, external memberships and Staff grants is valid. User-only has no product role. |
| Account status | `public.user.status` plus Auth state | Only active, nondeleted, unbanned identities authorize requests |
| Rider domain | Explicit `rider.user_id` profile and `rider.status` | Personal services, never internal operations |
| External domains | `organisation.type` and `organisation_membership` | Partner (`reward_partner`), Advertiser or Government; exact tenant, role and active/invited/revoked status |
| Internal MOVRR Staff | `admin_users.user_id` and canonical nullable `role` | Explicit independent platform staff grant; null revokes it while preserving references |
| Capabilities | `CapabilityCatalog.ts` and employee templates | Server-enforced domain and role grants; generated SQL shares the external catalog |
| Historical projection | `public.user.role` enum | Immutable historical/product navigation data; no internal or external permission authority |

An identity can have an independently granted Rider profile, staff grant and multiple external memberships. Revoking one membership preserves the others and all history. Account suspension denies every domain; Rider suspension denies Rider services independently. Current staff capabilities authorize platform operations globally. Former department/assignment/organisation scope metadata was descriptive only: the unused always-allow “future ABAC” evaluator has been removed, and diagnostics now report the actual global staff scope. External organisation authorization always checks the exact tenant. Role labels or departments do not create an unimplemented staff assignment boundary.

Operational request evaluation is: verified Auth identity → current active account → relevant selected domain/tenant → active profile or membership → valid scoped role → required capability → resource scope and command constraints. Unknown roles, missing/ambiguous required relationships and stale versions deny that operation, not the existence of the User. Ordinary account authentication does not require a product relationship. A tenant selector never falls through to internal staff authority. Rider-owned APIs continue to resolve the actual Rider. Staff Admin guards retain MFA; direct staff RLS capabilities require AAL2 as well.

## Role and capability inventory

The complete, generated role-to-capability inventory is [account-domain-capabilities.json](account-domain-capabilities.json). `node scripts/generate-account-domain-catalog.cjs --check` verifies it and the PostgreSQL organization catalog against the TypeScript source.

| Domain | Supported scoped roles |
| --- | --- |
| Rider | Rider |
| Partner | Owner, Manager, Partner Operations Manager, Staff, Viewer |
| Advertiser | Owner, Manager, Staff, Viewer |
| Government | Owner, Viewer |
| MOVRR Staff | super_admin, security_admin, operations_manager, platform_operator, campaign_manager, partner_operations_manager, fraud_analyst, trust_safety_analyst, support_agent, support_lead, finance_operator, compliance_analyst, programme_operations_manager, executive_viewer, product_operations, engineering_operations |

The production-before inventory records every deployed bundle, capability, SQL function signature/hash, relevant grant, policy, trigger, constraint and legacy enum dependency in [production-before.json](../verification/enterprise-identity/production-before.json). Deployed organization bundles were owner/manager/staff/viewer; Rider used `rider.default`. There were zero organization memberships in the read-only snapshot. The old enum contains super_admin/admin/moderator/support/advertiser/rider/gov. Its historical column/default and support-ticket dependencies explain why dropping the type is inappropriate. New external and staff profiles use null in this column; ordinary intentional Rider signup retains its Mobile navigation projection. No enum values were added.

## External and internal Partner Operations Manager

The existing external Manager has nine capabilities: resources.manage, rewards.manage, rewards.catalog.read, fulfilment.read/validate/confirm/cancel/refund and analytics.view. These cover voucher inventory/catalog, partner locations/resources, QR collection and fulfillment, including operational cancellation/refund. It has no staff administration. Reusing it would fail the explicitly approved staff-administration requirement.

The approved external `partner_operations_manager` adds staff.manage. It can grant, change and revoke **Staff and Viewer only**, within its active Partner organization. It cannot manage an existing Owner, Manager or another Operations Manager; grant ownership; grant internal roles; manage platform billing; or approve platform operations. Owner has a broader subordinate-role ceiling. Ownership changes remain reserved to a platform actor with users.role.approve. Manager stays Manager: there is no alias, automatic upgrade or data reinterpretation. With zero existing organization memberships, no production Manager grant needs conversion.

The internal role of the same name remains an explicit MOVRR Staff template: fulfillment, rewards catalog, partner/reward approvals, exports, reports, wallet visibility and workboard access. Its platform capabilities and escalation boundary differ from a tenant operator. It has neither users.role.assign nor users.role.approve. Domain and membership, not the shared label, distinguish them.

## Why the old experience survived

Migration 070 and its source release corrected employee aliases, the enum cast/fallback and employee assignment authority. They did not implement five-domain creation. At baseline `eb86e0a`, CreateUserPage still composed Rider/Advertiser choices with employee templates; product options had no Partner/Government creation contract or organization selector. User details projected one legacy account type, external membership writes were separate, and the web selected the oldest organization. Changing the backend employee catalog alone could not replace these independent UI/read/provisioning contracts.

The exact historical seven-value enum dropdown was not verified in an authenticated deployed browser in this session. Its reported occurrence is not evidence of a cache problem. Source and deployed SQL were inspected independently; current main's mixed/incomplete creation form was directly demonstrated. No cache or deployment explanation is asserted without evidence.

## Provisioning, lifecycle and active authorities

Creation validates domain, tenant type, role, actor capability, owner approval, status and email before Auth side effects. SQL reserves an exact UUID and request under an email lock shared by Rider, employee and external provisioning. Auth is created banned with server-owned reservation metadata. One SQL transaction persists the requested profile/membership and audit; Auth activation follows, then the durable receipt is completed. A database failure leaves a banned, recoverable Auth identity. Lost Auth/persistence responses and simultaneous requests reconcile that same reservation. A changed/revoked completed grant cannot be resurrected by replay. There is no cross-service atomicity claim or destructive compensation.

| Active authority | Entry points | Boundary |
| --- | --- | --- |
| Intentional Rider signup | GoTrue insert guards and `handle_new_user` | Explicit supported signup; no operational grant |
| Authorized account creation | `createUser` → provision_product / provision_employee / provision_external_account | Durable reservations, exact supported role, no fallback |
| Staff role changes | User Details → update_admin_user_profile → assign_employee_role(uuid,uuid,text,text) | Expected account version and prior role; no self-escalation or removal of last active super administrator |
| External membership changes | Admin account membership actions and organization APIs → change_organisation_membership | One audited tenant writer; exact role/status/version; owner approval and operational-role ceiling |
| Invitations | issue / accept / revoke_organisation_invitation | Existing explicit identity, hashed token, verified invited email, seven-day expiry, issuer authority rechecked, no token-based signup |
| Account status | update_admin_user_profile + account_auth_sync_state | DB denial commits first; versioned durable Auth synchronization/recovery |
| Rider membership status | Authorized Rider administration | Changes Rider status only; does not suspend unrelated domains |
| Account deletion continuity | Existing gated deletion commands, including detach_account_deletion_organisation | Preserved audited lifecycle authority, not an alternative general membership writer |
| Workboard collaboration | Existing staff/team-authorized handlers, accept_workboard_platform_invitation and hardened resend RPCs | Independent active staff workboard.access and current team authority; no anonymous resend; exact prepared token checks; collaboration membership never grants a product domain or internal staff role |
| Safe profile self service | update_my_rider_profile and own-profile policies | Whitelisted personal fields, no role/status authority |
| Auth/MFA administration | Existing elevated Admin MFA handlers and Supabase administrative API | Session/assurance and capability checks remain; not an employee role writer |

Invitation delivery is a generated acceptance link, displayed to the authorized operator; acceptance requires an explicit authenticated POST. Link scanners do not accept it. Retries reuse the operation token; changed access invalidates pending invitations, and accepted receipt retries require the exact accepted membership version. Old tokens cannot alter a subsequent grant. No email is sent by this new organization invitation path. Existing account-setup email delivery remains separately observable and is not claimed exactly once.

Admin uses Account domain → Organization → valid scoped role → account/membership status, with the established form components. Existing identities receive explicit independent memberships. Details and listings display all memberships, including role and status; domain/scoped-role filters and organization search use membership projections. UTC offsets and microsecond versions survive round trips. External web users choose a validated workspace; a cookie is a selector, not a permission grant. Staff and Rider access remain independently visible.

## Retired paths and migrated consumers

- Mixed role creation choices and obsolete product role-option export: replaced with the domain catalog. Notification audiences were migrated separately to explicit domains and staff memberships.
- Legacy exported updateUserRole and direct deleteUser actions, destructive user/Rider delete buttons: removed. Deletion intake and its controlled lifecycle remain.
- Three-argument assign_employee_role: dropped after migrating provisioning and profile commands to expected prior role.
- Arbitrary assignBundle command/repository methods: removed; bundle key follows the exact scoped role, enforced in SQL.
- Direct organization membership and employee grant DML: revoked; API/store callers use canonical commands. Historical references/rows remain.
- Coarse is_movrr_admin and Shop hard-coded staff lists: replaced with current capabilities and active identity checks.
- Broad dashboard RLS predicates: rewritten to concrete capabilities. Historical user_owns_campaign helper is dropped after all policy consumers move to tenant capability checks.
- Advertiser historical-owner authorization: replaced with active membership checks. Explicit advertiser.user_id ownership is backfilled through an approved migration actor, never inferred from user_role.
- Oldest-membership selection and web campaign database fallbacks: removed. Advertiser settings require org.settings and update the selected organization profile.
- Always-allow future ABAC function: removed; no executable placeholder permission evaluator remains.

Anonymous invitation resend/expiry authority and one-argument commit/abort RPCs are retired. Workboard callers use service-only actor-checked scoped commands with recoverable exact preparations. Generic invitation store writes are restricted to Workboard; organization invitations use canonical SQL lifecycle and reject direct service DML.

Historical migrations, enum data, financial rows, audit history, staff IDs and deletion continuity references are preserved. Mobile's read-only Rider navigation projection remains because runtime changes are prohibited; backend Rider access requires the actual active profile and identity. The legacy enum is not a source of staff or organization permissions.

## Acceptance and release

See the [initial-versus-final findings register](enterprise-identity-findings.md), [verification evidence](../verification/enterprise-identity/verification.json) and [release requirements](../release/enterprise-identity-release.md). Real local server-action/GoTrue/SQL journeys cover all five domains, including external Partner Operations Manager. Authenticated browser interactions and production acceptance remain open. This document does not declare the production remediation complete.
