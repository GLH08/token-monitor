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

    const res = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers
    });

    if (res.status === 401) {
        localStorage.removeItem('access_token');
        window.location.reload();
        throw new Error('Unauthorized');
    }

    return res.json();
};

export const fetchStats = async (filters) => {
    const params = new URLSearchParams();
    if (filters.channel_id) params.append('channel_id', filters.channel_id);
    if (filters.model_name) params.append('model_name', filters.model_name);
    if (filters.start_ts) params.append('start_ts', filters.start_ts);
    if (filters.end_ts) params.append('end_ts', filters.end_ts);

    return authFetch(`/stats?${params.toString()}`);
};

export const fetchSummary = async (filters) => {
    const params = new URLSearchParams();
    if (filters.start_ts) params.append('start_ts', filters.start_ts);
    if (filters.end_ts) params.append('end_ts', filters.end_ts);
    return authFetch(`/summary?${params.toString()}`);
};

export const fetchAnalysis = async (type, filters) => {
    const params = new URLSearchParams();
    params.append('type', type);
    if (filters.start_ts) params.append('start_ts', filters.start_ts);
    if (filters.end_ts) params.append('end_ts', filters.end_ts);
    return authFetch(`/analysis?${params.toString()}`);
};

export const fetchLogs = async (page, pageSize, filters) => {
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('pageSize', pageSize);
    if (filters.channel_id) params.append('channel_id', filters.channel_id);
    if (filters.model_name) params.append('model_name', filters.model_name);
    if (filters.start_ts) params.append('start_ts', filters.start_ts);
    if (filters.end_ts) params.append('end_ts', filters.end_ts);
    return authFetch(`/logs?${params.toString()}`);
};

export const fetchChannels = async () => {
    return authFetch(`/channels`);
};

export const fetchLatencyAnalysis = async (start_ts, end_ts) => {
    const params = new URLSearchParams();
    if (start_ts) params.append('start_ts', start_ts);
    if (end_ts) params.append('end_ts', end_ts);
    return authFetch(`/analysis/latency?${params.toString()}`);
};

export const fetchAlerts = async () => {
    return authFetch(`/alerts`);
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

export const deleteAlert = (id) => authFetch(`/alerts/${id}`, {
    method: 'DELETE'
});
