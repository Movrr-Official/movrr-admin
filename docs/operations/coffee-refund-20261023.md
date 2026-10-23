# Coffee voucher refund — separate financial authorization required

Status: PREPARED IN SOURCE. NOT EXECUTED. Shop must remain Disabled.

## Evidence and scope

The production read-only preflight on 2026-10-23 confirmed redemption
`ee738c97-47c2-41a9-976e-35e551d70382` is cancelled, with original debit
`22009837-9a7d-4d87-afc1-e0c0ee43c8e2` (`redemption`, -400), zero refund
entries, and both ledger and spendable balance 20,174. A full refund would
produce 20,574 in the absence of intervening activity. Cancellation was by
Admin, not a merchant. Re-run the preflight immediately before authorization.

## Deployment prerequisites

1. Run the isolated PostgreSQL lifecycle suite and relevant application tests.
2. Review and deploy `scripts/083_redemption_refund_reconciliation.sql` and
   `scripts/084_redemption_notification_delivery.sql` through the established
   migration journal, with distinct versions `20261023200000` and
   `20261023201000`. Neither script refunds a record or enables Shop.
3. Deploy the Admin API/worker and updated `send-push-notifications` Edge
   function together, before the Web/Mobile consumers. Do not execute a
   financial command as a deployment smoke test. Hold redemption financial
   commands during this coordinated rollout so an old Edge sender cannot
   dispatch a new notice before durable receipt tracking is installed.
4. Verify the existing private recovery scheduler reaches the worker; the
   worker reuses the existing Edge sender for bounded push retries and receipt
   polling. No new provider, extension, cron job or secret is installed.
   The former database webhook cannot dispatch while its approved Vault key
   and pg_net are absent. Do not create either without infrastructure approval.
   Verify the existing Edge/Expo credentials through an approved nonfinancial
   delivery check. A push ticket or APNs/FCM receipt does not prove device display.
5. Confirm `shop_release_control.state='disabled'` and `redemption_enabled=false`.

## Exact proposed financial operation

Requires a separate explicit owner authorization for this exact +400 credit.
Use an authenticated, authorized Admin session; never supply or impersonate an
actor UUID directly. POST:

`/api/v1/rewards/redemptions/ee738c97-47c2-41a9-976e-35e551d70382/reconcile-refund`

Idempotency-Key:
`coffee-refund:ee738c97-47c2-41a9-976e-35e551d70382:v1`

Body: the checked-in `movrr-mobile/scripts/manual/coffee-refund-20261023/request.json`.
The canonical ledger operation key is deterministically
`legacy-refund:ee738c97-47c2-41a9-976e-35e551d70382`.

Immediately beforehand run, from movrr-mobile:

`node scripts/manual/coffee-refund-20261023/preflight.cjs`

This tool only reads production, rejects extra arguments, checks the pinned
project, ownership, debit, absence of credits, cancellation and Shop state,
and saves redacted evidence in ignored task storage. Migration installation
and `settlementSourceVerified` must both be true before execution. Any changed evidence requires renewed review;
elapsed time or a passed preflight is not financial authorization.

The command explicitly binds the verified legacy debit, then calls the same
refund ledger writer used by canonical fulfilments. It creates one positive
400-point `adjustment` entry classified `compensating_refund`, referencing
the unchanged original debit and redemption, with operation/correlation and
audit receipts. It never overwrites a wallet balance or edits an old ledger row.

## Post-execution evidence and recovery

In a fresh read-only transaction verify: original -400 unchanged; exactly one
+400 entry referencing the original debit; sum of refunds=400; status still
cancelled; net points spent=0; outstanding refund=0; wallet snapshot equals
ledger minus remaining unrelated legacy reservations. Expected balance is
20,574 plus any newly verified unrelated transactions. Capture the new credit
ID/time, both idempotency receipts, audit correlation and targeted inbox
notification. Confirm notification read state independently from push dispatch,
Expo acceptance, provider receipt and actual device acknowledgement.

The preflight intentionally fails after a credit exists. Do not mistake that
for a failed refund and do not invent another operation key. Query the persisted
receipt and ledger. A lost HTTP acknowledgement is recovered by replaying the
same exact approved request; wallet locks, binding and remaining-amount checks
prevent a second credit even with a different caller operation key.

Before commit, any failure rolls back binding, credit, balance trigger, audit,
notification and receipt together. After commit, never delete the credit or
rewrite history. A genuine financial reversal requires its own reviewed and
authorized compensating operation. Deployment rollback must retain all binding,
financial, audit and notification evidence; use a forward fix for contract drift.

## Release gate

No public Shop enablement, EAS build, OTA update or store submission is part of
this change. Production refund remains NO-GO until deployment verification,
fresh preflight and the separate exact financial authorization are complete.

## Source verification (2026-10-23)

- PostgreSQL 17 disposable localhost database: 397 lifecycle assertions, with
  12-connection same-key and competing-key races, partial refund preconditions,
  reservation-only cancellation, fulfilled/cross-rider/tenant denial,
  immutable debit preservation, receipt-failure rollback and safe retry.
- The actual Edge handler was executed against real PostgreSQL delivery
  receipts, doubling only Expo transport. Accepted tickets were not resent;
  provider receipts persisted; uncertain send outcomes were fenced for review.
- Admin full suite: 946 passed; 105 existing tests skipped.
- Web full suite: 98 passed.
- Mobile rewards/notification suite: 368 passed; final screen/financial-copy/
  language checks: 27 passed (overlap with that suite).
- TypeScript checks passed in Mobile, Admin and Web. English/Dutch parity:
  2,821 keys per language.

These are source and isolated integration results. They do not establish live
Expo/APNs/FCM delivery, physical-device display, production migration completion
or financial authorization. The latest production preflight remains in ignored
`.tmp/coffee-refund-20261023/preflight.json` in movrr-mobile and is retained as
read-only operational evidence; it confirms zero production mutations.
