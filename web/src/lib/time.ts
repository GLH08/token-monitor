/**
 * Time-range presets and helpers.
 *
 * Most endpoints take `start_ts`/`end_ts` (epoch seconds). A few take `hours`
 * (dashboard hourly-trend) or a `window` string (model-status, subset below).
 */

export interface TimeRange {
    startTs: number;
    endTs: number;
}

export type TimePreset = '1h' | '6h' | '12h' | '24h' | '7d' | '30d';

export const TIME_PRESETS: { value: TimePreset; label: string; seconds: number }[] = [
    { value: '1h', label: '1 小时', seconds: 3600 },
    { value: '6h', label: '6 小时', seconds: 21600 },
    { value: '12h', label: '12 小时', seconds: 43200 },
    { value: '24h', label: '24 小时', seconds: 86400 },
    { value: '7d', label: '7 天', seconds: 604800 },
    { value: '30d', label: '30 天', seconds: 2592000 },
];

export const DEFAULT_TIME_PRESET: TimePreset = '24h';

export function isTimePreset(value: string | null | undefined): value is TimePreset {
    return !!value && TIME_PRESETS.some((p) => p.value === value);
}

/** { startTs, endTs } for the given preset, with endTs = now. */
export function presetToRange(preset: TimePreset): TimeRange {
    const entry = TIME_PRESETS.find((p) => p.value === preset) ?? TIME_PRESETS[3];
    const endTs = Math.floor(Date.now() / 1000);
    return { startTs: endTs - entry.seconds, endTs };
}

/** Whole-hours equivalent (for /api/dashboard/hourly-trend?hours=). */
export function presetToHours(preset: TimePreset): number {
    const entry = TIME_PRESETS.find((p) => p.value === preset) ?? TIME_PRESETS[3];
    return Math.round(entry.seconds / 3600);
}

/** Model-status only supports 1h/6h/12h/24h; clamp larger presets down to 24h. */
export function presetToStatusWindow(preset: TimePreset): '1h' | '6h' | '12h' | '24h' {
    switch (preset) {
        case '1h':
            return '1h';
        case '6h':
            return '6h';
        case '12h':
            return '12h';
        default:
            return '24h';
    }
}

/** Build a query-param object (snake_case) from a range, skipping empties. */
export function rangeToParams(range: TimeRange): Record<string, number> {
    return { start_ts: range.startTs, end_ts: range.endTs };
}

/** Format an epoch-seconds hour bucket as HH:MM (zh-CN). */
export function formatHourLabel(hour: number): string {
    return new Date(hour * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** Format an epoch-seconds timestamp as a full zh-CN date-time string. */
export function formatEpochSeconds(epoch: number): string {
    return new Date(epoch * 1000).toLocaleString('zh-CN');
}
