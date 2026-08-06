import StatCard, { type StatCardProps } from './StatCard';
import { cn } from '../lib/cn';

interface KpiStripProps {
    items: StatCardProps[];
    className?: string;
}

/** Responsive grid of Aura KPI cards with rotating soft orbs. */
const KpiStrip = ({ items, className }: KpiStripProps) => (
    <div
        className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-7',
            className,
        )}
    >
        {items.map((item, index) => (
            <StatCard key={item.label + String(index)} orbIndex={index} {...item} />
        ))}
    </div>
);

export default KpiStrip;
