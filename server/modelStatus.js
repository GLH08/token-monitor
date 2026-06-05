/**
 * 模型状态监控服务
 * 提供滑动窗口的模型成功率监控
 * 支持按渠道×模型的细粒度监控
 */

const { prisma } = require('./syncer');
const db = require('./db');

// 日志类型
const LOG_TYPE_CONSUME = 2;  // 成功
const LOG_TYPE_ERROR = 5;    // 失败

// 最大监控模型数（可通过环境变量配置）
const MAX_MONITOR_MODELS = parseInt(process.env.MAX_MONITOR_MODELS) || 50;

// 时间窗口配置: { 总秒数, 槽位数, 每槽秒数 }
const TIME_WINDOWS = {
    '1h': { totalSeconds: 3600, numSlots: 12, slotSeconds: 300 },      // 1小时, 12槽, 5分钟/槽
    '6h': { totalSeconds: 21600, numSlots: 24, slotSeconds: 900 },     // 6小时, 24槽, 15分钟/槽
    '12h': { totalSeconds: 43200, numSlots: 24, slotSeconds: 1800 },   // 12小时, 24槽, 30分钟/槽
    '24h': { totalSeconds: 86400, numSlots: 24, slotSeconds: 3600 },   // 24小时, 24槽, 1小时/槽
};

const STATUS_IDLE = 'gray';
const STATS_SLOT_SECONDS = 3600;

// 缓存
const cache = new Map();
const CACHE_TTL = 30000; // 30秒缓存

/**
 * 获取状态颜色
 */
function getStatusColor(successRate, totalRequests) {
    if (totalRequests === 0) return STATUS_IDLE;
    if (successRate >= 95) return 'green';
    if (successRate >= 80) return 'yellow';
    return 'red';
}

function createEmptySlots(config, windowStart) {
    const slots = [];
    for (let i = 0; i < config.numSlots; i++) {
        const slotStart = windowStart + (i * config.slotSeconds);
        const slotEnd = slotStart + config.slotSeconds;
        slots.push({
            slot: i,
            start_time: slotStart,
            end_time: slotEnd,
            total_requests: 0,
            success_count: 0,
            success_rate: null,
            status: STATUS_IDLE
        });
    }
    return slots;
}

function fillSlots(slots, rows, windowStart, config) {
    let totalRequests = 0;
    let totalSuccess = 0;

    rows.forEach(row => {
        const slotStart = Number(row.slot_start);
        const slotIndex = Math.floor((slotStart - windowStart) / config.slotSeconds);

        if (slotIndex >= 0 && slotIndex < slots.length) {
            const requests = Number(row.total_requests) || 0;
            const success = Number(row.success_count) || 0;
            slots[slotIndex].total_requests += requests;
            slots[slotIndex].success_count += success;
            totalRequests += requests;
            totalSuccess += success;
        }
    });

    slots.forEach(slot => {
        if (slot.total_requests > 0) {
            slot.success_rate = parseFloat((slot.success_count / slot.total_requests * 100).toFixed(2));
        }
        slot.status = getStatusColor(slot.success_rate, slot.total_requests);
    });

    return { totalRequests, totalSuccess };
}

async function fetchStatsSlotRows(modelName, windowStart, now, channelId) {
    let query = `SELECT hour as slot_start, SUM(request_count) as total_requests,
                 SUM(request_count) - SUM(error_count) as success_count,
                 SUM(error_count) as error_count
                 FROM stats WHERE model_name = ? AND hour >= ? AND hour < ?`;
    const params = [modelName, windowStart, now];

    if (channelId) {
        query += ` AND channel_id = ?`;
        params.push(channelId);
    }

    query += ` GROUP BY hour ORDER BY hour ASC`;
    return db.allAsync(query, params);
}

async function fetchLogSlotRows(modelName, windowStart, now, slotSeconds, channelId) {
    const where = {
        modelName,
        createdAt: { gte: windowStart, lt: now },
        type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
    };

    if (channelId) {
        where.channelId = channelId;
    }

    const rows = await prisma.log.groupBy({
        by: ['createdAt', 'type'],
        where,
        _count: { id: true }
    });

    const slotMap = new Map();
    rows.forEach(row => {
        const createdAt = Number(row.createdAt);
        const slotStart = windowStart + Math.floor((createdAt - windowStart) / slotSeconds) * slotSeconds;
        const current = slotMap.get(slotStart) || { slot_start: slotStart, total_requests: 0, success_count: 0, error_count: 0 };
        const count = row._count.id || 0;
        current.total_requests += count;
        if (row.type === LOG_TYPE_ERROR) {
            current.error_count += count;
        } else {
            current.success_count += count;
        }
        slotMap.set(slotStart, current);
    });

    return Array.from(slotMap.values()).sort((a, b) => a.slot_start - b.slot_start);
}

/**
 * 获取可用模型列表
 * 合并两种来源：日志中活跃的模型 + 渠道配置的模型
 */
