import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

interface LoadingStateProps {
    label?: string;
    className?: string;
}

const LoadingState = ({ label = '加载中...', className }: LoadingStateProps) => (
    <div className={cn('flex items-center justify-center', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{label}</span>
        </div>
    </div>
);

export default LoadingState;
