# `logs.other` JSON samples (new-api rc.20)

> Reconstructed from `D:\Files\Code\new-api\service\log_info_generate.go` and
> `service\text_quota.go`. These are the shapes the syncer's `metricsFromLog`
> must tolerate. Keys are written **top-level** in `other` (a JSON object stored
> as text in `logs.other`). Some legacy/nested `usage.*` variants are also
> tolerated by the existing `parseCacheHitTokens`; new extractors mirror that.

## Field provenance (per Go source)

### Common text path — `GenerateTextOtherInfo` (`log_info_generate.go:71-118`)

Every text/audio/wss/claude consume log starts from this base map:

| key | type | source line | meaning |
|-----|------|-------------|---------|
| `model_ratio` | float64 | `:74` | model price ratio |
| `group_ratio` | float64 | `:75` | user-group ratio |
| `completion_ratio` | float64 | `:76` | completion vs prompt ratio |
| `cache_tokens` | int | `:77` | **cache-read** (hit) tokens |
| `cache_ratio` | float64 | `:78` | cache ratio |
| `model_price` | float64 | `:79` | per-call price (when not ratio-billed) |
| `user_group_ratio` | float64 | `:80` | special group ratio (if any) |
| `frt` | float64 | `:81` | **first-response time in ms** = `FirstResponseTime.UnixMilli() - StartTime.UnixMilli()` (this is TTFT) |
| `reasoning_effort` | string | `:83` | only when `relayInfo.ReasoningEffort != ""` (`low`/`medium`/`high`) |
| `is_model_mapped`, `upstream_model_name` | bool/string | `:86-88` | model mapping |
| `admin_info` | object | `:95-110` | admin-only (use_channel, multi-key, ...). Stripped for non-admins by `formatUserLogs`. |
| `billing_source` | string | `appendBillingInfo:159` | `"wallet"` \| `"subscription"` (only when `relayInfo.BillingSource != ""`) |
| `request_path` | string | `:52-68` | request URL path |

### Claude cache path — `GenerateClaudeOtherInfo` (`log_info_generate.go:271-290`) + `text_quota.go:446-464`

Adds on top of the base map:

| key | type | source | meaning |
|-----|------|--------|---------|
| `claude` | bool | `:278` | marks Claude Messages format |
| `cache_creation_tokens` | int | `:279`, `text_quota.go:447` | base cache-write total |
| `cache_creation_ratio` | float64 | `:280` | |
| `cache_creation_tokens_5m` | int | `:282` (only `!= 0`) | 5-minute ephemeral cache-write **split** |
| `cache_creation_ratio_5m` | float64 | `:283` | |
| `cache_creation_tokens_1h` | int | `:286` (only `!= 0`) | 1-hour ephemeral cache-write **split** |
| `cache_creation_ratio_1h` | float64 | `:287` | |
| `cache_write_tokens` | int | `text_quota.go:458-464` | **normalized total** = `cacheWriteTokensTotal(summary)` |

**`cacheWriteTokensTotal`** (`text_quota.go:60-69`):
- if `_5m > 0 || _1h > 0` → `max(cache_creation_tokens, _5m + _1h)`
- else → `cache_creation_tokens`

So `_5m`/`_1h` are a **split** of the cache-write total, not additional. Summing
`cache_creation_tokens + _5m + _1h` would double-count. Our extractor prefers the
normalized `cache_write_tokens` field, else applies the `max(base, 5m+1h)` rule.

### Audio path — `GenerateAudioOtherInfo` (`log_info_generate.go:259-269`)

Adds `audio: true` plus:

| key | type | meaning |
|-----|------|---------|
| `audio_input` | int | `usage.PromptTokensDetails.AudioTokens` |
| `audio_output` | int | `usage.CompletionTokenDetails.AudioTokens` |
| `text_input` | int | `usage.PromptTokensDetails.TextTokens` |
| `text_output` | int | `usage.CompletionTokenDetails.TextTokens` |
| `audio_ratio` | float64 | |
| `audio_completion_ratio` | float64 | |

### WebSocket realtime path — `GenerateWssOtherInfo` (`log_info_generate.go:247-257`)

Same as audio but with `ws: true` instead of `audio: true`; same `audio_input`/
`audio_output`/`text_*`/`audio_*_ratio` keys.

### Image output path — `text_quota.go:418-422`

Only written when `summary.ImageTokens != 0`:

| key | type | meaning |
|-----|------|---------|
| `image` | bool | marks an image request |
| `image_ratio` | float64 | |
| `image_output` | int | `summary.ImageTokens` = `usage.PromptTokensDetails.ImageTokens` |

(There is no `image_input`; `image_output` is the single image token count.)

### Tool-call surcharge path — `text_quota.go:423-445`

Each block only written when its count/price > 0:

| key | type | source | meaning |
|-----|------|--------|---------|
| `web_search` | bool | `:424`/`:428` | marks a web-search request |
| `web_search_call_count` | int | `:425`/`:429` | number of web-search calls |
| `web_search_price` | float64 | `:426`/`:430` | **price per 1000 calls** (USD) |
| `file_search` | bool | `:433` | |
| `file_search_call_count` | int | `:434` | |
| `file_search_price` | float64 | `:435` | price per 1000 calls |
| `image_generation_call` | bool | `:443` | gpt-image-1 once-call |
| `image_generation_call_price` | float64 | `:444` | **price per call** (not per 1k) |
| `audio_input_seperate_price` | bool | `:438` | text path with separate audio pricing |
| `audio_input_token_count` | int | `:439` | audio tokens (text path variant) |
| `audio_input_price` | float64 | `:440` | |

