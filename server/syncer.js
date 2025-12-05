const { PrismaClient } = require('@prisma/client');
const db = require('./db');

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;

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

async function updateStats(logs) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`
                INSERT INTO stats (channel_id, model_name, hour, tokens, request_count)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(channel_id, model_name, hour)
                DO UPDATE SET 
                    tokens = tokens + excluded.tokens,
                    request_count = request_count + excluded.request_count
            `);

            logs.forEach(log => {
                // Skip if no tokens (e.g. error logs might have 0)
                const totalTokens = (log.promptTokens || 0) + (log.completionTokens || 0);
                // if (totalTokens === 0) return; // Commented out to track requests even with 0 tokens

                // Calculate hour timestamp (floor to hour)
                const timestamp = Number(log.createdAt);
                const hour = Math.floor(timestamp / 3600) * 3600;

                stmt.run(log.channelId, log.modelName, hour, totalTokens, 1);
            });

            stmt.finalize();
            db.run("COMMIT", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

async function syncLogs() {
    try {
        const lastIdStr = await getMeta('last_synced_id');
        let lastId = lastIdStr ? parseInt(lastIdStr) : 0;

        // Fetch new logs
        const logs = await prisma.log.findMany({
            where: {
                id: { gt: lastId }
            },
            take: BATCH_SIZE,
            orderBy: { id: 'asc' }
        });

        if (logs.length === 0) {
            return 0;
        }

        console.log(`Fetched ${logs.length} new logs. Processing...`);

        await updateStats(logs);

        // Update last synced ID
        const newLastId = logs[logs.length - 1].id;
        await setMeta('last_synced_id', newLastId.toString());

        return logs.length;
    } catch (error) {
        console.error("Sync error:", error);
        return 0;
    }
}

module.exports = { syncLogs };
