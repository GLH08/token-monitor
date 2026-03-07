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

### ⚡ 性能分析
- API 平均延迟趋势图
- 请求量 (RPM) 和 Token 吞吐量 (TPM) 趋势
- Top 20 慢请求排行榜
- 超时请求 (>5s) 红色高亮标识

### 🚨 告警与自动熔断
- 6 种告警类型：Token 用量、错误率、延迟、渠道宕机、额度不足、请求突增
- Telegram 通知推送
- 当触发严重警报时可选择**直接禁用该异常渠道**，物理隔离资损风险。

## 🏗️ 全栈极简架构

无需复杂的独立容器和跨域网关设置，前端后融合交付：

```text
┌──────────────────────────────┐
│  Token Monitor 镜像          │
│                              │
│  [ React Frontend (Static) ] │
│             │                │
│             ▼               │
│  [ Node.js Backend Engine ]  │
│  EXPOSE 3000 (Internal)      │
└─────────────┬────────────────┘
              │           
       映射到宿主机 5173 端口
              ▼           
      直连 New API 源数据库      
             ▼                  
   ┌──────────────────────┐   
   │ MySQL / PostgreSQL   │  
   └──────────────────────┘   
```

- **统一端口**: 对外统一暴漏 Node 服务映射端口 (`5173`)
- **同源通信**: 无跨域配置、不依赖外部 Nginx反代组件即可独立运行
- **本地存储**: 采用 SQLite 保存自身面板的监控告警预设、渠道元数据

## 🚀 一键快速部署

只使用一个精简的 `docker-compose.yml` 即可完成部署！

### 方式一：镜像部署（极速免编译推荐）

您可以完全忽略拉取项目全量代码的操作：

```bash
# 1. 创建你的存放目录
mkdir token-monitor && cd token-monitor

# 2. 下载远程部署专用配置
curl -O https://raw.githubusercontent.com/glh08/token-monitor/main/deploy/docker-compose.yml

# 3. 按需编辑配置文件中的密码及你的数据库地址
nano docker-compose.yml

# 4. 后台启动
docker compose up -d
```

### 方式二：源码编译部署（适合二开）

基于最新的源代码在本地执行包含前后端的重构编译：

```bash
git clone https://github.com/glh08/token-monitor.git
cd token-monitor

# 编辑配置文件
nano docker-compose.yml

# 基于 docker-compose 构建内部多阶段依赖并启动
docker compose up -d --build
```

**访问即可开始监控**：
`http://服务器IP:5173`

## 📝 配置说明 (环境变量)

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | New API 数据库连接字符串（支持 MySQL / PostgreSQL） |
| `ACCESS_PASSWORD` | ❌ | Web 登录密码 (不填则启用免密直达模式) |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram 机器人 Token |
| `TELEGRAM_CHAT_ID` | ❌ | Telegram 聊天 ID |
| `QUOTA_PER_UNIT` | ❌ | 额度转美元的倍率，与 New API 保持一致（默认：`500000`） |
| `MAX_MONITOR_MODELS` | ❌ | 控制面板展示的最大独立模型数量（默认：`50`） |

**数据库连接格式示例**：
- **MySQL**: `mysql://用户名:密码@IP地址:端口/数据库名`
- **PostgreSQL**: `postgresql://用户名:密码@IP地址:端口/数据库名?schema=public`
若和 New API 于同一台服务器且都在 Docker 中，您可能需要使用宿主机局域网 IP (例如 `172.17.0.1`) 代替 `localhost`。

## 🌐 宿主机 Nginx 域名反代 (可选)

如有公网独立域名及证书的需求，配置反代映射到您本地暴露出来的 `5173` 端口即可。支持原生 WebSocket 代理：

*(示例配置文件可参考仓库内的 `deploy/nginx.example.conf`)*

```nginx
server {
    listen 80;
    server_name your_domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your_domain.com;
    
    ssl_certificate     /etc/nginx/ssl/your_domain.com.crt;
    ssl_certificate_key /etc/nginx/ssl/your_domain.com.key;

    # 开启 HTTP/2 现代支持
    http2 on;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400; # 防止 WebSocket 被自动挂断
    }
}
```

## ⚠️ 常见问题
1. **熔断功能缺失**: 开启严重警报熔断策略需要本系统对 New API 的 `channels` 表具有完全读写更新权利。因此，请确保您在 `DATABASE_URL` 中提供的非为仅允许检索（查询）的访客数据库用户，否则功能会执行失败。

## 📄 License
MIT License
