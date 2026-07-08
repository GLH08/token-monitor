# Schema Diff — token-monitor Prisma vs new-api v1.0.0-rc.20

> C1 deliverable (prd R1 acceptance). Compares `server/prisma/schema.prisma`
> against the new-api Go/GORM models at `D:\Files\Code\new-api\model\*.go`.
> Scope = the six tables token-monitor **reads**: `logs`, `channels`, `tokens`,
> `models`, `vendors`, `users`. token-monitor treats new-api as **read-only**, so
> only the columns it actually selects need to be correct; unmapped GORM columns
> are listed as "present in rc.20, not mapped (out of scope)" for completeness.

Column names below are the **DB (snake_case)** names. GORM derives the column from
the struct field name unless a `gorm:"column:..."` tag overrides it; JSON tags do
**not** affect the DB column.

---

## logs (`model/log.go`)

Go struct `Log` at `log.go:59-81`; log-type constants at `log.go:84-93`.

| DB column | rc.20 (Go) | Prisma (before) | Action |
|-----------|-----------|-----------------|--------|
| `id` | `Id int` (`log.go:60`) | `id Int @id` | match |
| `user_id` | `UserId int` (`log.go:61`) | `userId @map("user_id")` | match |
| `created_at` | `CreatedAt int64 bigint` (`log.go:62`) | `createdAt BigInt @map("created_at")` | match |
| `type` | `Type int` (`log.go:63`) | `type Int` | **doc**: comment missing `0=unknown`,`7=login` |
| `content` | `Content string` (`log.go:64`) | `content String @db.Text` | match |
| `username` | `Username string default:''` (`log.go:65`) | `username String? @default("")` | match |
| `token_name` | `TokenName string default:''` (`log.go:66`) | `tokenName @map("token_name")` | match |
| `model_name` | `ModelName string default:''` (`log.go:67`) | `modelName @map("model_name")` | match |
| `quota` | `Quota int default:0` (`log.go:68`) | `quota Int` | match |
| `prompt_tokens` | `PromptTokens int default:0` (`log.go:69`) | `promptTokens @map("prompt_tokens")` | match |
| `completion_tokens` | `CompletionTokens int default:0` (`log.go:70`) | `completionTokens @map("completion_tokens")` | match |
| `use_time` | `UseTime int default:0` (`log.go:71`) — **SECONDS** | `useTime // 响应时间(ms)` | **doc fix**: unit is seconds, not ms |
| `is_stream` | `IsStream bool` (`log.go:72`) | `isStream @map("is_stream")` | match |
| `channel_id` | `ChannelId int gorm:"index"` (`log.go:73`, JSON `channel`, DB col `channel_id`) | `channelId @map("channel_id")` | match |
| `token_id` | `TokenId int default:0` (`log.go:75`) | `tokenId @map("token_id")` | match |
| `group` | `Group string` (`log.go:76`) | `group String?` | match |
| `ip` | `Ip string default:''` (`log.go:77`) | `ip String? @default("")` | match |
| `request_id` | `RequestId string varchar(64) default:''` (`log.go:78`) | `requestId @map("request_id") @default("")` | match |
| **`upstream_request_id`** | `UpstreamRequestId string varchar(128) index default:''` (`log.go:79`) | *missing* | **ADD** `upstreamRequestId String? @map("upstream_request_id")` |
| `other` | `Other string` (`log.go:80`) | `other String? @db.Text` | match |
| `channel_name` | `ChannelName string gorm:"->"` (`log.go:74`) | — | not a DB column (read-only join alias); out of scope |

**use_time = seconds (proof)**: `RecordConsumeLogParams.UseTimeSeconds int json:"use_time_seconds"`
(`log.go:337`) is stored into `UseTime` (`log.go:373`); `RecordErrorLog(..., useTimeSeconds int, ...)`
→ `UseTime: useTimeSeconds` (`log.go:282,309`). So the column holds whole seconds.
(Latency-metric rework that consumes this is **C2**, not C1.)

