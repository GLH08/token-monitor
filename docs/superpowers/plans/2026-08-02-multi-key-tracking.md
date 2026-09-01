# 多密钥追踪与优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 为 token-monitor 添加多密钥渠道的单密钥级别追踪能力，并优化现有同步/告警/数据保留/实时统计等机制。

**Architecture:** new-api 已在 logs.other.admin_info.multi_key_index 和 channels.channel_info 中存储了多密钥数据。本计划在 token-monitor 后端解析这些字段，建立 key_stats 聚合表，提供 API 端点，并在前端展示密钥级统计。同时优化 syncer 字段裁剪、告警查询合并、数据保留可配置化、实时统计本地化、渠道快照增强、WS 推送密钥状态变更。

**Tech Stack:** Node.js/Express (CommonJS), SQLite (sqlite3), Prisma, Vite + React + TypeScript, Tailwind, ECharts, TanStack Query/Table

## Global Constraints

- 后端 CommonJS ("type": "commonjs")，测试用 
ode --test 内置运行器
- 前端 TypeScript，构建用 	sc -b && vite build，lint 用 slint .
- SQLite 迁移用 PRAGMA table_info + ALTER TABLE ADD COLUMN 模式
- QUOTA_PER_UNIT 默认 500000
- 新增环境变量需同步更新 server/.env.example 和根 .env.example
- 所有中文 UI 文案
- backfill 逻辑必须幂等且可恢复（参考现有 extended-metrics backfill 模式）

---

## Task 1: 后端 - tokenMetrics.js 解析 multi_key_index

**Files:**
- Modify: server/tokenMetrics.js
- Test: server/test/token-metrics.test.js

**Interfaces:**
- Produces: parseMultiKeyIndex(parsed) -> 
umber (0-based index, -1 if not multi-key)
- Produces: parseIsMultiKey(parsed) -> oolean
- Updates: metricsFromLog(log) 返回值新增 multiKeyIndex: number 和 isMultiKey: boolean

- [ ] Step 1: 编写失败测试 - parseMultiKeyIndex 和 parseIsMultiKey
- [ ] Step 2: 运行测试确认失败
- [ ] Step 3: 实现 parseMultiKeyIndex / parseIsMultiKey / 更新 metricsFromLog
- [ ] Step 4: 运行测试确认通过
- [ ] Step 5: Commit

---

## Task 2: 后端 - key_stats 表 + syncer 多密钥聚合

**Files:**
- Modify: server/db.js (新建 key_stats 表 + 清理逻辑)
- Modify: server/syncer.js (live 聚合 + backfill)
- Test: server/test/key-stats.test.js (新建)

**Interfaces:**
- Consumes: Task 1 的 metricsFromLog().multiKeyIndex 和 isMultiKey
- Produces: key_stats 表，主键 (channel_id, key_index, model_name, hour)
- Produces: syncer 导出 stepKeyStatsBackfill() 函数

- [ ] Step 1: 在 db.js 中创建 key_stats 表
- [ ] Step 2: 在 syncer.js updateAggregates 中添加 key_stats 写入
- [ ] Step 3: 添加 key_stats backfill 逻辑
- [ ] Step 4: 在 cleanOldData 中添加 key_stats 清理
- [ ] Step 5: 在 index.js 中注册 backfill 调度
- [ ] Step 6: 编写测试并运行
- [ ] Step 7: Commit

---

## Task 3: 后端 - 多密钥 API 端点

**Files:**
- Modify: server/routes/channels.js

**Interfaces:**
- Consumes: Prisma channel.channelInfo (JSON), key_stats 表
- Produces: GET /api/channels/:id/keys -> { keys: ChannelKeyDetail[], channelInfo: {...} }

