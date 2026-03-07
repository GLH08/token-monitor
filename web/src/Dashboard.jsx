import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    BarChart,
    Bar,
} from 'recharts';
import { fetchStats, fetchSummary, fetchAnalysis, fetchChannels, fetchModelStatusOverview } from './api';
import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    HeartPulse,
    Clock3,
    TrendingUp,
    Coins,
    DollarSign,
    Gauge,
    ArrowRight,
    Cpu,
    Server,
} from 'lucide-react';
import { EmptyState, LoadingState, PageHeader, PanelCard, StatCard, TIME_RANGE_PRESETS, TimeRangeTabs } from './components/PageUI';
import { useDashboardData } from './hooks/useDashboardData';

const PERIOD_TO_SECONDS = {
    '1h': 3600,
    '6h': 6 * 3600,
    '12h': 12 * 3600,
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
};

const CHART_COLORS = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'];

const formatCompactNumber = (value) => new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000000 ? 1 : 0,
}).format(value || 0);

const formatPercent = (value) => `${(value || 0).toFixed(1)}%`;
const formatCurrency = (value) => `$${(value || 0).toFixed(4)}`;
const formatLatency = (value) => `${Math.round(value || 0)} ms`;

const DashboardTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) {
        return null;
    }

    return (
        <div className="bg-white/95 border border-slate-200 shadow-xl rounded-xl px-4 py-3">
            <div className="text-sm font-semibold text-slate-800 mb-2">{label}</div>
            <div className="space-y-1.5">
                {payload.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-500">{entry.name}</span>
                        <span className="ml-auto font-mono font-semibold text-slate-700">{entry.value?.toLocaleString?.() ?? entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Dashboard = () => {
    const [period, setPeriod] = useState('24h');

    const {
        summary,
        trendData,
        stackedData,
        modelData,
        channelData,
        topModels,
        topChannels,
        stackedKeys,
        loading,
        modelHealth,
        overviewMetrics,
        healthWindow
    } = useDashboardData(period);

    const hasDashboardData = Boolean(
        summary.total_requests
        || trendData.length
        || stackedData.length
        || modelData.length
        || channelData.length
        || modelHealth
    );

    const kpiCards = [
        {
            label: '总请求数',
            value: formatCompactNumber(summary.total_requests || 0),
            icon: TrendingUp,
            iconWrapperClassName: 'bg-cyan-100',
            iconClassName: 'text-cyan-600',
            valueClassName: 'text-cyan-600',
        },
        {
            label: '总 Token',
            value: formatCompactNumber(summary.total_tokens || 0),
            icon: Coins,
            iconWrapperClassName: 'bg-violet-100',
            iconClassName: 'text-violet-600',
            valueClassName: 'text-violet-600',
        },
        {
            label: '总费用',
            value: formatCurrency(summary.total_cost || 0),
            icon: DollarSign,
            iconWrapperClassName: 'bg-emerald-100',
            iconClassName: 'text-emerald-600',
            valueClassName: 'text-emerald-600',
        },
        {
            label: '错误率',
            value: formatPercent(overviewMetrics.errorRate),
            icon: AlertTriangle,
            iconWrapperClassName: 'bg-amber-100',
            iconClassName: 'text-amber-600',
            valueClassName: overviewMetrics.errorRate > 5 ? 'text-red-600' : overviewMetrics.errorRate > 1 ? 'text-amber-600' : 'text-emerald-600',
        },
        {
            label: '平均延迟',
            value: formatLatency(overviewMetrics.avgLatency),
            icon: Gauge,
            iconWrapperClassName: 'bg-slate-100',
            iconClassName: 'text-slate-600',
            valueClassName: 'text-slate-700',
        },
        {
            label: '异常模型',
            value: (modelHealth?.warning || 0) + (modelHealth?.critical || 0),
            icon: HeartPulse,
            iconWrapperClassName: 'bg-rose-100',
            iconClassName: 'text-rose-600',
            valueClassName: 'text-rose-600',
        },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            <PageHeader
                title="数据看板"
                description="聚焦总览指标、趋势变化与异常发现"
                actions={
                    <TimeRangeTabs
                        value={period}
                        onChange={setPeriod}
                        options={TIME_RANGE_PRESETS.dashboard}
                        activeClassName="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/20"
                    />
                }
            />

            {loading && !hasDashboardData ? (
                <LoadingState label="加载看板数据中..." className="h-80" />
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {kpiCards.map((card) => (
                            <StatCard
                                key={card.label}
                                icon={card.icon}
                                iconWrapperClassName={card.iconWrapperClassName}
                                iconClassName={card.iconClassName}
                                value={card.value}
                                label={card.label}
                                valueClassName={card.valueClassName}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                        <PanelCard
                            title="请求 / Token 趋势"
                            description="首页只保留最核心的流量走势，帮助快速发现波动"
                            className="xl:col-span-3"
                            bodyClassName="p-6"
                        >
                            <div className="h-[360px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={8} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <Tooltip content={<DashboardTooltip />} />
                                        <Line type="monotone" dataKey="requests" name="请求数" stroke="#06b6d4" strokeWidth={3} dot={false} />
                                        <Line type="monotone" dataKey="tokens" name="Tokens" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </PanelCard>

                        <PanelCard
                            title="模型消耗分布"
                            description="按时间观察主要模型的资源占用变化"
                            className="xl:col-span-2"
                            bodyClassName="p-6"
                        >
                            <div className="h-[360px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stackedData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={8} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <Tooltip content={<DashboardTooltip />} />
                                        {stackedKeys.map((key, index) => (
                                            <Bar
                                                key={key}
                                                dataKey={key}
                                                stackId="models"
                                                fill={key === 'Others' ? '#cbd5e1' : CHART_COLORS[index % CHART_COLORS.length]}
                                                radius={index === stackedKeys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </PanelCard>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <PanelCard title="模型健康摘要" description="关注异常与无流量模型，详细排查下沉到专题页" bodyClassName="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center">
                                        <HeartPulse className="text-cyan-600" size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800">当前时间范围</div>
                                        <div className="text-xs text-slate-500">{healthWindow === '24h' && period === '30d' ? '模型健康按最近 24 小时统计' : `模型健康按 ${TIME_RANGE_PRESETS.dashboard.find((option) => option.value === healthWindow)?.label || '24 小时'} 统计`}</div>
                                    </div>
                                </div>
                                <Link to="/model-status" className="inline-flex items-center gap-1 text-sm text-cyan-600 hover:underline">
                                    查看详情
                                    <ArrowRight size={14} />
                                </Link>
                            </div>

                            {modelHealth ? (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border bg-slate-50 p-4">
                                        <div className="text-2xl font-bold text-slate-800">{modelHealth.total}</div>
                                        <div className="text-sm text-slate-500">监控模型</div>
                                    </div>
                                    <div className="rounded-xl border bg-emerald-50 p-4">
                                        <div className="flex items-center gap-2 text-emerald-600">
                                            <CheckCircle size={18} />
                                            <span className="text-2xl font-bold">{modelHealth.healthy}</span>
                                        </div>
                                        <div className="text-sm text-emerald-700">健康</div>
                                    </div>
                                    <div className="rounded-xl border bg-amber-50 p-4">
                                        <div className="flex items-center gap-2 text-amber-600">
                                            <AlertTriangle size={18} />
                                            <span className="text-2xl font-bold">{modelHealth.warning}</span>
                                        </div>
                                        <div className="text-sm text-amber-700">警告</div>
                                    </div>
                                    <div className="rounded-xl border bg-red-50 p-4">
                                        <div className="flex items-center gap-2 text-red-600">
                                            <XCircle size={18} />
                                            <span className="text-2xl font-bold">{modelHealth.critical}</span>
                                        </div>
                                        <div className="text-sm text-red-700">异常</div>
                                    </div>
                                    <div className="rounded-xl border bg-slate-50 p-4 col-span-2">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Clock3 size={18} />
                                            <span className="text-2xl font-bold">{modelHealth.idle || 0}</span>
                                        </div>
                                        <div className="text-sm text-slate-600">无流量模型</div>
                                    </div>
                                </div>
                            ) : (
                                <EmptyState title="暂无健康数据" className="py-8" />
                            )}
                        </PanelCard>

                        <PanelCard title="Top 渠道" description="保留最有代表性的渠道消耗排行，详细分析留在专题页" bodyClassName="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                                        <Server className="text-violet-600" size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800">渠道消耗排行</div>
                                        <div className="text-xs text-slate-500">按 Token 排序</div>
                                    </div>
                                </div>
                                <Link to="/channels" className="inline-flex items-center gap-1 text-sm text-violet-600 hover:underline">
                                    渠道页
                                    <ArrowRight size={14} />
                                </Link>
                            </div>

                            {topChannels.length ? (
                                <div className="space-y-4">
                                    {topChannels.map((item) => {
                                        const maxValue = topChannels[0]?.value || 1;
                                        return (
                                            <div key={item.name}>
                                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                                    <span className="text-sm text-slate-700 truncate">{item.name}</span>
                                                    <span className="text-sm font-mono text-slate-500">{formatCompactNumber(item.value)}</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                                                        style={{ width: `${Math.max((item.value / maxValue) * 100, 8)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState title="暂无渠道数据" className="py-8" />
                            )}
                        </PanelCard>

                        <PanelCard title="Top 模型" description="首页只展示最值得关注的模型排名，更多细节在模型页" bodyClassName="p-6">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <Cpu className="text-emerald-600" size={20} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800">模型消耗排行</div>
                                        <div className="text-xs text-slate-500">按 Token 排序</div>
                                    </div>
                                </div>
                                <Link to="/models" className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline">
                                    模型页
                                    <ArrowRight size={14} />
                                </Link>
                            </div>

                            {topModels.length ? (
                                <div className="space-y-4">
                                    {topModels.map((item) => {
                                        const maxValue = topModels[0]?.value || 1;
                                        return (
                                            <div key={item.name}>
                                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                                    <span className="text-sm text-slate-700 truncate">{item.name}</span>
                                                    <span className="text-sm font-mono text-slate-500">{formatCompactNumber(item.value)}</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                                                        style={{ width: `${Math.max((item.value / maxValue) * 100, 8)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState title="暂无模型数据" className="py-8" />
                            )}
                        </PanelCard>
                    </div>
                </>
            )}
        </div>
    );
};

export default Dashboard;
