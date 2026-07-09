/**
 * Token-Monitor v2 - API client (C3).
 *
 * Mirrors the semantics of the legacy `web/src/api.js`:
 * - base `/api`, bearer token from `localStorage['access_token']`,
 * - on 401: clear token + dispatch `auth-changed` + throw,
 * - query params built with URLSearchParams (snake_case keys, empties skipped).
 *
 * Typed against `./types.ts` (the C2 FE<->BE contract). Auth + alert/model-status
 * shapes not present in types.ts are defined locally below.
 */
import type {
    Summary,
    UsageBreakdownResponse,
    UsageSummaryResponse,
    UsageTimeseriesResponse,
    UsageFilterOptionsResponse,
    LogsResponse,
    ModelAnalysisResponse,
    ChannelsOverviewResponse,
    ChannelPerformanceResponse,
    LatencyAnalysisResponse,
    DashboardHourlyTrendResponse,
    DashboardModelDistributionResponse,
    RealtimeResponse,
} from './types';

const API_BASE = '/api';
const TOKEN_KEY = 'access_token';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export function buildQueryString(params: QueryParams = {}): string {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            sp.append(key, String(value));
        }
    });
    return sp.toString();
}

export function withQuery(url: string, params: QueryParams): string {
    const qs = buildQueryString(params);
    return qs ? `${url}?${qs}` : url;
}

const buildUrl = (url: string) => `${API_BASE}${url}`;

// ==================== Token storage & auth events ====================

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export function notifyAuthChanged(): void {
    window.dispatchEvent(new Event('auth-changed'));
}

// ==================== Errors ====================

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function parseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Authenticated JSON fetch. Throws `ApiError` on non-2xx (401 also clears the
 * token and fires `auth-changed` so `App.tsx` flips back to Login).
 */
export async function authFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = getStoredToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string> | undefined) ?? {}),
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(buildUrl(url), { ...options, headers });

    if (res.status === 401) {
        clearStoredToken();
        notifyAuthChanged();
        throw new ApiError('Unauthorized', 401);
    }

    if (!res.ok) {
        const body = await parseBody(res);
        const message =
            (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
                ? (body as { error: string }).error
                : res.statusText) || `请求失败 (${res.status})`;
        throw new ApiError(message, res.status);
    }

    return (await parseBody(res)) as T;
}

/** Unauthenticated JSON fetch (for /auth/config). */
async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(buildUrl(url));
    return (await parseBody(res)) as T;
}

// ==================== Auth (local types; not in C2 types.ts) ====================

export interface AuthConfigData {
    enabled: boolean;
    expiresIn: number;
}
export interface AuthConfigResponse {
    success: true;
    data: AuthConfigData;
}
export interface AuthLoginData {
    token: string;
    expires_in: number;
    auth_disabled?: boolean;
}
export interface AuthLoginResponse {
    success: true;
    data: AuthLoginData;
}
export interface AuthMeData {
    authenticated: boolean;
    expires_in: number;
    expires_at: number | null;
}
export interface AuthMeResponse {
    success: true;
    data: AuthMeData;
}

export function fetchAuthConfig(): Promise<AuthConfigResponse> {
    return fetchJson('/auth/config');
}

export function fetchAuthMe(): Promise<AuthMeResponse> {
    return authFetch('/auth/me');
}

