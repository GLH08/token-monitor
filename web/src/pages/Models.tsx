import { useMemo } from 'react';
import { Cpu, AlertCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useModelsAnalysis } from '../api/hooks';
import { useUIStore } from '../stores/ui';
import { presetToRange } from '../lib/time';
import { CNY_USD_RATE, formatCostByMode } from '../lib/currency';
import {
    formatCny,
    formatLatency,
    formatNumber,
    formatPercent,
    formatTokens,
    formatTPS,
    formatUsd,
} from '../lib/format';
import type { StatCardProps } from '../components/StatCard';
import type { ColumnDef } from '@tanstack/react-table';
import type { ModelAnalysisRow } from '../api/types';

const Models = () => {
    const timePreset = useUIStore((s) => s.timePreset);
    const currencyMode = useUIStore((s) => s.currencyMode);
    const { startTs, endTs } = useMemo(() => presetToRange(timePreset), [timePreset]);
    const rangeParams = { start_ts: startTs, end_ts: endTs };

    const { data, isLoading, isError } = useModelsAnalysis(rangeParams, { refetchInterval: 60000 });
    const models = data?.models ?? [];
    const summary = data?.summary;

    const columns = useMemo<ColumnDef<ModelAnalysisRow>[]>(
        () => [
            {
                accessorKey: 'model_name',
                header: '模型',
                cell: ({ row }) => <span className="font-medium">{row.original.model_name}</span>,
            },
            {
                accessorKey: 'cost_usd',
                header: '费用',
                cell: ({ row }) => formatCostByMode(row.original.quota, row.original.tokens, currencyMode),
            },
            { accessorKey: 'tokens', header: 'Tokens', cell: ({ row }) => formatTokens(row.original.tokens) },
            {
                accessorKey: 'requests',
                header: '请求数',
                cell: ({ row }) => formatNumber(row.original.requests, 0),
            },
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
                accessorKey: 'cache_creation_tokens',
                header: '缓存写入',
                cell: ({ row }) => formatTokens(row.original.cache_creation_tokens),
            },
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
        [currencyMode],
    );

    const kpiItems: StatCardProps[] = [
        {
            label: '模型数',
            value: summary ? formatNumber(summary.totalModels, 0) : '--',
            icon: Cpu,
            loading: isLoading,
        },
        {
            label: '请求数',
            value: summary ? formatNumber(summary.totalRequests, 0) : '--',
            loading: isLoading,
        },
        {
            label: '错误数',
            value: summary ? formatNumber(summary.totalErrors, 0) : '--',
            loading: isLoading,
        },
        {
            label: currencyMode === 'token' ? 'Tokens 用量' : '总费用',
            value: summary
                ? currencyMode === 'token'
                    ? formatTokens(summary.totalTokens)
                    : currencyMode === 'cny'
                      ? formatCny(summary.total_cost_usd * CNY_USD_RATE)
                      : formatUsd(summary.total_cost_usd)
                : '--',
            loading: isLoading,
        },
        {
            label: '成功率',
            value: summary ? formatPercent(summary.success_rate) : '--',
            loading: isLoading,
        },
        {
            label: '缓存命中',
            value: summary ? formatPercent(summary.cache_hit_ratio) : '--',
            loading: isLoading,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="模型分析" description="各模型的用量、成本、缓存命中与延迟" icon={Cpu} />

            <KpiStrip items={kpiItems} />

            <Card>
                <CardHeader>
                    <CardTitle>模型明细</CardTitle>
                </CardHeader>
                <CardContent>
                    {isError ? (
                        <EmptyState icon={AlertCircle} title="加载失败" description="模型数据获取失败" />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={models}
                            enableSorting
                            loading={isLoading}
                            emptyTitle="暂无模型数据"
                            skeletonRows={8}
                            renderMobileCard={(m) => (
                                <div className="space-y-1">
                                    <div className="font-medium">{m.model_name}</div>
                                    <div className="text-sm text-muted-foreground">
                                        费用 {formatCostByMode(m.quota, m.tokens, currencyMode)} · Tokens {formatTokens(m.tokens)}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        请求 {formatNumber(m.requests, 0)} · 成功率 {formatPercent(m.success_rate)} · 延迟 {formatLatency(m.avg_latency_ms)}
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

export default Models;
