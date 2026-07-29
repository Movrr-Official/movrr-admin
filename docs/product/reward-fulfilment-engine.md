# Reward Fulfilment Engine — Product Intent & Functional Behaviour

**Audience:** engineers, designers, operations, customer support, QA, product managers, and future team members  
**Scope:** product intent and observable behaviour  
**Not in scope:** architecture, code, database design, or implementation plans

This is the canonical product reference for understanding the Reward Fulfilment Engine without reading technical specifications or source code.

---

## Overview

The **Reward Fulfilment Engine** is the system that safely delivers rewards after riders earn them.

Riders earn points through verified riding. Those points can be spent in the Rewards Shop. Spending points is not the same as receiving the reward. The Fulfilment Engine is what happens **after** a rider chooses to redeem: it reserves the right inventory, prepares a code or collection experience, involves partners when needed, and closes the loop only when delivery is complete or intentionally unwound.

### Why a fulfilment engine exists

Giving a reward “immediately and blindly” creates risk:

| Risk | Without fulfilment control |
|------|----------------------------|
| Fraud | Same reward claimed twice |
| Partner harm | Codes reused or stock oversold |
| Rider distrust | Codes that never work; silent failures |
| Ops blindness | No way to see where a reward got stuck |
| Scale failure | Manual spreadsheets cannot handle volume |

The engine exists so MOVRR can:

- deduct points with confidence,
- deliver partner value without chaos,
- recover when something goes wrong,
- and keep riders, partners, and operators aligned on the same truth.

**Product stance:** MOVRR does **not** process payments. Points are not cash and have no cash value. Fulfilment delivers partner rewards and experiences — not money.

---

## Goals

### Business objectives

| Goal | What it means in practice |
|------|---------------------------|
| **Reliable delivery** | A successful redemption eventually becomes a usable reward or a clean reversal |
| **Fraud resistance** | Duplicate claims and replayed taps do not create duplicate value |
| **Idempotent redemption** | Retrying the same redeem action does not double-spend points or double-fulfil |
| **Partner protection** | Inventory and codes are reserved carefully; partners do not fulfil the same claim twice |
| **Rider protection** | Riders are not left with deducted points and no reward when fulfilment fails |
| **Operational oversight** | Ops can see queues, timelines, stuck items, and partner activity |
| **Scale** | The same behaviours remain true from dozens to millions of fulfilments |

### What success looks like

- A rider who redeems receives a clear order journey they can reopen later.
- A partner who validates a code knows it is genuine and single-use.
- An operator can answer “where is this reward?” without guessing.
- Failures are visible, recoverable, and rare to require manual heroics.
- Trust stays higher than raw speed: a slightly slower correct delivery beats a fast broken one.

### What the engine intentionally does not do

| Out of scope | Why |
|--------------|-----|
| Become a payment processor | Points ≠ cash; MOVRR does not move money for rewards |
| Invent voucher codes on the rider device | Codes must come from authorised fulfilment |
| Let partners invent fulfilment rules in their own databases | Partner apps are workspaces that call MOVRR Platform behaviour |
| Replace the Rewards Shop catalog | Catalog defines *what* can be redeemed; fulfilment delivers *how* it arrives |
| Quietly invent success when a partner is down | Fake “success” destroys trust |

---

## Reward Journey

End-to-end, a reward travels through this journey:

```text
Ride completed
        ↓
Ride verified
        ↓
Points / reward value earned
        ↓
Reward available in shop (when catalogued & active)
        ↓
Rider redeems
        ↓
Validation & reservation
        ↓
Fulfilment (digital / QR / partner collection / …)
        ↓
Completed  —or—  Unavailable (cancelled / failed / expired) → refund when applicable
```

### Stage by stage

| Stage | What happens | Who cares |
|-------|--------------|-----------|
| **Ride completed** | Rider finishes a ride session | Rider |
| **Ride verified** | MOVRR accepts the ride as legitimate earning activity | Rider, fraud, ops |
| **Reward earned** | Points (or eligibility) land in the rider’s wallet | Rider |
| **Reward available** | An active catalog item can be purchased with points | Rider, catalog ops |
| **Rider redeems** | Rider chooses an item and confirms spend | Rider |
| **Validation** | Balance, catalog status, limits, and eligibility are checked | Engine |
| **Reservation** | Stock/code capacity is held for this redemption | Partners, engine |
| **Fulfilment** | Code prepared, QR ready, or partner collection path starts | Rider, partner |
| **Completed** | Rider can use the reward; claim is closed | Everyone |
| **Unavailable path** | Cancel / fail / expire — with refund behaviour when points were taken | Rider, support, ops |

