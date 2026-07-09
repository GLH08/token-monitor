import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PageHeaderProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    actions?: ReactNode;
    className?: string;
}

const PageHeader = ({ title, description, icon: Icon, actions, className }: PageHeaderProps) => (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-center md:justify-between', className)}>
        <div className="flex items-center gap-3">
            {Icon ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                </div>
            ) : null}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
);

export default PageHeader;
