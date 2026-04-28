import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchLatencyAnalysis } from './api';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Clock, AlertTriangle, Zap, RefreshCw } from 'lucide-react';
import { EmptyState, LoadingState, PageHeader, PanelCard, StatCard, TIME_RANGE_PRESETS, TimeRangeTabs } from './components/PageUI';

const formatCompactNumber = (value) => new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1000000 ? 1 : 0,
}).format(value || 0);

const formatLatency = (value) => `${Math.round(value || 0)} s`;

const getSummaryValue = (value, isUnavailable = false) => (isUnavailable ? '—' : value);

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) {
        return null;
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl">
            <div className="mb-2 text-sm font-semibold text-slate-800">{label}</div>
            <div className="space-y-1.5">
                {payload.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-500">{entry.name}</span>
                        <span className="ml-auto font-mono font-semibold text-slate-700">
                            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                            {entry.unit || ''}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const chartConfig = {
    rpm: {
        title: '请求量趋势',
        description: '观察单位时间内请求量变化，快速定位峰值时段。',
        icon: Activity,
        stroke: '#3b82f6',
        gradientId: 'colorRpm',
        label: 'Requests',
        dataKey: 'rpm',
    },
    tpm: {
        title: 'Token 消耗趋势',
        description: '识别 Token 消耗波动与流量结构变化。',
        icon: Zap,
        stroke: '#f59e0b',
        gradientId: 'colorTpm',
        label: 'Tokens',
        dataKey: 'tpm',
    },
    avg_latency: {
        title: '平均延迟趋势',
        description: '用于定位整体响应性能劣化的时间窗口。',
        icon: Clock,
        stroke: '#8b5cf6',
        gradientId: 'colorLatency',
        label: 'Latency',
        dataKey: 'avg_latency',
        unit: ' s',
    },
};

const Performance = () => {
    const [data, setData] = useState({ latency_trend: [], slow_requests: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [refreshError, setRefreshError] = useState('');
    const [period, setPeriod] = useState(24);
    const requestIdRef = useRef(0);

    const loadData = useCallback(async ({ silent = false } = {}) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;

        if (silent) {
            setRefreshing(true);
            setRefreshError('');
        } else {
            setLoading(true);
            setLoadError('');
        }

        try {
            const end = Math.floor(Date.now() / 1000);
            const start = end - (period * 3600);
            const result = await fetchLatencyAnalysis(start, end);

            if (!result || typeof result !== 'object' || result.error) {
                throw new Error(result?.error || 'Failed to load performance data');
            }

            if (requestIdRef.current !== requestId) {
                return false;
            }

            const nextData = {
                latency_trend: Array.isArray(result.latency_trend) ? result.latency_trend : [],
                slow_requests: Array.isArray(result.slow_requests) ? result.slow_requests : [],
            };

            setData(nextData);
            setLoadError('');
            setRefreshError('');
            return true;
        } catch (error) {
            if (requestIdRef.current !== requestId) {
                return false;
            }

            console.error('Failed to load performance data:', error);
            if (silent) {
                setRefreshError(error.message || '刷新性能数据失败');
            } else {
                setData({ latency_trend: [], slow_requests: [] });
                setLoadError(error.message || '加载性能数据失败');
            }
            return false;
        } finally {
            if (requestIdRef.current === requestId) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [period]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const summary = useMemo(() => {
        const trend = data.latency_trend || [];
        const slowRequests = data.slow_requests || [];
        const totalRequests = trend.reduce((sum, item) => sum + (item.rpm || 0), 0);
        const totalTokens = trend.reduce((sum, item) => sum + (item.tpm || 0), 0);
        const weightedLatency = trend.reduce((sum, item) => sum + ((item.avg_latency || 0) * (item.rpm || 0)), 0);
        const averageLatency = totalRequests > 0 ? weightedLatency / totalRequests : 0;
        const maxLatency = slowRequests.reduce((max, item) => Math.max(max, item.useTime || 0), 0);

        return {
            totalRequests,
            totalTokens,
            averageLatency,
            topSlowEntries: slowRequests.length,
            maxLatency,
        };
    }, [data]);

    const metricsUnavailable = loading || Boolean(loadError);
    const chartItems = Object.values(chartConfig);

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Activity}
                iconClassName="from-violet-500 to-purple-600"
                title="性能分析"
                description="追踪请求量、Token 消耗、平均延迟和慢请求"
                actions={(
                    <>
                        <button
                            type="button"
                            onClick={() => loadData({ silent: !loadError })}
                            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 transition hover:bg-slate-50"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            刷新
                        </button>
                        <TimeRangeTabs
                            value={period}
                            onChange={setPeriod}
                            options={TIME_RANGE_PRESETS.hourly}
                            activeClassName="bg-white text-violet-600 shadow-sm"
                            containerClassName="bg-slate-100"
                        />
                    </>
                )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={Activity}
                    iconWrapperClassName="bg-blue-100"
                    iconClassName="text-blue-600"
                    value={getSummaryValue(formatCompactNumber(summary.totalRequests), metricsUnavailable)}
                    label="请求总量"
                    valueClassName="text-blue-600"
                />
                <StatCard
                    icon={Zap}
                    iconWrapperClassName="bg-amber-100"
                    iconClassName="text-amber-600"
                    value={getSummaryValue(formatCompactNumber(summary.totalTokens), metricsUnavailable)}
                    label="Token 总量"
                    valueClassName="text-amber-600"
                />
                <StatCard
                    icon={Clock}
                    iconWrapperClassName="bg-violet-100"
                    iconClassName="text-violet-600"
                    value={getSummaryValue(formatLatency(summary.averageLatency), metricsUnavailable)}
                    label="平均延迟"
                    valueClassName="text-violet-600"
                />
                <StatCard
                    icon={AlertTriangle}
                    iconWrapperClassName="bg-red-100"
                    iconClassName="text-red-600"
                    value={getSummaryValue(summary.topSlowEntries.toLocaleString(), metricsUnavailable)}
                    label="Top 20 慢请求"
                    valueClassName="text-red-600"
                />
            </div>

            {refreshError ? (
                <PanelCard bodyClassName="px-4 py-3">
                    <div className="text-sm text-red-600">{refreshError}</div>
                </PanelCard>
            ) : null}

            {loading ? (
                <LoadingState label="加载性能数据中..." className="h-80" />
            ) : loadError ? (
                <EmptyState icon={AlertTriangle} title="加载失败" description={loadError} className="py-16" />
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {chartItems.slice(0, 2).map((chart) => {
                            const Icon = chart.icon;
                            return (
                                <PanelCard key={chart.dataKey} title={chart.title} description={chart.description} bodyClassName="p-6">
                                    <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                                        <Icon size={16} className="text-slate-400" />
                                        <span>{chart.label}</span>
                                    </div>
                                    <div className="h-[250px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={data.latency_trend}>
                                                <defs>
                                                    <linearGradient id={chart.gradientId} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chart.stroke} stopOpacity={0.12} />
                                                        <stop offset="95%" stopColor={chart.stroke} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} minTickGap={30} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                                <Tooltip content={<CustomTooltip />} />
                                                <Area type="monotone" dataKey={chart.dataKey} name={chart.label} unit={chart.unit} stroke={chart.stroke} strokeWidth={3} fillOpacity={1} fill={`url(#${chart.gradientId})`} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </PanelCard>
                            );
                        })}
                    </div>

                    <PanelCard title={chartConfig.avg_latency.title} description={chartConfig.avg_latency.description} bodyClassName="p-6">
                        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
                            <Clock size={16} className="text-slate-400" />
                            <span>{summary.maxLatency ? `当前窗口最高慢请求 ${summary.maxLatency.toLocaleString()} s` : '当前窗口暂无慢请求峰值'}</span>
                        </div>
                        <div className="h-[250px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.latency_trend}>
                                    <defs>
                                        <linearGradient id={chartConfig.avg_latency.gradientId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={chartConfig.avg_latency.stroke} stopOpacity={0.12} />
                                            <stop offset="95%" stopColor={chartConfig.avg_latency.stroke} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} minTickGap={30} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} unit=" s" />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area type="monotone" dataKey="avg_latency" name="Latency" stroke={chartConfig.avg_latency.stroke} strokeWidth={3} fillOpacity={1} fill={`url(#${chartConfig.avg_latency.gradientId})`} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </PanelCard>

                    <PanelCard title="Top 20 慢请求" description="保留最慢请求清单，便于快速定位高延迟模型与渠道。">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="border-b border-slate-100 bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">时间</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">模型</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">渠道 ID</th>
                                        <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">耗时 (s)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {data.slow_requests.length === 0 ? (
                                        <tr>
                                            <td colSpan={4}>
                                                <EmptyState icon={AlertTriangle} title="暂无慢请求数据" description="当前时间范围内没有高延迟请求。" />
                                            </td>
                                        </tr>
                                    ) : (
                                        data.slow_requests.map((log) => (
                                            <tr key={log.id} className="transition-colors hover:bg-slate-50/80">
                                                <td className="px-6 py-4 font-mono text-xs text-slate-600">
                                                    {new Date(Number(log.createdAt) * 1000).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-700">{log.modelName}</td>
                                                <td className="px-6 py-4">
                                                    <span className="rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">
                                                        #{log.channelId}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={`font-mono font-bold ${log.useTime > 5 ? 'text-red-500' : (log.useTime > 2 ? 'text-amber-500' : 'text-slate-700')}`}>
                                                        {log.useTime.toLocaleString()} s
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </PanelCard>
                </>
            )}
        </div>
    );
};

export default Performance;
