# Token-First Monitor Design

**Status:** Approved for implementation

**Date:** 2026-08-07

## Goal

将 Token Monitor 从金额/Quota 视角调整为 Token 使用分析平台。Token 是首页、Usage、模型、渠道、多 Key 和告警的主要统计对象；金额和 Quota 保留为辅助估算信息。

## Scope

- 修改范围仅限 `token-monitor` 仓库。
- `D:/Files/Code/new-api` 与 `newapi-ref-pack` 只作为上游行为和真实数据库结构参考，不修改。
- 保留用户已有的未跟踪文件，不将其纳入本次提交。
- 每个可独立验收的任务单独提交本地 Git commit。
- 最终审查、验证全部通过后才推送 GitHub。

## Canonical Token Contract

所有后端聚合和 API 使用统一字段：

- `total_input_tokens`: 优先使用 `other.input_tokens_total`；缺失时按上游语义回退。
- `cache_read_tokens`: 缓存读取/命中 Token。
- `cache_creation_tokens`: 缓存创建 Token。
- `uncached_input_tokens`: `max(0, total_input_tokens - cache_read_tokens - cache_creation_tokens)`。
- `completion_tokens`: 日志的输出 Token。
- `throughput_tokens`: `total_input_tokens + completion_tokens`。
- `request_count`、`success_count`、`error_count`。
- `avg_latency_ms`、`avg_ttft_ms`、`tps`。

`prompt_tokens` 作为原始字段保留，但不直接等同于总输入 Token。`reasoning_requests` 不展示为 reasoning Token，因为上游当前没有可靠的 reasoning token 数量。

## Architecture

上游 new-api 日志是事实来源。Token Monitor 在同步阶段一次解析 `logs.other`，将标准化字段写入本地 SQLite 的小时级聚合表；API 从聚合表提供 Token 维度、模型维度、渠道维度和用户组维度分析。对长周期分析使用日级汇总或按小时聚合压缩，避免每次重新解析源日志。

数据库兼容修正包括实际参考 PostgreSQL DDL 中的 `open_ai_organization`、JSON 类型、nullable 字段和 bigint 字段。Docker 的 provider 切换行为保留，并增加 schema 生成和关键字段验证。

## Product Behavior

- Overview 默认展示总 Token、输入/输出 Token、缓存 Token、请求数、成功率和 Token 速率。
- Usage 默认以 Token 为指标，支持 Token、模型、渠道、用户组和用户维度。
- Token 页面展示周期 Token 趋势、输入输出、缓存命中率、常用模型和渠道。
- Models 页面展示 Token 效率、输入输出比例、缓存命中率和吞吐率。
- Channels 页面展示渠道 Token 分布、多 Key Token 均衡度、Key 成功率和延迟。
- Performance 增加 P50/P95/P99 延迟及首 Token 延迟。
- Alerts 增加 Token 突增、骤降、大请求、缓存命中率下降和多 Key 不均衡告警。
- 金额/Quota 仅作为估算辅助字段，不参与默认排名。

## Error Handling

- 无法解析的 `other` 使用零值和显式的解析状态，不吞掉同步错误。
- 空模型表不影响以日志 `model_name` 为来源的分析。
- 空 `channel_info`、未知多 Key 状态和缺失 Token 关联使用稳定的 Unknown 标签。
- 聚合更新保持水位线和幂等性；指标口径发生变化时通过现有回填/重建流程重算。

## Testing

- 后端使用 Node test，先写失败测试再实现。
- 覆盖缓存、Claude 语义、图片/音频、工具调用、多 Key、异常 JSON、空模型表和 bigint/JSON schema 兼容。
- 前端执行 typecheck、lint、build，并进行受影响页面的浏览器冒烟验证。
- 最终执行后端全量测试、前端 typecheck/lint/build、Git diff 审查和敏感文件检查。

## Success Criteria

1. Token 相关 API 与页面不依赖金额字段才能得到正确结果。
2. 输入、输出、缓存读取、缓存创建和吞吐 Token 口径可解释、可测试。
3. 参考 PostgreSQL 数据结构可以正常读取，且不破坏现有 MySQL provider 生成流程。
4. 多 Key、空模型表、异常 `other` 不会破坏同步和统计。
5. 每项修改有独立 commit，最终审查完成后才推送 GitHub。
