/**
 * Token-Monitor v2 — FE<->BE API contract (C2b).
 *
 * Hand-authored TypeScript mirroring the JSON shapes returned by the backend
 * routes in `server/routes/*`. This is the SINGLE SOURCE OF TRUTH for the
 * frontend<->backend shape; update it in the same change as any endpoint.
 *
 * Conventions:
 * - `cost` / `cost_usd` = `quota / QUOTA_PER_UNIT` (QUOTA_PER_UNIT defaults to
 *   500000 == $1). Both aliases are returned; prefer `cost_usd` in new code.
 * - Ratios (`cache_hit_ratio`, `success_rate`) are 0..1 fractions (0 when there
 *   is no data). `success_rate = 1 - errors/requests`.
 * - Latencies are milliseconds. `avg_latency_ms` is whole-request latency
 *   derived from `use_time` (sec->ms); `avg_ttft_ms` is streaming first-token
 *   time from `other.frt` (0 when non-streaming). `tps = tokens / use_time_sum_sec`.
 * - Averages/rates are derived at query time from per-hour SUM columns stored
 *   by the syncer (see server/db.js + server/tokenMetrics.js#mapExtendedMetrics).
 */

// ==================== Shared sub-types ====================

/** Per-log ratio/price set extracted from `logs.other`. */
export interface Ratios {
    model: number;
    completion: number;
    group: number;
    cache: number;
    userGroup: number;
    modelPrice: number;
}

/** The C2 extended metric block (derived from per-hour sums). */
export interface ExtendedMetrics {
    cache_creation_tokens: number;
    image_tokens: number;
    audio_tokens: number;
    /** Total input tokens incl. cache (prompt_tokens + cache for Claude-semantic). */
    total_input_tokens: number;
    /** Input tokens excluding cache read and cache creation tokens. */
    net_input_tokens: number;
    /** Total input tokens plus completion tokens. */
    throughput_total: number;
    /** Alias of throughput_total for token-first clients. */
    throughput_tokens: number;
    /** 0..1, = cache_hit_tokens / total_input_tokens. */
    cache_hit_ratio: number;
    /** 0..1, = 1 - errors/requests (0 when no requests). */
    success_rate: number;
    /** Whole-request latency in ms (from use_time sec->ms). */
    avg_latency_ms: number;
    /** Streaming first-token latency in ms (from other.frt; 0 if non-streaming). */
    avg_ttft_ms: number;
    /** Tokens per second = tokens / use_time_sum_sec. */
    tps: number;
}

/** Base usage totals shared by summary / breakdown rows / timeseries points. */
export interface UsageTotals {
    tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cache_hit_tokens: number;
    requests: number;
    quota: number;
    cost: number;
    cost_usd: number;
    errors: number;
}

export type UsageTotalsWithMetrics = UsageTotals & ExtendedMetrics;

/**
 * Stats-endpoint totals: `UsageTotals` plus the `net_input_tokens` /
 * `throughput_total` fields emitted by `mapStatsTotals` (spread into the
 * `/api/stats`, `/api/models/analysis`, `/api/channels/performance`,
 * `/api/analysis/latency` and `/api/dashboard/*` responses).
 */
export interface StatsTotals extends UsageTotals {
    net_input_tokens: number;
    throughput_total: number;
}

export type StatsTotalsWithMetrics = StatsTotals & ExtendedMetrics;

/** Allowed `dimension` values for /api/usage/breakdown. `user` is derived. */
export type UsageDimension = 'group' | 'channel' | 'model' | 'token' | 'user';

/** Allowed `metric` values for /api/usage/* ranking. */
export type UsageMetric =
    | 'cost' | 'quota' | 'tokens' | 'requests'
    | 'cache_hit_ratio' | 'image_tokens' | 'audio_tokens'
    | 'success_rate' | 'avg_latency_ms' | 'avg_ttft_ms' | 'tps';

/** Allowed `split` values for /api/usage/timeseries. */
export type UsageSplit = 'none' | 'group' | 'channel' | 'model' | 'token';

/** Standard error body returned by every route on failure. */
export interface ApiError {
    error: string;
}

/** `[start_ts, end_ts]` epoch seconds, as accepted by most endpoints. */
export interface TimeRangeParams {
    start_ts?: number;
    end_ts?: number;
}

// ==================== /api/summary ====================

// /api/summary keeps its legacy `total_*` field names (design §4.1) and does NOT
// emit the bare `tokens`/`requests`/`quota`/`cost`/`errors` aliases, so it extends
// `ExtendedMetrics` only, not `UsageTotalsWithMetrics`.
export interface Summary extends ExtendedMetrics {
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_cache_hit_tokens: number;
    net_input_tokens: number;
    throughput_total: number;
    total_requests: number;
    total_quota: number;
    total_errors: number;
    active_models: number;
    /** = total_quota / QUOTA_PER_UNIT (alias of cost_usd, kept for backward compat). */
    total_cost: number;
    /** = total_quota / QUOTA_PER_UNIT. */
    cost_usd: number;
    /** Trailing-60s requests per minute (live, from logs). */
    rpm: number;
    /** Trailing-60s tokens per minute (live, from logs). */
    tpm: number;
}

