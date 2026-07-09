import StatCard, { type StatCardProps } from './StatCard';
import { cn } from '../lib/cn';

interface KpiStripProps {
    items: StatCardProps[];
    className?: string;
}

/** Responsive divided grid of StatCards. */
const KpiStrip = ({ items, className }: KpiStripProps) => (
    <div
        className={cn(
            'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4',
            className,
        )}
    >
        {items.map((item, index) => (
            <StatCard
                key={item.label + String(index)}
                {...item}
            />
        ))}
    </div>
);

export default KpiStrip;
