import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Coins, DollarSign, Filter, Hash, RotateCcw, TrendingUp, Database, Upload, Download, Clock } from 'lucide-react';
import { fetchUsageFilterOptions } from './api';
import { useUsageAnalysis } from './hooks/useUsageAnalysis';
import { useChannels } from './hooks/useChannels';
import CustomDateTimePicker from './components/CustomDateTimePicker';
import {
    ChannelSelect,
    EmptyState,
    FilterBar,
    FilterSelect,
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
    { value: 'requests', label: '请求' },
    { value: 'quota', label: 'Quota' }
];

const DIMENSION_OPTIONS = [
    { value: 'group', label: '分组' },
    { value: 'channel', label: '渠道' },
    { value: 'model', label: '模型' },
    { value: 'token', label: 'Token' }
];

const formatCompact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
const formatInteger = (value) => Math.round(value || 0).toLocaleString();
const formatCost = (value) => `$${(value || 0).toFixed(4)}`;
const metricLabel = (metric) => METRIC_OPTIONS.find((option) => option.value === metric)?.label || '成本';
const toDateTimeInput = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(Number(timestamp) * 1000);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
};
const fromDateTimeInput = (value) => value ? Math.floor(new Date(value).getTime() / 1000) : null;

const UsageTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white/95 border border-slate-200 shadow-xl rounded-xl px-4 py-3 max-w-sm">
            <div className="text-sm font-semibold text-slate-800 mb-2 break-all">{label}</div>
            {payload.map((entry) => (
                <div key={entry.dataKey} className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.name}</span>
                    <span className="font-mono font-semibold text-slate-800">{entry.dataKey === 'cost' ? formatCost(entry.value) : formatInteger(entry.value)}</span>
                </div>
            ))}
        </div>
    );
};

