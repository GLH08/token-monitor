/**
 * Pure formatting helpers (no currency-mode awareness beyond USD/CNY primitives).
 * Currency-mode-aware cost formatting lives in `./currency.ts`.
 */

/** Fixed-precision number with thousands separators. */
export function formatNumber(value: number, digits = 2): string {
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: 0,
    });
}

/** Compact notation, e.g. 1.2K / 3.4M / 5.6B. */
export function formatCompact(value: number, digits = 2): string {
    if (!Number.isFinite(value)) return '0';
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: digits,
    }).format(value);
}

/** Raw new-api quota (large integer) in compact form. */
export function formatQuota(quota: number): string {
    return formatCompact(quota || 0);
}

/** Token counts in compact form (K/M/B). */
export function formatTokens(tokens: number): string {
    return formatCompact(tokens || 0);
}

export function formatUsd(usd: number): string {
    return `$${formatNumber(usd || 0, 2)}`;
}

export function formatCny(cny: number): string {
    return `¥${formatNumber(cny || 0, 2)}`;
}

/** Accepts a 0..1 fraction; renders e.g. `12.5%`. */
export function formatPercent(fraction: number, digits = 1): string {
    if (!Number.isFinite(fraction)) return '0%';
    return `${(fraction * 100).toFixed(digits)}%`;
}

/** Whole-request latency in ms. */
export function formatLatency(ms: number): string {
    if (!ms || !Number.isFinite(ms)) return '--';
    return `${Math.round(ms)} ms`;
}

/** Streaming first-token (TTFT) latency in ms. */
export function formatTTFT(ms: number): string {
    if (!ms || !Number.isFinite(ms)) return '--';
    return `${Math.round(ms)} ms`;
}

/** Tokens per second. */
export function formatTPS(tps: number): string {
    if (!Number.isFinite(tps) || tps <= 0) return '--';
    return `${tps.toFixed(1)} tok/s`;
}

/** Requests per minute. */
export function formatRpm(rpm: number): string {
    if (!Number.isFinite(rpm)) return '0';
    return formatNumber(rpm, 1);
}

/** Masks a sensitive value when the global mask toggle is on. */
export function maskValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const str = String(value);
    if (str.length <= 4) return '****';
    return `${str.slice(0, 2)}****${str.slice(-2)}`;
}