**type values (proof)**: `LogTypeUnknown=0, Topup=1, Consume=2, Manage=3, System=4,
Error=5, Refund=6, Login=7` (`log.go:84-93`). token-monitor only ever ingests/filters
`2` (consume) and `5` (error) — see "Log-type handling" below — so `0/7` cannot be
miscounted.

---

## channels (`model/channel.go`)

Go struct `Channel` at `channel.go:23-60`. **No `gorm.DeletedAt`** → channels are
hard-deleted (`channel.Delete()` = `DB.Delete`, `channel.go:595-603`); **no
soft-delete filter applies**. All columns token-monitor selects (`id`, `name`,
`type`, `status`, `response_time`, `balance`, `models`, `used_quota`, `auto_ban`)
match. No schema change required.

- `response_time` = `ResponseTime int // in milliseconds` (`channel.go:34`) — ms
  (channel health, distinct from `logs.use_time`).
- rc.20 has `channel_info` as `gorm:"type:json"` (`channel.go:54`); token-monitor maps
  it as `String? @db.Text` (`schema.prisma:71`) and does not read it — acceptable for a
  read-only text projection under both MySQL and PostgreSQL.

---

## tokens (`model/token.go`)

Go struct `Token` at `token.go:14-32`.

| DB column | rc.20 (Go) | Prisma | Action |
|-----------|-----------|--------|--------|
| `deleted_at` | `DeletedAt gorm.DeletedAt gorm:"index"` (`token.go:31`) | `deletedAt DateTime? @map("deleted_at")` (`schema.prisma:97`) | already present |

All read columns (`id`, `name`, `status`, `remain_quota`, `used_quota`,
`unlimited_quota`, `expired_time`, `accessed_time`, `group`) match. No schema change
required. **Soft-delete filtering** on token reads is addressed in code (below).

---

## models (`model/model_meta.go`)

Go struct `Model` at `model_meta.go:24-45`.

| DB column | rc.20 (Go) | Prisma | Action |
|-----------|-----------|--------|--------|
| `deleted_at` | `DeletedAt gorm.DeletedAt` (`model_meta.go:36`) | `deletedAt DateTime? @map("deleted_at")` (`schema.prisma:117`) | already present |

All mapped columns match (`model_name`, `vendor_id`, `status`, `created_time`,
`updated_time`, `name_rule`, …). No schema change required. **Soft-delete filtering**
on model reads is addressed in code (below).

> Note: `stats.js` references `modelRatio`/`completionRatio` on the model lookup, but
> rc.20's `models` table has **no such columns** (ratios live in operation settings /
> `logs.other`). This is a pre-existing no-op (`undefined`) and belongs to the **C2**
> metric rework — **not changed here**.

---

## vendors (`model/vendor_meta.go`)  ← drifted

Go struct `Vendor` at `vendor_meta.go:15-24`.

| DB column | rc.20 (Go) | Prisma (before) | Action |
|-----------|-----------|-----------------|--------|
| `id` | `Id int` (`vendor_meta.go:16`) | `id Int @id` | match |
| `name` | `Name string size:128` (`vendor_meta.go:17`) | `name String` | match |
| `description` | `Description string type:text` (`vendor_meta.go:18`) | `description String? @db.Text` | match |
| `icon` | `Icon string type:varchar(128)` (`vendor_meta.go:19`) | `icon String? @db.VarChar(128)` | match |
| **`status`** | `Status int default:1` (`vendor_meta.go:20`) | *missing* | **ADD** `status Int @default(1)` |
| **`created_time`** | `CreatedTime int64 bigint` (`vendor_meta.go:21`) | *missing* | **ADD** `createdTime BigInt? @map("created_time")` |
| **`updated_time`** | `UpdatedTime int64 bigint` (`vendor_meta.go:22`) | *missing* | **ADD** `updatedTime BigInt? @map("updated_time")` |
| **`deleted_at`** | `DeletedAt gorm.DeletedAt gorm:"index"` (`vendor_meta.go:23`) | *missing* | **ADD** `deletedAt DateTime? @map("deleted_at")` |

> No token-monitor query currently reads `vendors` (no `prisma.vendor.*` call). These
> adds realign the schema to rc.20 so future vendor enrichment reads correct fields and
> can filter `deleted_at IS NULL`.

---

