#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { prisma } = require('../syncer');
const { metricsFromLog } = require('../tokenMetrics');

async function main() {
    const model = process.argv[2] || 'MiniMax-M3';
    const hours = Number.parseInt(process.argv[3] || '168', 10);
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - hours * 3600;

    const logs = await prisma.log.findMany({
        where: {
            type: 2,
            modelName: model,
            createdAt: { gte: startTs, lte: endTs }
        },
        select: { promptTokens: true, completionTokens: true, other: true }
    });

    const rollup = logs.reduce((acc, log) => {
        const metrics = metricsFromLog(log);
        acc.prompt_tokens += metrics.promptTokens;
        acc.completion_tokens += metrics.completionTokens;
        acc.cache_hit_tokens += metrics.cacheHitTokens;
        acc.tokens += metrics.tokens;
        acc.net_input_tokens += metrics.netInputTokens;
        acc.throughput_total += metrics.throughputTotal;
        return acc;
    }, {
        prompt_tokens: 0,
        completion_tokens: 0,
        cache_hit_tokens: 0,
        tokens: 0,
        net_input_tokens: 0,
        throughput_total: 0
    });

    const likeModels = await prisma.log.groupBy({
        by: ['modelName'],
        where: {
            type: 2,
            createdAt: { gte: startTs, lte: endTs },
            modelName: { contains: 'MiniMax', mode: 'insensitive' }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
    });

    console.log(JSON.stringify({
        model,
        hours,
        log_count: logs.length,
        rollup,
        minimax_models_in_window: likeModels.map((row) => ({
            model_name: row.modelName,
            count: row._count.id
        }))
    }, null, 2));

    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});