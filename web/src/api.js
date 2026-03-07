const API_BASE = '/api';
const TOKEN_KEY = 'access_token';

const buildUrl = (url) => `${API_BASE}${url}`;

const buildQueryString = (paramsObject = {}) => {
    const params = new URLSearchParams();
    Object.entries(paramsObject).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.append(key, value);
        }
    });
    return params.toString();
};

const withQuery = (url, paramsObject) => {
    const queryString = buildQueryString(paramsObject);
    return queryString ? `${url}?${queryString}` : url;
};

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

export const setStoredToken = (token) => {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
};

export const clearStoredToken = () => {
    localStorage.removeItem(TOKEN_KEY);
};

export const notifyAuthChanged = () => {
    window.dispatchEvent(new Event('auth-changed'));
};

const authFetch = async (url, options = {}) => {
    const token = getStoredToken();
    const headers = {
        ...options.headers,
        'Content-Type': 'application/json',
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(buildUrl(url), { ...options, headers });

    if (res.status === 401) {
        clearStoredToken();
        notifyAuthChanged();
        throw new Error('Unauthorized');
    }

    return res.json();
};

export const login = async (password) => {
    const res = await fetch(buildUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });

    const result = await res.json();
    if (!res.ok) {
        throw new Error(result.error || 'Login failed');
    }

    if (result?.data?.token) {
        setStoredToken(result.data.token);
        notifyAuthChanged();
    }

    return result;
};

export const logout = async () => {
    try {
        await authFetch('/auth/logout', { method: 'POST' });
    } finally {
        clearStoredToken();
        notifyAuthChanged();
    }
};

export const fetchAuthMe = () => authFetch('/auth/me');
export const fetchAuthConfig = async () => {
    const res = await fetch(buildUrl('/auth/config'));
    return res.json();
};

// ==================== 基础统计 ====================
export const fetchStats = (filters) => authFetch(withQuery('/stats', filters));

export const fetchSummary = (filters) => authFetch(withQuery('/summary', filters));

export const fetchAnalysis = (type, filters) => authFetch(withQuery('/analysis', { type, ...filters }));

// ==================== 渠道监控 ====================
export const fetchChannelsOverview = () => authFetch('/channels/overview');

export const fetchChannelPerformance = (filters) => authFetch(withQuery('/channels/performance', filters));

export const fetchChannels = () => authFetch('/channels');

// ==================== 模型分析 ====================
export const fetchModelsAnalysis = (filters) => authFetch(withQuery('/models/analysis', filters));

export const fetchModelsLatencyCompare = (filters) => authFetch(withQuery('/models/latency-compare', filters));


// ==================== Token 监控 ====================
export const fetchTokensOverview = () => authFetch('/tokens/overview');

export const fetchTokenUsage = (tokenId, filters) => authFetch(withQuery(`/tokens/${tokenId}/usage`, filters));

// ==================== 错误日志 ====================
export const fetchErrorLogs = (params) => authFetch(withQuery('/errors', params));

export const fetchErrors = ({ page, pageSize, ...filters }) => authFetch(withQuery('/errors', { page, pageSize, ...filters }));

export const fetchErrorsSummary = (filters) => authFetch(withQuery('/errors/summary', filters));

// ==================== 性能分析 ====================
export const fetchLatencyAnalysis = (start_ts, end_ts) => authFetch(withQuery('/analysis/latency', { start_ts, end_ts }));

// ==================== 日志 ====================
export const fetchLogs = ({ page, pageSize, ...filters }) => authFetch(withQuery('/logs', { page, pageSize, ...filters }));

// ==================== 告警 ====================
export const fetchAlerts = () => authFetch('/alerts');
export const fetchAlertTypes = () => authFetch('/alerts/types');
export const fetchAlertHistory = (limit = 100, alertId = null) => authFetch(withQuery('/alerts/history', { limit, alert_id: alertId }));

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

// ==================== 模型状态监控 ====================
export const fetchModelStatusOverview = (window = '24h', channelId = null) => authFetch(withQuery('/model-status/overview', { window, channel_id: channelId }));

export const fetchModelStatusDetail = (modelName, window = '24h', channelId = null) => authFetch(withQuery(`/model-status/${encodeURIComponent(modelName)}`, { window, channel_id: channelId }));

export const fetchAvailableModels = () => authFetch('/model-status/models');

// ==================== 仪表盘增强 ====================
export const fetchHourlyTrend = (hours = 24) => authFetch(withQuery('/dashboard/hourly-trend', { hours }));

export const fetchModelDistribution = (filters) => authFetch(withQuery('/dashboard/model-distribution', filters));
