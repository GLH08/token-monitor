import { AlertCircle, Server, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useChannelsOverview } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { formatCostByMode } from '../lib/currency';
import { formatLatency, formatNumber, formatPercent, formatQuota, maskValue } from '../lib/format';
import { cn } from '../lib/cn';
import type { StatCardProps } from '../components/StatCard';
import type { ColumnDef } from '@tanstack/react-table';
import type { ChannelOverviewRow } from '../api/types';

const STATUS_META: Record<number, { label: string; className: string }> = {
    1: { label: '启用', className: 'border-transparent bg-emerald-500/15 text-emerald-400' },
    2: { label: '已禁用', className: 'border-transparent bg-amber-500/15 text-amber-400' },
    3: { label: '自动禁用', className: 'border-transparent bg-red-500/15 text-red-400' },
};

function errorRateClass(errorRate: number): string {
    if (errorRate > 0.05) return 'bg-red-500/15 text-red-400';
    if (errorRate > 0.01) return 'bg-amber-500/15 text-amber-400';
    return 'bg-emerald-500/15 text-emerald-400';
}

const Channels = () => {
    const currencyMode = useUIStore((s) => s.currencyMode);
    const masked = useUIStore((s) => s.masked);
    const { data, isLoading, isError } = useChannelsOverview({ refetchInterval: 30000 });
    const channels = data?.channels ?? [];
    const statusCount = data?.statusCount;

    const formatChannelCost = (usedQuota: number) =>
        currencyMode === 'token' ? formatQuota(usedQuota) : formatCostByMode(usedQuota, 0, currencyMode);

    const columns: ColumnDef<ChannelOverviewRow>[] = [
        {
            accessorKey: 'name',
            header: '渠道',
            cell: ({ row }) => (
                <span className="font-medium">{masked ? maskValue(row.original.name) : row.original.name}</span>
            ),
        },
        {
            accessorKey: 'status',
            header: '状态',
            cell: ({ row }) => {
                const meta = STATUS_META[row.original.status] ?? STATUS_META[2];
                return <Badge className={meta.className}>{meta.label}</Badge>;
            },
        },
        {
            accessorKey: 'response_time',
            header: '响应时间',
            cell: ({ row }) => formatLatency(row.original.response_time),
        },
        {
            accessorKey: 'auto_ban',
            header: '自动禁用',
            cell: ({ row }) => (
                <Badge variant={row.original.auto_ban ? 'secondary' : 'outline'}>
                    {row.original.auto_ban ? '是' : '否'}
                </Badge>
            ),
        },
        {
            accessorKey: 'used_quota',
            header: '费用',
            cell: ({ row }) => formatChannelCost(row.original.used_quota),
        },
        {
            accessorKey: 'requests',
            header: '请求数',
            cell: ({ row }) => formatNumber(row.original.requests, 0),
        },
        {
            accessorKey: 'errors',
            header: '错误数',
            cell: ({ row }) => formatNumber(row.original.errors, 0),
        },
        {
            accessorKey: 'error_rate',
            header: '错误率',
            cell: ({ row }) => (
                <span className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', errorRateClass(row.original.error_rate))}>
                    {formatPercent(row.original.error_rate)}
                </span>
            ),
        },
        {
            accessorKey: 'avg_latency_ms',
            header: '平均延迟',
            cell: ({ row }) => formatLatency(row.original.avg_latency_ms),
        },
    ];

    const kpiItems: StatCardProps[] = [
        {
            label: '渠道总数',
            value: data ? formatNumber(data.total, 0) : '--',
            icon: Server,
            loading: isLoading,
        },
        {
            label: '启用',
            value: statusCount ? formatNumber(statusCount.enabled, 0) : '--',
            icon: ShieldCheck,
            loading: isLoading,
        },
        {
            label: '已禁用',
            value: statusCount ? formatNumber(statusCount.disabled, 0) : '--',
            icon: ShieldAlert,
            loading: isLoading,
        },
        {
            label: '自动禁用',
            value: statusCount ? formatNumber(statusCount.autoDisabled, 0) : '--',
            icon: ShieldX,
            loading: isLoading,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="渠道监控" description="渠道状态、用量、错误率与平均延迟" icon={Server} />

            <KpiStrip items={kpiItems} />

            <Card>
                <CardHeader>
                    <CardTitle>渠道列表</CardTitle>
                </CardHeader>
                <CardContent>
                    {isError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="渠道数据获取失败" />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={channels}
                            enableSorting
                            loading={isLoading}
                            emptyTitle="暂无渠道"
                            skeletonRows={6}
                            renderMobileCard={(c) => {
                                const meta = STATUS_META[c.status] ?? STATUS_META[2];
                                return (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">{masked ? maskValue(c.name) : c.name}</span>
                                            <Badge className={meta.className}>{meta.label}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            费用 {formatChannelCost(c.used_quota)} · 请求 {formatNumber(c.requests, 0)}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            错误率 {formatPercent(c.error_rate)} · 延迟 {formatLatency(c.avg_latency_ms)}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Channels;
