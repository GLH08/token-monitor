# C1 — Implement plan

> Execution checklist for the data-layer realignment. Design is inherited from the
> parent `design.md` (§6 Compatibility/migration, §7 C1 contract).

## Ordered checklist

1. **Diff schema vs rc.20** → write `research/schema-diff-rc20.md`.
   - Compare `server/prisma/schema.prisma` against `D:\Files\Code\new-api\model\{log,channel,token,model_meta,vendor_meta,user}.go`.
   - Record every add/rename/remove + the `use_time`=seconds and `type 0/7` facts (anchors from parent F1).
   → verify: diff doc lists each of the F1 items with a `model/*.go:line` anchor.

2. **Edit `schema.prisma`** (additive):
   - `Log`: add `upstreamRequestId String? @map("upstream_request_id")`; fix `use_time` comment to "seconds".
   - `Vendor`: add `status Int @default(1)`, `createdTime BigInt? @map("created_time")`,
     `updatedTime BigInt? @map("updated_time")`, `deletedAt DateTime? @map("deleted_at")`.
   - `User`: add `deletedAt DateTime? @map("deleted_at")`.
   → verify: fields present; `@map` names match snake_case columns.

3. **PostgreSQL validation**:
   - Run `npx prisma validate`; then `npx prisma generate` with `provider=postgresql`
     (temporarily point `DATABASE_URL` at a PG URL or use the entrypoint switch).
   - Confirm no MySQL-only native type remains; `channels.other`/`logs.other` read as text.
   → verify: both commands exit 0.

4. **Soft-delete filtering**: grep enrichment/lookup queries in `server/routes/*` and
   `server/syncer.js` that read `vendors/models/tokens/users`; add `WHERE deleted_at IS NULL`
   (Prisma: `where: { deletedAt: null }`).
   → verify: each changed query excludes soft-deleted rows; names/status no longer include deleted entities.

5. **Log-type handling**: grep for `type` filters/switches; ensure `0/7` don't get
   miscounted as consume/error. (Consume=2, Error=5 remain the stat drivers.)
   → verify: reading the changed code, `type` handling is explicit about 0/7.

6. **Regression**: `npx prisma generate` then `node --test`.
   → verify: existing `server/test/*.test.js` pass.

## Validation commands

```sh
cd server
npx prisma validate
DATABASE_URL="postgresql://.../new-api" npx prisma generate   # PG check (use a scratch/redacted URL)
node --test
```

## Risky files / rollback points

- `server/prisma/schema.prisma` — additive only; `git revert` is clean.
- Enrichment queries in `server/routes/{channels,tokens,modelStatus,usage,stats}.js`,
  `server/syncer.js` — soft-delete filter only; behavior-preserving otherwise.
- Rollback: revert the C1 commit; additive schema fields don't break the old backend.

## Follow-up before `task.py start`

- Curate `implement.jsonl` (backend spec entries) and `check.jsonl` before starting (parent will do this at the review gate).
