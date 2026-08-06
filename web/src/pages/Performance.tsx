import { useMemo } from 'react';
import { Gauge, AlertCircle, Activity, Timer, Zap, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import TrendChart from '../components/charts/TrendChart';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useLatencyAnalysis } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { formatHourLabel, formatEpochSeconds, presetToRange } from '../lib/time';
import { formatNumber, formatPercent, formatLatency } from '../lib/format';
import type { ColumnDef } from '@tanstack/react-table';
import type { StatCardProps } from '../components/StatCard';
import type { LatencyTrendPoint } from '../api/types';

interface SlowRequest {
    id: number;
    useTime: number;
    modelName: string;
    channelId: number;
    createdAt: string;
}

const Performance = () => {
    const timePreset = useUIStore((s) => s.timePreset);
    const { startTs, endTs } = useMemo(() => presetToRange(timePreset), [timePreset]);

    const { data, isLoading, isError } = useLatencyAnalysis(startTs, endTs, { refetchInterval: 60000 });
    const trend = useMemo<LatencyTrendPoint[]>(() => data?.latency_trend ?? [], [data]);
    const slow: SlowRequest[] = data?.slow_requests ?? [];

    const categories = useMemo(() => trend.map((p) => formatHourLabel(p.hour)), [trend]);

    const charts = [
        { title: '平均延迟 (ms)', series: [{ name: '平均延迟', data: trend.map((p) => p.avg_latency_ms) }] },
        { title: 'TTFT (ms)', series: [{ name: 'TTFT', data: trend.map((p) => p.avg_ttft_ms) }] },
        { title: 'TPS', series: [{ name: 'TPS', data: trend.map((p) => p.tps) }] },
        { title: '成功率', series: [{ name: '成功率', data: trend.map((p) => p.success_rate) }] },
    ];

    const kpiItems: StatCardProps[] = useMemo(() => {
        const n = trend.length;
        const sumRpm = n ? trend.reduce((acc, p) => acc + p.rpm, 0) : 0;
        const avgLat = n ? trend.reduce((acc, p) => acc + p.avg_latency_ms, 0) / n : NaN;
        const avgTtft = n ? trend.reduce((acc, p) => acc + p.avg_ttft_ms, 0) / n : NaN;
        const avgSuccess = n ? trend.reduce((acc, p) => acc + p.success_rate, 0) / n : NaN;
        return [
            {
                label: '总请求（窗口）',
                value: n ? formatNumber(sumRpm, 0) : '--',
                icon: Activity,
                loading: isLoading,
            },
            {
                label: '平均延迟',
                value: Number.isFinite(avgLat) ? formatLatency(avgLat) : '--',
                icon: Timer,
                loading: isLoading,
            },
            {
                label: '平均 TTFT',
                value: Number.isFinite(avgTtft) ? formatLatency(avgTtft) : '--',
                icon: Zap,
                loading: isLoading,
            },
            {
                label: '平均成功率',
                value: Number.isFinite(avgSuccess) ? formatPercent(avgSuccess) : '--',
                icon: CheckCircle2,
                loading: isLoading,
            },
        ];
    }, [trend, isLoading]);

    const slowColumns: ColumnDef<SlowRequest>[] = [
        { accessorKey: 'id', header: '日志 ID', cell: ({ row }) => formatNumber(row.original.id, 0) },
        {
            accessorKey: 'modelName',
            header: '模型',
            cell: ({ row }) => (
                <span className="block max-w-[160px] truncate font-medium" title={row.original.modelName}>
                    {row.original.modelName}
                </span>
            ),
        },
        { accessorKey: 'channelId', header: '渠道 ID', cell: ({ row }) => formatNumber(row.original.channelId, 0) },
        {
            accessorKey: 'useTime',
            header: '耗时',
            cell: ({ row }) => (
                <span className="font-mono tabular-nums">{row.original.useTime.toFixed(2)} s</span>
            ),
        },
        {
            accessorKey: 'createdAt',
            header: '时间',
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatEpochSeconds(Number(row.original.createdAt))}
                </span>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="性能分析" description="延迟趋势、TTFT、TPS 与慢请求" icon={Gauge} />

            {isError ? (
                <Card>
                    <CardContent className="p-6">
                        <EmptyState icon={AlertCircle} title="加载失败" description="性能数据获取失败" />
                    </CardContent>
                </Card>
            ) : (
                <>
                    <KpiStrip items={kpiItems} />

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {charts.map((c) => (
                            <Card key={c.title}>
                                <CardHeader>
                                    <CardTitle>{c.title}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <TrendChart
                                        categories={categories}
                                        series={c.series}
                                        loading={isLoading}
                                        height={260}
                                    />
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>慢请求 Top 20</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DataTable
                                columns={slowColumns}
                                data={slow}
                                enableSorting
                                loading={isLoading}
                                emptyTitle="暂无慢请求"
                                skeletonRows={6}
                                renderMobileCard={(r) => (
                                    <div className="space-y-1">
                                        <div className="font-medium">{r.modelName}</div>
                                        <div className="text-sm text-muted-foreground">
                                            耗时 {r.useTime.toFixed(2)} s · 渠道 {r.channelId}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            {formatEpochSeconds(Number(r.createdAt))}
                                        </div>
                                    </div>
                                )}
                            />
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
};

export default Performance;
