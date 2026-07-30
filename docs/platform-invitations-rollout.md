# Platform Invitations — Production Rollout

## Scope

Workboard invitations via reusable `platform_invitations` (Migration **050**).

**Breaking:** Legacy `workboard_invites` is dropped. There is no dual-write or
plaintext-token compatibility path.

Identity contract remains **Option A**: existing eligible platform admins only
(`admin` | `super_admin` | `moderator`).

---

## Deployment order

1. Deploy application build that includes invitation readiness guards
   (`assertPlatformInvitationsReady`) — **or** deploy app and migration in the
   same change window. App fails closed if 050 is missing.
2. Apply SQL: `scripts/050_platform_invitations.sql` in Supabase (staging first).
3. Confirm probe:
   ```sql
   SELECT * FROM public.platform_invitations_ready();
   ```
   Expect `ready = true`, `legacy_table_absent = true`.
4. Verify env: `APP_URL` (admin host), `RESEND_API_KEY`, `FROM_EMAIL`.
5. Smoke staging (matrix below).
6. Apply 050 to production, then promote app (or same window).
7. Post-deploy validation (matrix below).

---

## Migration order

| Step | Action |
|------|--------|
| 1 | Ensure `workboard.sql` base tables exist (`workboard_teams`, members, boards, cards) |
| 2 | Run `scripts/050_platform_invitations.sql` |
| 3 | Confirm `workboard_invites` table is **absent** |
| 4 | Confirm RPCs: accept, expire, prepare_resend, commit_resend, abort_resend, ready |

Do **not** recreate `workboard_invites`.

---

## Rollback

| Scenario | Action |
|----------|--------|
| App bug only | Roll back app deploy; leave 050 in place (schema is forward-compatible) |
| Need to disable invites | Feature freeze: stop issuing; revoke pending via Team UI |
| Full schema rollback | **Not recommended.** 050 drops `workboard_invites`. Restore from DB backup taken before 050 if absolute rollback required |

There is no supported rollback to plaintext `workboard_invites`.

---

## Verification matrix (staging + post-prod)

| Scenario | Expected |
|----------|----------|
| `platform_invitations_ready()` | `ready=true` |
| Issue invite (eligible admin) | Invitation emailed; pending row; hashed token only |
| Issue invite (unknown email) | Fail: not provisioned |
| Issue duplicate pending | Fail: use Resend |
| Resend success | Email sent; new token active after commit |
| Resend email failure | Previous invite remains valid |
| Revoke | Status revoked; accept fails |
| Expire | Pending past `expires_at` becomes expired |
| Login required | `redirectTo` keeps `?token=` |
| MFA | Token preserved via `x-url` / AuthWrapper |
| Wrong account → Switch account | Sign-in with `redirectTo=/workboard/invite?token=…` then accept |
| Refresh / multi-tab | Deterministic accept / already_accepted |
| Accept | Membership active; invite accepted |
| Already accepted | Success only if membership active |
| Deleted team | `board_deleted` |
| Open Workboard | Bootstrap succeeds for new member |
| List invites as viewer | Denied (owner/admin only) |

---

## Monitoring

- `platform_audit_record` capabilities: `invitation.created`, `invitation.resent`,
  `invitation.resend_failed`, `invitation.revoked`, `invitation.accepted`,
  `invitation.accept_failed`, `invitation.auth_mismatch`, `membership.activated`
- `user_activity` rows with `related_entity_type = platform_invitation`
- Resend failure rate (email_failed / resend_failed)
- Accept failure by `error_code`

---

## Known risks

- Email provider outage: issue/resend fail closed; prior invite preserved on resend abort.
- Admin email must match `admin_users.email` **exactly** (lowercased).
- `RESEND_API_KEY` required — invites will not claim success without delivery.

---

## Post-deployment checklist

- [ ] `SELECT * FROM platform_invitations_ready();` → ready
- [ ] `workboard_invites` does not exist
- [ ] Issue + accept happy path
- [ ] Wrong-account switch-account path
- [ ] Resend + revoke
- [ ] Audit rows present for create/accept
