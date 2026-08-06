import { useUIStore } from '../../stores/ui';

/** Aura multi-color chart palette (indigo / purple / teal / pink / green). */
export const CHART_COLORS = [
    '#5e5ce6',
    '#af52de',
    '#30b0c7',
    '#ff6b9d',
    '#34c759',
    '#ff9f0a',
    '#0071e3',
    '#ff2d55',
    '#6366f1',
    '#14b8a6',
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
        textColor: isDark ? '#cbd5e1' : '#86868b',
        axisLineColor: isDark ? '#334155' : 'rgba(0,0,0,0.06)',
        splitLineColor: isDark ? '#1e293b' : 'rgba(0,0,0,0.045)',
        tooltipBg: isDark ? '#0f172a' : '#ffffff',
        tooltipBorder: isDark ? '#1e293b' : 'rgba(0,0,0,0.06)',
    };
}