const getWindow = (value) => WINDOW_SECONDS[value] ? value : '24h';
const getValidatedTimestamp = (value) => {
    if (value === null || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const CostTokenAnalysis = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [analysisEndTs, setAnalysisEndTs] = useState(() => Math.floor(Date.now() / 1000));
    const [customStart, setCustomStart] = useState(() => toDateTimeInput(searchParams.get('start_ts')));
    const [customEnd, setCustomEnd] = useState(() => toDateTimeInput(searchParams.get('end_ts')));
    const [filterOptions, setFilterOptions] = useState({ groups: [], models: [], tokens: [] });
    const { channels } = useChannels();

    const customStartTs = getValidatedTimestamp(searchParams.get('start_ts'));
    const customEndTs = getValidatedTimestamp(searchParams.get('end_ts'));
    const hasCustomRange = customStartTs !== null && customEndTs !== null && customStartTs <= customEndTs;
    const windowValue = getWindow(searchParams.get('window'));
    const metric = METRIC_OPTIONS.some((option) => option.value === searchParams.get('metric')) ? searchParams.get('metric') : 'cost';
    const dimension = DIMENSION_OPTIONS.some((option) => option.value === searchParams.get('dimension')) ? searchParams.get('dimension') : 'model';

    useEffect(() => {
        setCustomStart(toDateTimeInput(searchParams.get('start_ts')));
        setCustomEnd(toDateTimeInput(searchParams.get('end_ts')));
    }, [searchParams]);

    const timeFilters = useMemo(() => ({
        start_ts: hasCustomRange ? customStartTs : analysisEndTs - WINDOW_SECONDS[windowValue],
        end_ts: hasCustomRange ? customEndTs : analysisEndTs
    }), [analysisEndTs, customEndTs, customStartTs, hasCustomRange, windowValue]);

    const filters = useMemo(() => ({
        ...timeFilters,
        group: searchParams.get('group') || '',
        channel_id: searchParams.get('channel_id') || '',
        model_name: searchParams.get('model_name') || '',
        token_id: searchParams.get('token_id') || '',
        metric,
        dimension,
        limit: 20
    }), [dimension, metric, searchParams, timeFilters]);

    useEffect(() => {
        let cancelled = false;
        fetchUsageFilterOptions({ ...timeFilters, limit: 200 })
            .then((result) => {
                if (!cancelled) {
                    setFilterOptions({
                        groups: Array.isArray(result.groups) ? result.groups : [],
                        models: Array.isArray(result.models) ? result.models : [],
                        tokens: Array.isArray(result.tokens) ? result.tokens : []
                    });
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error('Failed to load usage filter options:', error);
                    setFilterOptions({ groups: [], models: [], tokens: [] });
                }
            });
        return () => { cancelled = true; };
    }, [timeFilters]);

    const { summary, breakdown, timeseries, loading, error } = useUsageAnalysis(filters);

    const trendData = timeseries.map((row) => ({
        name: new Date(row.hour * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' }),
        cost: row.cost,
        quota: row.quota,
        tokens: row.tokens,
        requests: row.requests
    }));

    const barData = breakdown.slice(0, 10).map((row) => ({
        name: row.label,
        cost: row.cost,
        quota: row.quota,
        tokens: row.tokens,
        requests: row.requests
    }));

    const setFilter = (updates) => {
        const nextUpdates = { ...updates };
        if ('window' in updates) {
            nextUpdates.start_ts = '';
            nextUpdates.end_ts = '';
        }
        if (!hasCustomRange) {
            setAnalysisEndTs(Math.floor(Date.now() / 1000));
        }
        updateUrlSearchParams(setSearchParams, nextUpdates);
    };

    const handleTimeRangeChange = (value) => {
        setFilter({ window: value });
    };

    const applyCustomRange = () => {
        const startTs = fromDateTimeInput(customStart);
        const endTs = fromDateTimeInput(customEnd);
        if (startTs === null || endTs === null || startTs > endTs) {
            return;
        }
        updateUrlSearchParams(setSearchParams, { start_ts: startTs, end_ts: endTs, window: '' });
    };

    const clearFilters = () => {
        setAnalysisEndTs(Math.floor(Date.now() / 1000));
        setSearchParams({}, { replace: true });
    };

    const hasFilters = Boolean(filters.group || filters.channel_id || filters.model_name || filters.token_id || metric !== 'cost' || dimension !== 'model' || windowValue !== '24h' || hasCustomRange);

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
                        onChange={handleTimeRangeChange}
                        options={TIME_OPTIONS}
                        activeClassName="bg-gradient-to-r from-emerald-500 to-cyan-600 text-white shadow-md shadow-emerald-500/20"
                    />
                }
            />

            <FilterBar
                icon={Filter}
                contentClassName="flex flex-col gap-3"
                action={
                    <button
                        type="button"
                        onClick={clearFilters}
                        disabled={!hasFilters}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border text-slate-600 hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                    >
                        <RotateCcw size={16} />
                        清空
                    </button>
                }
            >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <FilterSelect label="分组" value={filters.group} onChange={(value) => setFilter({ group: value })} options={filterOptions.groups} allLabel="全部分组" wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                    <ChannelSelect channels={channels} value={filters.channel_id} onChange={(value) => setFilter({ channel_id: value })} className="w-full" wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                    <FilterSelect label="模型" value={filters.model_name} onChange={(value) => setFilter({ model_name: value })} options={filterOptions.models} allLabel="全部模型" wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                    <FilterSelect label="Token" value={filters.token_id} onChange={(value) => setFilter({ token_id: value })} options={filterOptions.tokens} allLabel="全部 Token" wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                    <FilterSelect label="指标" value={metric} onChange={(value) => setFilter({ metric: value })} options={METRIC_OPTIONS} wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                    <FilterSelect label="维度" value={dimension} onChange={(value) => setFilter({ dimension: value })} options={DIMENSION_OPTIONS.map((option) => ({ ...option, label: `按${option.label}` }))} wrapperClassName="w-full" selectClassName="w-full max-w-none min-w-0" />
                </div>
                <div className="flex flex-wrap gap-3 items-center justify-end">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white">
                        <Clock size={16} className="text-slate-400" />
                        <CustomDateTimePicker label="开始时间" value={customStart} onChange={setCustomStart} />
                        <span className="text-slate-300">→</span>
                        <CustomDateTimePicker label="结束时间" value={customEnd} onChange={setCustomEnd} />
                        <button type="button" onClick={applyCustomRange} className="px-2 py-1 rounded-md text-xs font-semibold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">
                            应用
                        </button>
                    </div>
                </div>
            </FilterBar>

            {loading && !summary ? (
                <LoadingState label="加载用量分析中..." className="h-80" />
            ) : error ? (
                <EmptyState title="加载失败" description={error.message} className="bg-white rounded-xl border" />
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        <StatCard icon={DollarSign} iconWrapperClassName="bg-emerald-100" iconClassName="text-emerald-600" value={formatCost(summary?.cost)} label="计费成本" valueClassName="text-emerald-600 text-2xl" />
                        <StatCard icon={Database} iconWrapperClassName="bg-slate-100" iconClassName="text-slate-600" value={formatCompact(summary?.quota)} label="计费 Quota" valueClassName="text-2xl" />
                        <StatCard icon={Upload} iconWrapperClassName="bg-blue-100" iconClassName="text-blue-600" value={formatCompact(summary?.prompt_tokens)} label="输入 Token" valueClassName="text-blue-600 text-2xl" />
                        <StatCard icon={Download} iconWrapperClassName="bg-violet-100" iconClassName="text-violet-600" value={formatCompact(summary?.completion_tokens)} label="输出 Token" valueClassName="text-violet-600 text-2xl" />
                        <StatCard icon={Coins} iconWrapperClassName="bg-amber-100" iconClassName="text-amber-600" value={formatCompact(summary?.cache_hit_tokens)} label="缓存命中 Token" valueClassName="text-amber-600 text-2xl" />
                        <StatCard icon={TrendingUp} iconWrapperClassName="bg-cyan-100" iconClassName="text-cyan-600" value={formatCompact(summary?.requests)} label="请求数" valueClassName="text-cyan-600 text-2xl" />
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
                                    <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis dataKey="name" type="category" width={132} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
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
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Quota</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">输入</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">输出</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">缓存命中</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">总 Token</th>
                                        <th className="px-4 py-3 text-right font-semibold text-slate-600">请求</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {breakdown.length ? breakdown.map((row) => (
                                        <tr key={row.key} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 max-w-[360px]">
                                                <div className="font-medium text-slate-800 whitespace-normal break-words" title={row.label}>{row.label}</div>
                                                <div className="text-xs text-slate-400 break-all">{row.key || 'default'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCost(row.cost)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.quota)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.prompt_tokens)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.completion_tokens)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.cache_hit_tokens)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.tokens)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatCompact(row.requests)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={8}><EmptyState icon={Hash} title="暂无用量数据" /></td>
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