// ==================== /api/usage/* ====================

/** A single breakdown row. Enrichment fields depend on `dimension`. */
export interface UsageRow extends UsageTotalsWithMetrics {
    /** Group key (dimension value as string). */
    key: string;
    /** Human-readable label (channel/token/user name, etc.). */
    label: string;
    /** Present when dimension=user. */
    user_id?: number;
    username?: string;
    /** Present when dimension=channel. */
    channelType?: number;
    /** Present when dimension=token. */
    status?: number;
    group?: string;
}

/** GET /api/usage/breakdown -> bare array of rows (envelope kept for compat). */
export type UsageBreakdownResponse = UsageRow[];

export interface UsageSummaryResponse extends UsageTotalsWithMetrics {
    active_groups: number;
    active_channels: number;
    active_models: number;
    active_tokens: number;
    comparison?: UsagePeriodComparison;
}

export interface UsagePeriodComparison {
    previous: UsageTotalsWithMetrics;
    delta: Record<string, number>;
    delta_percent: Record<string, number | null>;
}

export interface UsageTimeseriesPoint extends UsageTotalsWithMetrics {
    /** Bucket hour (epoch seconds, floored to the hour). */
    hour: number;
    /** Split key (empty string when split=none). */
    split: string;
}

export interface UsageTimeseriesResponse {
    split: UsageSplit;
    series: UsageTimeseriesPoint[];
}

export interface UsageOptionRow extends UsageTotalsWithMetrics {
    value: string;
    label: string;
}

export interface UsageTokenOptionRow extends UsageOptionRow {
    id: number;
    name: string;
    group: string;
    status: number;
}

export interface UsageFilterOptionsResponse {
    groups: UsageOptionRow[];
    models: UsageOptionRow[];
    tokens: UsageTokenOptionRow[];
}

// ==================== /api/logs ====================

export interface LogRow {
    id: number;
    /** BigInt `created_at` serialized as a string. */
    createdAt: string;
    type: number;
    username: string;
    channelId: number;
    modelName: string;
    tokenId: number;
    tokenName: string;
    group: string | null;
    useTime: number;
    promptTokens: number;
    completionTokens: number;
    quota: number;
    content: string;
    other: string | null;
    ip: string | null;
    requestId: string;
    upstreamRequestId: string | null;
    isStream: boolean;

    // --- derived / snake_case aliases (preferred by C3) ---
    request_id: string;
    upstream_request_id: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    billingQuota: number;
    cost: number;
    cost_usd: number;
    cacheHitTokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    image_tokens: number;
    audio_tokens: number;
    audio_input_tokens: number;
    audio_output_tokens: number;
    /** Total input including cache tokens under normalized semantics. */
    total_input_tokens: number;
    /** Total input including cache plus completion tokens. */
    throughput_total: number;
    /** First-response time in ms (TTFT); 0 when non-streaming. */
    frt_ms: number;
    /** Whole-request time in seconds (logs.use_time). */
    use_time_sec: number;
    /** Tokens per second = tokens / use_time_sec. */
    tps: number;
    ratios: Ratios;
    /** 'wallet' | 'subscription' | null. */
    billing_source: string | null;
    /** Multi-key index (-1 if not multi-key). */
    multi_key_index: number;
    /** True if the log used a multi-key channel. */
    is_multi_key: boolean;
    is_stream: boolean;
}

export interface LogsResponse {
    data: LogRow[];
    total: number;
    page: number;
    pageSize: number;
    stats: {
        total_tokens: number;
        total_prompt_tokens: number;
        total_completion_tokens: number;
        total_cache_read_tokens: number;
        total_cache_write_tokens: number;
        /** Total input including cache tokens under normalized semantics. */
        total_input_tokens: number;
        /** Total input including cache plus completion tokens. */
        throughput_total: number;
        total_cost: number;
    };
}

// ==================== /api/models/analysis ====================

export interface ModelAnalysisRow extends StatsTotalsWithMetrics {
    model_name: string;
    /** Legacy error rate as a percentage string (e.g. "12.50"); 0 when no data. */
    errorRate: string | number;
    /** Error rate as a 0..1 fraction. */
    error_rate: number;
    /** Legacy seconds-based latency (rounded); prefer avg_latency_ms. */
    avgLatency: number;
}

