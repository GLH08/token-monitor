import { type LucideIcon } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { cn } from '../lib/cn';

const ORB_CYCLE = [
    'kpi-orb-blue',
    'kpi-orb-indigo',
    'kpi-orb-purple',
    'kpi-orb-teal',
    'kpi-orb-orange',
    'kpi-orb-pink',
    'kpi-orb-green',
] as const;

export interface StatCardProps {
    label: string;
    value: string | number;
    /** Kept for API compat; not rendered (Aura KPI has no icon). */
    icon?: LucideIcon;
    hint?: string;
    loading?: boolean;
    /** Optional sparkline series (numbers). */
    sparkline?: number[];
    className?: string;
    /** Soft blob color class suffix index (0–6). */
    orbIndex?: number;
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

/**
 * Aura KPI card: fixed vertical rhythm (label / value / meta), soft color orb, no icon.
 */
const StatCard = ({
    label,
    value,
    hint,
    loading = false,
    sparkline,
    className,
    orbIndex = 0,
}: StatCardProps) => {
    const orbClass = ORB_CYCLE[Math.abs(orbIndex) % ORB_CYCLE.length];

    return (
        <div
            className={cn(
                'relative flex h-[118px] flex-col overflow-hidden rounded-[20px] bg-card px-[18px] pb-3.5 pt-4',
                className,
            )}
        >
            <span className={cn('kpi-orb', orbClass)} aria-hidden="true" />

            <div className="relative z-[1] h-4 truncate text-xs font-medium leading-4 text-muted-foreground">
                {label}
            </div>

            {loading ? (
                <Skeleton className="relative z-[1] mt-2.5 h-[34px] w-24" />
            ) : (
                <div className="relative z-[1] mt-2.5 h-[34px] truncate font-display text-[26px] font-normal leading-[34px] tracking-tight tabular-nums">
                    {value}
                </div>
            )}

            <div className="relative z-[1] mt-auto flex h-4 items-center justify-between gap-2">
                <div className="truncate text-xs font-medium leading-4 text-muted-foreground/80">
                    {hint || '\u00a0'}
                </div>
                {sparkline && sparkline.length >= 2 ? (
                    <div className="shrink-0 text-primary-500">
                        <Sparkline data={sparkline} />
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default StatCard;
