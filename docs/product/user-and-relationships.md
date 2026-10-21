# MOVRR User and independent relationships

Product understanding established before implementation on 21 October 2026. The owner's ten product rules and subsequent explicit Mobile decision govern this document. Existing schema or Admin controls are evidence of behaviour, not product requirements.

## Product model

A User is the independent MOVRR account: sign-in identity, personal account details and account status. An account can exist while onboarding is incomplete, without any Rider profile, organisation or Staff grant. Absence of a relationship is valid and must not be described as missing mandatory organisation access.

| Relationship | Deliberate creation / grant | Authority and removal |
| --- | --- | --- |
| User only | Admin chooses User only; no role or organisation | Sign in, account setup/recovery, accept an explicit invitation and sign out. No Rider, organisation or internal operational permissions. |
| Rider | Rider chosen in Admin, approved waitlist conversion or signup in the Rider Mobile application | Personal Rider services require the actual Rider profile and relevant active states, never an organisation. Membership removal must preserve Rider profile, Wallet and history. |
| Organisation member | Partner, Advertiser or Government organisation selected explicitly, or verified invitation accepted | Only the scoped role in that named organisation. Organisation existence is independent of its members. Revocation removes that grant, not the account or other relationships. |
| Internal Staff | Explicit authorized MOVRR Staff grant | Internal capabilities and MFA are independent of Rider and external membership. Staff-only accounts are valid. |
| Multiple relationships | Each relationship explicitly created or granted | Display and authorize each independently; choose the relevant workspace for organisation operations. Do not collapse capabilities into one account role. |

Account status controls the whole identity. Rider status controls Rider eligibility. Organisation membership status controls the specific grant. These are separate states. Display account status once in the established Status presentation; show a relationship's exceptional state only where it affects that relationship. Internal Staff and external organisational Staff are different grants.

The Mobile decision is explicit: MOVRR Mobile is the Rider application, so signing up there intends Rider onboarding. Keep that active public signup contract and its current metadata unchanged. It is not an error fallback. Admin's User-only, external and Staff creation must use an exact authorized reservation and must never fall into Mobile Rider provisioning. No new mandatory Mobile marker or Mobile runtime change is in scope.

## Verified evidence and divergences

- Existing product intent: [mobile-first companion](mobile-first-companion.md) retains personal Wallet, ride history, account and privacy journeys without tenancy. [Partner operations](partner-operations-and-organisations.md) describes an institution's tenancy; its wording must not be interpreted as requiring every person or Rider to belong to an institution. [Employee authorization](employee-authorization.md) defines independent internal grants.
- Mobile `app/(auth)/signup.tsx` invokes `features/auth/services/emailAuth.ts` with name/city, without organisation or employee membership. `features/auth/services/riderIdentity.ts` resolves the actual Rider ID for Rider operations. No organisational prerequisite exists. Preserve those callers unchanged.
- Admin `scripts/071_external_account_domains.sql` already separates external/employee reservations from Rider creation; `change_organisation_membership` and `scripts/073_account_status_and_staff_commands.sql` already preserve unrelated relationships. Reuse those security contracts.
- Admin `app/actions/users.ts` and `app/users/create/CreateUserPage.tsx` require a product domain and role for every new account. There is no User-only recipe. The form defaults every ordinary creation to Rider. Correct the creation choices, not the independent membership writer.
- `components/users/AccountMemberships.tsx` always loads all organisations and renders membership creation plus activation/suspension recovery for every user. `UserDetailsDrawer.tsx` repeats Rider and account statuses and exposes a Staff selector during every edit. `UsersTableColumns.tsx` presents zero relationships as “No active membership”, rather than a valid User. These are technical assumptions, not product requirements.
- `getUsers` derives a coarse primary role and domains from all memberships, including revoked ones. Rendering and filtering must use actual independent relationships, with revocation shown as history rather than active access.
- Web `lib/appUser.ts` makes authentication depend on finding a Rider or organisation workspace; no role returns null. It can send a signed-in User-only or Staff-only identity back to sign-in. Authentication must resolve the account first; product access is a separate optional selection.
- Web `app/auth/layout.tsx` describes MOVRR solely as a Business Workspace and says all access depends on organisation membership. `app/workspaces/page.tsx` tells profile-free users to contact an organisation owner. Correct this copy and empty-account handling without changing geometry or inventing access.

## Minimal implementation boundary

Extend the existing durable provisioning contract for an explicitly relationship-free User; do not build a second provisioning ledger or role writer. No persisted dummy role is needed. Keep Rider provisioning, organisation tenancy, capability/MFA checks, stale-command protection, deletion barriers, financial history and audit contracts.

Admin creation expresses “User only”, Rider, named external organisation access or internal Staff. A plain account edit changes personal details/status; relationship changes are explicit separate actions. Existing memberships are visible, adding one is opt-in, and recovery is visible only for a real pending receipt. A profile-free web account remains authenticated and receives a simple existing-style account/workspace landing, with no Rider dashboard or organisational permissions fabricated.

No production migration, role mutation, provider message or deployment is authorized by this source-remediation task. Keep deletion intake Enabled, irreversible execution Disabled and public Shop redemption Disabled. Verification must distinguish local handler/PostgreSQL/GoTrue evidence from production and authenticated browser acceptance.
