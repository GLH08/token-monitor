import { type LucideIcon } from 'lucide-react';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '../lib/cn';

export interface StatCardProps {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    hint?: string;
    loading?: boolean;
    /** Optional sparkline series (numbers). */
    sparkline?: number[];
    className?: string;
}

/** Renders a tiny inline SVG sparkline from a numeric series. */
const Sparkline = ({ data, className }: { data: number[]; className?: string }) => {
    if (!data || data.length < 2) return null;
    const width = 80;
    const height = 24;
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const points = data
        .map((value, index) => {
            const x = index * step;
            const y = height - ((value - min) / range) * height;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cn('overflow-visible', className)}
            aria-hidden="true"
        >
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

const StatCard = ({
    label,
    value,
    icon: Icon,
    hint,
    loading = false,
    sparkline,
    className,
}: StatCardProps) => (
    <Card className={cn('p-5', className)}>
        <div className="flex items-center gap-3">
            {Icon ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
            ) : null}
            <div className="min-w-0 flex-1">
                {loading ? (
                    <Skeleton className="mb-2 h-7 w-24" />
                ) : (
                    <div className="font-mono text-2xl font-bold tabular-nums tracking-tight">
                        {value}
                    </div>
                )}
                <div className="text-sm text-muted-foreground">{label}</div>
                {hint ? <div className="mt-0.5 text-xs text-muted-foreground/70">{hint}</div> : null}
            </div>
            {sparkline && sparkline.length >= 2 ? (
                <div className="text-primary">
                    <Sparkline data={sparkline} />
                </div>
            ) : null}
        </div>
    </Card>
);

export default StatCard;
