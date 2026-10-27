# Founder-led settlement operations

Prepared, disabled, locally verified. Production activation is not authorized.

## Accountable operator and authority

The existing verified Super Admin, privacy reference
`employee-sha256:fda75718291e1b61ff83`, owns settlement reviews, incident triage,
technical failures, escalation, acknowledgement and follow-up during launch.
Technical escalation goes to that same operator's existing Admin inbox at
`/notifications`; investigations and acknowledgements use `/incidents`.
There is no additional employee or engineering on-call team.

The resolver checks the pinned account against `admin_users`, active public
identity, confirmed matching Auth email, ban/deletion state and a verified MFA
factor. Revocation fails closed; operational history does not prevent removing
the employee role. Owner reassignment requires a separately authorized, audited
configuration review; never substitute an arbitrary available administrator.

Existing financial proposal/review capabilities, MFA, evidence, execution permits
and independent approval remain mandatory. A founder who proposed recovery cannot
approve that same recovery. Incident acknowledgement and delivery retry do not
invoke recovery or award RPCs, reset settlement attempts, change wallet balances
or release holds. The historical 23-attempt ride remains held.

## Alert contract

Migration100 repairs the existing notification enum insertion. Migration101 adds
the operational bridge, private RLS state and narrow RPCs; identical SQL lives in
all three repositories. Deploy through one authoritative migration pipeline.

`monitor_ride_operations_v3()` derives aggregate conditions from existing canonical
settlement health: delayed work (>5 minutes), overdue review, exhausted retries,
historical holds, missing backend evidence, recent worker diagnostics, failed
worker invocation and missing worker heartbeat (>3 minutes after arming).
Callers cannot submit counts, content, recipient identities or financial actions.

One active alert per condition links the existing `ops_incident` to
`ops_notification_send` and `ops_notification_recipient`. Repeated observations
reuse the episode. A recurring condition reuses an unresolved incident. A new
episode is created only after the earlier condition cleared and its incident
was resolved/closed. Active incidents cannot be resolved to hide an ongoing fault.
Partial credit and settlement status remain visible through the existing ride
operations readers; an alert changes neither.

Service authorship is explicit (`principal_kind=ride_settlement_monitor`, null
employee actor), never attributed to the recipient. Existing employee-authored
queue operations retain their contracts. Generic employee delivery cannot bypass
the service queue's ownership and retry controls. Critical employee operational
messages use the inbox even when marketing/rider notification preferences are off.
No email or outside notification channel is required or invented by this design.
Existing notification push infrastructure may process the persisted notification
under its current configuration; an inbox commit is not proof of push delivery.

The notification, recipient delivery stamp, completion and delivery state commit
atomically. Failures roll back that delivery only and retain a classified retry
record. Up to eight attempts use 30, 60, 120, 240, 480, 960, 1920 seconds between
attempts (capped at 3600). A dead letter remains visible in the existing incident
view; the assigned owner can request a reasoned, MFA-protected, audited requeue.
This resets only that notification delivery budget. Old attempts remain in the
append-only service audit trail. It never resets financial settlement attempts.

After 15 minutes without human acknowledgement, one escalation notification is
queued to the same founder inbox. Reading a notification does not acknowledge it.
The explicit **Acknowledge responsibility (MFA required)** command requires the
pinned owner, `incidents.manage`, and an AAL2 user session even if global Admin MFA
enforcement is disabled. Service-role and other employee sessions cannot call it.
It records the human actor and operation in `platform_audit_record` and
`ops_command_receipt`, and moves the incident to investigating. Duplicate requests
with the same operation return the canonical acknowledgement.

Service creation, delivery, failure, clearing, escalation queueing and worker
heartbeat events use the existing `audit_log` with a truthful service principal.
Only allowlisted counts, categories, stage references and correlation IDs are
automatically recorded. No raw SQL errors, credentials or GPS trails enter inbox
messages or rider responses. Staff investigation still uses existing RBAC APIs.

## Disabled scheduling preparation

`install-ride-settlement-schedules.disabled.sql` is a separately authorized
preparation step after migrations093-101, not an automatic migration hook.
It installs `pg_net` and two existing-Supabase `pg_cron` jobs, atomically inactive:

| Job | Invocation | Schedule | Default |
| --- | --- | --- | --- |
| movrr-ride-settlement-v3 | POST /api/internal/ride-settlement | Every minute | inactive |
| movrr-ride-settlement-monitor-v3 | POST /api/internal/ride-settlement-monitor | Every minute | inactive |

`pg_net` must be preloaded. Its extension is absent in the last authorized
production inspection, although preload and pg_cron are present. Local rehearsal
installed the extension and both jobs without secrets or external HTTP requests.

The SQL invoker reads only these dedicated Vault names at invocation time:

- `movrr_admin_origin`: approved HTTPS Admin origin, without a path or trailing slash.
- `movrr_ride_worker_token`: matches MAINTENANCE_JOB_TOKEN or CRON_SECRET in Admin.
- `movrr_ride_monitor_token`: matches RIDE_SETTLEMENT_MONITOR_TOKEN in Admin.

