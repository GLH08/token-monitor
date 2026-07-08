const db = require('./db');
const axios = require('axios');
const { prisma } = require('./syncer');

// ==================== 告警类型 ====================
const ALERT_TYPES = {
    TOKEN_USAGE: 'token_usage',      // Token 用量阈值
    ERROR_RATE: 'error_rate',        // 错误率阈值
    LATENCY: 'latency',              // 延迟阈值
    CHANNEL_DOWN: 'channel_down',    // 渠道宕机
    QUOTA_LOW: 'quota_low',          // Token 额度不足
    REQUEST_SPIKE: 'request_spike'   // 请求量突增
};

// ==================== 通知器 ====================
class Notifier {
    constructor() {
        this.telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }

    async sendTelegram(title, message) {
        if (!this.telegramToken || !this.telegramChatId) {
            console.warn("[NOTIFY] Telegram not configured, skipping notification");
            return false;
        }
        try {
            const text = `🚨 *${title}*\n\n${message}`;
            await axios.post(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
                chat_id: this.telegramChatId,
                text: text,
                parse_mode: 'Markdown'
            });
            return true;
        } catch (error) {
            console.error("[NOTIFY] Telegram notification failed:", error.message);
            return false;
        }
    }
}

const notifier = new Notifier();

// ==================== 熔断操作（通过 Prisma 执行） ====================
async function disableChannel(channelId) {
    try {
        const result = await prisma.channel.updateMany({
            where: { id: channelId },
            data: { status: 2 } // 2 = 手动禁用
        });

        if (result.count > 0) {
            console.log(`[CIRCUIT BREAKER] ✅ Channel ${channelId} disabled successfully`);
            return true;
        } else {
            console.warn(`[CIRCUIT BREAKER] ⚠️ Channel ${channelId} not found`);
            return false;
        }
    } catch (error) {
        console.error(`[CIRCUIT BREAKER] ❌ Error disabling channel ${channelId}:`, error.message);
        return false;
    }
}

// ==================== 告警检查函数 ====================

async function checkTokenUsage(rule, now) {
    let startTime;
    if (rule.period === 'custom') {
        startTime = rule.customStartTs || (now - 24 * 3600);
    } else if (rule.period === 'today' || rule.period === 'daily') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        startTime = Math.floor(todayStart.getTime() / 1000);
    } else {
        const periodHours = parseFloat(rule.period) || 24;
        startTime = now - periodHours * 3600;
    }

    let query = "SELECT SUM(tokens) as total FROM stats WHERE hour >= ?";
    const params = [startTime];

    if (rule.type === 'channel') {
        query += " AND channel_id = ?";
        params.push(rule.target);
    } else if (rule.type === 'model') {
        query += " AND model_name = ?";
        params.push(rule.target);
    }

    const row = await db.getAsync(query, params);
    return row?.total || 0;
}

async function checkErrorRate(rule, now) {
    const periodHours = parseFloat(rule.period) || 1;
    const startTime = now - periodHours * 3600;

    let whereClause = "hour >= ?";
    const params = [startTime];

    if (rule.type === 'channel') {
        whereClause += " AND channel_id = ?";
        params.push(rule.target);
    } else if (rule.type === 'model') {
        whereClause += " AND model_name = ?";
        params.push(rule.target);
    }

    const totalRow = await db.getAsync(
        `SELECT SUM(request_count) as total FROM stats WHERE ${whereClause}`,
        params
    );
    const errorRow = await db.getAsync(
        `SELECT SUM(error_count) as errors FROM stats WHERE ${whereClause}`,
        params
    );

    const total = totalRow?.total || 0;
    const errors = errorRow?.errors || 0;

    return total > 0 ? (errors / total * 100) : 0;
}

async function checkLatency(rule, now) {
    const periodHours = parseFloat(rule.period) || 1;
    const startTime = now - periodHours * 3600;

    let whereClause = "hour >= ? AND request_count > 0";
    const params = [startTime];

    if (rule.type === 'channel') {
        whereClause += " AND channel_id = ?";
        params.push(rule.target);
    } else if (rule.type === 'model') {
        whereClause += " AND model_name = ?";
        params.push(rule.target);
    }

    const row = await db.getAsync(
        `SELECT SUM(avg_latency * request_count) / SUM(request_count) as avg FROM stats WHERE ${whereClause}`,
        params
    );

    return Math.round(row?.avg || 0);
}

