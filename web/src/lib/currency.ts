/**
 * Quota <-> cost conversion and currency-mode-aware formatting.
 *
 * `cost` / `cost_usd` = `quota / QUOTA_PER_UNIT` (QUOTA_PER_UNIT defaults to
 * 500000 == $1), mirroring the backend convention (see `server/index.js`).
 */
import { formatCny, formatTokens, formatUsd } from './format';

/** new-api quota units per 1 USD. */
export const QUOTA_PER_UNIT = 500000;

/** Approximate USD -> CNY conversion rate (no FX endpoint in C2; configurable here). */
export const CNY_USD_RATE = 7.2;

export type CurrencyMode = 'usd' | 'cny' | 'token';

export const CURRENCY_MODES: { value: CurrencyMode; label: string }[] = [
    { value: 'usd', label: 'USD ($)' },
    { value: 'cny', label: 'CNY (¥)' },
    { value: 'token', label: 'Token' },
];

export function quotaToUsd(quota: number): number {
    return (quota || 0) / QUOTA_PER_UNIT;
}

export function quotaToCny(quota: number): number {
    return quotaToUsd(quota) * CNY_USD_RATE;
}

/**
 * Format a monetary/token value for the given currency mode.
 * - `usd`/`cny` derive cost from `quota`.
 * - `token` shows the token count instead of cost.
 */
export function formatCostByMode(
    quota: number,
    tokens: number,
    mode: CurrencyMode,
): string {
    switch (mode) {
        case 'cny':
            return formatCny(quotaToCny(quota));
        case 'token':
            return formatTokens(tokens || 0);
        case 'usd':
        default:
            return formatUsd(quotaToUsd(quota));
    }
}