**Important distinction:** earning points and redeeming a catalog reward are separate moments. Fulfilment only starts at redeem.

---

## Types of Rewards

Rewards are catalog products. Each product has a **fulfilment style** that changes how the rider receives value.

### Live fulfilment styles (primary today)

| Style | Rider experience | Partner involvement |
|-------|------------------|---------------------|
| **Instant Digital** | After redeem, an order opens and a digital code/voucher becomes available when ready — typically without visiting a counter | Usually low / none for completion |
| **QR / Barcode** | After redeem, rider gets a scannable code; a partner validates and confirms collection at a venue | Required for completion |

### Extended / catalogued fulfilment styles

These exist in product vocabulary so catalog and ops can label intent. Rider experience varies by launch readiness of each style:

| Style | Intended rider experience |
|-------|---------------------------|
| **Physical collection** | Collect an item in person at a partner location |
| **Physical shipping** | Item is shipped to the rider |
| **Event ticket** | Admission / event access is fulfilled |
| **Sweepstakes** | Entry into a draw rather than an immediate voucher |
| **Donation** | Points convert into a charitable donation outcome |
| **Premium feature** | Unlocks a product capability inside MOVRR |

### How categories feel to riders

| Rider-facing category | Typical behaviour |
|-----------------------|-------------------|
| Gift cards / digital vouchers | Instant Digital or partner digital code |
| Discount vouchers at a shop | Often QR / barcode + partner validation |
| Campaign rewards | Same engine; eligibility may be campaign-gated before redeem |
| Promotional rewards | May use time limits, stock caps, or one-per-rider rules |
| Marketplace-style rewards | Catalog browsing + redeem; fulfilment style depends on the item |
| Future types | Should reuse the same redeem → fulfil → complete/refund philosophy |

---

## Rider Experience

### How rewards appear

1. Rider builds points through verified rides.
2. Active rewards appear in the **Rewards Shop**.
3. Each item shows cost in points and basic offer details.
4. Shop entry can be gated by platform settings (shop enabled / maintenance).

### How they redeem

1. Rider selects a reward.
2. Confirms redemption while online.
3. Points are committed for that redemption.
4. Rider is taken into an **order / fulfilment detail** experience when fulfilment tracking is available.

### What happens after redemption

| What riders see | Meaning |
|-----------------|---------|
| **Preparing** | MOVRR is reserving / generating / preparing the reward |
| **Ready** | Digital value is available (e.g. code ready to show) |
| **Awaiting collection** | Partner step still needed (typical for QR / venue flows) |
| **Completed** | Journey finished successfully |
| **Unavailable** | Cancelled, failed, expired, or otherwise not deliverable |

Riders can reopen the journey from **My Orders** when the order is linked to fulfilment tracking.

### Confirmations riders receive

- In-app success or failure feedback at redeem time
- Persistent order status on the order detail screen
- Timeline / progress of fulfilment steps (when available)
- Notifications for key moments (earned, ready, fulfilled, failed, expired — see Notifications)

### What happens if something goes wrong

| Situation | Rider experience |
|-----------|------------------|
| Not enough points | Clear rejection; no order created |
| Offline | Redeem blocked; rider is told to reconnect (no silent offline queue) |
| Reward out of stock / unavailable | Clear rejection |
| Code still preparing | Empty/waiting state — **no invented code** |
| Fulfilment fails after points taken | Status becomes unavailable; refund path restores trust |
| Legacy order without tracking | Order may appear in history but tracking detail is unavailable |

---

## Reward States

Product language uses two related views:

1. **Rider progress** — simple status riders understand  
2. **Operational fulfilment states** — finer states operators and partners rely on  

### Rider-facing progress

