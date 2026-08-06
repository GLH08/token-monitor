import ReactEChartsCore from 'echarts-for-react/lib/core';
import { useMemo } from 'react';
import { echarts } from './echartsCore';
import { pickColors, useChartTheme } from './palette';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/cn';

export interface RankItem {
    name: string;
    value: number;
}

interface RankBarProps {
    data: RankItem[];
    height?: number;
    loading?: boolean;
    className?: string;
    /** Formats the right-side data label; defaults to the raw number. */
    valueFormatter?: (value: number) => string;
}

function truncateLabel(name: string, max = 14): string {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max)}…` : name;
}

/** Horizontal ranking bar chart (largest at top). */
const RankBar = ({ data, height = 300, loading = false, className, valueFormatter }: RankBarProps) => {
    const theme = useChartTheme();

    const ranked = useMemo(
        () => [...data].sort((a, b) => b.value - a.value).slice(0, 10),
        [data],
    );

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                textStyle: { color: theme.textColor, fontSize: 12 },
                // Full name + formatted value (axis labels may be truncated)
                formatter: (params: unknown) => {
                    const list = Array.isArray(params) ? params : [params];
                    const p = list[0] as { name?: string; value?: unknown; dataIndex?: number };
                    const fullName =
                        ranked[ranked.length - 1 - (p.dataIndex ?? 0)]?.name ?? p.name ?? '';
                    const raw = Number(p.value);
                    const val = valueFormatter ? valueFormatter(raw) : String(raw);
                    return `${fullName}<br/>${val}`;
                },
            },
            // Extra right room for bar value labels; left for category names
            grid: { left: 12, right: 56, top: 12, bottom: 12, containLabel: true },
            xAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                // Hide dense numeric ticks — values are on bar labels / tooltip
                axisLabel: { show: false },
                splitLine: {
                    show: true,
                    lineStyle: { color: theme.splitLineColor, type: 'dashed' },
                },
            },
            yAxis: {
                type: 'category',
                data: ranked.map((item) => item.name).reverse(),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: theme.axisLineColor } },
                axisLabel: {
                    color: theme.textColor,
                    fontSize: 11,
                    // Prevent name pile-up on the category axis
                    interval: 0,
                    hideOverlap: true,
                    width: 100,
                    overflow: 'truncate',
                    ellipsis: '…',
                    formatter: (value: string) => truncateLabel(value, 14),
                },
            },
            color: pickColors(1),
            series: [
                {
                    type: 'bar',
                    data: ranked.map((item) => item.value).reverse(),
                    barMaxWidth: 18,
                    barCategoryGap: '40%',
                    itemStyle: { borderRadius: [0, 6, 6, 0] },
                    label: {
                        show: true,
                        position: 'right',
                        distance: 6,
                        color: theme.textColor,
                        fontSize: 11,
                        formatter: valueFormatter
                            ? (params: { value: unknown }) => valueFormatter(Number(params.value))
                            : undefined,
                    },
                },
            ],
        }),
        [ranked, theme, valueFormatter],
    );

    if (loading) {
        return <Skeleton className={cn('w-full', className)} style={{ height }} />;
    }

    return (
        <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height, width: '100%' }}
            notMerge
            lazyUpdate
            className={className}
        />
    );
};

export default RankBar;
