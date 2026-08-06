import ReactEChartsCore from 'echarts-for-react/lib/core';
import { useMemo } from 'react';
import { echarts } from './echartsCore';
import { pickColors, useChartTheme } from './palette';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/cn';

export interface PieSlice {
    name: string;
    value: number;
}

interface DistributionPieProps {
    data: PieSlice[];
    height?: number;
    loading?: boolean;
    className?: string;
    /** Cap to top-N slices; merge rest into "其他". */
    topN?: number;
}

function truncateName(name: string, max = 18): string {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max)}…` : name;
}

/**
 * Donut chart with bottom scrollable legend (avoids legend/pie overlap for long model names).
 */
const DistributionPie = ({
    data,
    height = 300,
    loading = false,
    className,
    topN = 8,
}: DistributionPieProps) => {
    const theme = useChartTheme();

    const capped = useMemo(() => {
        const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
        if (sorted.length <= topN) return sorted;
        const head = sorted.slice(0, topN);
        const tail = sorted.slice(topN);
        const otherValue = tail.reduce((acc, d) => acc + d.value, 0);
        if (otherValue > 0) head.push({ name: '其他', value: otherValue });
        return head;
    }, [data, topN]);

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: 'item',
                backgroundColor: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                textStyle: { color: theme.textColor },
                // Full name in tooltip even when legend is truncated
                formatter: (params: { name: string; value: number; percent: number }) =>
                    `${params.name}<br/>${params.value} (${params.percent}%)`,
            },
            legend: {
                type: 'scroll' as const,
                orient: 'horizontal' as const,
                bottom: 0,
                left: 'center',
                width: '92%',
                itemWidth: 10,
                itemHeight: 10,
                itemGap: 12,
                pageIconSize: 10,
                textStyle: {
                    color: theme.textColor,
                    fontSize: 11,
                    width: 96,
                    overflow: 'truncate' as const,
                    ellipsis: '…',
                },
                formatter: (name: string) => truncateName(name, 14),
            },
            color: pickColors(capped.length),
            series: [
                {
                    name: '占比',
                    type: 'pie',
                    // Leave room above the bottom legend so they never overlap
                    radius: ['38%', '62%'],
                    center: ['50%', '42%'],
                    avoidLabelOverlap: true,
                    label: { show: false },
                    labelLine: { show: false },
                    emphasis: {
                        label: {
                            show: true,
                            fontSize: 12,
                            fontWeight: 'bold',
                            color: theme.textColor,
                            formatter: (p: { name: string }) => truncateName(p.name, 16),
                        },
                    },
                    data: capped.map((d) => ({ ...d, // keep full name for tooltip
                    })),
                },
            ],
        }),
        [capped, theme],
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

export default DistributionPie;