Use separately generated tokens of at least 32 characters. Never put tokens in
cron commands, repository configuration, logs, incident descriptions or reports.
Application defaults remain `RIDE_SETTLEMENT_WORKER_ENABLED=false` and
`RIDE_SETTLEMENT_ALERTS_ENABLED=false`. DB defaults remain `ride_ops_control.enabled=false`,
`worker_expected=false`, and all existing financial/evidence gates false.

The worker still commits fenced claims before executing the existing financial
executor. It records a safe invocation heartbeat after success or caught failure.
Missing HTTP requests/responses, invalid credentials, job crashes and dead workers
are detected from absence of that heartbeat, independently of the worker itself.
Overlapping HTTP requests are protected by existing per-job lease fencing; do not
claim a global single-invocation guarantee from asynchronous HTTP scheduling.

The monitor cron shares Supabase with the worker and is insufficient to monitor
a failure of the entire scheduler. `scripts/ride-settlement-independent-watchdog.cjs`
must run every minute from an independent scheduler outside Supabase cron. It POSTs
only the operational monitor, with the dedicated monitor token; it never invokes
financial processing. It defaults off, bounds transport/server retries to three,
times out each request at15 seconds (three attempts fit inside one minute), rejects
redirects, fails nonzero on unavailable/disabled monitoring and suppresses
private response/error bodies. Use Node22 or later. Provision environment through
the scheduler's secret manager, not its command arguments:

`MOVRR_ADMIN_ORIGIN`, `RIDE_SETTLEMENT_MONITOR_TOKEN`, `RIDE_OPS_WATCHDOG_ENABLED=false`.

The actual external scheduling destination and its own run-failure/missing-run
visibility remain unconfigured/unverified in available evidence. Assign that
existing provider's monitoring to the same verified founder; do not invent a
channel or employee. If no suitable scheduler exists, the smallest addition is
one independent scheduled HTTP check running this script, with provider-native
failure and missing-run visibility for the founder. This requires separate
configuration/activation authorization. An Admin/Supabase outage can prevent the
inbox itself from accepting alerts: the external run must visibly fail, retain
its execution record and be investigated through the provider until service
recovers. Do not claim the shared inbox provides out-of-band outage delivery.

## Controlled deployment and acceptance

1. Obtain deployment approval and record source digests, schema/grant drift and
   existing wallet/receipt reconciliation. Preserve the historical hold unchanged.
2. Apply the ordered 093-101 chain from one migration authority, including100's
   enum fix. Keep every financial, worker, alert and client-enrollment gate off.
3. Deploy the compatible Admin code with worker/alerts off. Review new operational
   tables under existing employee privacy/retention procedures. Install the
   disabled SQL schedules separately after approval; verify both cron jobs inactive.
4. Provision the approved origin and distinct Vault/application tokens. Configure
   the independent watchdog and its own failure/missing-run monitoring, still off.
   Record actual provider/job references without secret values.
5. After separate permission for live operational tests, enable only the agreed
   alert/monitor scope. Verify one authorized test incident reaches the pinned
   founder inbox, deduplicates, requires AAL2 explicit acknowledgement, and has
   attributed audit and receipt records. Verify failed delivery/requeue visibility
   and same-founder overdue acknowledgement escalation. These tests have not run.
6. Rehearse missing worker invocation with the independent monitor; then a missing
   Supabase monitor/cron invocation with the independent watchdog. Verify the
   watchdog's own missing-run/failure visibility and founder acknowledgement.
   Record timestamps, notification/delivery/incident/audit references. Do not use
   the held production ride or real financial mutations for operational tests.
7. Complete Android/iOS bicycle and installed-build compatibility certification,
   read-only ledger/receipt/wallet reconciliation and policy activation approvals.
   Only then separately authorize financial worker/client activation. Arm
   `worker_expected` with an explicit current `armed_at`; never backdate it.

Read-only preflight:

`node scripts/check-ride-settlement-launch-ops.cjs docs/operations/ride-settlement-worker-v3.example.json <privacy-minimized-inspection.json>`

HOLD exits2. A successful preflight does not activate anything or grant financial
authorization. Production acknowledgement and scheduler receipts must be actual
deployed evidence, not local synthetic results copied into the manifest.

## Containment and rollback

Disable cron jobs and the external watchdog first if operational automation must
stop; turn off the alert gate/control, worker gates and new enrollment as needed.
Do not delete operational delivery/acknowledgement history, financial records,
execution permits or evidence. Leave additive migrations installed. Preserve the
service-principal constraint and generic-delivery guard when rolling back Admin;
do not restore untyped notification inserts or broad client mutation privileges.
Investigate/requeue notification dead letters with the dedicated owner action.
An operational rollback never approves a historical financial recovery.

Local evidence and the full acceptance matrix are recorded in Mobile
`docs/implementation/ride-reward-v3-founder-operations-2026-10-26.md`.