**Surcharge quota formula** (mirrors `calculateTextToolCallSurcharge` /
`tool_billing.go ComputeToolCallQuota`):
- web/file search: `price_per_1k * count / 1000 * group_ratio * QUOTA_PER_UNIT`
- image generation (count=1): `price_per_call * group_ratio * QUOTA_PER_UNIT`
- rounded (`common.QuotaRound` = `math.Round`, half-away-from-zero; JS `Math.round`
  matches for non-negative values).

The surcharge is already included in `logs.quota`; we re-derive it into
`tool_quota` only as a breakdown metric.

## Representative samples

### S1 — OpenAI text (basic, streaming, wallet)
```json
{
  "model_ratio": 2.5,
  "group_ratio": 1.0,
  "completion_ratio": 4.0,
  "cache_tokens": 120,
  "cache_ratio": 0.5,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 845.0,
  "billing_source": "wallet",
  "request_path": "/v1/chat/completions"
}
```

### S2 — Anthropic Claude (cache read + write 5m/1h)
```json
{
  "claude": true,
  "model_ratio": 3.0,
  "group_ratio": 1.0,
  "completion_ratio": 5.0,
  "cache_tokens": 500,
  "cache_ratio": 0.1,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 1230.0,
  "cache_creation_tokens": 800,
  "cache_creation_ratio": 1.25,
  "cache_creation_tokens_5m": 300,
  "cache_creation_ratio_5m": 1.1,
  "cache_creation_tokens_1h": 500,
  "cache_creation_ratio_1h": 1.2,
  "cache_write_tokens": 800,
  "usage_semantic": "anthropic",
  "billing_source": "wallet"
}
```
`cacheCreationTokens` → 800 (prefers `cache_write_tokens`). If `cache_write_tokens`
were absent: `max(800, 300+500)=800`.

### S3 — Audio (speech-to-text / TTS)
```json
{
  "audio": true,
  "model_ratio": 1.0,
  "group_ratio": 1.0,
  "completion_ratio": 1.0,
  "cache_tokens": 0,
  "cache_ratio": 0.0,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 0.0,
  "audio_input": 1500,
  "audio_output": 320,
  "text_input": 80,
  "text_output": 120,
  "audio_ratio": 2.0,
  "audio_completion_ratio": 3.0
}
```

### S4 — WebSocket realtime
```json
{
  "ws": true,
  "model_ratio": 1.5,
  "group_ratio": 1.0,
  "completion_ratio": 1.5,
  "cache_tokens": 0,
  "cache_ratio": 0.0,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 210.0,
  "audio_input": 900,
  "audio_output": 480,
  "text_input": 40,
  "text_output": 60,
  "audio_ratio": 2.0,
  "audio_completion_ratio": 3.0
}
```

### S5 — Image output (gpt-image-1 style)
```json
{
  "image": true,
  "model_ratio": 0.0,
  "group_ratio": 1.0,
  "completion_ratio": 1.0,
  "cache_tokens": 0,
  "cache_ratio": 0.0,
  "model_price": 0.04,
  "user_group_ratio": 1.0,
  "frt": 3200.0,
  "image_ratio": 2.0,
  "image_output": 4096,
  "billing_source": "wallet"
}
```

### S6 — Tool calls (web_search + file_search + image_generation)
```json
{
  "model_ratio": 2.0,
  "group_ratio": 1.0,
  "completion_ratio": 3.0,
  "cache_tokens": 0,
  "cache_ratio": 0.0,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 1800.0,
  "reasoning_effort": "medium",
  "web_search": true,
  "web_search_call_count": 3,
  "web_search_price": 10.0,
  "file_search": true,
  "file_search_call_count": 2,
  "file_search_price": 2.5,
  "image_generation_call": true,
  "image_generation_call_price": 0.04,
  "billing_source": "subscription"
}
```
`toolCalls` = 3 + 2 + 1 = 6. With `QUOTA_PER_UNIT=500000`, `group_ratio=1.0`:
- web: `round(10.0 * 3 / 1000 * 1.0 * 500000)` = 15000
- file: `round(2.5 * 2 / 1000 * 1.0 * 500000)` = 2500
- img-gen: `round(0.04 * 1.0 * 500000)` = 20000
- `toolQuota` = 37500.

### S7 — Text path with separate audio input pricing (no `audio_input` key)
```json
{
  "model_ratio": 1.0,
  "group_ratio": 1.0,
  "completion_ratio": 1.0,
  "cache_tokens": 0,
  "cache_ratio": 0.0,
  "model_price": 0.0,
  "user_group_ratio": 1.0,
  "frt": 540.0,
  "audio_input_seperate_price": true,
  "audio_input_token_count": 750,
  "audio_input_price": 0.003
}
```
`audioInputTokens` = 750 (from `audio_input_token_count` fallback), `audioOutputTokens` = 0.

## Coverage map (each extractor field ← ≥1 sample)

| field | samples |
|-------|---------|
| `cacheHitTokens` | S1, S2 |
| `cacheCreationTokens` | S2 (normalized), +5m/1h rule |
| `imageTokens` | S5 |
| `audioInputTokens` | S3, S4, S7 |
| `audioOutputTokens` | S3, S4 |
| `toolCalls` / `toolQuota` | S6 |
| `reasoning` | S6 |
| `frtMs` | S1, S2, S4, S5, S6, S7 |
| `useTimeSec` | from `log.useTime` (seconds), not `other` |
| `billingSource` | S1, S2, S5, S6 (wallet/subscription) |
| `ratios.*` | S1, S2, S3, S5, S6 |
