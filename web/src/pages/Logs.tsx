import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, FileText, RotateCcw, Search, AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import { useLogs } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { presetToRange, formatEpochSeconds } from '../lib/time';
import { CNY_USD_RATE, formatCostByMode } from '../lib/currency';
import {
    formatCny,
    formatCompact,
    formatNumber,
    formatTPS,
    formatTTFT,
    formatTokens,
    formatUsd,
    maskValue,
} from '../lib/format';
import { cn } from '../lib/cn';
import type { StatCardProps } from '../components/StatCard';
import type { LogRow } from '../api/types';

const PAGE_SIZE = 20;

/** Compact zh-CN date-time for a log `createdAt` (epoch-seconds BigInt string). */
function formatLogTime(createdAt: string): string {
    const ts = Number(createdAt);
    if (!Number.isFinite(ts)) return '--';
    return new Date(ts * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function latencyColor(ms: number): string {
    if (!ms || ms <= 0) return 'text-muted-foreground';
    if (ms > 2000) return 'text-red-400';
    if (ms > 800) return 'text-amber-400';
    return 'text-emerald-400';
}

function secondsColor(sec: number): string {
    if (sec > 10) return 'text-red-400';
    if (sec > 3) return 'text-amber-400';
    return 'text-emerald-400';
}

const BILLING_SOURCE_META: Record<string, { label: string; className: string }> = {
    wallet: { label: '钱包', className: 'bg-violet-500/15 text-violet-400' },
    subscription: { label: '订阅', className: 'bg-sky-500/15 text-sky-400' },
};

interface FilterDraft {
    model_name: string;
    channel_id: string;
    request_id: string;
}

const EMPTY_DRAFT: FilterDraft = {
    model_name: '',
    channel_id: '',
    request_id: '',
};

// ==================== Log details dialog ====================

const DetailField = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="space-y-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-all">{value}</div>
    </div>
);

const BreakdownRow = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('font-mono text-sm tabular-nums', accent)}>{value}</span>
    </div>
);

// new-api uses -1 as the "unset" sentinel for ratios/price; 0 means not present
// either. Render both as "-" so the billing section never shows bogus -1/$-1.
const formatRatio = (v: number): string => (Number.isFinite(v) && v > 0 ? v.toFixed(4) : '-');
const formatPrice = (v: number): string => (Number.isFinite(v) && v > 0 ? formatUsd(v) : '-');