| Progress | Rider meaning | Typical when |
|----------|---------------|--------------|
| **Preparing** | We’re working on your reward | Right after redeem; reservation/processing |
| **Ready** | You can use / view your digital reward | Instant digital ready; QR prepared |
| **Awaiting collection** | Show this to a partner / finish collection | Venue validation path |
| **Completed** | Done | Successful end state |
| **Unavailable** | This order cannot be completed as hoped | Cancelled, failed, expired, refunded, reversed |

### Operational fulfilment states (simplified)

```text
Created → Reserved / Processing → Ready
                ↓
     Awaiting collection → Validated → Collected → Completed
                ↓
     Cancelled / Failed / Expired → Refunded (when points must be returned)
                ↓
     Completed → Reversed (exceptional unwind)
```

| State family | Why it exists |
|--------------|---------------|
| **Created / reserved / processing** | Capture intent and hold scarce resources before promising a code |
| **Ready** | Safe moment to show authorised value to the rider |
| **Awaiting collection / validated / collected** | Coordinate real-world partner handoff |
| **Completed** | Terminal success |
| **Cancelled / failed / expired** | Terminal or pre-refund failure modes |
| **Refunded / reversed** | Restore fairness after unwind |

Transitions exist so the product never skips from “I tapped redeem” to “partner already fulfilled” without passing through controlled checkpoints.

---

## Redemption Flow

After a rider taps **Redeem**:

```text
Tap Redeem
    ↓
Validate (balance, catalog, eligibility, limits, online)
    ↓
Reserve (inventory / code capacity / fulfilment intent)
    ↓
Create fulfilment journey (order tracking begins)
    ↓
Partner fulfilment steps (only when required)
    ↓
Completion  —or—  failure path with refund when needed
```

### Step detail

| Step | Behaviour |
|------|-----------|
| **Validate** | Confirm the item is active, rider can afford it, limits allow it, and the request is legitimate |
| **Reservation** | Hold the scarce thing (pool code, generated digital asset, capacity) so two riders cannot claim the same unit |
| **Partner fulfilment** | For QR/collection styles: rider presents code; partner validates; partner confirms collection |
| **Completion** | Mark the journey finished; rider progress becomes Completed |

**Idempotency promise:** if the rider’s app retries the same redeem (double tap, flaky network), the product must not create a second independent fulfilment of the same intent.

---

## Fulfilment Behaviour

### Immediate fulfilment (Instant Digital)

- Rider redeems.
- Engine prepares a digital code/voucher.
- When ready, rider can view it in order detail.
- Partner counter visit is usually unnecessary.

**Rider feel:** “I redeemed and got my code in the app.”

### Partner-gated fulfilment (QR / Barcode)

- Rider redeems.
- Engine prepares a scannable token.
- Rider presents it at the partner venue.
- Partner validates authenticity.
- Partner confirms collection.
- Journey completes.

**Rider feel:** “I redeemed, showed my code at the shop, and got the reward.”

### Delayed / asynchronous fulfilment

- Some steps happen after the redeem screen closes (preparation, partner action, background expiry/release jobs).
- Rider can leave the app and return to **My Orders / order detail**.
- Status should advance without the rider babysitting a spinner forever.

**Rider feel:** “I can check back; the order keeps its place.”

### Manual / operational intervention

- Exceptional path when automatic flow cannot finish (partner outage, stuck reservation, disputed claim).
- Operators investigate using queue/timeline/partner tools.
- Manual action should be rare; automation should own the happy path.

**Rider feel:** support may update them; status should still resolve to completed or unavailable/refunded.

---

## Partner Experience

Partners use the **Business Workspace** (partner app), not the rider shop.

### What partners do

| Activity | Purpose |
|----------|---------|
| See pending collections | Know which riders are waiting |
| Validate a token | Confirm the code is real and currently valid |
| Confirm collection | Mark that the rider received the reward in the real world |
| Manage resources / codes (when permitted) | Keep voucher pools healthy |
| Manage staff roles | Owner / staff / viewer permissions |
| View analytics / settings | Operational awareness |

### Inventory behaviour

- Finite codes live in resource pools.
- Redeem reserves capacity so stock is not oversold.
- Unused reservations can be released/expired by policy so inventory returns to health.
- Partners should never manually “guess” codes outside MOVRR.

### How fulfilment requests work

1. Rider redeems a partner-linked reward.
2. Fulfilment becomes visible to the partner when collection is needed.
3. Staff validate the presented token.
4. Staff confirm collection.
5. Rider status moves to completed.

