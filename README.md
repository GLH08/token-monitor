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
- WebSocket 实时数据推送
- **健康检查**：内置 `/health` 与系统信息监控端点

### 🖥️ 渠道监控
- 渠道状态总览（正常/手动禁用/自动禁用）
- 渠道性能详情（请求数、Token、费用、错误率、延迟）
- 请求量 Top 10 排行
- 渠道状态分布饼图

### 🤖 模型分析
- 模型使用统计（请求数、Token、费用）
- Token 分布 Top 8 饼图
- 模型错误率和平均延迟分析
- 支持多时间维度切换

### 🔑 Token 管理
- Token 状态总览（正常/禁用/过期/耗尽）
- 额度使用情况（已用/剩余/无限）
- Token 使用次数统计
- 低额度 Token 预警
- **软删除适配**：自动过滤 New API 中已软删除的 Token 数据

### 📋 日志明细
- 分页查询所有 API 请求日志
- 支持按渠道 ID、模型名称、时间范围筛选
- 自定义时间选择器，精确到分钟
- 查看完整请求/响应 JSON 内容
- 统计筛选结果的 Token 总量和费用

### ❌ 错误日志
- 独立的错误日志查看页面
- 支持按渠道、模型筛选
- 分页浏览错误详情

### ⚡ 性能分析
- API 平均延迟趋势图
- 请求量 (RPM) 和 Token 吞吐量 (TPM) 趋势
- Top 20 慢请求排行榜
- 超时请求 (>5s) 红色高亮标识

### 🚨 告警配置
- 6 种告警类型：Token 用量、错误率、延迟、渠道宕机、额度不足、请求突增
- 多种统计周期：1h/6h/12h/24h/48h/72h/7天/30天/自然日/自定义时间范围
- 告警生效时间窗口（如仅工作时间生效）
- 告警历史记录
- 1小时告警冷却，避免重复通知

### 📢 Telegram 通知
- 告警触发时通过 Telegram 机器人推送通知
- 支持自定义 Bot Token 和 Chat ID

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
           │  SQLite (本地) │         │ MySQL / PGSQL │
           │  统计/告警数据  │         │ New API 日志  │
           └───────────────┘         └───────────────┘
```

- **前端**: React 19 + Vite + TailwindCSS + Recharts
- **后端**: Express + Prisma (MySQL & PostgreSQL) + SQLite + WebSocket
- **部署**: Docker Compose

## 🚀 快速部署

### 方式一：镜像部署（推荐）

只需一个配置文件即可部署，无需 clone 代码：

```bash
# 创建目录
mkdir token-monitor && cd token-monitor

# 下载部署配置
curl -O https://raw.githubusercontent.com/GLH08/token-monitor/main/deploy/docker-compose.yml

# 编辑配置（修改数据库连接和密码）
nano docker-compose.yml

# 启动
docker compose up -d
```

访问：`http://服务器IP:3000`

### 方式二：源码部署

适合需要自定义修改的场景：

```bash
# 克隆项目
git clone https://github.com/GLH08/token-monitor.git
cd token-monitor

# 编辑配置（修改数据库连接和密码）
nano docker-compose.yml

# 构建并启动
docker compose up -d --build
```

访问：
- Web 界面: `http://服务器IP:5173`
- API 服务: `http://服务器IP:3002`

## 📝 配置说明

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | New API 数据库连接字符串（支持 MySQL / PostgreSQL） |
| `ACCESS_PASSWORD` | ✅ | Web 登录密码 |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram 机器人 Token |
| `TELEGRAM_CHAT_ID` | ❌ | Telegram 聊天 ID |
| `QUOTA_PER_UNIT` | ❌ | 额度转美元的倍率，与 New API 保持一致（默认：`500000`） |
| `MAX_MONITOR_MODELS` | ❌ | 控制面板展示的最大独立模型数（默认：`50`） |

### DATABASE_URL

连接到 New API 的数据库，用于读取日志数据，支持 MySQL 与 PostgreSQL：

**MySQL 格式**：
```
mysql://用户名:密码@IP地址:端口/数据库名
```

