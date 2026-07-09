/**
 * Token-Monitor v2 - TanStack Query hooks (C3).
 *
 * One hook per C2 endpoint. Query keys embed the filter params so cache
 * invalidation and dedup work correctly. Polling via `refetchInterval` where a
 * live view is expected (realtime). Auth mutations invalidate the relevant
 * query keys so the cache stays consistent.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import {
    createAlert,
    deleteAlert,
    fetchAlertHistory,
    fetchAlerts,
    fetchAlertTypes,
    fetchAuthConfig,
    fetchAuthMe,
    fetchAvailableModels,
    fetchChannelPerformance,
    fetchChannelsOverview,
    fetchDashboardHourlyTrend,
    fetchDashboardModelDistribution,
    fetchLatencyAnalysis,
    fetchLogs,
    fetchModelStatusDetail,
    fetchModelStatusOverview,
    fetchModelStatusWindows,
    fetchModelsAnalysis,
    fetchRealtime,
    fetchSummary,
    fetchUsageBreakdown,
    fetchUsageFilterOptions,
    fetchUsageSummary,
    fetchUsageTimeseries,
    login,
    logout,
    toggleAlert,
    updateAlert,
    type AlertInput,
    type AlertTypesResponse,
    type AuthConfigResponse,
    type AuthMeResponse,
    type AvailableModel,
    type Envelope,
    type ModelStatusDetail,
    type ModelStatusOverviewData,
    type ModelStatusWindowConfig,
    type QueryParams,
} from './client';
import type {
    ChannelPerformanceResponse,
    ChannelsOverviewResponse,
    DashboardHourlyTrendResponse,
    DashboardModelDistributionResponse,
    LatencyAnalysisResponse,
    LogsResponse,
    ModelAnalysisResponse,
    RealtimeResponse,
    Summary,
    UsageBreakdownResponse,
    UsageFilterOptionsResponse,
    UsageSummaryResponse,
    UsageTimeseriesResponse,
} from './types';

// Re-export the envelope type so consumers don't need to import from client.
export type { Envelope } from './client';

// ==================== Auth ====================

export function useAuthConfig(options?: Omit<UseQueryOptions<AuthConfigResponse>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['auth-config'],
        queryFn: fetchAuthConfig,
        staleTime: Infinity,
        ...options,
    });
}

export function useAuthMe(options?: Omit<UseQueryOptions<AuthMeResponse>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['auth-me'],
        queryFn: fetchAuthMe,
        retry: false,
        ...options,
    });
}

export function useLogin() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (password: string) => login(password),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['auth-me'] });
        },
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => logout(),
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: ['auth-me'] });
            queryClient.clear();
        },
    });
}

// ==================== Summary ====================

export function useSummary(filters: QueryParams = {}, options?: Omit<UseQueryOptions<Summary>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['summary', filters],
        queryFn: () => fetchSummary(filters),
        ...options,
    });
}

// ==================== Usage ====================

export function useUsageSummary(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<UsageSummaryResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['usage-summary', filters],
        queryFn: () => fetchUsageSummary(filters),
        ...options,
    });
}

export function useUsageBreakdown(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<UsageBreakdownResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['usage-breakdown', filters],
        queryFn: () => fetchUsageBreakdown(filters),
        ...options,
    });
}

export function useUsageTimeseries(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<UsageTimeseriesResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['usage-timeseries', filters],
        queryFn: () => fetchUsageTimeseries(filters),
        ...options,
    });
}

export function useUsageFilterOptions(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<UsageFilterOptionsResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['usage-filter-options', filters],
        queryFn: () => fetchUsageFilterOptions(filters),
        ...options,
    });
}

// ==================== Logs ====================

export function useLogs(
    params: QueryParams = {},
    options?: Omit<UseQueryOptions<LogsResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['logs', params],
        queryFn: () => fetchLogs(params),
        ...options,
    });
}

// ==================== Models ====================

export function useModelsAnalysis(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<ModelAnalysisResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['models-analysis', filters],
        queryFn: () => fetchModelsAnalysis(filters),
        ...options,
    });
}

// ==================== Channels ====================

export function useChannelsOverview(
    options?: Omit<UseQueryOptions<ChannelsOverviewResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['channels-overview'],
        queryFn: fetchChannelsOverview,
        ...options,
    });
}

export function useChannelPerformance(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<ChannelPerformanceResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['channel-performance', filters],
        queryFn: () => fetchChannelPerformance(filters),
        ...options,
    });
}

// ==================== Performance / latency ====================

export function useLatencyAnalysis(
    startTs: number,
    endTs: number,
    options?: Omit<UseQueryOptions<LatencyAnalysisResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['latency-analysis', startTs, endTs],
        queryFn: () => fetchLatencyAnalysis(startTs, endTs),
        ...options,
    });
}

// ==================== Dashboard ====================

export function useDashboardHourlyTrend(
    hours: number,
    options?: Omit<UseQueryOptions<DashboardHourlyTrendResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['dashboard-hourly-trend', hours],
        queryFn: () => fetchDashboardHourlyTrend(hours),
        ...options,
    });
}

export function useDashboardModelDistribution(
    filters: QueryParams = {},
    options?: Omit<UseQueryOptions<DashboardModelDistributionResponse>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['dashboard-model-distribution', filters],
        queryFn: () => fetchDashboardModelDistribution(filters),
        ...options,
    });
}

// ==================== Realtime ====================

export function useRealtime(options?: Omit<UseQueryOptions<RealtimeResponse>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['realtime'],
        queryFn: fetchRealtime,
        refetchInterval: 5000,
        ...options,
    });
}

// ==================== Alerts ====================

export function useAlerts(options?: Omit<UseQueryOptions<Awaited<ReturnType<typeof fetchAlerts>>>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['alerts'],
        queryFn: fetchAlerts,
        ...options,
    });
}

export function useAlertTypes(options?: Omit<UseQueryOptions<AlertTypesResponse>, 'queryKey' | 'queryFn'>) {
    return useQuery({
        queryKey: ['alert-types'],
        queryFn: fetchAlertTypes,
        staleTime: Infinity,
        ...options,
    });
}

export function useAlertHistory(
    limit = 100,
    alertId: number | null = null,
    options?: Omit<UseQueryOptions<Awaited<ReturnType<typeof fetchAlertHistory>>>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['alert-history', limit, alertId],
        queryFn: () => fetchAlertHistory(limit, alertId),
        ...options,
    });
}

export function useCreateAlert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (data: AlertInput) => createAlert(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
}

export function useUpdateAlert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: AlertInput }) => updateAlert(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
}

export function useToggleAlert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => toggleAlert(id, enabled),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
}

export function useDeleteAlert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteAlert(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        },
    });
}

// ==================== Model status ====================

export function useModelStatusOverview(
    window = '24h',
    channelId: number | null = null,
    options?: Omit<UseQueryOptions<Envelope<ModelStatusOverviewData>>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['model-status-overview', window, channelId],
        queryFn: () => fetchModelStatusOverview(window, channelId),
        ...options,
    });
}

export function useModelStatusDetail(
    modelName: string | null,
    window = '24h',
    channelId: number | null = null,
    options?: Omit<UseQueryOptions<Envelope<ModelStatusDetail>>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['model-status-detail', modelName, window, channelId],
        queryFn: () => fetchModelStatusDetail(modelName as string, window, channelId),
        enabled: !!modelName,
        ...options,
    });
}

export function useAvailableModels(
    options?: Omit<UseQueryOptions<Envelope<AvailableModel[]>>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['available-models'],
        queryFn: fetchAvailableModels,
        ...options,
    });
}

export function useModelStatusWindows(
    options?: Omit<UseQueryOptions<Envelope<Record<string, ModelStatusWindowConfig>>>, 'queryKey' | 'queryFn'>,
) {
    return useQuery({
        queryKey: ['model-status-windows'],
        queryFn: fetchModelStatusWindows,
        staleTime: Infinity,
        ...options,
    });
}
