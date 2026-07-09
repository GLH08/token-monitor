import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import TrendChart from '../components/charts/TrendChart';
import DistributionPie from '../components/charts/DistributionPie';
import RankBar from '../components/charts/RankBar';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useUsageBreakdown, useUsageTimeseries } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { presetToRange, formatHourLabel } from '../lib/time';
import { CNY_USD_RATE, formatCostByMode } from '../lib/currency';
import {
    formatCompact,
    formatLatency,
    formatNumber,
    formatPercent,
    formatTokens,
    formatTPS,
    formatUsd,
    formatCny,
    maskValue,
} from '../lib/format';
import type { ColumnDef } from '@tanstack/react-table';
import type { UsageDimension, UsageMetric, UsageRow, UsageTimeseriesPoint } from '../api/types';

const DIMENSION_OPTIONS: { value: UsageDimension; label: string }[] = [
    { value: 'model', label: '模型' },
    { value: 'channel', label: '渠道' },
    { value: 'token', label: 'Token' },
    { value: 'group', label: '分组' },
    { value: 'user', label: '用户' },
];

const METRIC_OPTIONS: { value: UsageMetric; label: string }[] = [
    { value: 'cost', label: '费用' },
    { value: 'tokens', label: 'Tokens' },
    { value: 'requests', label: '请求数' },
    { value: 'quota', label: '配额' },
    { value: 'cache_hit_ratio', label: '缓存命中率' },
    { value: 'image_tokens', label: '图像 Tokens' },
    { value: 'audio_tokens', label: '音频 Tokens' },
    { value: 'success_rate', label: '成功率' },
    { value: 'avg_latency_ms', label: '平均延迟' },
    { value: 'avg_ttft_ms', label: 'TTFT' },
    { value: 'tps', label: 'TPS' },
];

const VALID_DIMENSIONS = new Set(DIMENSION_OPTIONS.map((o) => o.value));
const VALID_METRICS = new Set(METRIC_OPTIONS.map((o) => o.value));

interface MetricHolder {
    cost_usd: number;
    quota: number;
    tokens: number;
    requests: number;
    cache_hit_ratio: number;
    image_tokens: number;
    audio_tokens: number;
    success_rate: number;
    avg_latency_ms: number;
    avg_ttft_ms: number;
    tps: number;
}

function metricValue(row: MetricHolder, metric: UsageMetric): number {
    switch (metric) {
        case 'cost': return row.cost_usd;
        case 'quota': return row.quota;
        case 'tokens': return row.tokens;
        case 'requests': return row.requests;
        case 'cache_hit_ratio': return row.cache_hit_ratio;
        case 'image_tokens': return row.image_tokens;
        case 'audio_tokens': return row.audio_tokens;
        case 'success_rate': return row.success_rate;
        case 'avg_latency_ms': return row.avg_latency_ms;
        case 'avg_ttft_ms': return row.avg_ttft_ms;
        case 'tps': return row.tps;
    }
}

function pivotSeries(
    points: UsageTimeseriesPoint[],
    metric: UsageMetric,
) {
    const hours = Array.from(new Set(points.map((p) => p.hour))).sort((a, b) => a - b);
    const splits = Array.from(new Set(points.map((p) => p.split)));
    const totals = new Map<string, number>();
    splits.forEach((s) => {
        totals.set(
            s,
            points.filter((p) => p.split === s).reduce((acc, p) => acc + metricValue(p, metric), 0),
        );
    });
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return {
        categories: hours.map(formatHourLabel),
        series: ranked.map(([s]) => ({
            name: s || '合计',
            data: hours.map((h) => {
                const p = points.find((pp) => pp.hour === h && pp.split === s);
                return p ? metricValue(p, metric) : 0;
            }),
        })),
    };
}