async function checkChannelDown() {
    try {
        const channels = await prisma.channel.findMany({
            where: { status: { in: [2, 3] } },
            select: { id: true, name: true, status: true }
        });
        return channels;
    } catch (error) {
        console.error("[ALERT] Check channel down error:", error);
        return [];
    }
}

async function checkQuotaLow(threshold) {
    try {
        const tokens = await prisma.token.findMany({
            where: {
                unlimitedQuota: false,
                remainQuota: { lt: threshold },
                status: 1,
                deletedAt: null
            },
            select: { id: true, name: true, remainQuota: true }
        });
        return tokens;
    } catch (error) {
        console.error("[ALERT] Check quota low error:", error);
        return [];
    }
}

async function checkRequestSpike(rule, now) {
    const periodHours = parseFloat(rule.period) || 1;
    const currentStart = now - periodHours * 3600;
    const previousStart = currentStart - periodHours * 3600;

    let whereClause = "";
    const params = [];

    if (rule.type === 'channel') {
        whereClause = " AND channel_id = ?";
        params.push(rule.target);
    } else if (rule.type === 'model') {
        whereClause = " AND model_name = ?";
        params.push(rule.target);
    }

    const currentRow = await db.getAsync(
        `SELECT SUM(request_count) as total FROM stats WHERE hour >= ? AND hour < ?${whereClause}`,
        [currentStart, now, ...params]
    );
    const previousRow = await db.getAsync(
        `SELECT SUM(request_count) as total FROM stats WHERE hour >= ? AND hour < ?${whereClause}`,
        [previousStart, currentStart, ...params]
    );

    const current = currentRow?.total || 0;
    const previous = previousRow?.total || 1;

    return previous > 0 ? ((current - previous) / previous * 100) : 0;
}

