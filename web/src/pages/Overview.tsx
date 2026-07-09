import { useMemo } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Database,
    DollarSign,
    Gauge,
    Server,
    Cpu,
    Zap,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import TrendChart from '../components/charts/TrendChart';
import RankBar from '../components/charts/RankBar';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useRealtime, useSummary, useUsageBreakdown, useUsageTimeseries } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { presetToRange, formatHourLabel } from '../lib/time';
import { CNY_USD_RATE, formatCostByMode } from '../lib/currency';
import {
    formatCompact,
    formatNumber,
    formatPercent,
    formatRpm,
    formatTokens,
    formatUsd,
    formatCny,
} from '../lib/format';
import type { StatCardProps } from '../components/StatCard';
import type { UsageTimeseriesPoint, UsageRow } from '../api/types';

/** Pivot a flat timeseries into {categories, series} for TrendChart. */
function pivotSeries(
    points: UsageTimeseriesPoint[],
    valueOf: (p: UsageTimeseriesPoint) => number,
) {
    const hours = Array.from(new Set(points.map((p) => p.hour))).sort((a, b) => a - b);
    const splits = Array.from(new Set(points.map((p) => p.split)));
    const totals = new Map<string, number>();
    splits.forEach((s) => {
        totals.set(
            s,
            points.filter((p) => p.split === s).reduce((acc, p) => acc + valueOf(p), 0),
        );
    });
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return {
        categories: hours.map(formatHourLabel),
        series: ranked.map(([s]) => ({
            name: s || '合计',
            data: hours.map((h) => {
                const p = points.find((pp) => pp.hour === h && pp.split === s);
                return p ? valueOf(p) : 0;
            }),
        })),
    };
}

const Overview = () => {
    const timePreset = useUIStore((s) => s.timePreset);
    const currencyMode = useUIStore((s) => s.currencyMode);
    const { startTs, endTs } = useMemo(() => presetToRange(timePreset), [timePreset]);
    const rangeParams = { start_ts: startTs, end_ts: endTs };

    const metric = currencyMode === 'token' ? 'tokens' : 'cost';

    const summary = useSummary(rangeParams, { refetchInterval: 30000 });
    const trendQ = useUsageTimeseries(
        { ...rangeParams, split: 'model', metric, limit: 8 },
        { refetchInterval: 60000 },
    );
    const modelsQ = useUsageBreakdown({ ...rangeParams, dimension: 'model', metric, limit: 10 });
    const channelsQ = useUsageBreakdown({ ...rangeParams, dimension: 'channel', metric, limit: 10 });
    const realtime = useRealtime();

    const trendValueOf = useMemo(
        () => (p: UsageTimeseriesPoint) => (currencyMode === 'token' ? p.tokens : p.cost_usd),
        [currencyMode],
    );
    const trend = useMemo(
        () => pivotSeries(trendQ.data?.series ?? [], trendValueOf),
        [trendQ.data, trendValueOf],
    );

    const rankValueFormatter = useMemo(() => {
        if (currencyMode === 'token') return formatTokens;
        if (currencyMode === 'cny') return (v: number) => formatCny(v * CNY_USD_RATE);
        return formatUsd;
    }, [currencyMode]);

    const toRank = (rows: UsageRow[]): { name: string; value: number }[] =>
        rows.map((r) => ({
            name: r.label || r.key,
            value: currencyMode === 'token' ? r.tokens : r.cost_usd,
        }));

    const s = summary.data;
    const kpiItems: StatCardProps[] = [
        {
            label: currencyMode === 'token' ? 'Tokens 用量' : '费用',
            value: s ? formatCostByMode(s.total_quota, s.total_tokens, currencyMode) : '--',
            icon: DollarSign,
            loading: summary.isLoading,
        },
        {
            label: 'Tokens',
            value: s ? formatTokens(s.total_tokens) : '--',
            icon: Zap,
            loading: summary.isLoading,
        },
        {
            label: '请求数',
            value: s ? formatNumber(s.total_requests) : '--',
            icon: Activity,
            loading: summary.isLoading,
        },
        {
            label: 'RPM',
            value: s ? formatRpm(s.rpm) : '--',
            icon: Gauge,
            hint: '近 60 秒',
            loading: summary.isLoading,
        },
        {
            label: 'TPM',
            value: s ? formatCompact(s.tpm) : '--',
            icon: Zap,
            hint: '近 60 秒',
            loading: summary.isLoading,
        },
        {
            label: '成功率',
            value: s ? formatPercent(s.success_rate) : '--',
            icon: CheckCircle2,
            loading: summary.isLoading,
        },
        {
            label: '缓存命中',
            value: s ? formatPercent(s.cache_hit_ratio) : '--',
            icon: Database,
            loading: summary.isLoading,
        },
    ];

    const rt = realtime.data?.data;

    return (
        <div className="space-y-6">
            <PageHeader title="概览" description="全局用量、成本与实时流量总览" icon={Activity} />

            <KpiStrip items={kpiItems} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{currencyMode === 'token' ? 'Token 用量趋势（按模型）' : '费用趋势（按模型）'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {trendQ.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="趋势数据获取失败" />
                        ) : (
                            <TrendChart
                                categories={trend.categories}
                                series={trend.series}
                                topN={6}
                                loading={trendQ.isLoading}
                                height={300}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>实时流量</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {realtime.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="实时数据获取失败" />
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">QPS</span>
                                    <span className="font-mono text-xl font-bold tabular-nums">
                                        {rt ? formatNumber(rt.qps) : '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">TPS</span>
                                    <span className="font-mono text-xl font-bold tabular-nums">
                                        {rt ? formatCompact(rt.tps) : '--'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">活跃渠道</span>
                                    <span className="font-mono text-xl font-bold tabular-nums">
                                        {rt ? formatNumber(rt.activeChannels) : '--'}
                                    </span>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Cpu className="h-4 w-4" /> Top 模型
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {modelsQ.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="模型数据获取失败" />
                        ) : (
                            <RankBar
                                data={toRank(modelsQ.data ?? [])}
                                valueFormatter={rankValueFormatter}
                                loading={modelsQ.isLoading}
                                height={320}
                            />
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Server className="h-4 w-4" /> Top 渠道
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {channelsQ.isError ? (
                            <EmptyState icon={AlertCircle} title="加载失败" description="渠道数据获取失败" />
                        ) : (
                            <RankBar
                                data={toRank(channelsQ.data ?? [])}
                                valueFormatter={rankValueFormatter}
                                loading={channelsQ.isLoading}
                                height={320}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default Overview;
