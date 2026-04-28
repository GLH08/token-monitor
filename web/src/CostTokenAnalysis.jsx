import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Coins, DollarSign, Filter, Hash, RotateCcw, Server, TrendingUp } from 'lucide-react';
import { useUsageAnalysis } from './hooks/useUsageAnalysis';
import { useChannels } from './hooks/useChannels';
import {
    ChannelSelect,
    EmptyState,
    FilterBar,
    LoadingState,
    PageHeader,
    PanelCard,
    StatCard,
    TimeRangeTabs,
    updateUrlSearchParams
} from './components/PageUI';

const TIME_OPTIONS = [
    { value: '1h', label: '1 小时' },
    { value: '6h', label: '6 小时' },
    { value: '24h', label: '24 小时' },
    { value: '7d', label: '7 天' },
    { value: '30d', label: '30 天' }
];

const WINDOW_SECONDS = {
    '1h': 3600,
    '6h': 6 * 3600,
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600
};

const METRIC_OPTIONS = [
    { value: 'cost', label: '成本' },
    { value: 'tokens', label: 'Token' },
    { value: 'requests', label: '请求' }
];

const DIMENSION_OPTIONS = [
    { value: 'group', label: '分组' },
    { value: 'channel', label: '渠道' },
    { value: 'model', label: '模型' },
    { value: 'token', label: 'Token' }
];

const formatCompact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
const formatCost = (value) => `$${(value || 0).toFixed(4)}`;
const formatMetric = (metric, value) => metric === 'cost' ? formatCost(value) : formatCompact(value);
const metricLabel = (metric) => METRIC_OPTIONS.find((option) => option.value === metric)?.label || '成本';

const UsageTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/95 border border-slate-200 shadow-xl rounded-xl px-4 py-3">
            <div className="text-sm font-semibold text-slate-800 mb-2">{label}</div>
            {payload.map((entry) => (
                <div key={entry.dataKey} className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.name}</span>
                    <span className="font-mono font-semibold text-slate-800">{entry.value?.toLocaleString?.() ?? entry.value}</span>
                </div>
            ))}
        </div>
    );
};

const getWindow = (value) => WINDOW_SECONDS[value] ? value : '24h';