**PostgreSQL 格式**：
```
postgresql://用户名:密码@IP地址:端口/数据库名?schema=public
```

**获取方式**：查看 New API 的 `docker-compose.yml` 或环境变量配置。

**注意**：
- 如果 Monitor 和 New API 在同一服务器：
  - Docker Desktop: 使用 `host.docker.internal`
  - Linux: 使用宿主机内网 IP（如 `172.17.0.1`）
- 确保 MySQL 允许远程连接（检查 `bind-address` 和用户权限）

### Telegram 配置

1. 在 Telegram 搜索 `@BotFather`，发送 `/newbot` 创建机器人
2. 获取 Bot Token（格式：`123456789:ABCdefGHI...`）
3. 向机器人发送消息，然后访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 获取 Chat ID

## 🌐 Nginx 反向代理

项目提供了 `nginx.conf` 配置示例，支持 HTTPS 和 WebSocket。

### 镜像部署（单端口 3000）

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_read_timeout 86400;  # WebSocket 长连接
}
```

### 源码部署（前端 5173 + API 3002）

```nginx
# Frontend
location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
}

# Backend API
location /api/ {
    proxy_pass http://127.0.0.1:3002/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_read_timeout 86400;
}

# Backend Health Check
location = /health {
    proxy_pass http://127.0.0.1:3002/health;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 📖 使用指南

### 创建告警规则

1. 进入「告警配置」页面
2. 点击「新建告警」
3. 配置规则：
   - **告警类型**：Token 用量、错误率、延迟、渠道宕机、额度不足、请求突增
   - **监控对象**：选择渠道 ID 或模型名称
   - **统计周期**：选择时间范围或自定义
   - **阈值**：设置触发条件
   - **通知渠道**：勾选需要的通知方式
   - **触发动作**：选择「仅通知」或「通知并禁用渠道」

### 熔断保护

当选择「通知并禁用渠道」时：
- 告警触发后会自动将该渠道状态设为禁用
- 仅对「渠道」类型的告警生效
- 需要手动在 New API 后台重新启用渠道

## 🔧 开发调试

### 本地开发

```bash
# 后端
cd server
cp .env.example .env  # 配置环境变量

# 如果你使用的是 PostgreSQL，需更改 prisma/schema.prisma 中的 provider 为 "postgresql"
npm install
npx prisma generate
node index.js

# 前端
cd web
npm install
npm run dev
```

### 目录结构

```
token-monitor/
├── server/                 # 后端服务
│   ├── index.js           # Express 主入口 + WebSocket
│   ├── syncer.js          # 日志同步模块
│   ├── alerter.js         # 告警检查模块 (6种告警类型)
│   ├── db.js              # SQLite 数据库
│   └── prisma/            # Prisma ORM 配置
├── web/                    # 前端应用
│   └── src/
│       ├── Dashboard.jsx  # 数据看板
│       ├── Channels.jsx   # 渠道监控
│       ├── Models.jsx     # 模型分析
│       ├── Tokens.jsx     # Token 管理
│       ├── Errors.jsx     # 错误日志
│       ├── Alerts.jsx     # 告警配置
│       ├── Performance.jsx # 性能分析
│       └── components/    # 通用组件
├── deploy/                 # 镜像部署配置
│   └── docker-compose.yml
├── Dockerfile             # 单镜像构建 (前后端合并)
├── docker-compose.yml     # 源码部署配置
├── nginx.conf             # Nginx 配置示例
└── README.md
```

## ⚠️ 注意事项

1. **数据安全**：本系统仅读取 New API 的 `logs` 表，写入操作仅限于本地 SQLite 和渠道状态更新（熔断时）
2. **端口开放**：
   - 镜像部署：开放 `3000` 端口
   - 源码部署：开放 `5173` 和 `3002` 端口
   - 建议使用 Nginx 反向代理
3. **密码保护**：请设置强密码，避免监控数据泄露
4. **数据库权限**：建议为 Monitor 创建只读数据库用户（熔断功能除外）

## 📄 License

MIT License

## 🙏 致谢

- [New API](https://github.com/Calcium-Ion/new-api)
- [One API](https://github.com/songquanpeng/one-api)
