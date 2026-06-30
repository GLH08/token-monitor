#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();

const { syncLogs, getSyncState, prisma } = require('../syncer');

async function main() {
    const maxRuns = Number.parseInt(process.argv[2] || '200', 10);
    for (let i = 0; i < maxRuns; i += 1) {
        const result = await syncLogs();
        const state = getSyncState();
        console.log(`[SYNC] run=${i + 1} processed=${result.processedLogs} backlog=${result.estimatedBacklog}`);
        if (result.estimatedBacklog === 0 && result.processedLogs === 0) {
            break;
        }
        if (state.lastError) {
            throw new Error(state.lastError);
        }
    }
    console.log(JSON.stringify(getSyncState(), null, 2));
    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error(error);
    try {
        await prisma.$disconnect();
    } catch {}
    process.exit(1);
});