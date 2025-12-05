// 检查logs表中今日渠道31的实际数据（使用北京时间）
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLogs() {
    // 使用UTC+8时区计算今日00:00
    const now = new Date();
    const chinaOffset = 8 * 3600 * 1000; // UTC+8
    const todayChina = new Date(now.getTime() + chinaOffset);
    todayChina.setUTCHours(0, 0, 0, 0);
    const startOfDay = Math.floor((todayChina.getTime() - chinaOffset) / 1000);

    console.log('=== 检查New API的logs表（北京时间） ===');
    console.log(`北京时间今日00:00的UTC时间戳: ${startOfDay}`);
    console.log(`对应UTC时间: ${new Date(startOfDay * 1000).toISOString()}`);
    console.log(`对应北京时间: ${new Date((startOfDay + 8 * 3600) * 1000).toISOString().replace('Z', '+08:00')}`);
    console.log(`当前UTC时间戳: ${Math.floor(Date.now() / 1000)}\n`);

    // 查询今日渠道31的所有日志
    const logs = await prisma.log.findMany({
        where: {
            channelId: 31,
            createdAt: {
                gte: BigInt(startOfDay)
            }
        },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true,
            createdAt: true,
            modelName: true,
            promptTokens: true,
            completionTokens: true
        }
    });

    console.log(`找到 ${logs.length} 条今日渠道31的日志记录\n`);

    // 按小时聚合
    const hourlyStats = {};
    let totalTokens = 0;

    logs.forEach(log => {
        const timestamp = Number(log.createdAt);
        const hour = Math.floor(timestamp / 3600) * 3600;
        // 转换为北京时间显示
        const hourDate = new Date((hour + 8 * 3600) * 1000);
        const hourKey = hourDate.toISOString().substring(0, 13).replace('T', ' ');

        if (!hourlyStats[hourKey]) {
            hourlyStats[hourKey] = { tokens: 0, count: 0 };
        }

        const tokens = (log.promptTokens || 0) + (log.completionTokens || 0);
        hourlyStats[hourKey].tokens += tokens;
        hourlyStats[hourKey].count++;
        totalTokens += tokens;
    });

    console.log('按小时统计（北京时间）:');
    Object.keys(hourlyStats).sort().forEach(hour => {
        const stat = hourlyStats[hour];
        console.log(`  ${hour}:00 - ${stat.tokens.toLocaleString()} tokens (${stat.count} 条记录)`);
    });

    console.log(`\n今日总计: ${totalTokens.toLocaleString()} tokens`);

    await prisma.$disconnect();
}

checkLogs().catch(console.error);
