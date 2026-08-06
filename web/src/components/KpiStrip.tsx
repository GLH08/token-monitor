import StatCard, { type StatCardProps } from './StatCard';
import { cn } from '../lib/cn';

interface KpiStripProps {
    items: StatCardProps[];
    className?: string;
}

/** Full-width grid: column count follows item count so strips always match content width. */
function columnsClass(count: number): string {
    if (count <= 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-2 md:grid-cols-3';
    if (count === 4) return 'grid-cols-2 md:grid-cols-4';
    if (count === 5) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5';
    if (count === 6) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';
    // 7+
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7';
}

const KpiStrip = ({ items, className }: KpiStripProps) => (
    <div className={cn('grid w-full gap-3', columnsClass(items.length), className)}>
        {items.map((item, index) => (
            <StatCard key={item.label + String(index)} orbIndex={index} {...item} />
        ))}
    </div>
);

export default KpiStrip;
