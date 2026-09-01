const db = require('./db');
const axios = require('axios');
const { prisma } = require('./syncer');
const { metricsFromLog } = require('./tokenMetrics');

const QUOTA_PER_UNIT = parseInt(process.env.QUOTA_PER_UNIT) || 500000;

async function getMeta(key) {
    return new Promise((resolve, reject) => {
        db.get("SELECT value FROM meta WHERE key = ?", [key], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.value : null);
        });
    });
}

async function setMeta(key, value) {
    return new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ==================== 告警类型 ====================
const ALERT_TYPES = {
    TOKEN_USAGE: 'token_usage',      // Token 用量阈值
    ERROR_RATE: 'error_rate',        // 错误率阈值
    LATENCY: 'latency',              // 延迟阈值
    CHANNEL_DOWN: 'channel_down',    // 渠道宕机
    QUOTA_LOW: 'quota_low',          // Token 额度不足
    BALANCE_LOW: 'balance_low',      // 渠道余额不足
    REQUEST_SPIKE: 'request_spike',   // 请求量突增
    TOKEN_SPIKE: 'token_spike',       // Token 用量增长
    TOKEN_DROP: 'token_drop',         // Token 用量下降
    CACHE_HIT_DROP: 'cache_hit_drop', // 缓存命中率下降
    LARGE_REQUEST: 'large_request',   // 单请求 Token 过大
    MULTI_KEY_IMBALANCE: 'multi_key_imbalance' // 多 Key Token 分布失衡
};

// Pure matcher for the per-alert active time window. A window whose start is
// later than its end (e.g. 22:00-06:00) wraps midnight and matches on either
// side of the boundary.
function isWithinAlertWindow(startTime, endTime, nowDate) {
    const [startH, startM] = String(startTime).split(':').map(Number);
    const [endH, endM] = String(endTime).split(':').map(Number);
    const currentMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function percentageChange(current, previous) {
    if (!Number.isFinite(previous) || previous <= 0) {
        return 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
}

// Escape Telegram legacy-Markdown specials in user-derived strings (model and
// channel names, error text). A raw `*`/`_`/backtick/`[` makes Telegram reject
// the whole message with 400 — which previously meant the daily digest was
// retried and lost all day, because the dedup key is only written on success.
function escapeTelegramMarkdown(value) {
    // Legacy Markdown only treats _ * ` [ as escapable; escaping anything
    // else (like ]) would render a literal backslash in the message.
    return String(value).replace(/[_*`\[]/g, '\\$&');
}

function resolveAlertPeriod(rule = {}, now, defaultHours = 1) {
    let startTime;
    const isNaturalDay = rule.period === 'today' || rule.period === 'daily';
    if (rule.period === 'custom') {
        startTime = Number(rule.customStartTs) || now - defaultHours * 3600;
    } else if (rule.period === 'today' || rule.period === 'daily') {
        const todayStart = new Date(now * 1000);
        todayStart.setHours(0, 0, 0, 0);
        startTime = Math.floor(todayStart.getTime() / 1000);
    } else {
        const periodHours = parseFloat(rule.period) || defaultHours;
        startTime = now - periodHours * 3600;
    }

    const normalizedStart = Math.floor(startTime);
    return {
        startTime: normalizedStart,
        durationSeconds: Math.max(0, now - normalizedStart),
        isNaturalDay
    };
}

function resolveAlertStatsWindow(rule, now, defaultHours = 1) {
    const period = resolveAlertPeriod(rule, now, defaultHours);
    const currentHour = Math.floor(now / 3600) * 3600;
    const endTime = currentHour + 3600;
    const elapsedSeconds = period.durationSeconds;
    const elapsedHours = Math.max(1, Math.ceil(Math.max(1, elapsedSeconds) / 3600));
    const includesCurrentBoundary = period.isNaturalDay
        && elapsedSeconds > 0
        && elapsedSeconds % 3600 === 0;
    const durationHours = elapsedHours + (includesCurrentBoundary ? 1 : 0);
    const durationSeconds = durationHours * 3600;
    const currentStart = currentHour - (durationHours - 1) * 3600;
    return { currentStart, endTime, previousStart: currentStart - durationSeconds };
}

function cacheHitDropPercentage(currentHit, currentInput, previousHit, previousInput) {
    if (currentInput <= 0) {
        return 0;
    }
    const currentRate = currentInput > 0 ? currentHit / currentInput : 0;
    const previousRate = previousInput > 0 ? previousHit / previousInput : 0;
    if (previousRate <= 0) {
        return 0;
    }
    return Number((Math.max(0, (previousRate - currentRate) / previousRate * 100)).toFixed(2));
}

function maxSharePercentage(values) {
    const positive = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
    const total = positive.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
        return 0;
    }
    return Number((Math.max(...positive) / total * 100).toFixed(2));
}

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
    const { startTime } = resolveAlertPeriod(rule, now, 24);

    let query = "SELECT SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as total FROM stats WHERE hour >= ?";
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
    const { startTime } = resolveAlertPeriod(rule, now);

    let whereClause = "hour >= ?";
    const params = [startTime];

    if (rule.type === 'channel') {
        whereClause += " AND channel_id = ?";
        params.push(rule.target);
    } else if (rule.type === 'model') {
        whereClause += " AND model_name = ?";
        params.push(rule.target);
    }

    const row = await db.getAsync(
        `SELECT SUM(request_count) as total, SUM(error_count) as errors FROM stats WHERE ${whereClause}`,
        params
    );

    const total = row?.total || 0;
    const errors = row?.errors || 0;

    return total > 0 ? (errors / total * 100) : 0;
}

async function checkLatency(rule, now) {
    const { startTime } = resolveAlertPeriod(rule, now);

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
                // remain_quota is BigInt; thresholds arrive as rule numbers.
                remainQuota: { lt: BigInt(Math.trunc(Number(threshold) || 0)) },
                status: 1,
                deletedAt: null
            },
            select: { id: true, name: true, remainQuota: true }
        });
        // Normalize BigInt at the boundary so messages render numbers, not `123n`.
        return tokens.map(t => ({ ...t, remainQuota: Number(t.remainQuota) }));
    } catch (error) {
        console.error("[ALERT] Check quota low error:", error);
        return [];
    }
}

// Enabled channels whose upstream balance (from new-api, refreshed on its own
// schedule) has dropped below the threshold. NULL balances never match lt.
async function checkBalanceLow(threshold) {
    try {
        const channels = await prisma.channel.findMany({
            where: {
                status: 1,
                balance: { lt: Number(threshold), not: null }
            },
            select: { id: true, name: true, balance: true },
            orderBy: { balance: 'asc' }
        });
        return channels;
    } catch (error) {
        console.error("[ALERT] Check balance low error:", error);
        return [];
    }
}

async function checkRequestSpike(rule, now) {
    const { currentStart, endTime, previousStart } = resolveAlertStatsWindow(rule, now);

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
        [currentStart, endTime, ...params]
    );
    const previousRow = await db.getAsync(
        `SELECT SUM(request_count) as total FROM stats WHERE hour >= ? AND hour < ?${whereClause}`,
        [previousStart, currentStart, ...params]
    );

    const current = currentRow?.total || 0;
    // Empty baseline means "no data", not "+100%": percentageChange returns 0
    // for previous <= 0, so quiet channels don't fire spurious spike alerts.
    const previous = previousRow?.total || 0;

    return percentageChange(current, previous);
}

async function checkTokenTrend(rule, now) {
    const { currentStart, endTime, previousStart } = resolveAlertStatsWindow(rule, now);
    const scope = [];
    const params = [];

    if (rule.type === 'channel') {
        scope.push(' AND channel_id = ?');
        params.push(rule.target);
    } else if (rule.type === 'model') {
        scope.push(' AND model_name = ?');
        params.push(rule.target);
    }

    const expression = 'CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens';
    const currentRow = await db.getAsync(
        `SELECT SUM(${expression}) as total FROM stats WHERE hour >= ? AND hour < ?${scope.join('')}`,
        [currentStart, endTime, ...params]
    );
    const previousRow = await db.getAsync(
        `SELECT SUM(${expression}) as total FROM stats WHERE hour >= ? AND hour < ?${scope.join('')}`,
        [previousStart, currentStart, ...params]
    );

    return percentageChange(currentRow?.total || 0, previousRow?.total || 0);
}

async function checkCacheHitDrop(rule, now) {
    const { currentStart, endTime, previousStart } = resolveAlertStatsWindow(rule, now);
    const scope = [];
    const params = [];

    if (rule.type === 'channel') {
        scope.push(' AND channel_id = ?');
        params.push(rule.target);
    } else if (rule.type === 'model') {
        scope.push(' AND model_name = ?');
        params.push(rule.target);
    }

    const inputExpression = 'CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END';
    const select = `SUM(cache_hit_tokens) as cache_hit, SUM(${inputExpression}) as input`;
    const currentRow = await db.getAsync(
        `SELECT ${select} FROM stats WHERE hour >= ? AND hour < ?${scope.join('')}`,
        [currentStart, endTime, ...params]
    );
    const previousRow = await db.getAsync(
        `SELECT ${select} FROM stats WHERE hour >= ? AND hour < ?${scope.join('')}`,
        [previousStart, currentStart, ...params]
    );

    return cacheHitDropPercentage(
        currentRow?.cache_hit || 0,
        currentRow?.input || 0,
        previousRow?.cache_hit || 0,
        previousRow?.input || 0
    );
}

async function checkLargeRequest(rule, now) {
    const { startTime } = resolveAlertPeriod(rule, now);
    const where = {
        createdAt: { gte: BigInt(Math.floor(startTime)) },
        type: 2
    };
    if (rule.type === 'channel') {
        where.channelId = Number(rule.target);
    } else if (rule.type === 'model') {
        where.modelName = rule.target;
    }

    const logs = await prisma.log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5000,
        select: { promptTokens: true, completionTokens: true, other: true }
    });
    return logs.reduce((max, log) => Math.max(max, metricsFromLog(log).throughputTokens), 0);
}

async function checkMultiKeyImbalance(rule, now) {
    if (rule.type !== 'channel' || !rule.target) {
        return 0;
    }
    const { currentStart, endTime } = resolveAlertStatsWindow(rule, now);
    const rows = await db.allAsync(
        `SELECT key_index,
                SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as throughput_total
         FROM key_stats
         WHERE channel_id = ? AND hour >= ? AND hour < ?
         GROUP BY key_index`,
        [Number(rule.target), currentStart, endTime]
    );
    return maxSharePercentage(rows.map((row) => row.throughput_total));
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

// Evaluate one alert rule. All user-derived strings interpolated into the
// Telegram message are escaped here (a raw `*`/`_`/backtick/`[` makes Telegram
// reject the whole notification with 400).
async function evaluateAlertRule(alertType, rule, now) {
    switch (alertType) {
        case ALERT_TYPES.TOKEN_USAGE: {
            const currentValue = await checkTokenUsage(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `Token 用量 ${currentValue.toLocaleString()} 超过阈值 ${rule.threshold.toLocaleString()}`
            };
        }

        case ALERT_TYPES.ERROR_RATE: {
            const currentValue = await checkErrorRate(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `错误率 ${currentValue.toFixed(2)}% 超过阈值 ${rule.threshold}%`
            };
        }

        case ALERT_TYPES.LATENCY: {
            const currentValue = await checkLatency(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `平均延迟 ${currentValue}ms 超过阈值 ${rule.threshold}ms`
            };
        }

        case ALERT_TYPES.CHANNEL_DOWN: {
            const downChannels = await checkChannelDown();
            return {
                triggered: downChannels.length > 0,
                currentValue: downChannels.length,
                message: `${downChannels.length} 个渠道异常: ${downChannels.map(c => escapeTelegramMarkdown(c.name)).join(', ')}`
            };
        }

        case ALERT_TYPES.QUOTA_LOW: {
            const lowQuotaTokens = await checkQuotaLow(rule.threshold);
            return {
                triggered: lowQuotaTokens.length > 0,
                currentValue: lowQuotaTokens.length,
                message: `${lowQuotaTokens.length} 个 Token 额度不足: ${lowQuotaTokens.map(t => `${escapeTelegramMarkdown(t.name)}(${t.remainQuota})`).join(', ')}`
            };
        }

        case ALERT_TYPES.BALANCE_LOW: {
            const lowBalanceChannels = await checkBalanceLow(rule.threshold);
            // Truncate the channel list: balance strings are long and
            // Telegram rejects messages over 4096 chars.
            const shown = lowBalanceChannels.slice(0, 10)
                .map(c => `${escapeTelegramMarkdown(c.name)}($${Number(c.balance).toFixed(2)})`).join(', ');
            const more = lowBalanceChannels.length > 10
                ? ` 等 ${lowBalanceChannels.length} 个` : '';
            return {
                triggered: lowBalanceChannels.length > 0,
                currentValue: lowBalanceChannels.length,
                message: `${lowBalanceChannels.length} 个渠道余额低于 ${rule.threshold} 美元: ${shown}${more}`
            };
        }

        case ALERT_TYPES.REQUEST_SPIKE: {
            const currentValue = await checkRequestSpike(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `请求量增长 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`
            };
        }

        case ALERT_TYPES.TOKEN_SPIKE: {
            const currentValue = await checkTokenTrend(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `Token 用量增长 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`
            };
        }

        case ALERT_TYPES.TOKEN_DROP: {
            const currentValue = Math.max(0, -(await checkTokenTrend(rule, now)));
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `Token 用量下降 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`
            };
        }

        case ALERT_TYPES.CACHE_HIT_DROP: {
            const currentValue = await checkCacheHitDrop(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `缓存命中率下降 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`
            };
        }

        case ALERT_TYPES.LARGE_REQUEST: {
            const currentValue = await checkLargeRequest(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `单请求吞吐 Token ${currentValue.toLocaleString()} 超过阈值 ${rule.threshold.toLocaleString()}`
            };
        }

        case ALERT_TYPES.MULTI_KEY_IMBALANCE: {
            const currentValue = await checkMultiKeyImbalance(rule, now);
            return {
                triggered: currentValue > rule.threshold,
                currentValue,
                message: `多 Key 最大 Token 占比 ${currentValue.toFixed(1)}% 超过阈值 ${rule.threshold}%`
            };
        }

        default: {
            // Unknown alertType: a future rule type was added without wiring here.
            // Warn loudly so the missing case is caught in dev, and skip the
            // check — falling through to token_usage semantics would risk firing
            // bogus alerts from stale rule JSON.
            console.warn('[ALERT] Unknown alertType on rule:', rule);
            return { triggered: false, currentValue: 0, message: 'unknown alertType' };
        }
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

            // 检查时间窗口（支持 22:00-06:00 这类跨午夜时段）
            if (alert.start_time && alert.end_time
                && !isWithinAlertWindow(alert.start_time, alert.end_time, nowDate)) {
                console.log(`[ALERT CHECK] ⏭️ Skipped: outside time window`);
                continue;
            }

            const alertType = rule.alertType || ALERT_TYPES.TOKEN_USAGE;

            // Evaluate in isolation: one malformed rule (e.g. a missing
            // threshold) must not abort the remaining alerts on this tick.
            let evaluation;
            try {
                evaluation = await evaluateAlertRule(alertType, rule, now);
            } catch (error) {
                console.error(`[ALERT] Rule evaluation failed for alert ${alert.id} (${alert.name}):`, error.message);
                continue;
            }
            const { triggered, currentValue, message } = evaluation;

            console.log(`[ALERT CHECK] Value: ${currentValue}, Threshold: ${rule.threshold}, Triggered: ${triggered}`);

            if (!triggered) continue;

            const lastTriggered = alert.last_triggered || 0;
            const cooldownMs = 3600000; // 1 小时冷却

            if (Date.now() - lastTriggered <= cooldownMs) {
                console.log(`[ALERT] ${alert.name} in cooldown. Last: ${new Date(lastTriggered).toLocaleString()}`);
                continue;
            }

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

            const targetInfo = rule.type === 'channel' ? `渠道 ${escapeTelegramMarkdown(rule.target)}` :
                               rule.type === 'model' ? `模型 ${escapeTelegramMarkdown(rule.target)}` : '全局';

            const fullMessage = `*规则:* ${escapeTelegramMarkdown(alert.name)}\n` +
                `*类型:* ${alertType}\n` +
                `*目标:* ${targetInfo}\n` +
                `*当前值:* ${typeof currentValue === 'number' ? currentValue.toLocaleString() : escapeTelegramMarkdown(currentValue)}\n` +
                `*阈值:* ${rule.threshold !== undefined && rule.threshold !== null ? rule.threshold.toLocaleString() : '-'}\n` +
                `*详情:* ${message}` +
                actionResult;

            console.log(`[ALERT] 🚨 ${alert.name} triggered!`);

            // 先发送，成功后才写状态与历史：以前发送失败也会消耗 1 小时冷却，
            // 通知直接丢失；现在下一轮检查会重试。
            const sent = alert.notify_telegram
                ? await notifier.sendTelegram("Token Monitor 告警", fullMessage)
                : true;

            if (!sent) {
                console.error(`[ALERT] Notification failed for "${alert.name}"; will retry next check`);
                continue;
            }

            // 更新告警状态
            await db.runAsync(
                "UPDATE alerts SET last_triggered = ?, last_value = ?, trigger_count = trigger_count + 1 WHERE id = ?",
                [Date.now(), currentValue, alert.id]
            );

            // 记录历史
            await recordAlertHistory(alert.id, alert.name, currentValue, rule.threshold, message, actionTaken);
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

// ==================== 每日用量摘要 ====================
const DAILY_DIGEST_DAY_KEY = 'last_daily_digest_day';

function compactNumber(value) {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
}

// Pure message builder so the digest content is unit-testable. stats shape:
// { totals: {requests, errors, throughput, quota}, topModels: [...],
//   topChannels: [...], alertCount, dayLabel }
function buildDailyDigestMessage(stats) {
    const { totals, topModels, topChannels, alertCount, dayLabel } = stats;
    const requests = totals.requests || 0;
    const errors = totals.errors || 0;
    const errorRate = requests > 0 ? (errors / requests * 100).toFixed(2) : '0.00';
    const cost = (totals.quota || 0) / QUOTA_PER_UNIT;

    const lines = [
        `📊 *每日用量报告* (${dayLabel})`,
        '',
        `*请求:* ${requests.toLocaleString()} (错误 ${errors.toLocaleString()} · ${errorRate}%)`,
        `*吞吐:* ${compactNumber(totals.throughput)} tokens`,
        `*费用:* $${cost.toFixed(2)}`,
    ];

    if (topModels.length > 0) {
        lines.push('', '*Top 模型*');
        topModels.forEach((m, i) => {
            lines.push(`${i + 1}. ${escapeTelegramMarkdown(m.model_name)} — ${compactNumber(m.tokens)} (${compactNumber(m.requests)} 请求)`);
        });
    }
    if (topChannels.length > 0) {
        lines.push('', '*Top 渠道*');
        topChannels.forEach((c, i) => {
            lines.push(`${i + 1}. ${escapeTelegramMarkdown(c.channel_name)} — ${compactNumber(c.tokens)}`);
        });
    }
    if (alertCount > 0) {
        lines.push('', `🚨 告警触发 ${alertCount} 次`);
    }

    return lines.join('\n');
}

// Send a Telegram digest for "yesterday" (server-local natural day). Checked
// every scheduler tick; the reported day is persisted in meta so it is sent
// exactly once even across restarts. Skips silently when Telegram is not
// configured.
async function maybeSendDailyDigest(nowMs = Date.now()) {
    if (!notifier.telegramToken || !notifier.telegramChatId) {
        return { skipped: true, reason: 'telegram_not_configured' };
    }

    const todayStart = new Date(nowMs);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStartMs = todayStart.getTime() - 24 * 3600 * 1000;
    // Label + dedup key use the SERVER-LOCAL calendar day (matching the stats
    // window below), not the UTC ISO date which shifts for UTC+ timezones.
    const reported = new Date(yesterdayStartMs);
    const dayKey = `${reported.getFullYear()}-${String(reported.getMonth() + 1).padStart(2, '0')}-${String(reported.getDate()).padStart(2, '0')}`;

    const lastSent = await getMeta(DAILY_DIGEST_DAY_KEY);
    if (lastSent === dayKey) {
        return { skipped: true, reason: 'already_sent' };
    }
    // Wait a few minutes past midnight so logs written just before the
    // boundary get a chance to be synced into stats.
    if (nowMs < todayStart.getTime() + 5 * 60 * 1000) {
        return { skipped: true, reason: 'too_close_to_midnight' };
    }

    const startTs = Math.floor(yesterdayStartMs / 1000);
    const endTs = Math.floor(todayStart.getTime() / 1000) - 1;

    const totalsRow = await db.getAsync(
        `SELECT SUM(request_count) as requests,
                SUM(error_count) as errors,
                SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as throughput,
                SUM(quota) as quota
         FROM stats WHERE hour >= ? AND hour <= ?`,
        [startTs, endTs]
    );
    const topModels = await db.allAsync(
        `SELECT model_name,
                SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as tokens,
                SUM(request_count) as requests
         FROM stats WHERE hour >= ? AND hour <= ?
         GROUP BY model_name ORDER BY tokens DESC LIMIT 5`,
        [startTs, endTs]
    );
    const topChannelRows = await db.allAsync(
        `SELECT channel_id,
                SUM(CASE WHEN total_input_tokens > 0 THEN total_input_tokens ELSE prompt_tokens END + completion_tokens) as tokens
         FROM stats WHERE hour >= ? AND hour <= ?
         GROUP BY channel_id ORDER BY tokens DESC LIMIT 5`,
        [startTs, endTs]
    );
    const alertRow = await db.getAsync(
        "SELECT COUNT(*) as n FROM alert_history WHERE triggered_at >= ? AND triggered_at <= ?",
        [startTs, endTs]
    );

    let topChannels = topChannelRows.map(r => ({ channel_id: r.channel_id, channel_name: `渠道 ${r.channel_id}`, tokens: r.tokens }));
    const channelIds = topChannelRows.map(r => r.channel_id).filter(id => id !== undefined && id !== null);
    if (channelIds.length > 0) {
        try {
            const channels = await prisma.channel.findMany({
                where: { id: { in: channelIds } },
                select: { id: true, name: true }
            });
            const nameMap = Object.fromEntries(channels.map(c => [c.id, c.name]));
            topChannels = topChannels.map(c => ({
                ...c,
                channel_name: nameMap[c.channel_id] ?? c.channel_name
            }));
        } catch (error) {
            console.error('[DIGEST] Channel name lookup failed:', error.message);
        }
    }

    const message = buildDailyDigestMessage({
        totals: totalsRow || {},
        topModels,
        topChannels,
        alertCount: alertRow?.n || 0,
        dayLabel: dayKey
    });

    const sent = await notifier.sendTelegram('Token Monitor 每日报告', message);
    if (sent) {
        await setMeta(DAILY_DIGEST_DAY_KEY, dayKey);
    }
    return { skipped: false, sent, dayKey };
}

// ==================== 同步健康自监控 ====================
// In-memory cooldown so a persistently broken pipeline notifies once per
// window instead of every check tick. Resets on restart, which is fine: the
// failure counters reset with it.
const SYNC_HEALTH_COOLDOWN_MS = 6 * 3600 * 1000;
const syncHealthMemory = { lastNotifyAt: 0 };

// Pure: returns a notification message when the sync pipeline looks
// unhealthy, or null when everything is fine.
function buildSyncHealthMessage(state = {}, thresholds = {}) {
    const failureThreshold = thresholds.failureThreshold ?? 3;
    const backlogThreshold = thresholds.backlogThreshold ?? 10000;
    const issues = [];

    const failures = state.consecutiveFailures || 0;
    if (failures >= failureThreshold) {
        issues.push(`日志同步连续失败 ${failures} 次: ${escapeTelegramMarkdown(state.lastError || '未知错误')}`);
    }
    const backlog = state.estimatedBacklog || 0;
    if (backlog > backlogThreshold) {
        issues.push(`日志同步积压约 ${Number(backlog).toLocaleString()} 条（已同步水位 ${state.lastSyncedId ?? 0}）`);
    }

    if (issues.length === 0) return null;
    return '⚠️ *同步健康告警*\n\n' + issues.join('\n');
}

async function maybeCheckSyncHealth(syncState = {}, nowMs = Date.now()) {
    const message = buildSyncHealthMessage(syncState, {
        failureThreshold: parseInt(process.env.SYNC_FAILURE_ALERT_THRESHOLD, 10) || 3,
        backlogThreshold: parseInt(process.env.SYNC_BACKLOG_ALERT_THRESHOLD, 10) || 10000
    });
    if (!message) {
        return { skipped: true, reason: 'healthy' };
    }
    if (nowMs - syncHealthMemory.lastNotifyAt < SYNC_HEALTH_COOLDOWN_MS) {
        return { skipped: true, reason: 'cooldown' };
    }
    syncHealthMemory.lastNotifyAt = nowMs;

    console.warn('[SYNC-HEALTH]', message.replace(/\*/g, ''));
    await notifier.sendTelegram('Token Monitor 同步健康', message);

    // Audit trail using the alert_id=0 convention (same as key status changes).
    try {
        await db.runAsync(
            `INSERT INTO alert_history (alert_id, alert_name, triggered_at, value, threshold, message, action_taken)
             VALUES (0, '同步健康', ?, ?, ?, ?, 'notify')`,
            [Math.floor(nowMs / 1000), syncState.consecutiveFailures || 0, 0, message]
        );
    } catch (error) {
        console.error('[SYNC-HEALTH] alert_history insert error:', error.message);
    }
    return { skipped: false };
}

module.exports = {
    checkAlerts,
    getAlertHistory,
    ALERT_TYPES,
    disableChannel,
    percentageChange,
    cacheHitDropPercentage,
    maxSharePercentage,
    resolveAlertPeriod,
    resolveAlertStatsWindow,
    buildDailyDigestMessage,
    maybeSendDailyDigest,
    buildSyncHealthMessage,
    maybeCheckSyncHealth,
    escapeTelegramMarkdown,
    isWithinAlertWindow
};
