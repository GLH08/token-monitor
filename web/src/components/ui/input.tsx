import * as React from 'react'
import { cn } from '../../lib/cn'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, type, ...props }, ref) => (
        <input
            type={type}
            className={cn(
                'flex h-11 w-full rounded-[14px] border border-input bg-white px-4 py-2 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background',
                className,
            )}
            ref={ref}
            {...props}
        />
    ),
)
Input.displayName = 'Input'

export { Input }
