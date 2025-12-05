// 调试脚本：检查告警和统计数据
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'monitor.db');
const db = new sqlite3.Database(dbPath);

console.log('=== 检查告警配置 ===');
db.all('SELECT * FROM alerts', (err, alerts) => {
    if (err) {
        console.error('查询alerts表失败:', err);
        return;
    }
    console.log(`找到 ${alerts.length} 条告警规则:`);
    alerts.forEach(alert => {
        console.log(`\n[${alert.id}] ${alert.name}`);
        console.log(`  规则: ${alert.rule}`);
        console.log(`  启用: ${alert.enabled}`);
        console.log(`  时间窗口: ${alert.start_time} - ${alert.end_time}`);
        console.log(`  通知: Telegram=${alert.notify_telegram}, Feishu=${alert.notify_feishu}, WeCom=${alert.notify_wecom}`);
        console.log(`  动作: ${alert.trigger_action}`);
        console.log(`  上次触发: ${alert.last_triggered ? new Date(alert.last_triggered).toLocaleString() : '从未'}`);
    });
});

console.log('\n=== 检查统计数据（最近10条）===');
db.all('SELECT hour, channel_id, model_name, tokens, datetime(hour, "unixepoch", "localtime") as time FROM stats ORDER BY hour DESC LIMIT 10', (err, stats) => {
    if (err) {
        console.error('查询stats表失败:', err);
        return;
    }
    console.log(`找到 ${stats.length} 条统计记录:`);
    stats.forEach(stat => {
        console.log(`  [${stat.time}] 渠道${stat.channel_id} ${stat.model_name}: ${stat.tokens.toLocaleString()} tokens`);
    });
});

console.log('\n=== 检查今日渠道31的Token使用 ===');
const today = new Date();
today.setHours(0, 0, 0, 0);
const startOfDay = Math.floor(today.getTime() / 1000);

db.get('SELECT SUM(tokens) as total FROM stats WHERE channel_id = 31 AND hour >= ?', [startOfDay], (err, result) => {
    if (err) {
        console.error('查询失败:', err);
        return;
    }
    console.log(`渠道31今日总Token: ${result.total ? result.total.toLocaleString() : 0}`);

    setTimeout(() => db.close(), 1000);
});
