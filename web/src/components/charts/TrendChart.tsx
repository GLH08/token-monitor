import ReactEChartsCore from 'echarts-for-react/lib/core';
import { useMemo } from 'react';
import { echarts } from './echartsCore';
import { pickColors, useChartTheme } from './palette';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/cn';

export interface TrendSeries {
    name: string;
    data: number[];
}

interface TrendChartProps {
    categories: string[];
    series: TrendSeries[];
    height?: number;
    /** Cap to top-N series by sum and merge the rest into an "其他" series. */
    topN?: number;
    loading?: boolean;
    className?: string;
}

/** Stacked area trend with top-N + "其他" capping and a theme-aware Total tooltip. */
const TrendChart = ({
    categories,
    series,
    height = 300,
    topN,
    loading = false,
    className,
}: TrendChartProps) => {
    const theme = useChartTheme();

    const capped = useMemo(() => {
        if (!topN || series.length <= topN) return series;
        const ranked = [...series].sort((a, b) => sum(b.data) - sum(a.data));
        const head = ranked.slice(0, topN);
        const tail = ranked.slice(topN);
        if (tail.length === 0) return head;
        const otherData = categories.map((_, index) =>
            tail.reduce((acc, s) => acc + (s.data[index] ?? 0), 0),
        );
        return [...head, { name: '其他', data: otherData }];
    }, [series, categories, topN]);

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: 'axis',
                backgroundColor: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                textStyle: { color: theme.textColor },
                axisPointer: { type: 'cross' },
            },
            legend: {
                type: 'scroll' as const,
                top: 0,
                textStyle: { color: theme.textColor },
            },
            grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: categories,
                axisLine: { lineStyle: { color: theme.axisLineColor } },
                axisLabel: { color: theme.textColor },
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisLabel: { color: theme.textColor },
                splitLine: { lineStyle: { color: theme.splitLineColor } },
            },
            color: pickColors(capped.length),
            series: capped.map((s) => ({
                name: s.name,
                type: 'line' as const,
                stack: 'total',
                areaStyle: { opacity: 0.15 },
                emphasis: { focus: 'series' as const },
                data: s.data,
                smooth: true,
            })),
        }),
        [capped, categories, theme],
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

function sum(values: number[]): number {
    return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

export default TrendChart;