- [ ] Step 1: 实现 GET /api/channels/:id/keys 端点
- [ ] Step 2: 解析 channelInfo JSON 获取多密钥配置
- [ ] Step 3: 聚合 key_stats 数据
- [ ] Step 4: 返回脱敏密钥标识 + 状态 + 用量统计
- [ ] Step 5: Commit

---

## Task 4: 前端 - 多密钥渠道详情展开视图

**Files:**
- Modify: web/src/api/types.ts (新增 ChannelKeyDetail 类型)
- Modify: web/src/api/client.ts (新增 fetchChannelKeys)
- Modify: web/src/pages/Channels.tsx (可展开行)

- [ ] Step 1: 添加 TypeScript 类型定义
- [ ] Step 2: 添加 API client 函数
- [ ] Step 3: 实现可展开行 UI
- [ ] Step 4: typecheck + build 验证
- [ ] Step 5: Commit

---

## Task 5: 后端+前端 - logs API 暴露 multi_key_index

**Files:**
- Modify: server/routes/logs.js (解析 other.admin_info.multi_key_index)
- Modify: web/src/api/types.ts (LogRow 新增字段)
- Modify: web/src/pages/Logs.tsx (详情展示)

- [ ] Step 1: 后端 - 在 logs 路由解析并返回 multi_key_index
- [ ] Step 2: 前端 - 类型更新
- [ ] Step 3: 前端 - Logs 详情展示密钥索引
- [ ] Step 4: typecheck + build 验证
- [ ] Step 5: Commit

---

## Task 6: 前端 - 密钥用量分布图表

**Files:**
- Modify: web/src/pages/Channels.tsx (ECharts 饼图/条形图)

- [ ] Step 1: 在渠道密钥详情中添加用量分布图表
- [ ] Step 2: typecheck + build 验证
- [ ] Step 3: Commit

---

## Task 7: 后端 - syncer 字段裁剪 + alerter 查询合并

**Files:**
- Modify: server/syncer.js (findMany 添加 select)
- Modify: server/alerter.js (合并 checkErrorRate 查询)

- [ ] Step 1: syncer findMany 添加 select 仅拉必要字段
- [ ] Step 2: alerter checkErrorRate 合并为单查询
- [ ] Step 3: 运行测试确认无回归
- [ ] Step 4: Commit

---

## Task 8: 后端 - 可配置数据保留策略

**Files:**
- Modify: server/syncer.js (cleanOldData 使用 DATA_RETENTION_DAYS)
- Modify: server/.env.example
- Modify: D:\Files\Code\token-monitor\.env.example

- [ ] Step 1: 添加 DATA_RETENTION_DAYS 环境变量
- [ ] Step 2: 更新 cleanOldData 使用可配置保留期
- [ ] Step 3: 更新 .env.example 文件
- [ ] Step 4: Commit

---

## Task 9: 后端 - 实时统计改用本地 SQLite

**Files:**
- Modify: server/index.js (updateRealtimeStats 改查 stats 表)

- [ ] Step 1: 将 updateRealtimeStats 改为查询本地 SQLite stats 表
- [ ] Step 2: 验证 WebSocket 推送正常
- [ ] Step 3: Commit

---

## Task 10: 后端 - 渠道快照增强

**Files:**
- Modify: server/db.js (channel_snapshots 添加 used_quota + key_status_json 列)
- Modify: server/syncer.js (syncChannelSnapshots 扩展)

- [ ] Step 1: 扩展 channel_snapshots 表结构
- [ ] Step 2: 扩展 syncChannelSnapshots 查询 usedQuota 和 channelInfo
- [ ] Step 3: Commit

---

## Task 11: 后端 - WebSocket 推送密钥状态变更

**Files:**
- Modify: server/syncer.js (对比 channel_info 变化)
- Modify: server/index.js (WS 广播 + alert_history 记录)

- [ ] Step 1: 在渠道快照中对比上次的多密钥状态
- [ ] Step 2: 变更时通过 WS 广播 + 记录告警历史
- [ ] Step 3: Commit
