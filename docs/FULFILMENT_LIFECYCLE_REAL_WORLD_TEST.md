# Fulfilment lifecycle — real-world E2E test guide

Practical walkthrough for testing the reward fulfilment lifecycle across **movrr-admin**, **movrr-mobile**, and **movrr-app**, using any real reward-partner business.

---

## Apps and roles

| Who | App | Role |
|-----|-----|------|
| You (ops) | **movrr-admin** (`admin.movrr.nl`) | Create partner, catalog reward, pools, enable Platform redeem |
| Rider (you or a test rider) | **movrr-mobile** | Earn points → redeem → see order detail / QR |
| Partner owner/staff | **movrr-app** (Business Workspace) | Validate token + confirm collection |

Neither mobile nor the partner app implements the fulfilment **engine**. Both are thin clients of Admin Platform APIs (`/api/v1/*`).

---

## 0) Prerequisites

Do these before any live redeem:

1. **Admin Platform APIs** are live on the environment mobile and movrr-app point at.
2. **Enable Platform redeem** for the rider build:
   - Dev/QA: `EXPO_PUBLIC_PLATFORM_REDEEM=true`, **or**
   - Remote: Admin rewards settings → `features.platformRedeemEnabled = true`
3. Rider has **enough points** (complete verified rides if needed).
4. Partner contact has a **MOVRR login** that you will attach as organisation staff.

Without the Platform redeem flag, mobile stays on legacy RPC (`redeem_reward_for_me`). Those orders often lack a `fulfilmentId`, so **My Orders will not open order detail**.

See also: `movrr-mobile/docs/PLATFORM_REDEEM_CUTOVER.md`.

---

## 1) Set up the partner in Admin (one-time)

Use the partner’s real business name.

1. Go to **Fulfilment → Partner Operations → Create Partner**.
2. Enter the organisation name; type is reward partner.
3. Open the partner drawer → **Edit** contact / website / logo if useful.
4. In **Staff**, invite the business owner as **owner** (or **staff** if they will only validate/confirm).
5. They sign into **movrr-app** → should land in **Partner Workspace** (`GET /api/v1/partners/me` succeeds).  
   If they only see a non-partner dashboard, membership is not attached yet.

Optional but useful for QR / voucher-pool rewards:

6. **Fulfilment → Resource Pools** — create/import a pool of voucher codes for the partner.
7. **Rewards → Catalog → Create** a live reward:
   - Partner = the linked partner / organisation
   - Points price (e.g. 400)
   - **Fulfilment type** = a supported redeem type (`instant_digital` or `qr_barcode`)
   - Link the resource pool when using QR / voucher pool
   - Status = **active**

---

## 2) Choose which lifecycle to test

| Path | Best for | Partner needed at counter? |
|------|----------|----------------------------|
| **A. Instant Digital** | Quick smoke; app shows code immediately | Usually **no** |
| **B. QR / collection** | Real counter / venue visit with staff | **Yes** — validate + confirm |

For a convincing in-person demo with partner staff, use **B**. Use **A** the same day as a quick smoke test.

---

## 3) Path A — Instant Digital (quick smoke)

1. Rider: Wallet → Rewards Shop → redeem the Instant Digital catalog item.
2. Mobile should navigate to **Order details** (`fulfilmentId` present).
3. When status is ready: code/QR shows from Platform (never invented on device).
4. **My Orders** row should show a chevron and open detail.
5. Partner app may stay quiet — Instant Digital often completes without collection.

**Pass if:** redeem → detail opens → code appears → order is trackable in My Orders.

---

## 4) Path B — Real venue visit (full lifecycle)

### Before you go

1. Confirm partner staff can open movrr-app → **Validate** + **Collections**.
2. Confirm rider can redeem the partner **QR/barcode** catalog item with Platform redeem enabled.
3. Agree the script: rider redeems *before* receiving the product / service / at the till.

### At the partner venue

| Step | Rider (mobile) | Partner staff (movrr-app) | You (admin, optional) |
|------|----------------|---------------------------|------------------------|
| 1 | Redeem QR reward | — | Watch Fulfilment Queue if useful |
| 2 | Opens **Order details** → preparing → ready / awaiting collection; token/QR when ready | — | Timeline events appear |
| 3 | Shows QR/code to staff | **Validate** → enter token from rider screen | Partner validation recorded |
| 4 | Status moves toward collected/completed | **Collections** → open pending item → **Confirm collection** | Fulfilment completes |
| 5 | Order detail shows **Completed**; My Orders still opens detail | Item leaves pending | Done |

**Pass if:** redeem → token only from API → validate succeeds → confirm succeeds → rider sees completed.

---

## 5) Suggested 30-minute script

1. **5 min** — Admin: confirm partner org + staff + active reward.
2. **5 min** — Partner owner logs into movrr-app on phone/laptop at the venue.
3. **5 min** — Rider redeems (Platform flag on) and waits until code/QR is ready.
4. **10 min** — Staff validate + confirm while rider watches status change.
5. **5 min** — Screenshot My Orders → Order details (chevron works) for evidence.

Tip: run Instant Digital first if QR validate fails — isolates “redeem works” vs “partner validate/confirm”.

---

## 6) Role / authz sanity checks

| Partner role | Should be able to | Should not |
|--------------|-------------------|------------|
| Viewer | Read dashboard / rewards / analytics | Validate, confirm, manage staff/resources |
| Staff | Validate + confirm | Manage staff |
| Owner | Staff + resources when granted | — |

---

## 7) Known gaps and gotchas

- **Legacy orders** (redeemed via old RPC, no `fulfilmentId`) do not open order detail. My Orders hides the chevron and shows “Tracking unavailable for this order”.
- If **Collections is empty** after a successful redeem, the pending read model may still be incomplete on Platform — use Admin queue/timeline and the Validate screen as backup, and note it.
- Partner **settings save** may error until Admin exposes `PATCH /api/v1/partners/settings`.
- Codes must come from Platform. If mobile shows “preparing”, wait/refresh — do not hardcode vouchers on device.
- Staff revoke/delete may not exist yet (invite + role change only).

---

## Happy-path checklist

- [ ] Partner org exists and owner can enter Partner Workspace
- [ ] Active catalog reward linked to partner + fulfilment type set
- [ ] Platform redeem enabled on rider build / remote flag
- [ ] Rider redeems → Order details opens
- [ ] QR path: Validate → Confirm → rider Completed
- [ ] Instant Digital: code visible without partner action
- [ ] My Orders row for that redeem shows chevron and opens detail
- [ ] Legacy rows without `fulfilmentId` do **not** look tappable

---

## Related docs

| Doc | Repo |
|-----|------|
| Platform redeem cutover | `movrr-mobile/docs/PLATFORM_REDEEM_CUTOVER.md` |
| Plan 3 mobile integration report | `movrr-mobile/.superpowers/sdd/.../plan-3-report.md` |
| Plan 4 partner workspace report | `movrr-app/.superpowers/sdd/.../plan-4-report.md` |
| Plan 4 verification notes | `movrr-app/.superpowers/sdd/.../plan-4-verification.md` |
