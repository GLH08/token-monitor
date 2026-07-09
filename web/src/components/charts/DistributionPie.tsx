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
}

/** Donut distribution chart. */
const DistributionPie = ({ data, height = 300, loading = false, className }: DistributionPieProps) => {
    const theme = useChartTheme();

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
            color: pickColors(data.length),
            series: [
                {
                    name: '占比',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    center: ['40%', '50%'],
                    avoidLabelOverlap: true,
                    label: { color: theme.textColor },
                    emphasis: {
                        label: { show: true, fontSize: 16, fontWeight: 'bold' },
                    },
                    data,
                },
            ],
        }),
        [data, theme],
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
