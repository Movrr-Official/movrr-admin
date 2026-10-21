# Admin account terminology production release — 21 October 2026

The explicitly approved Admin revision `09991751f36e1aabd1a67a5d7473cc72905d395e` was deployed as `dpl_56bHKrva7EDz1xhUy1Ze85URrKuy`. Independent readback verified READY/PROMOTED, the project production target and `admin.movrr.nl`. The [production receipt](../verification/account-terminology/production.json) records the exact source, isolated UI evidence, immutable build results, HTTP probes and read-only database comparisons.

The prior deployment was `dpl_CmD93XcJu3yxdh9iDYQoAbk2G9Y4`, source `f3f0dec1bccf515cb53f48356bc1007b56e5eea1`. The runtime delta consists only of the seven tested User Management presentation files. User readers, statistics calculations, schema and authorization contracts are byte-identical to that prior revision. Newer dashboard remediation and cleanup work were excluded by deploying the approved Git SHA, never the shared working tree.

Both the production candidate and final deployment passed compilation and TypeScript. The existing isolated acceptance includes 51 focused UI/schema/action tests, TypeScript, the repository lint command and a production build. Rendered tests cover Unassigned, Rider, Partner, Advertiser, Government, Internal Staff and multiple types, creation payloads, classification/role/status filters, statistics, Details, opt-in assignment and access history.

## Verified terminology and classification

The exact deployed source uses **Account Types & Roles**, **Account Type**, **Account Breakdown**, **Organisation Users**, **Internal Staff**, **Manage Access**, **Organisation Memberships**, **Assign to Organisation**, **Assign Staff Role**, **Access History**, **Organisation Role** and **Save Assignment**. It removes the superseded visible Relationship/User-only labels from the affected interface while retaining canonical role names and the existing independent Status presentation. Ordinary Riders do not receive an unconditional membership form or redundant active Rider status label.

**Unassigned** is derived presentation for an account without additional access. Read-only production checks confirmed it is absent from the historical database role enum and stored account roles. No role, permission, status or default membership was invented. The deployed creation and independent Rider/organisation/Staff contracts remain unchanged.

These labels and screen behavior were verified in exact source and actual isolated DOM tests. They were **not** observed through a successful authenticated production browser session: Chrome DevTools could not connect and computer-use inventory exposed no browsers.

## Counts, permissions and preservation

At final verification (`2026-10-21T14:39:01.859Z`), production retained **17 Users**, all active; **13 Users with Rider profiles**, **one Organisation User**, and **five Internal Staff**. Eleven existing Users were Rider-only without an organisation; no Unassigned production account was fabricated. A read-only Supabase account-count request independently returned 17.

Before/after comparisons covered **184 public/Auth tables**. Protected identity, membership, cleanup, financial, ride and audit fingerprints were unchanged. Only routine Admin dashboard session activity changed during the release window. Function definitions/ACLs/owners, policies, table grants, RLS flags and migration journals were unchanged. No migration, permission change or production-record mutation was executed by this task.

All 13 live anonymous HTTP probes passed, including sign-in availability, protected-page gates and canonical JSON API authentication denial. Candidate checks also passed before promotion. Firewall configuration remained unchanged at version 10, enabled with zero custom rules. The web deployment remained `dpl_5CbDEtdhy6Jk4Y53vXhFxXQbirVN`; Mobile was untouched. Deletion intake remained Enabled, irreversible execution Disabled and public Shop redemption Disabled.

## Remaining issue: existing Users-loading P1

The known Users dashboard defect persisted at this release's verification: direct `account_auth_sync` selection returns `42501`, despite the underlying 17 accounts being intact. The approved terminology revision has the same data reader and error behavior as its production baseline. It does not fix that pre-existing defect, and this report does **not** claim the live Users table, counts, filters or Details successfully loaded in an authenticated production session.

The independently owned [Users dashboard P1 remediation](users-dashboard-p1.md), including 079 and source correction `083fe8c`, was deliberately excluded from this exact-SHA deployment. Its authorization, migration, release and acceptance must proceed through that separate workflow. This report records this release's verification time and does not override a later separately authorized remediation or cleanup.

Authenticated live acceptance of the corrected labels, real table counts/loading, filtering and Details remains necessary. No credentials, synthetic users, financial tests, emails, legacy fallback or compatibility path were introduced to manufacture that acceptance.

The production inspection tool is `scripts/manual/account-terminology/inspect-production.cjs`. Raw read-only snapshots remain in ignored `.tmp/account-terminology-deploy-20261021/`; the committed receipt contains aggregate counts and fingerprints, not identity details or credentials.
