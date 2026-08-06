import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface PageHeaderProps {
    title: string;
    description?: string;
    /** Kept for API compat; not rendered (title is typography-led). */
    icon?: LucideIcon;
    actions?: ReactNode;
    className?: string;
}

const PageHeader = ({ title, description, actions, className }: PageHeaderProps) => (
    <div
        className={cn(
            'flex flex-col gap-3 md:flex-row md:items-end md:justify-between',
            className,
        )}
    >
        <div className="min-w-0">
            <h1 className="font-display text-[30px] font-normal leading-tight tracking-tight text-foreground md:text-[32px]">
                {title}
            </h1>
            {description ? (
                <p className="mt-1 text-[13.5px] text-muted-foreground">{description}</p>
            ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
);

export default PageHeader;
