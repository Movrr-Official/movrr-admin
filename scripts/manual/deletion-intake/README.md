# Controlled intake/execution separation

See [the rollout and approval record](../../../docs/operations/deletion-intake-separation.md) and [pinned migration manifest](manifest.json).

The controller defaults to read-only. Do not run `--apply` until the owner explicitly approves the exact new production migrations. Both files and journal entries apply in one transaction, preserving immutable v1 and protected business/request data. Neither file enables intake or irreversible execution.

```text
node scripts/manual/deletion-intake/apply-and-verify.cjs
node scripts/manual/deletion-intake/apply-and-verify.cjs --apply
node scripts/manual/deletion-intake/apply-and-verify.cjs --verify
```

Activation afterwards uses the existing genuine MFA Admin operating control. No SQL/JWT operator impersonation is provided. Use Hold/Disable through that control for containment and preserve existing requests/receipts and the migration journal.
