# Token 指标说明

Token Monitor 的主要统计对象是 Token，金额和 Quota 只用于辅助估算。

## 标准字段

| 字段 | 计算方式 | 说明 |
| --- | --- | --- |
| `prompt_tokens` | new-api 原始字段 | 不能直接视为总输入 Token |
| `total_input_tokens` | 优先 `other.input_tokens_total` | 包含缓存读取和缓存创建 |
| `cache_read_tokens` | `cache_tokens` 等字段归一化 | 已命中/读取的缓存 Token |
| `cache_creation_tokens` | `cache_write_tokens` 等字段归一化 | 创建缓存的 Token |
| `net_input_tokens` | `max(0, total_input - cache_read - cache_creation)` | 未缓存输入 Token |
| `completion_tokens` | new-api 原始字段 | 输出 Token |
| `throughput_total` | `total_input_tokens + completion_tokens` | 输入加输出的吞吐 Token |
| `throughput_tokens` | `throughput_total` 的兼容别名 | API/UI 统一使用的吞吐 Token |

`metricsFromLog()` 会保留旧字段 `cacheHitTokens`、`throughputTotal`，同时提供 `cacheReadTokens`、`uncachedInputTokens`、`outputTokens` 和 `throughputTokens` 标准别名，保证已有调用方兼容。

## 模型语义回退

- 当日志包含 `other.input_tokens_total` 时，直接使用该值。
- Claude/Anthropic 语义下，`prompt_tokens` 通常不含缓存，因此回退为 `prompt_tokens + cache_read_tokens + cache_creation_tokens`。
- 其他语义下，回退为 `prompt_tokens`。
- 缺失或非法 `other` 不阻断同步，扩展字段使用零值。

## 维度与存储

本地 SQLite 的 `usage_stats` 按小时保存：

```text
hour + user_group + channel_id + model_name + token_id
```

用户维度通过 Token 到 new-api 用户的关联在查询时重新分组。多 Key 日志额外写入 `key_stats`，以支持单 Key Token 分布和负载分析。

## 性能指标

- `avg_latency_ms`：`use_time` 秒转换为毫秒后的平均请求耗时。
- `avg_ttft_ms`：`other.frt` 的平均首 Token 延迟。
- `tps`：吞吐 Token 除以总耗时秒数。
- `/api/analysis/latency` 额外返回窗口级 P50/P95/P99 延迟和 TTFT；同时返回样本数量、是否达到样本上限以及 `sample_scope`。达到 10,000 条上限时，百分位代表窗口内最近样本，而不是完整窗口。

告警的 `today`/`daily` 周期按服务器本地自然日计算；Token 趋势、缓存命中率和多 Key 失衡均以吞吐 Token作为主口径。当前窗口无输入时不触发缓存命中率下降告警。

## 金额限制

金额由 `quota / QUOTA_PER_UNIT` 估算。由于模型倍率、分组倍率、缓存价格和部署配置可能变化，金额不作为 Token 排名或主要告警依据。需要精确计费时，应使用带版本的模型价格配置重新计算。

## 回填与重建

当 Token 口径发生变化时，应通过后端已有的历史回填或 `/api/admin/rebuild-stats` 重建小时聚合，不应只修改前端展示逻辑。