export interface ModelAnalysisSummary {
    totalModels: number;
    totalRequests: number;
    totalErrors: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCacheHitTokens: number;
    netInputTokens: number;
    throughputTotal: number;
    totalCost: number;
    total_cost_usd: number;
    cache_hit_ratio: number;
    success_rate: number;
}

export interface ModelAnalysisResponse {
    models: ModelAnalysisRow[];
    summary: ModelAnalysisSummary;
}

// ==================== /api/channels/* ====================

export interface ChannelOverviewRow {
    id: number;
    name: string | null;
    type: number;
    /** 1=enabled, 2=manually disabled, 3=auto-disabled. */
    status: number;
    /** Channel test response time (ms) — distinct from avg_latency_ms. */
    response_time: number;
    auto_ban: number | null;
    used_quota: number;
    cost_usd: number;
    tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    total_input_tokens: number;
    net_input_tokens: number;
    throughput_total: number;
    throughput_tokens: number;
    requests: number;
    errors: number;
    /** 0..1 error fraction over the selected window. */
    error_rate: number;
    avg_latency_ms: number;
    /** True if this channel uses multi-key (random/polling) mode. */
    is_multi_key: boolean;
    /** Number of keys configured (0 when not multi-key). */
    multi_key_size: number;
    /** 'random' | 'polling' | null. */
    multi_key_mode: string | null;
}

export interface ChannelsOverviewResponse {
    channels: ChannelOverviewRow[];
    statusCount: { enabled: number; disabled: number; autoDisabled: number };
    total: number;
    timeRange: { startTs: number; endTs: number };
}

/** Per-key detail for a multi-key channel (GET /api/channels/:id/keys). */
export interface ChannelKeyDetail {
    key_index: number;
    /** Masked key label (e.g. "sk-1...xyz4"). */
    key_label: string;
    /** 1=enabled, 2=manually disabled, 3=auto-disabled. */
    status: number;
    disabled_reason: string | null;
    disabled_time: number | null;
    requests: number;
    errors: number;
    error_rate: number;
    prompt_tokens: number;
    completion_tokens: number;
    tokens: number;
    throughput_total: number;
    throughput_tokens: number;
    quota: number;
    cost_usd: number;
    avg_latency_ms: number;
    success_count: number;
    total_input_tokens: number;
    cache_hit_tokens: number;
}

export interface ChannelKeysResponse {
    channel_id: number;
    channel_name: string | null;
    is_multi_key: boolean;
    multi_key_mode?: string;
    multi_key_size?: number;
    multi_key_polling_index?: number;
    time_range?: { start_ts: number; end_ts: number };
    keys: ChannelKeyDetail[];
}

export interface ChannelPerformanceRow extends StatsTotalsWithMetrics {
    channelId: number;
    channelName: string;
    channelType: number;
    errorRate: string | number;
    error_rate: number;
    avgLatency: number;
}

/** GET /api/channels/performance -> bare array. */
export type ChannelPerformanceResponse = ChannelPerformanceRow[];

// ==================== /api/analysis/latency ====================

// /api/analysis/latency latency_trend points use `rpm`/`tpm` (not `requests`)
// and omit `cost`/`cost_usd`, but do spread the mapStatsTotals fields.
export interface LatencyTrendPoint extends Omit<StatsTotalsWithMetrics, 'requests' | 'cost' | 'cost_usd'> {
    hour: number;
    time: string;
    /** Requests in the hour (legacy field name; not a true per-minute rate). */
    rpm: number;
    /** Tokens in the hour. */
    tpm: number;
    avg_latency: number;
}

export interface LatencyAnalysisResponse {
    slow_requests: Array<{
        id: number;
        useTime: number;
        modelName: string;
        channelId: number;
        createdAt: string;
    }>;
    percentiles: {
        latency_ms: { count: number; p50: number; p95: number; p99: number };
        ttft_ms: { count: number; p50: number; p95: number; p99: number };
        sample_count: number;
        sampled: boolean;
        sample_scope: 'full' | 'latest';
    };
    latency_trend: LatencyTrendPoint[];
}

// ==================== /api/dashboard/* ====================

export interface HourlyTrendPoint extends StatsTotalsWithMetrics {
    hour: number;
    time: string;
    quota: number;
    errors: number;
    avg_latency: number;
}

export interface DashboardHourlyTrendResponse {
    success: true;
    data: HourlyTrendPoint[];
}

export interface ModelDistributionPoint extends StatsTotalsWithMetrics {
    name: string;
    percentage: number;
}

export interface DashboardModelDistributionResponse {
    success: true;
    data: ModelDistributionPoint[];
    total: number;
}

// ==================== /api/realtime ====================

export interface RealtimeData {
    qps: number;
    tps: number;
    activeChannels: number;
}

export interface RealtimeResponse {
    success: true;
    data: RealtimeData;
}