### Failure & duplicate protection for partners

| Concern | Product behaviour |
|---------|-------------------|
| Duplicate fulfilment | Same token/fulfilment cannot be successfully completed twice |
| Invalid / already used token | Validation fails clearly |
| Staff without permission | Cannot validate/confirm |
| Empty pending list while riders redeem | Treat as a platform/ops visibility issue — do not invent local workarounds |

---

## Operations Experience

Operators use **Admin** fulfilment tools to supervise the system.

### What they monitor

- Fulfilment queue health (stuck, aging, failed)
- Timelines for individual fulfilments
- Partner organisations and staff access
- Resource pool health (inventory)
- Redeem success / failure patterns
- Retry and expiry/release activity

### What they investigate

- Rider reports “I paid points but got nothing”
- Partner reports “code already used” / “can’t validate”
- Sudden spikes in failures or retries
- Inventory depletion for popular rewards
- Orders stuck in preparing / awaiting collection

### Manual actions available (product level)

- Inspect fulfilment timeline and current status
- Manage partner organisations and staff
- Maintain catalog items and fulfilment style
- Maintain / import resource pool codes
- Trigger or rely on operational jobs that expire stale reservations and retry recoverable work
- Coordinate refunds / unavailable outcomes when fulfilment cannot complete

### How incidents are resolved

1. Identify the fulfilment / redemption.
2. Read timeline: where did it stop?
3. Determine if partner action, inventory, or rider eligibility is the blocker.
4. Prefer automatic recovery (retry / release / expire + refund).
5. Use manual intervention only when automation cannot restore a correct end state.

---

## Failure Handling

| Situation | Product behaviour | Rider experience | Ops experience |
|-----------|-------------------|------------------|----------------|
| **Partner unavailable** | Do not fake success; keep awaiting or fail/expire per policy | Waiting or unavailable; supportable | Visibility into stuck collection |
| **Network failure at redeem** | Idempotent retry; no double spend | May need to retry; should not see two orders for one intent | Monitor duplicate attempts |
| **Duplicate redemption tap** | Single logical redemption | One order | No double inventory consumption |
| **Timeout during preparation** | Retry recoverable work; expire/release if needed | Preparing longer, then ready or unavailable | Retry volume, aging queue |
| **Inventory exhausted** | Reject new redeems; in-flight reservations protected | “Out of stock / unavailable” | Pool health alerts |
| **Fulfilment failure** | Mark failed/unavailable; refund when points were taken | Clear failure; balance restored when refunded | Failure rate, reason codes |
| **Partial failure** (reserved but not delivered) | Release reservation; refund path | Should not keep paid empty order forever | Release/expire jobs matter |
| **Retry** | Safe to retry without duplicating value | May see status advance after delay | Retry dashboards |
| **Manual intervention** | Exception path | Support-mediated resolution | Case-by-case ops action |

---

## Fraud Protection

| Protection | Why it exists |
|------------|---------------|
| **Duplicate redemption prevention** | Stops double value from one intent |
| **Replay protection** | Stops reused requests from creating new fulfilments |
| **Validation before fulfilment** | No code shown / partner completion without checks |
| **Authorised code display only** | Prevents forged vouchers on device |
| **Redemption limits** (e.g. max per rider) | Stops abuse of promotions |
| **Campaign / eligibility validation** | Ensures only intended riders claim campaign rewards |
| **Partner capability roles** | Viewers cannot validate; only trusted staff confirm |
| **Online-only redeem** | Avoids uncontrolled offline queues that are hard to reconcile |

Fraud controls are trust features. They may feel strict; that is intentional.

---

## Reliability

Expressed as product promises:

| Promise | Business meaning |
|---------|------------------|
| **No duplicate fulfilments** | One successful claim → one delivered value unit |
| **Safe retries** | Networks can fail; customers can tap again without creating chaos |
| **Eventual completion** | In-flight work finishes as completed or cleanly unavailable/refunded |
| **Recovery after failures** | Expiry, release, and retry restore inventory and fairness |
| **Operational visibility** | Someone can always answer “what happened to this reward?” |
| **Partner and rider share one truth** | No private partner spreadsheet that disagrees with MOVRR |

Reliability is measured by correct outcomes, not by how fast a spinner disappears.

