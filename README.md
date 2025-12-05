# Token Monitor System (Token 监控系统)

Token Monitor 是一个专为 `new-api` (One API) 设计的高级监控与分析系统。它不仅提供现代化的数据看板，还具备强大的**主动防御 (Active Defense)** 和**深度分析 (Deep Insights)** 能力，帮助您全方位掌握 API 使用情况并防止成本失控。

![Dashboard Preview](https://via.placeholder.com/800x400?text=Token+Monitor+Dashboard)

## ✨ 核心功能

### 1. 📊 全方位数据看板
*   **实时概览**: 核心指标（Token 消耗、请求数、费用）一目了然。
*   **趋势分析**: 支持 1小时/6小时/24小时/72小时等多维度的趋势图表。
*   **消耗分布**: 清晰展示各模型 (Model) 和渠道 (Channel) 的消耗占比。

### 2. 🛡️ 主动防御 (Circuit Breaker)
*   **自动熔断**: 当某个渠道触发告警阈值时，系统可**自动禁用**该渠道，防止因配置错误或恶意攻击导致的巨额账单。
*   **灵活规则**: 支持针对特定渠道或模型设置每日或滚动周期的用量上限。

### 3. 🚨 全渠道告警 (Omni-Notify)
*   **多平台支持**: 支持 **Telegram**, **飞书 (Feishu)**, **企业微信 (WeCom)** 机器人通知。
*   **富文本消息**: 告警信息包含详细的用量数据、阈值对比及触发时间，飞书支持交互式卡片颜色标识（红色严重，橙色警告）。

### 4. 📈 深度性能分析
*   **延迟趋势**: 监控 API 平均响应时间的历史走势，发现性能瓶颈。
*   **慢请求追踪**: 自动捕获并展示 Top 20 最慢的请求，标红显示超时请求 (>5s)。
*   **日志详情**: 每一笔请求都可查看完整的 JSON 请求/响应内容、Token 消耗明细及耗时。

---

## 🛠 部署指南 (Docker)

本项目推荐使用 Docker Compose 进行一键部署。

### 1. 获取代码
将本项目代码上传至服务器，或直接克隆仓库。

### 2. 配置环境变量
编辑 `docker-compose.remote.yml` 文件。以下是关键配置项说明：

```yaml
services:
  monitor-server:
    environment:
      # ---------------- 基础配置 ----------------
      # 数据库连接 (指向 new-api 的数据库)
      - DATABASE_URL=mysql://root:123456@127.0.0.1:3306/new-api
      # 系统访问密码 (Web 界面登录用)
      - ACCESS_PASSWORD=your_secure_password
      
      # ---------------- 熔断与管理 (可选) ----------------
      # new-api 的地址 (用于执行禁用渠道操作)
      - NEW_API_BASE_URL=http://127.0.0.1:3000
      # new-api 的 Root Key (必须是 Root 权限)
      - NEW_API_KEY=sk-your_root_key
      
      # ---------------- 通知配置 (可选) ----------------
      # Telegram
      - TELEGRAM_BOT_TOKEN=your_bot_token
      - TELEGRAM_CHAT_ID=your_chat_id
      # 飞书 Webhook
      - FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/...
      # 企业微信 Webhook
      - WECOM_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
```

### 3. 启动服务
```bash
# 构建并后台启动
docker-compose -f docker-compose.remote.yml up -d --build
```
启动后访问：
*   **Web 界面**: `http://服务器IP:5173`
*   **API 服务**: `http://服务器IP:3002`

---

## 🔑 变量获取指南 (Variable Acquisition Guide)

### 1. `DATABASE_URL` (数据库连接)
*   **格式**: `mysql://用户名:密码@IP地址:端口/数据库名`
*   **获取方式**: 查看您部署 `new-api` 时使用的 `config.env` 或 `docker-compose.yml` 中的数据库配置。
*   **注意**: 如果 Monitor 和 new-api 在同一台服务器，IP 通常为 `127.0.0.1` 或宿主机内网 IP。

### 2. `NEW_API_KEY` (管理密钥)
*   **用途**: 用于执行"自动熔断"操作（禁用渠道）。
*   **获取方式**:
    1. 登录您的 `new-api` 管理后台。
    2. 进入 **令牌 (Token)** 页面。
    3. 点击 **添加新的令牌**。
    4. 勾选 **设为无限额度** (推荐) 和 **永不过期**。
    5. **关键**: 确保该令牌是由 **Root 管理员账号** 创建的，否则无法操作渠道状态。
    6. 复制生成的 `sk-` 开头的密钥。

### 3. `TELEGRAM_BOT_TOKEN` & `CHAT_ID`
*   **Bot Token**:
    1. 在 Telegram 搜索 `@BotFather`。
    2. 发送 `/newbot` 创建新机器人。
    3. 按照提示设置名称，最后会获得一串 Token (如 `123456:ABC-DEF...`)。
*   **Chat ID**:
    1. 向您刚创建的机器人发送一条任意消息。
    2. 搜索 `@userinfobot` 并点击 Start。
    3. 它会返回您的 `Id` (数字)，这就是 Chat ID。如果是群组，需将机器人拉入群组并获取群组 ID。

### 4. `FEISHU_WEBHOOK` (飞书机器人)
1.  在飞书桌面端，进入任意群组 (或新建群组)。
2.  点击群设置 (右上角 "...") -> **群机器人**。
3.  点击 **添加机器人** -> 选择 **自定义机器人**。
4.  设置名称 (如 "Token Monitor")。
5.  **安全设置**: 建议勾选 "自定义关键词"，填入 "Token" 或 "Alert" (Monitor 发送的消息包含这些词)。或者不设置安全校验 (仅测试用)。
6.  复制生成的 **Webhook 地址**。

### 5. `WECOM_WEBHOOK` (企业微信机器人)
1.  在企业微信群组中，点击右上角 "..."。
2.  选择 **添加群机器人** -> **新创建一个机器人**。
3.  设置名称。
4.  复制生成的 **Webhook 地址**。

---

## 📖 使用说明

### 性能分析 (Performance Analysis)
点击侧边栏的 **性能分析**，您可以：
*   查看 API 平均延迟的走势，判断网络或模型是否波动。
*   在 **慢请求排行榜** 中，红色高亮显示耗时超过 5 秒的请求，点击 "查看" 可分析具体原因。

### 日志详情 (Log Details)
在 **日志明细** 页面，点击任意一行日志，右侧会弹出详情抽屉：
*   **JSON 视图**: 完整展示 `request` 和 `response` 的 JSON 结构。
*   **Token 构成**: 直观展示 Prompt 与 Completion 的消耗比例。

### 告警与熔断
在 **告警配置** 页面新建告警时：
*   **触发动作**: 选择 `通知并禁用渠道` 即可开启熔断保护。
*   **注意**: 熔断功能仅对 "渠道 (Channel)" 类型的告警生效。

---

## ⚠️ 注意事项
1.  **安全性**: 请务必保护好您的 `ACCESS_PASSWORD` 和 `NEW_API_KEY`。
2.  **端口开放**: 确保服务器防火墙开放了 `5173` (Web) 和 `3002` (API) 端口，或者使用 Nginx 反代 (推荐)。
3.  **数据安全**: 本系统仅**读取** `new-api` 的日志表，**写入**操作仅限于自身的 `monitor.db` 和 `new-api` 的渠道状态更新 (仅在熔断时)，不会破坏原有数据结构。

---
© 2025 Token Monitor System
