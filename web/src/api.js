const API_BASE = '/api';

const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('access_token');
    const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });

    if (res.status === 401) {
        localStorage.removeItem('access_token');
        window.location.reload();
        throw new Error('Unauthorized');
    }
    return res.json();
};

// ==================== 基础统计 ====================
export const fetchStats = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/stats?${params.toString()}`);
};

export const fetchSummary = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/summary?${params.toString()}`);
};

export const fetchAnalysis = (type, filters) => {
    const params = new URLSearchParams({ type });
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/analysis?${params.toString()}`);
};

// ==================== 渠道监控 ====================
export const fetchChannelsOverview = () => authFetch('/channels/overview');

export const fetchChannelPerformance = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/channels/performance?${params.toString()}`);
};

export const fetchChannels = () => authFetch('/channels');

// ==================== 模型分析 ====================
export const fetchModelsAnalysis = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/models/analysis?${params.toString()}`);
};

export const fetchModelsLatencyCompare = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/models/latency-compare?${params.toString()}`);
};


// ==================== Token 监控 ====================
export const fetchTokensOverview = () => authFetch('/tokens/overview');

export const fetchTokenUsage = (tokenId, filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/tokens/${tokenId}/usage?${params.toString()}`);
};

// ==================== 错误日志 ====================
export const fetchErrorLogs = (params) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && searchParams.append(k, v));
    return authFetch(`/errors?${searchParams.toString()}`);
};

export const fetchErrors = (page, pageSize, filters) => {
    const params = new URLSearchParams({ page, pageSize });
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/errors?${params.toString()}`);
};

export const fetchErrorsSummary = (filters) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/errors/summary?${params.toString()}`);
};

// ==================== 性能分析 ====================
export const fetchLatencyAnalysis = (start_ts, end_ts) => {
    const params = new URLSearchParams();
    if (start_ts) params.append('start_ts', start_ts);
    if (end_ts) params.append('end_ts', end_ts);
    return authFetch(`/analysis/latency?${params.toString()}`);
};

// ==================== 日志 ====================
export const fetchLogs = (page, pageSize, filters) => {
    const params = new URLSearchParams({ page, pageSize });
    Object.entries(filters).forEach(([k, v]) => v && params.append(k, v));
    return authFetch(`/logs?${params.toString()}`);
};

// ==================== 告警 ====================
export const fetchAlerts = () => authFetch('/alerts');
export const fetchAlertTypes = () => authFetch('/alerts/types');
export const fetchAlertHistory = (limit = 100, alertId = null) => {
    const params = new URLSearchParams({ limit });
    if (alertId) params.append('alert_id', alertId);
    return authFetch(`/alerts/history?${params.toString()}`);
};

export const createAlert = (data) => authFetch('/alerts', {
    method: 'POST',
    body: JSON.stringify(data)
});

export const updateAlert = (id, data) => authFetch(`/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
});

export const toggleAlert = (id, enabled) => authFetch(`/alerts/${id}/toggle`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
});

export const deleteAlert = (id) => authFetch(`/alerts/${id}`, { method: 'DELETE' });

// ==================== 实时统计 ====================
export const fetchRealtime = () => authFetch('/realtime');