---

## Notifications

| Notification | When | Intent |
|--------------|------|--------|
| **Reward earned** | Points / eligibility granted after verified activity | Encourage shop visit |
| **Reward ready** | Digital value available to view/use | Bring rider back to order detail |
| **Reward redeemed** | Redeem accepted | Confirm spend happened |
| **Reward fulfilled / completed** | Journey finished | Closure |
| **Reward failed** | Fulfilment cannot complete | Set expectation + support path |
| **Reward expired** | Time window ended | Explain why code/order is gone |
| **Partner action required** | (Partner-facing) pending validation/collection | Drive counter action |

Notifications should deep-link into the relevant order when fulfilment tracking exists.

---

## Customer Support

### “My reward didn’t arrive.”

**Expected behaviour**

1. Find the order in My Orders / Admin timeline.
2. If **Preparing**: ask rider to wait/refresh; check inventory/jobs if aging.
3. If **Awaiting collection**: rider may still need partner validation/confirm.
4. If **Unavailable** + refunded: explain points returned.
5. If **Unavailable** without refund: escalate to ops for refund path.
6. If legacy order without tracking: explain tracking is unavailable; escalate with redemption timestamp/item.

### “My voucher doesn’t work.”

**Expected behaviour**

1. Confirm status is Ready/Completed and code is the Platform-issued one.
2. Ask partner to validate via Business Workspace (not a handwritten code).
3. If already validated/collected: explain single-use.
4. If expired/cancelled: explain and check refund.

### “I redeemed twice.”

**Expected behaviour**

1. Check whether two distinct successful fulfilments exist.
2. If one intent retried: product should show a single logical outcome — reassure rider.
3. If two real redeems: both spend points; treat as two orders unless policy says otherwise.

### “I accidentally closed the app.”

**Expected behaviour**

1. Redeem should still exist server-side if it succeeded.
2. Rider reopens My Orders / order detail.
3. No need to redeem again for the same successful intent.

---

## Edge Cases

| Edge case | Rider experience | Operations sees |
|-----------|------------------|-----------------|
| **Offline redemption** | Blocked with clear message | No offline backlog to reconcile |
| **App restart mid-redeem** | Return to order if created; safe retry if not | Idempotent redeem attempts |
| **Fulfilment retry** | Status may jump forward later | Retry job / retry volume |
| **Partner outage** | Waiting or later unavailable | Stuck awaiting collection; partner incident |
| **Expired rewards** | Unavailable; possible refund | Expire job activity |
| **Cancelled rewards** | Unavailable | Cancel reason / timeline |
| **Inventory depletion** | New redeems rejected | Pool empty / import needed |
| **Duplicate requests** | One fulfilment outcome | Deduped attempts |
| **Delayed partner response** | Long awaiting collection | Aging queue alerts |
| **Legacy history rows** | Visible but not openable for tracking | Distinguish Platform vs legacy history |

---

## Product Principles

These should not change as features expand:

1. **Riders never receive duplicate value for one redemption intent.**
2. **Partners never successfully fulfil the same claim twice.**
3. **Points are not cash; MOVRR is not a payment rail for rewards.**
4. **Codes and tokens are only shown from authorised fulfilment.**
5. **Redemption is online and reliable; retries are safe.**
6. **Fulfilment is always observable (rider progress + ops timeline).**
7. **Failures recover gracefully: complete or unavailable + refund when owed.**
8. **Manual intervention is exceptional, not the default path.**
9. **Trust is more important than speed.**
10. **Partner and rider apps remain thin clients of Platform truth — they do not invent fulfilment rules.**

---

## Frequently Asked Questions

**Q: Is redeeming the same as getting the reward?**  
A: No. Redeeming starts fulfilment. Getting the reward means the journey reaches a usable ready/completed state (and partner confirmation when required).

**Q: Why can’t the mobile app just generate a voucher code?**  
A: Because forged or offline-generated codes break partner trust and fraud controls. Codes come from fulfilment.

**Q: Why do some My Orders rows not open?**  
A: Older/legacy redemptions may lack fulfilment tracking. New Platform fulfilments should open order detail.

**Q: Do partners need the rider app?**  
A: No. Partners use the Business Workspace to validate and confirm.

