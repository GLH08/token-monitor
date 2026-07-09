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
    /** Cap to the top-N slices by value and merge the rest into an "其他" slice.
     * Keeps the legend + labels readable when there are many models. */
    topN?: number;
}

/** Donut distribution chart. With many slices, on-pie labels overlap and the
 * legend overflows, so labels are hidden (legend + tooltip carry the names) and
 * the data is capped to top-N + "其他". */
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
                formatter: '{b}: {c} ({d}%)',
            },
            legend: {
                type: 'scroll' as const,
                orient: 'vertical' as const,
                right: 0,
                top: 'middle' as const,
                textStyle: { color: theme.textColor },
            },
            color: pickColors(capped.length),
            series: [
                {
                    name: '占比',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    center: ['38%', '50%'],
                    avoidLabelOverlap: true,
                    // Hide on-pie labels (they overlap with many slices); the
                    // scrollable legend + tooltip carry the names/values.
                    label: { show: false },
                    labelLine: { show: false },
                    emphasis: {
                        label: { show: true, fontSize: 14, fontWeight: 'bold', color: theme.textColor },
                    },
                    data: capped,
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