// ==================== 记录告警历史 ====================
async function recordAlertHistory(alertId, alertName, value, threshold, message, actionTaken) {
    try {
        await db.runAsync(
            `INSERT INTO alert_history (alert_id, alert_name, triggered_at, value, threshold, message, action_taken)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [alertId, alertName, Math.floor(Date.now() / 1000), value, threshold, message, actionTaken]
        );
    } catch (error) {
        console.error("[ALERT] Record history error:", error);
    }
}

// ==================== 主检查函数 ====================
async function checkAlerts() {
    try {
        const alerts = await db.allAsync("SELECT * FROM alerts WHERE enabled = 1");
        console.log(`[ALERT CHECK] Found ${alerts.length} enabled alerts`);

        const now = Math.floor(Date.now() / 1000);
        const nowDate = new Date();

        for (const alert of alerts) {
            console.log(`\n[ALERT CHECK] Checking: ${alert.name} (ID: ${alert.id})`);
            
            let rule;
            try {
                rule = JSON.parse(alert.rule);
            } catch (e) {
                console.error(`[ALERT] Invalid rule JSON for alert ${alert.id}:`, e);
                continue;
            }

            // 检查时间窗口
            if (alert.start_time && alert.end_time) {
                const [startH, startM] = alert.start_time.split(':').map(Number);
                const [endH, endM] = alert.end_time.split(':').map(Number);
                const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                    console.log(`[ALERT CHECK] ⏭️ Skipped: outside time window`);
                    continue;
                }
            }

            let triggered = false;
            let currentValue = 0;
            let message = '';
            const alertType = rule.alertType || ALERT_TYPES.TOKEN_USAGE;

            switch (alertType) {
                case ALERT_TYPES.TOKEN_USAGE:
                    currentValue = await checkTokenUsage(rule, now);
                    triggered = currentValue > rule.threshold;
                    message = `Token 用量 ${currentValue.toLocaleString()} 超过阈值 ${rule.threshold.toLocaleString()}`;
                    break;

                case ALERT_TYPES.ERROR_RATE:
                    currentValue = await checkErrorRate(rule, now);
                    triggered = currentValue > rule.threshold;
                    message = `错误率 ${currentValue.toFixed(2)}% 超过阈值 ${rule.threshold}%`;
                    break;

                case ALERT_TYPES.LATENCY:
                    currentValue = await checkLatency(rule, now);
                    triggered = currentValue > rule.threshold;
                    message = `平均延迟 ${currentValue}ms 超过阈值 ${rule.threshold}ms`;
                    break;

                case ALERT_TYPES.CHANNEL_DOWN:
                    const downChannels = await checkChannelDown();
                    triggered = downChannels.length > 0;
                    currentValue = downChannels.length;
                    message = `${downChannels.length} 个渠道异常: ${downChannels.map(c => c.name).join(', ')}`;
                    break;

                case ALERT_TYPES.QUOTA_LOW:
                    const lowQuotaTokens = await checkQuotaLow(rule.threshold);
                    triggered = lowQuotaTokens.length > 0;
                    currentValue = lowQuotaTokens.length;
                    message = `${lowQuotaTokens.length} 个 Token 额度不足: ${lowQuotaTokens.map(t => `${t.name}(${t.remainQuota})`).join(', ')}`;
                    break;

                case ALERT_TYPES.REQUEST_SPIKE:
                    currentValue = await checkRequestSpike(rule, now);
                    triggered = currentValue > rule.threshold;
                    message = `请求量增长 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
                    break;

                default:
                    // 兼容旧版本的 token_usage 类型
                    currentValue = await checkTokenUsage(rule, now);
                    triggered = currentValue > rule.threshold;
                    message = `Token 用量 ${currentValue.toLocaleString()} 超过阈值 ${rule.threshold.toLocaleString()}`;
            }

            console.log(`[ALERT CHECK] Value: ${currentValue}, Threshold: ${rule.threshold}, Triggered: ${triggered}`);

            if (triggered) {
                const lastTriggered = alert.last_triggered || 0;
                const cooldownMs = 3600000; // 1 小时冷却

                if (Date.now() - lastTriggered > cooldownMs) {
                    let actionResult = "";
                    let actionTaken = "notify";

                    // 执行熔断动作
                    if (alert.trigger_action === 'disable' && rule.type === 'channel') {
                        const disabled = await disableChannel(rule.target);
                        if (disabled) {
                            actionResult = "\n\n⚡ *熔断已触发* ⚡\n渠道已自动禁用";
                            actionTaken = "disable_channel";
                        } else {
                            actionResult = "\n\n⚠️ *熔断失败* ⚠️\n无法禁用渠道，请检查日志";
                            actionTaken = "disable_failed";
                        }
                    }

                    const targetInfo = rule.type === 'channel' ? `渠道 ${rule.target}` : 
                                       rule.type === 'model' ? `模型 ${rule.target}` : '全局';

                    const fullMessage = `*规则:* ${alert.name}\n` +
                        `*类型:* ${alertType}\n` +
                        `*目标:* ${targetInfo}\n` +
                        `*当前值:* ${typeof currentValue === 'number' ? currentValue.toLocaleString() : currentValue}\n` +
                        `*阈值:* ${rule.threshold.toLocaleString()}\n` +
                        `*详情:* ${message}` +
                        actionResult;

                    console.log(`[ALERT] 🚨 ${alert.name} triggered!`);

                    // 发送通知
                    if (alert.notify_telegram) {
                        await notifier.sendTelegram("Token Monitor 告警", fullMessage);
                    }

                    // 更新告警状态
                    await db.runAsync(
                        "UPDATE alerts SET last_triggered = ?, last_value = ?, trigger_count = trigger_count + 1 WHERE id = ?",
                        [Date.now(), currentValue, alert.id]
                    );

                    // 记录历史
                    await recordAlertHistory(alert.id, alert.name, currentValue, rule.threshold, message, actionTaken);
                } else {
                    console.log(`[ALERT] ${alert.name} in cooldown. Last: ${new Date(lastTriggered).toLocaleString()}`);
                }
            }
        }
    } catch (error) {
        console.error("[ALERT] Check error:", error);
    }
}

// ==================== 获取告警历史 ====================
async function getAlertHistory(limit = 100, alertId = null) {
    let query = "SELECT * FROM alert_history";
    const params = [];
    
    if (alertId) {
        query += " WHERE alert_id = ?";
        params.push(alertId);
    }
    
    query += " ORDER BY triggered_at DESC LIMIT ?";
    params.push(limit);
    
    return await db.allAsync(query, params);
}

module.exports = { 
    checkAlerts, 
    getAlertHistory, 
    ALERT_TYPES,
    disableChannel 
};