const UsageAnalytics = () => {
    const timePreset = useUIStore((s) => s.timePreset);
    const currencyMode = useUIStore((s) => s.currencyMode);
    const masked = useUIStore((s) => s.masked);
    const { startTs, endTs } = useMemo(() => presetToRange(timePreset), [timePreset]);
    const rangeParams = { start_ts: startTs, end_ts: endTs };

    const [searchParams, setSearchParams] = useSearchParams();
    const dimensionRaw = searchParams.get('dimension');
    const dimension: UsageDimension = (dimensionRaw && VALID_DIMENSIONS.has(dimensionRaw as UsageDimension))
        ? dimensionRaw as UsageDimension
        : 'model';
    const metricRaw = searchParams.get('metric');
    const metric: UsageMetric = (metricRaw && VALID_METRICS.has(metricRaw as UsageMetric))
        ? metricRaw as UsageMetric
        : 'cost';

    const updateParam = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams);
        next.set(key, value);
        setSearchParams(next, { replace: true });
    };

    const breakdown = useUsageBreakdown({ ...rangeParams, dimension, metric, limit: 50 });
    const timeseries = useUsageTimeseries({ ...rangeParams, split: dimension, metric, limit: 8 });

    const trend = useMemo(
        () => pivotSeries(timeseries.data?.series ?? [], metric),
        [timeseries.data, metric],
    );

    const rows = breakdown.data ?? [];

    const formatMetric = useMemo(() => {
        const fn = (value: number): string => {
            switch (metric) {
                case 'cost':
                    return currencyMode === 'cny'
                        ? formatCny(value * CNY_USD_RATE)
                        : formatUsd(value);
                case 'quota':
                    return formatCompact(value);
                case 'tokens':
                case 'image_tokens':
                case 'audio_tokens':
                    return formatTokens(value);
                case 'requests':
                    return formatNumber(value, 0);
                case 'cache_hit_ratio':
                case 'success_rate':
                    return formatPercent(value);
                case 'avg_latency_ms':
                case 'avg_ttft_ms':
                    return formatLatency(value);
                case 'tps':
                    return formatTPS(value);
            }
        };
        return fn;
    }, [metric, currencyMode]);

    const pieData = rows
        .map((r) => ({ name: r.label || r.key, value: metricValue(r, metric) }))
        .filter((d) => d.value > 0);

    const rankData = rows
        .map((r) => ({ name: r.label || r.key, value: metricValue(r, metric) }))
        .slice(0, 15);

    const labelSensitive = dimension === 'token' || dimension === 'user' || dimension === 'group';
    const displayLabel = (r: UsageRow) => (masked && labelSensitive ? maskValue(r.label || r.key) : r.label || r.key);

    const columns = useMemo<ColumnDef<UsageRow>[]>(
        () => [
            {
                accessorFn: (r) => displayLabel(r),
                header: DIMENSION_OPTIONS.find((o) => o.value === dimension)?.label ?? '名称',
                cell: ({ row }) => <span className="font-medium">{displayLabel(row.original)}</span>,
            },
            {
                accessorKey: 'cost_usd',
                header: '费用',
                cell: ({ row }) => formatCostByMode(row.original.quota, row.original.tokens, currencyMode),
            },
            { accessorKey: 'tokens', header: 'Tokens', cell: ({ row }) => formatTokens(row.original.tokens) },
            { accessorKey: 'requests', header: '请求数', cell: ({ row }) => formatNumber(row.original.requests, 0) },
            {
                accessorKey: 'success_rate',
                header: '成功率',
                cell: ({ row }) => formatPercent(row.original.success_rate),
            },
            {
                accessorKey: 'cache_hit_ratio',
                header: '缓存命中',
                cell: ({ row }) => formatPercent(row.original.cache_hit_ratio),
            },
            {
                accessorKey: 'avg_latency_ms',
                header: '延迟',
                cell: ({ row }) => formatLatency(row.original.avg_latency_ms),
            },
            {
                accessorKey: 'avg_ttft_ms',
                header: 'TTFT',
                cell: ({ row }) => formatLatency(row.original.avg_ttft_ms),
            },
            { accessorKey: 'tps', header: 'TPS', cell: ({ row }) => formatTPS(row.original.tps) },
            {
                accessorKey: 'image_tokens',
                header: '图像',
                cell: ({ row }) => formatTokens(row.original.image_tokens),
            },
            {
                accessorKey: 'audio_tokens',
                header: '音频',
                cell: ({ row }) => formatTokens(row.original.audio_tokens),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dimension, currencyMode, masked],
    );

    return (
        <div className="space-y-6">
            <PageHeader title="用量分析" description="按分组 / 渠道 / 模型 / Token / 用户多维拆解" icon={BarChart3} />

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">维度</span>
                    <Select value={dimension} onValueChange={(v) => updateParam('dimension', v)}>
                        <SelectTrigger className="h-9 w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {DIMENSION_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">指标</span>
                    <Select value={metric} onValueChange={(v) => updateParam('metric', v)}>
                        <SelectTrigger className="h-9 w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {METRIC_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{METRIC_OPTIONS.find((o) => o.value === metric)?.label} 趋势</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {timeseries.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="趋势数据获取失败" />
                        ) : (
                            <TrendChart
                                categories={trend.categories}
                                series={trend.series}
                                topN={6}
                                loading={timeseries.isLoading}
                                height={300}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>占比分布</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {breakdown.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="数据获取失败" />
                        ) : pieData.length === 0 && !breakdown.isLoading ? (
                            <EmptyState title="暂无数据" />
                        ) : (
                            <DistributionPie data={pieData} loading={breakdown.isLoading} height={300} />
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Top 排名</CardTitle>
                </CardHeader>
                <CardContent>
                    {breakdown.isError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="数据获取失败" />
                    ) : (
                        <RankBar
                            data={rankData}
                            valueFormatter={formatMetric}
                            loading={breakdown.isLoading}
                            height={320}
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>明细表</CardTitle>
                </CardHeader>
                <CardContent>
                    {breakdown.isError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="数据获取失败" />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={rows}
                            enableSorting
                            loading={breakdown.isLoading}
                            emptyTitle="暂无数据"
                            skeletonRows={8}
                            renderMobileCard={(r) => (
                                <div className="space-y-1">
                                    <div className="font-medium">{displayLabel(r)}</div>
                                    <div className="text-sm text-muted-foreground">
                                        费用 {formatCostByMode(r.quota, r.tokens, currencyMode)} · Tokens {formatTokens(r.tokens)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        请求 {formatNumber(r.requests, 0)} · 成功率 {formatPercent(r.success_rate)}
                                    </div>
                                </div>
                            )}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default UsageAnalytics;
