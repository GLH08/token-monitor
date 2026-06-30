#!/usr/bin/env node
/**
 * Compare SQLite stats aggregates with a direct Prisma rollup for a model/time window.
 *
 * Usage:
 *   node scripts/verify-token-metrics.js --model minimax --hours 168
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const db = require('../db');
const { prisma } = require('../syncer');
const { metricsFromLog } = require('../tokenMetrics');

function parseArgs(argv) {
    const args = { model: '', hours: 168 };
    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === '--model') args.model = argv[i + 1] || '';
        if (argv[i] === '--hours') args.hours = Number.parseInt(argv[i + 1] || '168', 10);
    }
    return args;
}

function rollupLogs(logs) {
    return logs.reduce((acc, log) => {
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
}

async function main() {
    const { model, hours } = parseArgs(process.argv);
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - hours * 3600;
    const startHour = Math.floor(startTs / 3600) * 3600;
    const endHour = Math.floor(endTs / 3600) * 3600;

    const logWhere = {
        type: 2,
        createdAt: { gte: startTs, lte: endTs }
    };
    if (model) logWhere.modelName = model;

    const logs = await prisma.log.findMany({
        where: logWhere,
        select: {
            promptTokens: true,
            completionTokens: true,
            other: true
        }
    });

    const expected = rollupLogs(logs);

    let statsQuery = `
        SELECT
            SUM(prompt_tokens) as prompt_tokens,
            SUM(completion_tokens) as completion_tokens,
            SUM(cache_hit_tokens) as cache_hit_tokens,
            SUM(tokens) as tokens
        FROM stats
        WHERE hour >= ? AND hour <= ?
    `;
    const params = [startHour, endHour];
    if (model) {
        statsQuery += ' AND model_name = ?';
        params.push(model);
    }

    const actualRow = await db.getAsync(statsQuery, params) || {};
    const actual = {
        prompt_tokens: actualRow.prompt_tokens || 0,
        completion_tokens: actualRow.completion_tokens || 0,
        cache_hit_tokens: actualRow.cache_hit_tokens || 0,
        tokens: actualRow.tokens || 0
    };
    actual.net_input_tokens = Math.max(0, actual.prompt_tokens - actual.cache_hit_tokens);
    actual.throughput_total = actual.net_input_tokens + actual.completion_tokens + actual.cache_hit_tokens;

    const fields = ['prompt_tokens', 'completion_tokens', 'cache_hit_tokens', 'tokens', 'net_input_tokens', 'throughput_total'];
    const mismatches = fields.filter((field) => expected[field] !== actual[field]);

    console.log(JSON.stringify({
        model: model || '(all)',
        hours,
        log_count: logs.length,
        expected,
        actual,
        ok: mismatches.length === 0,
        mismatches
    }, null, 2));

    await prisma.$disconnect();
    await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));

    process.exit(mismatches.length === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});