const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'monitor.db');
const db = new sqlite3.Database(dbPath);

function initDB() {
    db.serialize(() => {
        // Meta table for storing last synced ID
        db.run(`CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // Stats table for aggregated token usage
        // Grouped by channel, model, and hour
        db.run(`CREATE TABLE IF NOT EXISTS stats (
            channel_id INTEGER,
            model_name TEXT,
            hour INTEGER,
            tokens INTEGER,
            request_count INTEGER DEFAULT 0,
            PRIMARY KEY (channel_id, model_name, hour)
        )`);

        // Alerts table
        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            rule TEXT,
            enabled INTEGER DEFAULT 1,
            start_time TEXT DEFAULT '00:00',
            end_time TEXT DEFAULT '23:59',
            notify_telegram INTEGER DEFAULT 0,
            last_triggered INTEGER DEFAULT 0,
            trigger_action TEXT DEFAULT 'notify'
        )`);

        // Migration: Add new columns if they don't exist
        db.all("PRAGMA table_info(alerts)", (err, columns) => {
            if (!err) {
                const columnNames = columns.map(col => col.name);

                if (!columnNames.includes('start_time')) {
                    db.run("ALTER TABLE alerts ADD COLUMN start_time TEXT DEFAULT '00:00'");
                }
                if (!columnNames.includes('end_time')) {
                    db.run("ALTER TABLE alerts ADD COLUMN end_time TEXT DEFAULT '23:59'");
                }
                if (!columnNames.includes('notify_telegram')) {
                    db.run("ALTER TABLE alerts ADD COLUMN notify_telegram INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('notify_feishu')) {
                    db.run("ALTER TABLE alerts ADD COLUMN notify_feishu INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('notify_wecom')) {
                    db.run("ALTER TABLE alerts ADD COLUMN notify_wecom INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('last_triggered')) {
                    db.run("ALTER TABLE alerts ADD COLUMN last_triggered INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('trigger_action')) {
                    db.run("ALTER TABLE alerts ADD COLUMN trigger_action TEXT DEFAULT 'notify'");
                }
            }
        });
    });
}

initDB();

module.exports = db;
