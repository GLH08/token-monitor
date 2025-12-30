/**
 * 模型状态监控服务
 * 提供滑动窗口的模型成功率监控
 */

const { prisma } = require('./syncer');

// 日志类型
const LOG_TYPE_CONSUME = 2;  // 成功
const LOG_TYPE_ERROR = 5;    // 失败

// 时间窗口配置: { 总秒数, 槽位数, 每槽秒数 }
const TIME_WINDOWS = {
    '1h': { totalSeconds: 3600, numSlots: 12, slotSeconds: 300 },      // 1小时, 12槽, 5分钟/槽
    '6h': { totalSeconds: 21600, numSlots: 24, slotSeconds: 900 },     // 6小时, 24槽, 15分钟/槽
    '12h': { totalSeconds: 43200, numSlots: 24, slotSeconds: 1800 },   // 12小时, 24槽, 30分钟/槽
    '24h': { totalSeconds: 86400, numSlots: 24, slotSeconds: 3600 },   // 24小时, 24槽, 1小时/槽
};

// 缓存
const cache = new Map();
const CACHE_TTL = 30000; // 30秒缓存

/**
 * 获取状态颜色
 */
function getStatusColor(successRate, totalRequests) {
    if (totalRequests === 0) return 'green';
    if (successRate >= 95) return 'green';
    if (successRate >= 80) return 'yellow';
    return 'red';
}

/**
 * 获取可用模型列表（从日志中提取活跃模型）
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

        // 从日志中获取24小时内活跃的模型
        const models = await prisma.log.groupBy({
            by: ['modelName'],
            where: {
                createdAt: { gte: dayAgo },
                type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] },
                modelName: { not: '' }
            },
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } }
        });

        const result = models.map(m => ({
            model_name: m.modelName,
            request_count_24h: m._count.id
        }));

        cache.set(cacheKey, { data: result, time: Date.now() });
        return result;
    } catch (error) {
        console.error('[ModelStatus] getAvailableModels error:', error.message);
        return [];
    }
}

/**
 * 获取单个模型的状态
 */
async function getModelStatus(modelName, timeWindow = '24h') {
    const config = TIME_WINDOWS[timeWindow] || TIME_WINDOWS['24h'];
    const cacheKey = `model_status:${modelName}:${timeWindow}`;
    
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const windowStart = now - config.totalSeconds;

        // 查询该模型在时间窗口内的日志
        const logs = await prisma.log.findMany({
            where: {
                modelName: modelName,
                createdAt: { gte: windowStart, lt: now },
                type: { in: [LOG_TYPE_CONSUME, LOG_TYPE_ERROR] }
            },
            select: {
                createdAt: true,
                type: true
            }
        });

        // 初始化所有槽位
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
                success_rate: 100,
                status: 'green'
            });
        }

        // 填充数据
        let totalRequests = 0;
        let totalSuccess = 0;

        logs.forEach(log => {
            const ts = Number(log.createdAt);
            const slotIndex = Math.floor((ts - windowStart) / config.slotSeconds);
            
            if (slotIndex >= 0 && slotIndex < config.numSlots) {
                slots[slotIndex].total_requests++;
                totalRequests++;
                
                if (log.type === LOG_TYPE_CONSUME) {
                    slots[slotIndex].success_count++;
                    totalSuccess++;
                }
            }
        });

        // 计算每个槽位的成功率和状态
        slots.forEach(slot => {
            if (slot.total_requests > 0) {
                slot.success_rate = parseFloat((slot.success_count / slot.total_requests * 100).toFixed(2));
            }
            slot.status = getStatusColor(slot.success_rate, slot.total_requests);
        });

        const overallRate = totalRequests > 0 ? parseFloat((totalSuccess / totalRequests * 100).toFixed(2)) : 100;

        const result = {
            model_name: modelName,
            display_name: modelName,
            time_window: timeWindow,
            total_requests: totalRequests,
            success_count: totalSuccess,
            success_rate: overallRate,
            current_status: getStatusColor(overallRate, totalRequests),
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
async function getMultipleModelsStatus(modelNames, timeWindow = '24h') {
    const results = await Promise.all(
        modelNames.map(name => getModelStatus(name, timeWindow))
    );
    return results.filter(r => r !== null);
}

/**
 * 获取所有活跃模型的状态概览
 */
async function getAllModelsStatusOverview(timeWindow = '24h') {
    const models = await getAvailableModels();
    const topModels = models.slice(0, 20); // 只取前20个活跃模型
    
    const statuses = await getMultipleModelsStatus(
        topModels.map(m => m.model_name),
        timeWindow
    );

    // 按状态分组统计
    const statusCount = { green: 0, yellow: 0, red: 0 };
    statuses.forEach(s => {
        statusCount[s.current_status]++;
    });

    return {
        models: statuses,
        summary: {
            total: statuses.length,
            healthy: statusCount.green,
            warning: statusCount.yellow,
            critical: statusCount.red
        },
        time_window: timeWindow,
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
