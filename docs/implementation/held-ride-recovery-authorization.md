# One-job held-ride authorization candidate

Status: source verified; deployment and financial execution separately gated.

This corrects a two-super-admin assumption in the prepared one-job recovery for ride fb5df08c-06ad-4b25-ac0d-81419226e3a4. Accepted ADR-0001 requires capability-based feature access and separation of duties, not two root accounts. Product employee-authorization section "Separation of duties" requires a different authorized colleague and prohibits credential sharing. Operations employee-authorization treats super-admin as rare break-glass and requires staffing for genuine independent approval.

Two proposed, one-job permissions are registered in the canonical capability catalog and dashboard registry: rides.settlement.recovery.request for Engineering Operations, and rides.settlement.recovery.review for Operations Manager (including legacy admin) and Finance Operator. Super Admin inherits the existing complete catalog. There are no new roles/accounts or unrelated grants. Two independent people, no self-approval, AAL2, trusted Admin sessions, immutable evidence binding, revocation and audit remain mandatory. SQL rechecks current capability and owner state; broad audit insert permission is not approval authority.

The three server actions only propose, review and revoke approval through a genuine user client after requireCapability, MFA and identity verification. They have no claim/settlement/point amount API. The matching generated SQL and detailed procedure live in movrr-mobile/scripts/manual/held-ride-recovery and docs/implementation/held-ride-recovery-policy-review.md. The SQL projection is generated from canonical catalog/templates; coordinated source hashes are in capability-manifest.json. Run the mobile generator with --check before deployment and whenever these capability bundles change.

No migration or approval is seeded by this source. Actual recovery preserves attempts 23 to 24, a five-minute lease and the original exactly-once executor. The normal eight-attempt limit is unchanged. Publishing code does not approve a financial attempt.

Admin main is linked to Vercel Production. Do not push this candidate there without explicit deployment authorization or independently verified suppression of automatic deployment. No such hosting change is part of this work.