const LogDetailsDialog = ({
    log,
    onOpenChange,
    masked,
}: {
    log: LogRow | null;
    onOpenChange: (open: boolean) => void;
    masked: boolean;
}) => (
    <Dialog open={!!log} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
                <DialogTitle>日志详情</DialogTitle>
                <DialogDescription>日志 ID: {log?.id ?? '--'}</DialogDescription>
            </DialogHeader>
            {log ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <DetailField label="时间" value={formatEpochSeconds(Number(log.createdAt))} />
                        <DetailField
                            label="耗时"
                            value={
                                <span className={cn('font-mono tabular-nums', secondsColor(log.use_time_sec))}>
                                    {log.use_time_sec.toFixed(2)} s
                                </span>
                            }
                        />
                        <DetailField label="模型" value={log.modelName || '-'} />
                        <DetailField label="渠道" value={`#${log.channelId}`} />
                        <DetailField
                            label="用户"
                            value={masked ? maskValue(log.username) : log.username || '-'}
                        />
                        <DetailField
                            label="Token"
                            value={
                                <span>
                                    {masked ? maskValue(log.tokenName) : log.tokenName || '-'}
                                    <span className="ml-1 text-xs text-muted-foreground">#{log.tokenId}</span>
                                </span>
                            }
                        />
                        <DetailField
                            label="分组"
                            value={masked ? maskValue(log.group) : log.group || '-'}
                        />
                        <DetailField label="流式" value={log.is_stream ? '是' : '否'} />
                        <DetailField
                            label="计费来源"
                            value={
                                log.billing_source
                                    ? (BILLING_SOURCE_META[log.billing_source]?.label ?? log.billing_source)
                                    : '-'
                            }
                        />
                        <DetailField
                            label="请求 ID"
                            value={<span className="font-mono text-xs">{log.request_id || '-'}</span>}
                        />
                        <DetailField
                            label="上游 ID"
                            value={<span className="font-mono text-xs">{log.upstream_request_id || '-'}</span>}
                        />
                    </div>

                    <div className="rounded-lg border p-4">
                        <div className="mb-2 text-sm font-semibold">Token 消耗</div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3">
                            <BreakdownRow label="输入 (Prompt)" value={formatNumber(log.promptTokens, 0)} />
                            <BreakdownRow label="输出 (Completion)" value={formatNumber(log.completionTokens, 0)} />
                            <BreakdownRow
                                label="缓存读取"
                                value={formatNumber(log.cache_read_tokens, 0)}
                                accent="text-amber-400"
                            />
                            <BreakdownRow
                                label="缓存写入"
                                value={formatNumber(log.cache_write_tokens, 0)}
                                accent="text-sky-400"
                            />
                            <BreakdownRow
                                label="总输入（含缓存）"
                                value={formatNumber(log.total_input_tokens, 0)}
                                accent="text-violet-400"
                            />
                            <BreakdownRow
                                label="吞吐总量（输入+输出）"
                                value={formatNumber(log.throughput_total, 0)}
                                accent="text-primary"
                            />
                            <BreakdownRow label="图像" value={formatNumber(log.image_tokens, 0)} />
                            <BreakdownRow label="音频" value={formatNumber(log.audio_tokens, 0)} />
                            <BreakdownRow
                                label="基础合计（输入+输出）"
                                value={formatNumber(log.totalTokens, 0)}
                                accent="text-primary"
                            />
                        </div>
                    </div>

                    <div className="rounded-lg border p-4">
                        <div className="mb-2 text-sm font-semibold">计费明细</div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                            <BreakdownRow label="模型倍率" value={formatRatio(log.ratios.model)} />
                            <BreakdownRow label="补全倍率" value={formatRatio(log.ratios.completion)} />
                            <BreakdownRow label="分组倍率" value={formatRatio(log.ratios.group)} />
                            <BreakdownRow label="缓存倍率" value={formatRatio(log.ratios.cache)} />
                            <BreakdownRow label="用户分组倍率" value={formatRatio(log.ratios.userGroup)} />
                            <BreakdownRow label="模型单价" value={formatPrice(log.ratios.modelPrice)} />
                            <BreakdownRow
                                label="费用 (USD)"
                                value={formatUsd(log.cost_usd)}
                                accent="text-emerald-400"
                            />
                            <BreakdownRow
                                label="计费来源"
                                value={
                                    log.billing_source
                                        ? (BILLING_SOURCE_META[log.billing_source]?.label ?? log.billing_source)
                                        : '-'
                                }
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </DialogContent>
    </Dialog>
);

// ==================== Logs page ====================

const Logs = () => {
    const timePreset = useUIStore((s) => s.timePreset);
    const currencyMode = useUIStore((s) => s.currencyMode);
    const masked = useUIStore((s) => s.masked);
    const { startTs, endTs } = useMemo(() => presetToRange(timePreset), [timePreset]);

    const [searchParams, setSearchParams] = useSearchParams();
    const urlModel = searchParams.get('model_name') ?? '';
    const urlChannel = searchParams.get('channel_id') ?? '';
    const urlRequest = searchParams.get('request_id') ?? '';
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

    // Draft-then-apply: edits live in local state, only committed to the URL on Search/Enter.
    const [draft, setDraft] = useState<FilterDraft>({
        model_name: urlModel,
        channel_id: urlChannel,
        request_id: urlRequest,
    });
    const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);

    // Keep the draft in sync when the URL changes externally (back/forward, reset).
    useEffect(() => {
        setDraft({
            model_name: urlModel,
            channel_id: urlChannel,
            request_id: urlRequest,
        });
    }, [urlModel, urlChannel, urlRequest]);

    const upsertParam = (sp: URLSearchParams, key: string, value: string) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
    };

    const handleSearch = () => {
        const next = new URLSearchParams(searchParams);
        upsertParam(next, 'model_name', draft.model_name.trim());
        upsertParam(next, 'channel_id', draft.channel_id.trim());
        upsertParam(next, 'request_id', draft.request_id.trim());
        next.delete('page');
        setSearchParams(next);
    };

    const handleReset = () => {
        setDraft(EMPTY_DRAFT);
        const next = new URLSearchParams(searchParams);
        ['model_name', 'channel_id', 'request_id', 'page'].forEach((k) => next.delete(k));
        setSearchParams(next);
    };

    const handleEnterKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    };

    const goToPage = (p: number) => {
        const next = new URLSearchParams(searchParams);
        if (p <= 1) next.delete('page');
        else next.set('page', String(p));
        setSearchParams(next);
    };

    const activeFilterCount = [urlModel, urlChannel, urlRequest].filter(Boolean).length;

    const { data, isLoading, isError } = useLogs({
        start_ts: startTs,
        end_ts: endTs,
        model_name: urlModel || undefined,
        channel_id: urlChannel || undefined,
        request_id: urlRequest || undefined,
        page,
        pageSize: PAGE_SIZE,
    });

    const logs = data?.data ?? [];
    const total = data?.total ?? 0;
    const currentPage = data?.page ?? page;
    const pageSize = data?.pageSize ?? PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safeStats = data?.stats ?? {
        total_tokens: 0,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_write_tokens: 0,
        total_input_tokens: 0,
        throughput_total: 0,
        total_cost: 0,
    };

    const formatStatsCost = (): string => {
        const usd = safeStats.total_cost;
        if (currencyMode === 'cny') return formatCny(usd * CNY_USD_RATE);
        return formatUsd(usd);
    };

    const columns: ColumnDef<LogRow>[] = [
        {
            accessorKey: 'createdAt',
            header: '时间',
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLogTime(row.original.createdAt)}
                </span>
            ),
        },
        {
            accessorKey: 'type',
            header: '类型',
            cell: () => (
                <Badge className="border-transparent bg-cyan-500/15 text-cyan-400">消费</Badge>
            ),
        },
        {
            accessorKey: 'username',
            header: '用户',
            cell: ({ row }) => (
                <span className="text-xs">
                    {masked ? maskValue(row.original.username) : row.original.username || '-'}
                </span>
            ),
        },
        {
            accessorKey: 'tokenName',
            header: 'Token',
            cell: ({ row }) => (
                <span className="text-xs">
                    {masked ? maskValue(row.original.tokenName) : row.original.tokenName || '-'}
                </span>
            ),
        },
        {
            accessorKey: 'modelName',
            header: '模型',
            cell: ({ row }) => (
                <span
                    className="block max-w-[180px] truncate text-xs font-medium"
                    title={row.original.modelName}
                >
                    {row.original.modelName || '-'}
                </span>
            ),
        },
        {
            accessorKey: 'channelId',
            header: '渠道',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">#{row.original.channelId}</span>
            ),
        },
        {
            id: 'tokens',
            header: 'Tokens (入/出)',
            cell: ({ row }) => {
                const r = row.original;
                const hasCache = r.cache_read_tokens > 0 || r.cache_write_tokens > 0;
                return (
                    <div className="space-y-0.5">
                        <div className="font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{formatCompact(r.promptTokens)}</span>
                            <span className="text-muted-foreground/50"> / </span>
                            <span>{formatCompact(r.completionTokens)}</span>
                        </div>
                        {hasCache ? (
                            <div className="whitespace-nowrap font-mono text-[10px] tabular-nums">
                                <span className="text-amber-400">↓{formatCompact(r.cache_read_tokens)}</span>
                                {r.cache_write_tokens > 0 ? (
                                    <span className="text-sky-400"> ↑{formatCompact(r.cache_write_tokens)}</span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                );
            },
        },
        {
            id: 'media',
            header: '图/音',
            cell: ({ row }) => {
                const r = row.original;
                if (r.image_tokens <= 0 && r.audio_tokens <= 0) {
                    return <span className="text-xs text-muted-foreground/40">--</span>;
                }
                return (
                    <div className="whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground">
                        <span>图{formatCompact(r.image_tokens)}</span>
                        {r.audio_tokens > 0 ? <span className="ml-1">音{formatCompact(r.audio_tokens)}</span> : null}
                    </div>
                );
            },
        },
        {
            accessorKey: 'frt_ms',
            header: 'TTFT',
            cell: ({ row }) => {
                const ms = row.original.frt_ms;
                if (!ms || ms <= 0) return <span className="text-xs text-muted-foreground/40">--</span>;
                return <span className={cn('font-mono text-xs tabular-nums', latencyColor(ms))}>{formatTTFT(ms)}</span>;
            },
        },
        {
            accessorKey: 'tps',
            header: 'TPS',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">{formatTPS(row.original.tps)}</span>
            ),
        },
        {
            accessorKey: 'use_time_sec',
            header: '耗时',
            cell: ({ row }) => (
                <span className={cn('font-mono text-xs tabular-nums', secondsColor(row.original.use_time_sec))}>
                    {row.original.use_time_sec.toFixed(2)}s
                </span>
            ),
        },
        {
            id: 'cost',
            header: currencyMode === 'token' ? '计费 Token' : '费用',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">
                    {formatCostByMode(row.original.quota, row.original.totalTokens, currencyMode)}
                </span>
            ),
        },
        {
            accessorKey: 'billing_source',
            header: '计费',
            cell: ({ row }) => {
                const src = row.original.billing_source;
                if (!src) return <span className="text-xs text-muted-foreground/40">--</span>;
                const meta = BILLING_SOURCE_META[src];
                return (
                    <Badge className={cn('border-transparent', meta?.className ?? '')}>
                        {meta?.label ?? src}
                    </Badge>
                );
            },
        },
    ];

    const kpiItems: StatCardProps[] = [
        { label: '筛选结果', value: formatNumber(total, 0), icon: FileText, loading: isLoading },
        { label: '总 Token', value: formatTokens(safeStats.total_tokens), icon: Search, loading: isLoading },
        { label: '输入', value: formatTokens(safeStats.total_prompt_tokens), icon: ArrowDown, loading: isLoading },
        { label: '输出', value: formatTokens(safeStats.total_completion_tokens), icon: ArrowUp, loading: isLoading },
        { label: '缓存读取', value: formatTokens(safeStats.total_cache_read_tokens), icon: Database, loading: isLoading },
        { label: '缓存写入', value: formatTokens(safeStats.total_cache_write_tokens), icon: Database, loading: isLoading },
        {
            label: currencyMode === 'token' ? '总费用 (USD)' : '总费用',
            value: formatStatsCost(),
            icon: AlertCircle,
            loading: isLoading,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="日志明细" description="消费请求明细 · 多维筛选 · 详情查看" icon={FileText} />

            <KpiStrip items={kpiItems} />

            <Card>
                <CardHeader>
                    <CardTitle>请求日志</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            placeholder="模型名称"
                            value={draft.model_name}
                            onChange={(e) => setDraft({ ...draft, model_name: e.target.value })}
                            onKeyDown={handleEnterKey}
                            className="h-9 w-40"
                        />
                        <Input
                            placeholder="渠道 ID"
                            value={draft.channel_id}
                            onChange={(e) => setDraft({ ...draft, channel_id: e.target.value })}
                            onKeyDown={handleEnterKey}
                            className="h-9 w-28"
                        />
                        <Input
                            placeholder="请求 ID"
                            value={draft.request_id}
                            onChange={(e) => setDraft({ ...draft, request_id: e.target.value })}
                            onKeyDown={handleEnterKey}
                            className="h-9 w-44"
                        />
                        <Button size="sm" onClick={handleSearch}>
                            <Search />
                            搜索
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleReset}>
                            <RotateCcw />
                            重置
                        </Button>
                        {activeFilterCount > 0 ? (
                            <Badge variant="secondary">{activeFilterCount} 个筛选</Badge>
                        ) : null}
                    </div>

                    {isError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="日志数据获取失败" />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={logs}
                            loading={isLoading}
                            emptyTitle="暂无日志"
                            emptyDescription="尝试调整筛选条件或时间范围"
                            skeletonRows={8}
                            onRowClick={(row) => setSelectedLog(row)}
                            renderMobileCard={(r) => (
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {formatLogTime(r.createdAt)}
                                        </span>
                                        <span className={cn('font-mono text-xs tabular-nums', secondsColor(r.use_time_sec))}>
                                            {r.use_time_sec.toFixed(2)}s
                                        </span>
                                    </div>
                                    <div className="truncate text-sm font-medium">{r.modelName}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {masked ? maskValue(r.username) : r.username} · 渠道 #{r.channelId}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
                                        <span>
                                            <span className="text-muted-foreground">入 {formatCompact(r.promptTokens)}</span>{' '}
                                            出 {formatCompact(r.completionTokens)}
                                        </span>
                                        {(r.cache_read_tokens > 0 || r.cache_write_tokens > 0) ? (
                                            <span>
                                                <span className="text-amber-400">↓{formatCompact(r.cache_read_tokens)}</span>
                                                {r.cache_write_tokens > 0 ? (
                                                    <span className="text-sky-400"> ↑{formatCompact(r.cache_write_tokens)}</span>
                                                ) : null}
                                            </span>
                                        ) : null}
                                        {r.frt_ms > 0 ? (
                                            <span className={latencyColor(r.frt_ms)}>TTFT {Math.round(r.frt_ms)}</span>
                                        ) : null}
                                        <span>{formatTPS(r.tps)}</span>
                                    </div>
                                    <div className="font-mono text-xs text-emerald-400">
                                        {formatCostByMode(r.quota, r.totalTokens, currencyMode)}
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                            共 {formatNumber(total, 0)} 条 · 第 {currentPage}/{totalPages} 页
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={currentPage <= 1}
                                onClick={() => goToPage(currentPage - 1)}
                            >
                                <ChevronLeft />
                                上一页
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={currentPage >= totalPages}
                                onClick={() => goToPage(currentPage + 1)}
                            >
                                下一页
                                <ChevronRight />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <LogDetailsDialog log={selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)} masked={masked} />
        </div>
    );
};

export default Logs;
