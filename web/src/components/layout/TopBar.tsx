import { Eye, EyeOff, Menu, Moon, Sun } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useUIStore } from '../../stores/ui';
import { CURRENCY_MODES } from '../../lib/currency';
import { TIME_PRESETS } from '../../lib/time';
import { cn } from '../../lib/cn';

interface TopBarProps {
    onOpenNav?: () => void;
}

const TopBar = ({ onOpenNav }: TopBarProps) => {
    const timePreset = useUIStore((state) => state.timePreset);
    const setTimePreset = useUIStore((state) => state.setTimePreset);
    const currencyMode = useUIStore((state) => state.currencyMode);
    const setCurrencyMode = useUIStore((state) => state.setCurrencyMode);
    const masked = useUIStore((state) => state.masked);
    const toggleMasked = useUIStore((state) => state.toggleMasked);
    const theme = useUIStore((state) => state.theme);
    const toggleTheme = useUIStore((state) => state.toggleTheme);

    return (
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 px-4 pb-2 pt-5 md:px-8">
            <div className="flex items-center gap-2 pt-1">
                {onOpenNav ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="md:hidden"
                        onClick={onOpenNav}
                        aria-label="打开导航菜单"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex items-center rounded-full bg-muted p-1">
                    <Select
                        value={timePreset}
                        onValueChange={(value) => setTimePreset(value as typeof timePreset)}
                    >
                        <SelectTrigger className="h-9 w-[7.5rem] rounded-full border-0 bg-white shadow-sm dark:bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                            {TIME_PRESETS.map((preset) => (
                                <SelectItem key={preset.value} value={preset.value} className="rounded-xl">
                                    {preset.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="inline-flex items-center rounded-full bg-muted p-1">
                    <Select
                        value={currencyMode}
                        onValueChange={(value) => setCurrencyMode(value as typeof currencyMode)}
                    >
                        <SelectTrigger className="h-9 w-[6.5rem] rounded-full border-0 bg-white shadow-sm dark:bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                            {CURRENCY_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value} className="rounded-xl">
                                    {mode.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    variant={masked ? 'secondary' : 'ghost'}
                    size="icon"
                    className={cn('rounded-full', masked && 'bg-muted')}
                    onClick={toggleMasked}
                    aria-label={masked ? '显示敏感数据' : '隐藏敏感数据'}
                    title={masked ? '显示敏感数据' : '隐藏敏感数据'}
                >
                    {masked ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
                    title={theme === 'dark' ? '浅色主题' : '深色主题'}
                >
                    {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                </Button>
            </div>
        </header>
    );
};

export default TopBar;
