import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Server, ShieldCheck, ShieldAlert, ShieldX, KeyRound } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { useChannelsOverview } from '../api/hooks';
import { fetchChannelKeys } from '../api/client';
import { useUIStore } from '../stores/ui';
import { formatCostByMode, type CurrencyMode } from '../lib/currency';
import { formatLatency, formatNumber, formatPercent, formatQuota, maskValue } from '../lib/format';
import { cn } from '../lib/cn';
import type { StatCardProps } from '../components/StatCard';
import type { ColumnDef } from '@tanstack/react-table';
import type { ChannelOverviewRow, ChannelKeyDetail } from '../api/types';

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

function KeyStatusBadge({ status }: { status: number }) {
    const meta = STATUS_META[status] ?? STATUS_META[1];
    return <Badge className={cn('text-xs', meta.className)}>{meta.label}</Badge>;
}

function KeyDetailTable({ keys, currencyMode }: { keys: ChannelKeyDetail[]; currencyMode: CurrencyMode }) {
    const formatKeyCost = (quota: number) =>
        currencyMode === 'token' ? formatQuota(quota) : formatCostByMode(quota, 0, currencyMode);

    return (
        <div className="max-h-[60vh] overflow-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>密钥</TableHead>
                        <TableHead className="w-20">状态</TableHead>
                        <TableHead className="text-right">请求</TableHead>
                        <TableHead className="text-right">错误率</TableHead>
                        <TableHead className="text-right">Token</TableHead>
                        <TableHead className="text-right">费用</TableHead>
                        <TableHead className="text-right">延迟</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {keys.map((k) => (
                        <TableRow key={k.key_index}>
                            <TableCell className="font-mono text-xs tabular-nums">{k.key_index}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{k.key_label}</TableCell>
                            <TableCell><KeyStatusBadge status={k.status} /></TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(k.requests, 0)}</TableCell>
                            <TableCell className="text-right">
                                <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', errorRateClass(k.error_rate))}>
                                    {formatPercent(k.error_rate)}
                                </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(k.tokens, 0)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatKeyCost(k.quota)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatLatency(k.avg_latency_ms)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

const Channels = () => {
    const currencyMode = useUIStore((s) => s.currencyMode);
    const masked = useUIStore((s) => s.masked);
    const { data, isLoading, isError } = useChannelsOverview({ refetchInterval: 30000 });
    const channels = data?.channels ?? [];
    const statusCount = data?.statusCount;

    const [selectedChannel, setSelectedChannel] = useState<{ id: number; name: string } | null>(null);

    const { data: keysData, isLoading: keysLoading, isError: keysError } = useQuery({
        queryKey: ['channel-keys', selectedChannel?.id],
        queryFn: () => fetchChannelKeys(selectedChannel!.id),
        enabled: !!selectedChannel,
        staleTime: 30_000,
    });

    const formatChannelCost = (usedQuota: number) =>
        currencyMode === 'token' ? formatQuota(usedQuota) : formatCostByMode(usedQuota, 0, currencyMode);

    const columns: ColumnDef<ChannelOverviewRow>[] = [
        {
            accessorKey: 'name',
            header: '渠道',
            cell: ({ row }) => (
                <div className="flex items-center gap-2">
                    <span className="font-medium">{masked ? maskValue(row.original.name) : row.original.name}</span>
                    {row.original.is_multi_key && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={() => setSelectedChannel({ id: row.original.id, name: row.original.name })}
                        >
                            <KeyRound className="h-3 w-3" />
                            {row.original.multi_key_size} 密钥
                            {row.original.multi_key_mode && (
                                <span className="text-muted-foreground">({row.original.multi_key_mode})</span>
                            )}
                        </Button>
                    )}
                </div>
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
        { label: '渠道总数', value: data ? formatNumber(data.total, 0) : '--', icon: Server, loading: isLoading },
        { label: '启用', value: statusCount ? formatNumber(statusCount.enabled, 0) : '--', icon: ShieldCheck, loading: isLoading },
        { label: '已禁用', value: statusCount ? formatNumber(statusCount.disabled, 0) : '--', icon: ShieldAlert, loading: isLoading },
        { label: '自动禁用', value: statusCount ? formatNumber(statusCount.autoDisabled, 0) : '--', icon: ShieldX, loading: isLoading },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="渠道监控" description="渠道状态、用量、错误率与平均延迟" icon={Server} />
            <KpiStrip items={kpiItems} />
            <Card>
                <CardHeader><CardTitle>渠道列表</CardTitle></CardHeader>
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
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{masked ? maskValue(c.name) : c.name}</span>
                                                {c.is_multi_key && (
                                                    <Button
                                                        variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"
                                                        onClick={() => setSelectedChannel({ id: c.id, name: c.name })}
                                                    >
                                                        <KeyRound className="h-3 w-3" />{c.multi_key_size}密钥
                                                    </Button>
                                                )}
                                            </div>
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

            <Dialog open={!!selectedChannel} onOpenChange={(open) => { if (!open) setSelectedChannel(null); }}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5" />
                            {selectedChannel?.name} - 密钥详情
                        </DialogTitle>
                        <DialogDescription>
                            {keysData?.is_multi_key
                                ? `多密钥模式: ${keysData.multi_key_mode} · 共 ${keysData.multi_key_size} 个密钥`
                                : '该渠道未启用多密钥模式'}
                        </DialogDescription>
                    </DialogHeader>
                    {keysError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="密钥数据获取失败" />
                    ) : keysLoading ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
                    ) : keysData && keysData.keys.length > 0 ? (
                        <KeyDetailTable keys={keysData.keys} currencyMode={currencyMode} />
                    ) : (
                        <EmptyState icon={KeyRound} title="暂无密钥数据" description="该渠道可能尚未产生多密钥日志" />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Channels;