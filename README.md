# Token Monitor

专为 [New API](https://github.com/Calcium-Ion/new-api) / [One API](https://github.com/songquanpeng/one-api) 设计的 Token 用量监控与告警系统。

![Dashboard](https://img.shields.io/badge/Dashboard-React-61DAFB?style=flat-square&logo=react)
![Backend](https://img.shields.io/badge/Backend-Node.js-339933?style=flat-square&logo=node.js)
![Database](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite)
![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED?style=flat-square&logo=docker)

## ✨ 功能特性

### 📊 数据看板
- 实时统计 Token 消耗、请求数、活跃模型数
- 支持 1小时/6小时/12小时/24小时/7天/30天 多时间维度
- 模型消耗分布堆叠图、渠道消耗占比饼图
- Token 消耗趋势折线图

### � 日志明细渠
- 分页查询所有 API 请求日志
- 支持按渠道 ID、模型名称、时间范围筛选
- 自定义时间选择器，精确到分钟
- 查看完整请求/响应 JSON 内容
- 统计筛选结果的 Token 总量和费用

### ⚡ 性能分析
- API 平均延迟趋势图
- 请求量 (RPM) 和 Token 吞吐量 (TPM) 趋势
- Top 20 慢请求排行榜
- 超时请求 (>5s) 红色高亮标识

### 🚨 告警配置
- 支持按渠道或模型设置 Token 用量阈值
- 多种统计周期：1h/6h/12h/24h/48h/72h/7天/30天/自然日/自定义时间范围
- 告警生效时间窗口（如仅工作时间生效）
- 1小时告警冷却，避免重复通知

### 📢 多渠道通知
- **Telegram** 机器人推送
- **飞书 (Feishu)** Webhook 机器人（支持交互式卡片）
- **企业微信 (WeCom)** Webhook 机器人

### 🛡️ 熔断保护 (Circuit Breaker)
- 告警触发时可自动禁用渠道
- 直接操作 New API 数据库，无需 API Key
- 防止配置错误或恶意调用导致的巨额账单

## 🏗️ 技术架构

```
┌─────────────────┐     ┌─────────────────┐
│   Web (React)   │────▶│  Server (Node)  │
│   Port: 5173    │     │   Port: 3001    │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │  SQLite (本地) │         │ MySQL (远程)  │
           │  统计/告警数据  │         │ New API 日志  │
           └───────────────┘         └───────────────┘
```

- **前端**: React 19 + Vite + TailwindCSS + Recharts
- **后端**: Express + Prisma (MySQL) + SQLite
- **部署**: Docker Compose

## 🚀 快速部署

### 1. 克隆项目

```bash
git clone https://github.com/GLH08/token-monitor.git
cd token-monitor
```

### 2. 配置环境变量

编辑 `docker-compose.yml`：

```yaml
services:
  monitor-server:
    environment:
      # 必填：New API 数据库连接
      - DATABASE_URL=mysql://用户名:密码@数据库IP:3306/new-api
      
      # 必填：Web 界面登录密码
      - ACCESS_PASSWORD=your_secure_password
      
      # 可选：Telegram 通知
      - TELEGRAM_BOT_TOKEN=your_bot_token
      - TELEGRAM_CHAT_ID=your_chat_id
      
      # 可选：飞书通知
      - FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
      
      # 可选：企业微信通知
      - WECOM_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
```

### 3. 启动服务

```bash
docker compose up -d --build
```

### 4. 访问系统

- **Web 界面**: `http://服务器IP:5173`
- **API 服务**: `http://服务器IP:3002`

## 📝 配置说明

### DATABASE_URL

连接到 New API 的 MySQL 数据库，用于读取日志数据。

```
mysql://用户名:密码@IP地址:端口/数据库名
```

**获取方式**：查看 New API 的 `docker-compose.yml` 或环境变量配置。

**注意**：
- 如果 Monitor 和 New API 在同一服务器，IP 使用 `host.docker.internal` (Docker Desktop) 或宿主机内网 IP
- 确保 MySQL 允许远程连接（检查 `bind-address` 和用户权限）

### Telegram 配置

1. 在 Telegram 搜索 `@BotFather`，发送 `/newbot` 创建机器人
2. 获取 Bot Token（格式：`123456789:ABCdefGHI...`）
3. 向机器人发送消息，然后访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 获取 Chat ID

### 飞书配置

1. 进入飞书群组 → 设置 → 群机器人 → 添加机器人
2. 选择「自定义机器人」
3. 安全设置建议添加关键词：`Token` 或 `Alert`
4. 复制 Webhook 地址

### 企业微信配置

1. 进入企业微信群组 → 添加群机器人
2. 复制 Webhook 地址

## 📖 使用指南

### 创建告警规则

1. 进入「告警配置」页面
2. 点击「新建告警」
3. 配置规则：
   - **监控对象**：选择渠道 ID 或模型名称
   - **统计周期**：选择时间范围或自定义
   - **阈值**：设置 Token 上限
   - **通知渠道**：勾选需要的通知方式
   - **触发动作**：选择「仅通知」或「通知并禁用渠道」

### 熔断保护

当选择「通知并禁用渠道」时：
- 告警触发后会自动将该渠道状态设为禁用
- 仅对「渠道」类型的告警生效
- 需要手动在 New API 后台重新启用渠道

### 自定义时间范围

告警支持自定义统计时间范围，适用于：
- 统计历史某个时段的 Token 总量
- 月度/季度用量统计
- 特定活动期间的用量监控

## 🔧 开发调试

### 本地开发

```bash
# 后端
cd server
npm install
npm run dev

# 前端
cd web
npm install
npm run dev
```

### 目录结构

```
token-monitor/
├── server/                 # 后端服务
│   ├── index.js           # Express 主入口
│   ├── syncer.js          # 日志同步模块
│   ├── alerter.js         # 告警检查模块
│   ├── db.js              # SQLite 数据库
│   └── prisma/            # Prisma ORM 配置
├── web/                    # 前端应用
│   └── src/
│       ├── Dashboard.jsx  # 数据看板
│       ├── Alerts.jsx     # 告警配置
│       ├── Performance.jsx # 性能分析
│       └── components/    # 通用组件
├── docker-compose.yml     # Docker 部署配置
└── README.md
```

## ⚠️ 注意事项

1. **数据安全**：本系统仅读取 New API 的 `logs` 表，写入操作仅限于本地 SQLite 和渠道状态更新（熔断时）
2. **端口开放**：确保防火墙开放 5173 和 3002 端口，或使用 Nginx 反向代理
3. **密码保护**：请设置强密码，避免监控数据泄露
4. **数据库权限**：建议为 Monitor 创建只读数据库用户（熔断功能除外）

## 📄 License

MIT License

## 🙏 致谢

- [New API](https://github.com/Calcium-Ion/new-api)
- [One API](https://github.com/songquanpeng/one-api)