async function getAvailableModels() {
    const cacheKey = 'available_models';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 300000) { // 5分钟缓存
        return cached.data;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const dayAgo = now - 86400;

        // 来源1: 从日志中获取24小时内活跃的模型
        const activeModels = await prisma.log.groupBy({
            by: ['modelName'],
            where: {
                createdAt: { gte: dayAgo },
                type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] },
                modelName: { not: '' }
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        });

        const activeModelMap = new Map();
        activeModels.forEach(m => {
            activeModelMap.set(m.modelName, m._count.id);
        });

        // 来源2: 从渠道配置中获取全量模型列表
        const channels = await prisma.channel.findMany({
            where: { status: 1 },
            select: { id: true, name: true, models: true }
        });

        const channelModelSet = new Set();
        channels.forEach(ch => {
            if (ch.models) {
                const modelList = ch.models.split(',').map(m => m.trim()).filter(m => m);
                modelList.forEach(m => channelModelSet.add(m));
            }
        });

        // 合并：活跃模型优先，补充渠道配置中的非活跃模型
        const result = [];
        activeModelMap.forEach((count, name) => {
            result.push({
                model_name: name,
                request_count_24h: count,
                is_active: true
            });
        });

        channelModelSet.forEach(name => {
            if (!activeModelMap.has(name)) {
                result.push({
                    model_name: name,
                    request_count_24h: 0,
                    is_active: false
                });
            }
        });

        // 按活跃度排序：有请求的在前，无请求的按名称排序
        result.sort((a, b) => {
            if (a.request_count_24h !== b.request_count_24h) {
                return b.request_count_24h - a.request_count_24h;
            }
            return a.model_name.localeCompare(b.model_name);
        });

        cache.set(cacheKey, { data: result, time: Date.now() });
        return result;
    } catch (error) {
        console.error('[ModelStatus] getAvailableModels error:', error.message);
        return [];
    }
}

/**
 * 获取单个模型的状态（优化版：优先从 stats 聚合表读取）
 * @param {string} modelName - 模型名称
 * @param {string} timeWindow - 时间窗口
 * @param {number|null} channelId - 可选的渠道ID筛选
 */
async function getModelStatus(modelName, timeWindow = '24h', channelId = null) {
    const config = TIME_WINDOWS[timeWindow] || TIME_WINDOWS['24h'];
    const cacheKey = `model_status:${modelName}:${timeWindow}:${channelId || 'all'}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - config.totalSeconds;

        const rows = config.slotSeconds >= STATS_SLOT_SECONDS
            ? await fetchStatsSlotRows(modelName, windowStart, now, channelId)
            : await fetchLogSlotRows(modelName, windowStart, now, config.slotSeconds, channelId);

        const slots = createEmptySlots(config, windowStart);
        const { totalRequests, totalSuccess } = fillSlots(slots, rows, windowStart, config);

        const overallRate = totalRequests > 0 ? parseFloat((totalSuccess / totalRequests * 100).toFixed(2)) : null;

        const result = {
            model_name: modelName,
            display_name: modelName,
            time_window: timeWindow,
            channel_id: channelId,
            total_requests: totalRequests,
            success_count: totalSuccess,
            success_rate: overallRate,
            current_status: getStatusColor(overallRate ?? 0, totalRequests),
            slot_data: slots
        };

        cache.set(cacheKey, { data: result, time: Date.now() });
        return result;
    } catch (error) {
        console.error(`[ModelStatus] getModelStatus error for ${modelName}:`, error.message);
        return null;
    }
}

/**
 * 获取多个模型的状态
 */
async function getMultipleModelsStatus(modelNames, timeWindow = '24h', channelId = null) {
    const results = await Promise.all(
        modelNames.map(name => getModelStatus(name, timeWindow, channelId))
    );
    return results.filter(r => r !== null);
}

/**
 * 获取所有活跃模型的状态概览
 * @param {string} timeWindow - 时间窗口
 * @param {number|null} channelId - 可选的渠道ID筛选
 */
async function getAllModelsStatusOverview(timeWindow = '24h', channelId = null) {
    let models = await getAvailableModels();

    // 如果指定了渠道ID，过滤出该渠道配置的模型
    if (channelId) {
        try {
            const channel = await prisma.channel.findUnique({
                where: { id: channelId },
                select: { models: true }
            });
            if (channel && channel.models) {
                const channelModels = new Set(
                    channel.models.split(',').map(m => m.trim()).filter(m => m)
                );
                models = models.filter(m => channelModels.has(m.model_name));
            }
        } catch (e) {
            console.error('[ModelStatus] Filter by channel error:', e.message);
        }
    }

    // 使用可配置的限制数量
    const topModels = models.slice(0, MAX_MONITOR_MODELS);

    const statuses = await getMultipleModelsStatus(
        topModels.map(m => m.model_name),
        timeWindow,
        channelId
    );

    // 按状态分组统计
    const statusCount = { green: 0, yellow: 0, red: 0, gray: 0 };
    statuses.forEach(s => {
        statusCount[s.current_status]++;
    });

    return {
        models: statuses,
        summary: {
            total: statuses.length,
            healthy: statusCount.green,
            warning: statusCount.yellow,
            critical: statusCount.red,
            idle: statusCount.gray
        },
        time_window: timeWindow,
        channel_id: channelId,
        max_models: MAX_MONITOR_MODELS,
        generated_at: Math.floor(Date.now() / 1000)
    };
}

module.exports = {
    getAvailableModels,
    getModelStatus,
    getMultipleModelsStatus,
    getAllModelsStatusOverview,
    TIME_WINDOWS
};