export async function login(password: string): Promise<AuthLoginResponse> {
    const res = await fetch(buildUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    const body = (await parseBody(res)) as AuthLoginResponse & { error?: string };
    if (!res.ok) {
        throw new ApiError(body.error || '登录失败', res.status);
    }
    if (body?.data?.token) {
        setStoredToken(body.data.token);
        notifyAuthChanged();
    }
    return body;
}

export async function logout(): Promise<void> {
    try {
        await authFetch('/auth/logout', { method: 'POST' });
    } finally {
        clearStoredToken();
        notifyAuthChanged();
    }
}

// ==================== Alerts (local types; not in C2 types.ts) ====================

export interface Alert {
    id: number;
    name: string;
    /** JSON-encoded rule object. */
    rule: string;
    enabled: number;
    start_time: string | null;
    end_time: string | null;
    notify_telegram: number;
    trigger_action: string | null;
    last_triggered: number;
    last_value: number;
    trigger_count: number;
    created_at: number;
}

export interface AlertHistory {
    id: number;
    alert_id: number;
    alert_name: string | null;
    triggered_at: number;
    value: number;
    threshold: number;
    message: string | null;
    action_taken: string | null;
}

export type AlertTypesResponse = Record<string, string>;

export interface AlertInput {
    name: string;
    rule: unknown;
    enabled: boolean;
    start_time?: string | null;
    end_time?: string | null;
    notify_telegram?: boolean;
    trigger_action?: string | null;
}

// ==================== Model status (local types; not in C2 types.ts) ====================

export interface ModelStatusSlot {
    slot: number;
    start_time: number;
    end_time: number;
    total_requests: number;
    success_count: number;
    success_rate: number | null;
    status: string;
}

export interface ModelStatusDetail {
    model_name: string;
    display_name: string;
    time_window: string;
    channel_id: number | null;
    total_requests: number;
    success_count: number;
    success_rate: number | null;
    current_status: string;
    slot_data: ModelStatusSlot[];
}

export interface ModelStatusOverviewData {
    models: ModelStatusDetail[];
    summary: {
        total: number;
        green: number;
        yellow: number;
        red: number;
        gray: number;
        [key: string]: number;
    };
}

export interface ModelStatusWindowConfig {
    totalSeconds: number;
    numSlots: number;
    slotSeconds: number;
}

export interface AvailableModel {
    model_name: string;
    count?: number;
}

export interface Envelope<T> {
    success: true;
    data: T;
}

// ==================== Summary / stats ====================

export function fetchSummary(filters: QueryParams = {}): Promise<Summary> {
    return authFetch<Summary>(withQuery('/summary', filters));
}

// ==================== Usage ====================

export function fetchUsageSummary(filters: QueryParams = {}): Promise<UsageSummaryResponse> {
    return authFetch<UsageSummaryResponse>(withQuery('/usage/summary', filters));
}

export function fetchUsageBreakdown(filters: QueryParams = {}): Promise<UsageBreakdownResponse> {
    return authFetch<UsageBreakdownResponse>(withQuery('/usage/breakdown', filters));
}

export function fetchUsageTimeseries(filters: QueryParams = {}): Promise<UsageTimeseriesResponse> {
    return authFetch<UsageTimeseriesResponse>(withQuery('/usage/timeseries', filters));
}

export function fetchUsageFilterOptions(filters: QueryParams = {}): Promise<UsageFilterOptionsResponse> {
    return authFetch<UsageFilterOptionsResponse>(withQuery('/usage/filter-options', filters));
}

// ==================== Logs ====================

export function fetchLogs(params: QueryParams = {}): Promise<LogsResponse> {
    return authFetch<LogsResponse>(withQuery('/logs', params));
}

// ==================== Models ====================

export function fetchModelsAnalysis(filters: QueryParams = {}): Promise<ModelAnalysisResponse> {
    return authFetch<ModelAnalysisResponse>(withQuery('/models/analysis', filters));
}

// ==================== Channels ====================

export function fetchChannelsOverview(): Promise<ChannelsOverviewResponse> {
    return authFetch<ChannelsOverviewResponse>('/channels/overview');
}

export function fetchChannelPerformance(filters: QueryParams = {}): Promise<ChannelPerformanceResponse> {
    return authFetch<ChannelPerformanceResponse>(withQuery('/channels/performance', filters));
}

// ==================== Performance / latency ====================

export function fetchLatencyAnalysis(startTs: number, endTs: number): Promise<LatencyAnalysisResponse> {
    return authFetch<LatencyAnalysisResponse>(withQuery('/analysis/latency', { start_ts: startTs, end_ts: endTs }));
}

// ==================== Dashboard ====================

export function fetchDashboardHourlyTrend(hours: number): Promise<DashboardHourlyTrendResponse> {
    return authFetch<DashboardHourlyTrendResponse>(withQuery('/dashboard/hourly-trend', { hours }));
}

export function fetchDashboardModelDistribution(filters: QueryParams = {}): Promise<DashboardModelDistributionResponse> {
    return authFetch<DashboardModelDistributionResponse>(withQuery('/dashboard/model-distribution', filters));
}

// ==================== Realtime ====================

export function fetchRealtime(): Promise<RealtimeResponse> {
    return authFetch<RealtimeResponse>('/realtime');
}

// ==================== Alerts ====================

export function fetchAlerts(): Promise<Alert[]> {
    return authFetch<Alert[]>('/alerts');
}

export function fetchAlertTypes(): Promise<AlertTypesResponse> {
    return authFetch<AlertTypesResponse>('/alerts/types');
}

export function fetchAlertHistory(limit = 100, alertId: number | null = null): Promise<AlertHistory[]> {
    return authFetch<AlertHistory[]>(withQuery('/alerts/history', { limit, alert_id: alertId }));
}

export function createAlert(data: AlertInput): Promise<{ id: number }> {
    return authFetch<{ id: number }>('/alerts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAlert(id: number, data: AlertInput): Promise<{ success: true }> {
    return authFetch<{ success: true }>(`/alerts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function toggleAlert(id: number, enabled: boolean): Promise<{ success: true }> {
    return authFetch<{ success: true }>(`/alerts/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
    });
}

export function deleteAlert(id: number): Promise<{ success: true }> {
    return authFetch<{ success: true }>(`/alerts/${id}`, { method: 'DELETE' });
}

// ==================== Model status ====================

export function fetchModelStatusOverview(
    window = '24h',
    channelId: number | null = null,
): Promise<Envelope<ModelStatusOverviewData>> {
    return authFetch<Envelope<ModelStatusOverviewData>>(
        withQuery('/model-status/overview', { window, channel_id: channelId }),
    );
}

export function fetchModelStatusDetail(
    modelName: string,
    window = '24h',
    channelId: number | null = null,
): Promise<Envelope<ModelStatusDetail>> {
    return authFetch<Envelope<ModelStatusDetail>>(
        withQuery(`/model-status/${encodeURIComponent(modelName)}`, { window, channel_id: channelId }),
    );
}

export function fetchAvailableModels(): Promise<Envelope<AvailableModel[]>> {
    return authFetch<Envelope<AvailableModel[]>>('/model-status/models');
}

export function fetchModelStatusWindows(): Promise<Envelope<Record<string, ModelStatusWindowConfig>>> {
    return authFetch<Envelope<Record<string, ModelStatusWindowConfig>>>('/model-status/windows/config');
}
