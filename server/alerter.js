const db = require('./db');
const axios = require('axios');

async function getAlerts() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM alerts WHERE enabled = 1", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function updateLastTriggered(id) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE alerts SET last_triggered = ? WHERE id = ?", [Date.now(), id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

class Notifier {
    constructor() {
        this.telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }

    async sendTelegram(title, message) {
        if (!this.telegramToken || !this.telegramChatId) {
            console.warn("Telegram not configured, skipping notification");
            return;
        }
        try {
            const text = `*${title}*\n\n${message}`;
            await axios.post(`https://api.telegram.org/bot${this.telegramToken}/sendMessage`, {
                chat_id: this.telegramChatId,
                text: text,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error("Telegram notification failed:", error.message);
        }
    }
}

const notifier = new Notifier();

// MySQL connection for circuit breaker
let mysqlConnection = null;

async function getMysqlConnection() {
    if (mysqlConnection) return mysqlConnection;

    try {
        const mysql = require('mysql2/promise');
        const dbUrl = process.env.DATABASE_URL;

        if (!dbUrl) {
            console.error('[CIRCUIT BREAKER] DATABASE_URL not set');
            return null;
        }

        // Parse DATABASE_URL: mysql://user:pass@host:port/database
        const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (!match) {
            console.error('[CIRCUIT BREAKER] Invalid DATABASE_URL format');
            return null;
        }

        mysqlConnection = await mysql.createConnection({
            host: match[3],
            port: parseInt(match[4]),
            user: match[1],
            password: match[2],
            database: match[5]
        });

        console.log('[CIRCUIT BREAKER] MySQL connection established');
        return mysqlConnection;
    } catch (error) {
        console.error('[CIRCUIT BREAKER] MySQL connection failed:', error.message);
        return null;
    }
}

async function disableChannel(channelId) {
    try {
        const conn = await getMysqlConnection();
        if (!conn) {
            console.warn('[CIRCUIT BREAKER] No MySQL connection available');
            return false;
        }

        // 直接更新数据库：status = 2 (手动禁用)
        const [result] = await conn.execute(
            'UPDATE channels SET status = 2 WHERE id = ?',
            [channelId]
        );

        if (result.affectedRows > 0) {
            console.log(`[CIRCUIT BREAKER] ✅ Channel ${channelId} disabled successfully via database.`);
            return true;
        } else {
            console.warn(`[CIRCUIT BREAKER] ⚠️ Channel ${channelId} not found in database.`);
            return false;
        }
    } catch (error) {
        console.error(`[CIRCUIT BREAKER] ❌ Error disabling channel ${channelId}:`, error.message);
        // 重置连接以便下次重试
        if (mysqlConnection) {
            try {
                await mysqlConnection.end();
            } catch (e) {
                // ignore
            }
            mysqlConnection = null;
        }
        return false;
    }
}

async function checkAlerts() {
    try {
        const alerts = await getAlerts();
        console.log(`[ALERT CHECK] Found ${alerts.length} enabled alerts`);

        const now = Math.floor(Date.now() / 1000);
        const nowDate = new Date();
        console.log(`[ALERT CHECK] Current time: ${nowDate.toLocaleString()}, timestamp: ${now}`);

        for (const alert of alerts) {
            console.log(`\n[ALERT CHECK] Checking alert: ${alert.name} (ID: ${alert.id})`);
            let rule;
            try {
                rule = JSON.parse(alert.rule);
            } catch (e) {
                console.error(`Invalid rule JSON for alert ${alert.id}:`, e);
                continue;
            }

            // Daily Window Logic
            if (alert.start_time && alert.end_time) {
                const [startH, startM] = alert.start_time.split(':').map(Number);
                const [endH, endM] = alert.end_time.split(':').map(Number);
                const currentH = nowDate.getHours();
                const currentM = nowDate.getMinutes();

                const currentMinutes = currentH * 60 + currentM;
                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                console.log(`[ALERT CHECK]   Time window: ${alert.start_time}-${alert.end_time}, Current: ${currentH}:${currentM.toString().padStart(2, '0')}`);

                if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                    console.log(`[ALERT CHECK]   ⏭️  Skipped: outside time window`);
                    continue;
                }
            }

            let startTime;
            let endTime = now; // 默认结束时间为当前时间
            let periodDisplay;

            if (rule.period === 'custom') {
                // 自定义时间范围
                startTime = rule.customStartTs || (now - 24 * 3600); // 默认24小时前
                endTime = rule.customEndTs || now; // 默认到当前
                const startDate = new Date(startTime * 1000).toLocaleString('zh-CN');
                const endDate = new Date(endTime * 1000).toLocaleString('zh-CN');
                periodDisplay = `Custom: ${startDate} → ${endDate}`;
                console.log(`[ALERT CHECK]   Period: custom → ${periodDisplay}`);
            } else if (rule.period === 'today' || rule.period === 'daily') {
                // 使用UTC+8（北京时间）计算自然日00:00
                const nowDate = new Date();
                const chinaOffset = 8 * 3600 * 1000; // UTC+8
                const todayChina = new Date(nowDate.getTime() + chinaOffset);
                todayChina.setUTCHours(0, 0, 0, 0);
                startTime = Math.floor((todayChina.getTime() - chinaOffset) / 1000);
                periodDisplay = "Current Day (00:00 Beijing Time - Now)";
                console.log(`[ALERT CHECK]   Period: ${rule.period} → ${periodDisplay}, start_time=${startTime} (UTC: ${new Date(startTime * 1000).toISOString()})`);
            } else {
                // 相对时间 (1h, 6h, 12h, 24h, 48h, 72h, 168h, 720h, etc.)
                const periodHours = parseFloat(rule.period) || 24;
                const periodSeconds = periodHours * 3600;
                startTime = now - periodSeconds;
                periodDisplay = `Last ${periodHours} hours`;
                console.log(`[ALERT CHECK]   Period: ${rule.period} → ${periodDisplay}, start_time=${startTime}`);
            }

            let query = "SELECT SUM(tokens) as total FROM stats WHERE hour >= ?";
            const params = [startTime];

            // 如果有结束时间限制（自定义时间范围）
            if (rule.period === 'custom' && rule.customEndTs) {
                query += " AND hour <= ?";
                params.push(endTime);
            }

            if (rule.type === 'channel') {
                query += " AND channel_id = ?";
                params.push(rule.target);
                console.log(`[ALERT CHECK]   Type: channel, Target: ${rule.target}`);
            } else if (rule.type === 'model') {
                query += " AND model_name = ?";
                params.push(rule.target);
                console.log(`[ALERT CHECK]   Type: model, Target: ${rule.target}`);
            }

            console.log(`[ALERT CHECK]   Query: ${query}, Params: ${JSON.stringify(params)}`);

            const total = await new Promise((resolve, reject) => {
                db.get(query, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.total : 0);
                });
            });

            console.log(`[ALERT CHECK]   Usage: ${total || 0}, Threshold: ${rule.threshold}`);

            if (total > rule.threshold) {
                const lastTriggered = alert.last_triggered || 0;
                const cooldownMs = 3600000; // 1 hour

                if (Date.now() - lastTriggered > cooldownMs) {
                    let actionResult = "";

                    // Execute Trigger Action
                    if (alert.trigger_action === 'disable' && rule.type === 'channel') {
                        const disabled = await disableChannel(rule.target);
                        if (disabled) {
                            actionResult = "\n\n⚡ *CIRCUIT BREAKER ACTIVATED* ⚡\nChannel has been automatically DISABLED.";
                        } else {
                            actionResult = "\n\n⚠️ *CIRCUIT BREAKER FAILED* ⚠️\nFailed to disable channel. Check logs.";
                        }
                    } else if (alert.trigger_action === 'disable') {
                        console.warn(`[CIRCUIT BREAKER] Skipped disable action. Reason: Rule type is '${rule.type}' (must be 'channel'). Target: ${rule.target}`);
                    }

                    const message = `*Name:* ${alert.name}\n` +
                        `*Target:* ${rule.type === 'channel' ? 'Channel ' + rule.target : 'Model ' + rule.target}\n` +
                        `*Usage:* ${total.toLocaleString()} tokens\n` +
                        `*Threshold:* ${rule.threshold.toLocaleString()} tokens\n` +
                        `*Period:* ${periodDisplay}` +
                        actionResult;

                    console.log(`[ALERT] ${alert.name} triggered! Usage: ${total} > ${rule.threshold}`);

                    if (alert.notify_telegram) {
                        await notifier.sendTelegram("🚨 Token Alert Triggered", message);
                    }

                    await updateLastTriggered(alert.id);
                } else {
                    console.log(`[ALERT] ${alert.name} in cooldown. Last triggered: ${new Date(lastTriggered).toLocaleString()}`);
                }
            }
        }
    } catch (error) {
        console.error("Alert check error:", error);
    }
}

module.exports = { checkAlerts };