**Q: What if a partner confirms collection by mistake?**  
A: Treat as an operational incident. The product prioritises single completion; reversal is exceptional and support/ops mediated.

**Q: What does “Preparing” mean for Instant Digital?**  
A: The system is reserving/creating the digital asset. The rider should wait or refresh — not redeem again immediately.

**Q: Can viewers at a partner validate codes?**  
A: No. Validation and confirmation require appropriate staff capabilities.

**Q: What happens to points if fulfilment fails?**  
A: The product aims to refund when value was not delivered. Support should verify refunded vs still pending.

**Q: Is Instant Digital always partner-free?**  
A: Usually yes for completion. Catalog/partner linkage may still exist for commercial attribution.

**Q: Will every catalogue fulfilment style behave identically?**  
A: No. Styles share the same redeem → fulfil → complete/refund philosophy, but rider steps differ (code vs visit vs shipment, etc.).

---

## QA Behaviour Checklist

Verify observable behaviour (not internals):

### Redeem

- [ ] Online redeem with sufficient points creates a trackable order (Platform path)
- [ ] Insufficient points is rejected with clear feedback
- [ ] Offline redeem is blocked
- [ ] Double-tap / retry does not create duplicate value
- [ ] Inactive / unsupported catalog items cannot be redeemed successfully

### Instant Digital

- [ ] Order detail opens after redeem
- [ ] Code appears only when ready (never fabricated while preparing)
- [ ] Completed/unavailable states are understandable

### QR / collection

- [ ] Rider reaches awaiting collection with a presentable token when ready
- [ ] Partner validate succeeds for a valid token
- [ ] Partner validate fails for used/invalid tokens
- [ ] Confirm collection moves rider to completed
- [ ] Viewer role cannot validate/confirm

### Orders & notifications

- [ ] My Orders opens detail when tracking exists
- [ ] My Orders does not look tappable when tracking is unavailable
- [ ] Notifications with fulfilment identity open the correct order

### Failure & trust

- [ ] Out-of-stock rejects cleanly
- [ ] Failure/expiry leads to unavailable and refund behaviour when owed
- [ ] Partner outage does not show fake success

---

## Operations Checklist

Monitor continuously:

| Signal | Why it matters |
|--------|----------------|
| Fulfilment failure rate | Rider trust & refund load |
| Queue age / stuck preparing | Inventory or job issues |
| Awaiting collection aging | Partner adoption / venue friction |
| Partner validate latency & errors | Partner tooling or training issues |
| Redemption success rate | Shop + engine health |
| Retry volume | Instability or partner/backend pressure |
| Inventory / pool health | Prevent surprise stockouts |
| Duplicate detection hits | Fraud or client retry storms |
| Refund volume | Delivery quality and support burden |
| Legacy vs tracked order mix | Cutover completeness |

---

## Future Evolution

Future capabilities should **extend** this engine, not replace its philosophy:

| Direction | Fits because |
|-----------|--------------|
| More reward providers / partners | Same validate/confirm and inventory discipline |
| Digital wallets / more digital formats | Still authorised issuance + observable status |
| Physical rewards at scale | Same reservation → dispatch/collect → complete model |
| International partners | Same trust principles; localised partner workspaces |
| Scheduled / time-window rewards | Expiry and readiness already exist as product ideas |
| Dynamic reward selection | Selection happens pre-redeem; fulfilment stays consistent after redeem |
| Richer order history media | Improves clarity; does not change lifecycle truth |

Any new fulfilment style must still answer:

1. What does the rider see?
2. When is value actually delivered?
3. How do we prevent duplicates?
4. How do we unwind fairly on failure?

---

## Product Summary

The Reward Fulfilment Engine is MOVRR’s system for **turning a redemption into a trustworthy delivered reward**.

- **Riders** earn points, redeem in the shop, and follow a clear order journey (preparing → ready / awaiting collection → completed, or unavailable with fair unwind).
- **Partners** validate and confirm real-world collection without running their own fragile fulfilment rules.
- **Operators** observe queues and timelines so incidents are diagnosable.
- **The product** prioritises idempotency, authorised codes, partner protection, rider fairness, and observability.

The behaviours that must remain true: **no duplicate value, no forged codes, no silent fake success, and trust over speed.**

---

*Canonical location: `docs/product/reward-fulfilment-engine.md`*
