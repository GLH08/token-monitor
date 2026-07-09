import { useUIStore } from '../../stores/ui';

/** Stable brand-aware palette (cyan-led, ported from the legacy app idea). */
export const CHART_COLORS = [
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#10b981',
    '#ef4444',
    '#14b8a6',
    '#6366f1',
    '#f97316',
];

/** Returns N colors, cycling through the palette. */
export function pickColors(count: number): string[] {
    const colors: string[] = [];
    for (let i = 0; i < count; i += 1) {
        colors.push(CHART_COLORS[i % CHART_COLORS.length]);
    }
    return colors;
}

/** Theme-aware chart styling, driven by the global UI store. */
export function useChartTheme() {
    const theme = useUIStore((state) => state.theme);
    const isDark = theme === 'dark';
    return {
        isDark,
        textColor: isDark ? '#cbd5e1' : '#475569',
        axisLineColor: isDark ? '#334155' : '#e2e8f0',
        splitLineColor: isDark ? '#1e293b' : '#f1f5f9',
        tooltipBg: isDark ? '#0f172a' : '#ffffff',
        tooltipBorder: isDark ? '#1e293b' : '#e2e8f0',
    };
}