## users (`model/user.go`)  ← drifted

Go struct `User` at `user.go:23-56`. token-monitor maps only the subset it needs
(`id`, `username`, `display_name`, `role`, `status`, `quota`, `used_quota`, `group`).

| DB column | rc.20 (Go) | Prisma (before) | Action |
|-----------|-----------|-----------------|--------|
| **`deleted_at`** | `DeletedAt gorm.DeletedAt gorm:"index"` (`user.go:48`) | *missing* | **ADD** `deletedAt DateTime? @map("deleted_at")` |

Other rc.20 `users` columns (`email`, `github_id`, `group`, `aff_*`, `access_token`,
`created_at`, `last_login_at`, …) are intentionally **not mapped** — token-monitor
doesn't read them; out of scope for C1. No `prisma.user.*` read exists today, so the
add is schema-alignment for future per-user enrichment (C2/C3).

---

## Summary of schema edits (all additive)

1. `Log`: **add** `upstreamRequestId String? @map("upstream_request_id")` (`log.go:79`);
   **doc-fix** `use_time` comment ms→seconds (`log.go:71,337`); complete the `type`
   comment with `0=unknown`,`7=login` (`log.go:84-93`).
2. `Vendor`: **add** `status`(`vendor_meta.go:20`), `created_time`(`:21`),
   `updated_time`(`:22`), `deleted_at`(`:23`).
3. `User`: **add** `deleted_at` (`user.go:48`).

Provider stays `mysql` in the committed file; `docker-entrypoint.sh:7-15` swaps it to
`postgresql` at container start based on `DATABASE_URL`. No MySQL-only native types are
present (`@db.Text`/`@db.VarChar`/`@db.Char` only), so the schema is PostgreSQL-valid.

## Soft-delete filtering (code, not schema)

Prisma has **no** automatic soft-delete scoping (unlike GORM's `gorm.DeletedAt`), so
each read of a soft-deletable table must decide explicitly whether to add `deletedAt: null`.
The rule is **current-vs-historical**:

- **Current-state views** (entity lists, status/overview, quota alerts) → filter
  `deletedAt: null` so deleted entities don't leak into live names/status/counts.
- **Historical enrichment** (usage breakdown, per-model/token analysis, log rows) →
  **retain names** (no filter) so past spend keeps a human-readable label. Filtering
  here is a regression: a deleted-but-historically-active token/model would blank out
  to `Token <id>` / undefined ratios.

| Location | Table | Kind | Filter |
|----------|-------|------|--------|
| `routes/tokens.js:18` (`/overview`) | token | current-state list | `deletedAt: null` ✓ (pre-existing) |
| `alerter.js:163` (`checkQuotaLow`) | token | current-state alert | `deletedAt: null` ✓ (added by C1) |
| `routes/usage.js:106` (breakdown) | token | historical enrichment | **no filter** (retain name) |
| `routes/usage.js:199` (filter-options) | token | historical labeling | **no filter** (retain name) |
| `routes/stats.js:197` (`/models/analysis`) | model | historical enrichment | **no filter** (retain name) |

> C1 first added the filter to all four reads; the check gate removed it from the three
> historical-enrichment reads and kept only the two current-state reads, per the rule above.

Channel reads (`usage.js`, `stats.js`, `channels.js`, `modelStatus.js`, `alerter.js`,
`syncer.js`) need **no** filter — channels have no soft-delete in rc.20.

## Log-type handling (`0`/`7`) — verified, no change needed

Every production read filters type explicitly to consume/error, so new `0/7` rows are
never fetched or miscounted:

- `syncer.js:251,277,403,449` — `type: { in: [2,5] }`; `errorCount = type===5?1:0`
  (`syncer.js:133`).
- `modelStatus.js:108,159` — `type: { in: [2,5] }`.
- `index.js:42` (realtime) — `type: { in: [2,5] }`.
- `routes/logs.js:73,142` — `type: 2` / `type: 5`.
- `routes/tokens.js:89`, `routes/stats.js:288` — `type: 2`.

SQLite `stats`/`usage_stats` are populated only from those type-2/5 logs, so `error_count`
and request counts are unaffected by `0/7`.
