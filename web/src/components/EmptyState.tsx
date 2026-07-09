import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '../lib/cn';

interface EmptyStateProps {
    icon?: LucideIcon;
    title?: string;
    description?: string;
    className?: string;
}

const EmptyState = ({
    icon: Icon = Inbox,
    title = '暂无数据',
    description,
    className,
}: EmptyStateProps) => (
    <div
        className={cn(
            'flex flex-col items-center justify-center p-12 text-center text-muted-foreground',
            className,
        )}
    >
        <Icon className="mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
);

export default EmptyState;
