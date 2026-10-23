# Controlled Community Safety rollout receipt

23 October 2026. **STOPPED AT PREFLIGHT — no production apply or deployment.**

The owner approved the internal retention and moderation operating policy and
conditionally authorized a backend/Admin rollout. The authoritative approved
policy, exact blockers, containment limits and resume order are in
[Community Safety operations](../../operations/community-safety.md). The
[launch roadmap](../../release/launch-roadmap.json) has been updated.

- `preflight.json`: read-only Supabase target, migration checksum, required RPCs,
  policy/helper comparison, Community aggregate fingerprints, cover counts and
  preserved gates. No tokens, individual rider records or narratives.
- `rehearsal.json`: fresh 192-table schema-only installation, 14 targeted assertions,
  rollback and publication/participation/roster preservation, old-client cover
  incompatibility and actual restricted-account report/block write results.
- `admin-baseline.json`: current production Admin alias/source, read only. No older
  deployment promoted and no candidate created.
- `preservation.json`: repeat read-only checks confirm Community fingerprints and
  operating gates match the initial baseline.

Runtime source: Admin `f765f1b7f4879bdc91de7530e5ad34d89aa20814`,
Mobile `0aeb626f28c9761f486e8b5fb17aad4bb6a29dae`. Migration 082 remains unchanged
and unapplied, SHA-256 `6072bdf88bb1256439ad2ab6a1510b3894014125154f35c44449b6ba84ad20d0`.
Fresh production schema export SHA-256:
`3930a9082a74505ca611a5bbffa6bbf9f907c56aec65017b1ff325f57419c3aa`.

Reproduce with [the local/read-only tooling](../../../scripts/manual/community-safety/README.md).
Its source schema export and prerequisite metadata are retained as task-specific
ignored input fixtures. They are not another schema authority. No production rows
were copied. Object ownership and role memberships are not fully cloned, control
table contents are not replayed, and outbound push is replaced by an inert local
trigger. The lifecycle restriction probe uses an actual local queued job and its
installed barrier trigger. This is not a complete irreversible-erasure rehearsal.

Earlier 96 SQL / 21 authenticated HTTP / 28 real Storage assertions and 192
rendered-state checks are reused from the independent audit; unchanged suites
were not rerun. Fresh checks concern schema installation/lifecycle/client cutover,
not another broad audit. No authenticated production write journey, staff decision,
new report/block or physical-device acceptance was performed. No native visual
acceptance, Mobile delivery or release readiness is claimed.

Privacy disclosures are unchanged: the future Safety-specific EN/NL notice,
necessity/minimum-field assessment and lifecycle disposal controls are still
required. Human review needs demonstrated coverage/escalation; no external image
classification provider is used. Production CDN/private-cover acceptance and
verified backup recovery remain pre-apply dependencies.

Concurrent test-port changes and newly created draft proposal/rollout/rehearsal
files were preserved and excluded from this continuation's commits. Their claims
are not substituted for the current owner approval or these fresh receipts.
