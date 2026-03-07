import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchStats, fetchSummary, fetchAnalysis, fetchChannels, fetchModelStatusOverview } from '../api';
import { mapAnalysisWindowToStatusWindow } from '../components/PageUI';

const PERIOD_TO_SECONDS = {
    '1h': 3600,
    '6h': 6 * 3600,
    '12h': 12 * 3600,
    '24h': 24 * 3600,
    '7d': 7 * 24 * 3600,
    '30d': 30 * 24 * 3600,
};

export function useDashboardData(period) {
    const [summary, setSummary] = useState({});
    const [trendData, setTrendData] = useState([]);
    const [stackedData, setStackedData] = useState([]);
    const [modelData, setModelData] = useState([]);
    const [channelAnalysis, setChannelAnalysis] = useState([]);
    const [loading, setLoading] = useState(true);
    const [channelsMap, setChannelsMap] = useState({});
    const [modelHealth, setModelHealth] = useState(null);
    const [overviewMetrics, setOverviewMetrics] = useState({ avgLatency: 0, errorRate: 0 });
    const latestRequestIdRef = useRef(0);

    const cacheKey = `dashboard_cache:${period}`;
    const healthWindow = mapAnalysisWindowToStatusWindow(period);

    const resetDashboardState = useCallback(() => {
        setSummary({});
        setTrendData([]);
        setStackedData([]);
        setModelData([]);
        setChannelAnalysis([]);
        setModelHealth(null);
        setOverviewMetrics({ avgLatency: 0, errorRate: 0 });
    }, []);

    useEffect(() => {
        const loadChannels = async () => {
            try {
                const channels = await fetchChannels();
                const map = {};
                channels.forEach((channel) => {
                    map[channel.id] = channel.name;
                });
                setChannelsMap(map);
            } catch (err) {
                console.error('Failed to load channels:', err);
            }
        };

        loadChannels();
    }, []);

    const loadData = useCallback(async () => {
        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;
        setLoading(true);
        try {
            const now = Math.floor(Date.now() / 1000);
            const start = now - (PERIOD_TO_SECONDS[period] || PERIOD_TO_SECONDS['24h']);
            const filters = { start_ts: start };

            const [statsRes, summaryRes, modelRes, channelRes, healthRes] = await Promise.all([
                fetchStats(filters),
                fetchSummary(filters),
                fetchAnalysis('model', filters),
                fetchAnalysis('channel', filters),
                fetchModelStatusOverview(healthWindow).catch(() => null),
            ]);

            if (latestRequestIdRef.current !== requestId) return;

            const statsRows = Array.isArray(statsRes) ? statsRes : [];
            const models = Array.isArray(modelRes) ? modelRes : [];
            const channels = Array.isArray(channelRes) ? channelRes : [];
            const nextSummary = summaryRes || {};

            const isShortWindow = ['1h', '6h', '12h', '24h'].includes(period);
            const formatBucketLabel = (timestamp) => {
                const dateObj = new Date(timestamp * 1000);
                if (isShortWindow) {
                    return dateObj.toLocaleString('zh-CN', { hour12: false, hour: 'numeric', minute: 'numeric' });
                }
                return dateObj.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric' });
            };

            const timeMap = {};
            const stackedMap = {};
            const modelTotals = {};
            let weightedLatencyTotal = 0;
            let latencyRequestCount = 0;

            statsRows.forEach((row) => {
                const dateStr = formatBucketLabel(row.hour);
                const requestCount = row.request_count || 0;
                const avgLatency = row.avg_latency || 0;

                if (!timeMap[dateStr]) {
                    timeMap[dateStr] = { name: dateStr, tokens: 0, requests: 0 };
                }
                timeMap[dateStr].tokens += row.tokens || 0;
                timeMap[dateStr].requests += requestCount;

                if (!modelTotals[row.model_name]) {
                    modelTotals[row.model_name] = 0;
                }
                modelTotals[row.model_name] += row.tokens || 0;

                weightedLatencyTotal += avgLatency * requestCount;
                latencyRequestCount += requestCount;
            });

            const topModelNames = Object.entries(modelTotals)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name]) => name);
            const topModelsSet = new Set(topModelNames);

            statsRows.forEach((row) => {
                const dateStr = formatBucketLabel(row.hour);
                if (!stackedMap[dateStr]) {
                    stackedMap[dateStr] = { name: dateStr, Others: 0 };
                }

                const modelKey = topModelsSet.has(row.model_name) ? row.model_name : 'Others';
                if (!stackedMap[dateStr][modelKey]) {
                    stackedMap[dateStr][modelKey] = 0;
                }
                stackedMap[dateStr][modelKey] += row.tokens || 0;
            });

            const nextOverviewMetrics = {
                avgLatency: latencyRequestCount > 0 ? weightedLatencyTotal / latencyRequestCount : 0,
                errorRate: nextSummary.total_requests > 0
                    ? ((nextSummary.total_errors || 0) / nextSummary.total_requests) * 100
                    : 0,
            };

            const nextModelHealth = healthRes?.success ? (healthRes.data?.summary || null) : null;
            const nextTrendData = Object.values(timeMap);
            const nextStackedData = Object.values(stackedMap);

            setSummary(nextSummary);
            setTrendData(nextTrendData);
            setStackedData(nextStackedData);
            setModelData(models);
            setChannelAnalysis(channels);
            setModelHealth(nextModelHealth);
            setOverviewMetrics(nextOverviewMetrics);

            localStorage.setItem(cacheKey, JSON.stringify({
                summary: nextSummary,
                trendData: nextTrendData,
                stackedData: nextStackedData,
                modelData: models,
                channelAnalysis: channels,
                modelHealth: nextModelHealth,
                overviewMetrics: nextOverviewMetrics,
                timestamp: Date.now(),
            }));
        } catch (err) {
            if (latestRequestIdRef.current === requestId) {
                console.error('Failed to load dashboard data:', err);
            }
        } finally {
            if (latestRequestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [cacheKey, healthWindow, period]);

    useEffect(() => {
        let hasFreshCache = false;
        const cache = localStorage.getItem(cacheKey);
        if (cache) {
            try {
                const parsed = JSON.parse(cache);
                if (Date.now() - parsed.timestamp < 300000) {
                    setSummary(parsed.summary || {});
                    setTrendData(parsed.trendData || []);
                    setStackedData(parsed.stackedData || []);
                    setModelData(parsed.modelData || []);
                    setChannelAnalysis(parsed.channelAnalysis || []);
                    setModelHealth(parsed.modelHealth || null);
                    setOverviewMetrics(parsed.overviewMetrics || { avgLatency: 0, errorRate: 0 });
                    setLoading(false);
                    hasFreshCache = true;
                }
            } catch (e) {
                console.error('Failed to parse dashboard cache', e);
            }
        }

        if (!hasFreshCache) {
            resetDashboardState();
            setLoading(true);
        }

        loadData();
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [cacheKey, loadData, resetDashboardState]);

    const channelData = useMemo(() => channelAnalysis.map((item) => ({
        ...item,
        name: channelsMap[item.name] || `Channel ${item.name}`,
    })), [channelAnalysis, channelsMap]);

    const stackedKeys = useMemo(() => {
        const keys = new Set();
        stackedData.forEach((item) => {
            Object.keys(item).forEach((key) => {
                if (key !== 'name') {
                    keys.add(key);
                }
            });
        });
        return Array.from(keys);
    }, [stackedData]);

    const topModels = useMemo(() => modelData.slice(0, 5), [modelData]);
    const topChannels = useMemo(() => channelData.slice(0, 5), [channelData]);

    return {
        summary,
        trendData,
        stackedData,
        modelData,
        channelData,
        topModels,
        topChannels,
        stackedKeys,
        loading,
        modelHealth,
        overviewMetrics,
        healthWindow
    };
}
