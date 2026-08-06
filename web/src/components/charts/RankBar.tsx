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

/** Horizontal ranking bar chart (largest at top). */
const RankBar = ({ data, height = 300, loading = false, className, valueFormatter }: RankBarProps) => {
    const theme = useChartTheme();

    const ranked = useMemo(
        () => [...data].sort((a, b) => b.value - a.value),
        [data],
    );

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                textStyle: { color: theme.textColor },
                valueFormatter: valueFormatter
                    ? (params: { value: unknown }) => valueFormatter(Number(params.value))
                    : undefined,
            },
            grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
            xAxis: {
                type: 'value',
                axisLine: { show: false },
                axisLabel: { color: theme.textColor },
                splitLine: { lineStyle: { color: theme.splitLineColor } },
            },
            yAxis: {
                type: 'category',
                data: ranked.map((item) => item.name).reverse(),
                axisLine: { lineStyle: { color: theme.axisLineColor } },
                axisLabel: {
                    color: theme.textColor,
                    width: 120,
                    overflow: 'truncate',
                    ellipsis: '…',
                    // Keep long model names from colliding with bars
                    formatter: (value: string) =>
                        value && value.length > 18 ? `${value.slice(0, 18)}…` : value,
                },
            },
            color: pickColors(1),
            series: [
                {
                    type: 'bar',
                    data: ranked.map((item) => item.value).reverse(),
                    barMaxWidth: 24,
                    itemStyle: { borderRadius: [0, 4, 4, 0] },
                    label: {
                        show: true,
                        position: 'right',
                        color: theme.textColor,
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