const CostTokenAnalysis = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [analysisEndTs, setAnalysisEndTs] = useState(() => Math.floor(Date.now() / 1000));
    const { channels } = useChannels();

    const windowValue = getWindow(searchParams.get('window'));
    const metric = METRIC_OPTIONS.some((option) => option.value === searchParams.get('metric')) ? searchParams.get('metric') : 'cost';
    const dimension = DIMENSION_OPTIONS.some((option) => option.value === searchParams.get('dimension')) ? searchParams.get('dimension') : 'model';

    const filters = useMemo(() => ({
        start_ts: analysisEndTs - WINDOW_SECONDS[windowValue],
        end_ts: analysisEndTs,
        group: searchParams.get('group') || '',
        channel_id: searchParams.get('channel_id') || '',
        model_name: searchParams.get('model_name') || '',
        token_id: searchParams.get('token_id') || '',
        metric,
        dimension,
        limit: 20
    }), [analysisEndTs, dimension, metric, searchParams, windowValue]);

    const { summary, breakdown, timeseries, loading, error } = useUsageAnalysis(filters);

    const trendData = timeseries.map((row) => ({
        name: new Date(row.hour * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' }),
        cost: row.cost,
        tokens: row.tokens,
        requests: row.requests
    }));

    const barData = breakdown.slice(0, 10).map((row) => ({
        name: row.label,
        cost: row.cost,
        tokens: row.tokens,
        requests: row.requests
    }));

    const setFilter = (updates) => {
        setAnalysisEndTs(Math.floor(Date.now() / 1000));
        updateUrlSearchParams(setSearchParams, updates);
    };
    const clearFilters = () => {
        setAnalysisEndTs(Math.floor(Date.now() / 1000));
        setSearchParams({}, { replace: true });
    };
    const hasFilters = Boolean(filters.group || filters.channel_id || filters.model_name || filters.token_id || metric !== 'cost' || dimension !== 'model' || windowValue !== '24h');

    return (
        <div className="space-y-6">
            <PageHeader
                icon={BarChart3}
                iconClassName="from-emerald-500 to-cyan-600"
                title="用量分析"
                description="按分组、渠道、模型、Token 和时间窗口查看成本与 Token 消耗"
                actions={
                    <TimeRangeTabs
                        value={windowValue}
                        onChange={(value) => setFilter({ window: value })}
                        options={TIME_OPTIONS}
                        activeClassName="bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-md shadow-emerald-500/20"
                    />
                }
            />

            <FilterBar
                icon={Filter}
                action={
                    <button
                        type="button"
                        onClick={clearFilters}
                        disabled={!hasFilters}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                        <RotateCcw size={16} />
                        清空
                    </button>
                }
            >
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg border bg-white">
                    <span className="text-sm text-slate-500">分组</span>
                    <input value={filters.group} onChange={(event) => setFilter({ group: event.target.value })} placeholder="全部" className="text-sm outline-none w-28" />
                </div>
                <ChannelSelect channels={channels} value={filters.channel_id} onChange={(value) => setFilter({ channel_id: value })} />
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg border bg-white">
                    <span className="text-sm text-slate-500">模型</span>
                    <input value={filters.model_name} onChange={(event) => setFilter({ model_name: event.target.value })} placeholder="全部" className="text-sm outline-none w-36" />
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg border bg-white">
                    <span className="text-sm text-slate-500">Token ID</span>
                    <input value={filters.token_id} onChange={(event) => setFilter({ token_id: event.target.value })} placeholder="全部" className="text-sm outline-none w-24" />
                </div>
                <select value={metric} onChange={(event) => setFilter({ metric: event.target.value })} className="px-3 py-2 rounded-lg border bg-white text-sm text-slate-700">
                    {METRIC_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={dimension} onChange={(event) => setFilter({ dimension: event.target.value })} className="px-3 py-2 rounded-lg border bg-white text-sm text-slate-700">
                    {DIMENSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>按{option.label}</option>)}
                </select>
            </FilterBar>

            {loading && !summary ? (
                <LoadingState label="加载用量分析中..." className="h-80" />
            ) : error ? (
                <EmptyState title="加载失败" description={error.message} className="bg-white rounded-xl border" />
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <StatCard icon={DollarSign} iconWrapperClassName="bg-emerald-100" iconClassName="text-emerald-600" value={formatCost(summary?.cost)} label="总成本" valueClassName="text-emerald-600" />
                        <StatCard icon={Coins} iconWrapperClassName="bg-violet-100" iconClassName="text-violet-600" value={formatCompact(summary?.tokens)} label="总 Token" valueClassName="text-violet-600" />
                        <StatCard icon={TrendingUp} iconWrapperClassName="bg-cyan-100" iconClassName="text-cyan-600" value={formatCompact(summary?.requests)} label="请求数" valueClassName="text-cyan-600" />
                        <StatCard icon={Server} iconWrapperClassName="bg-slate-100" iconClassName="text-slate-600" value={`${summary?.active_channels || 0}/${summary?.active_models || 0}`} label="活跃渠道 / 模型" />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                        <PanelCard title={`${metricLabel(metric)}趋势`} className="xl:col-span-3" bodyClassName="p-6">
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={trendData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <Tooltip content={<UsageTooltip />} />
                                        <Line type="monotone" dataKey={metric} name={metricLabel(metric)} stroke="#10b981" strokeWidth={3} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </PanelCard>

                        <PanelCard title={`Top ${metricLabel(metric)} 分布`} className="xl:col-span-2" bodyClassName="p-6">
                            <div className="h-[340px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} layout="vertical" margin={{ left: 24, right: 12 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis dataKey="name" type="category" width={90} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <Tooltip content={<UsageTooltip />} />
                                        <Bar dataKey={metric} name={metricLabel(metric)} fill="#06b6d4" radius={[0, 6, 6, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </PanelCard>
                    </div>

                    <PanelCard title={`按${DIMENSION_OPTIONS.find((option) => option.value === dimension)?.label}排行`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600">名称</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">成本</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Token</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">请求</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Quota</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {breakdown.length ? breakdown.map((row) => (
                                        <tr key={row.key} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-slate-800">{row.label}</div>
                                                <div className="text-xs text-slate-400">{row.key || 'default'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCost(row.cost)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.tokens)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.requests)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatMetric('quota', row.quota)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5}><EmptyState icon={Hash} title="暂无用量数据" /></td>
                                        </tr>
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

export default CostTokenAnalysis;
