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
        // ==================== Meta 表 ====================
        db.run(`CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // ==================== 统计数据表 ====================
        db.run(`CREATE TABLE IF NOT EXISTS stats (
            channel_id INTEGER,
            model_name TEXT,
            hour INTEGER,
            tokens INTEGER,
            request_count INTEGER DEFAULT 0,
            quota INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            avg_latency INTEGER DEFAULT 0,
            PRIMARY KEY (channel_id, model_name, hour)
        )`);

        // 添加索引
        db.run(`CREATE INDEX IF NOT EXISTS idx_stats_hour ON stats(hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stats_channel_hour ON stats(channel_id, hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_stats_model_hour ON stats(model_name, hour)`);

        // ==================== 用量分析聚合表 ====================
        db.run(`CREATE TABLE IF NOT EXISTS usage_stats (
            hour INTEGER,
            user_group TEXT,
            channel_id INTEGER,
            model_name TEXT,
            token_id INTEGER,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            cache_hit_tokens INTEGER DEFAULT 0,
            tokens INTEGER DEFAULT 0,
            request_count INTEGER DEFAULT 0,
            quota INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            avg_latency INTEGER DEFAULT 0,
            PRIMARY KEY (hour, user_group, channel_id, model_name, token_id)
        )`);

        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_stats_hour ON usage_stats(hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_stats_group_hour ON usage_stats(user_group, hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_stats_channel_hour ON usage_stats(channel_id, hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_stats_model_hour ON usage_stats(model_name, hour)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_usage_stats_token_hour ON usage_stats(token_id, hour)`);
        // Migration: usage_stats 表添加新列
        db.all("PRAGMA table_info(usage_stats)", (err, columns) => {
            if (!err && columns) {
                const columnNames = columns.map(col => col.name);
                if (!columnNames.includes('cache_hit_tokens')) {
                    db.run("ALTER TABLE usage_stats ADD COLUMN cache_hit_tokens INTEGER DEFAULT 0");
                }
            }
        });

        // ==================== 告警规则表 ====================
        db.run(`CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            rule TEXT,
            enabled INTEGER DEFAULT 1,
            start_time TEXT DEFAULT '00:00',
            end_time TEXT DEFAULT '23:59',
            notify_telegram INTEGER DEFAULT 0,
            trigger_action TEXT DEFAULT 'notify',
            last_triggered INTEGER DEFAULT 0,
            last_value REAL DEFAULT 0,
            trigger_count INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT 0
        )`);

        // ==================== 告警历史表 ====================
        db.run(`CREATE TABLE IF NOT EXISTS alert_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alert_id INTEGER,
            alert_name TEXT,
            triggered_at INTEGER,
            value REAL,
            threshold REAL,
            message TEXT,
            action_taken TEXT,
            FOREIGN KEY (alert_id) REFERENCES alerts(id)
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_alert_history_time ON alert_history(triggered_at)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id)`);

        // ==================== 渠道快照表（定期记录渠道状态） ====================
        db.run(`CREATE TABLE IF NOT EXISTS channel_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            status INTEGER,
            response_time INTEGER,
            balance REAL,
            snapshot_time INTEGER
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_channel_snapshot_time ON channel_snapshots(snapshot_time)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_channel_snapshot_channel ON channel_snapshots(channel_id)`);

        // Migration: 添加新列（如果不存在）
        db.all("PRAGMA table_info(alerts)", (err, columns) => {
            if (!err && columns) {
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
                if (!columnNames.includes('last_triggered')) {
                    db.run("ALTER TABLE alerts ADD COLUMN last_triggered INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('trigger_action')) {
                    db.run("ALTER TABLE alerts ADD COLUMN trigger_action TEXT DEFAULT 'notify'");
                }
                if (!columnNames.includes('last_value')) {
                    db.run("ALTER TABLE alerts ADD COLUMN last_value REAL DEFAULT 0");
                }
                if (!columnNames.includes('trigger_count')) {
                    db.run("ALTER TABLE alerts ADD COLUMN trigger_count INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('created_at')) {
                    db.run("ALTER TABLE alerts ADD COLUMN created_at INTEGER DEFAULT 0");
                }
            }
        });

        // Migration: stats 表添加新列
        db.all("PRAGMA table_info(stats)", (err, columns) => {
            if (!err && columns) {
                const columnNames = columns.map(col => col.name);
                if (!columnNames.includes('quota')) {
                    db.run("ALTER TABLE stats ADD COLUMN quota INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('error_count')) {
                    db.run("ALTER TABLE stats ADD COLUMN error_count INTEGER DEFAULT 0");
                }
                if (!columnNames.includes('avg_latency')) {
                    db.run("ALTER TABLE stats ADD COLUMN avg_latency INTEGER DEFAULT 0");
                }
            }
        });
    });
}

initDB();

// ==================== 辅助函数 ====================

// Promise 包装的查询方法
db.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
};

db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

module.exports = db;
