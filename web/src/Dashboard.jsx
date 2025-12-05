import React, { useState, useEffect } from 'react';
import { fetchStats, fetchSummary, fetchAnalysis, fetchChannels } from './api';
import SummaryCards from './components/SummaryCards';
import AnalyticsCharts from './components/AnalyticsCharts';

const Dashboard = () => {
    const [summary, setSummary] = useState({});
    const [trendData, setTrendData] = useState([]);
    const [stackedData, setStackedData] = useState([]);
    const [modelData, setModelData] = useState([]);
    const [channelData, setChannelData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('24h');
    const [channelsMap, setChannelsMap] = useState({});

    // Fetch channel names on mount
    useEffect(() => {
        const loadChannels = async () => {
            try {
                const channels = await fetchChannels();
                const map = {};
                channels.forEach(c => map[c.id] = c.name);
                setChannelsMap(map);
            } catch (err) {
                console.error("Failed to load channels:", err);
            }
        };
        loadChannels();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Calculate timestamps
            const now = Math.floor(Date.now() / 1000);
            let start = now - 24 * 3600;

            // Time filters
            if (period === '1h') start = now - 3600;
            if (period === '6h') start = now - 6 * 3600;
            if (period === '12h') start = now - 12 * 3600;
            if (period === '24h') start = now - 24 * 3600;
            if (period === '7d') start = now - 7 * 24 * 3600;
            if (period === '30d') start = now - 30 * 24 * 3600;

            const filters = { start_ts: start };

            // Parallel fetch
            const [statsRes, summaryRes, modelRes, channelRes] = await Promise.all([
                fetchStats(filters),
                fetchSummary(filters),
                fetchAnalysis('model', filters),
                fetchAnalysis('channel', filters)
            ]);

            setSummary(summaryRes);
            setModelData(modelRes);

            // Map channel IDs to names for channel data
            const mappedChannelData = channelRes.map(item => ({
                ...item,
                name: channelsMap[item.name] || `Channel ${item.name}` // item.name is channel_id here
            }));
            setChannelData(mappedChannelData);

            // Process trend data & Stacked Bar Data
            const timeMap = {};
            const stackedMap = {};
            const modelTotals = {}; // To identify Top N models

            statsRes.forEach(row => {
                // Format date based on period
                const dateObj = new Date(row.hour * 1000);
                let dateStr;
                if (period === '1h' || period === '6h' || period === '12h' || period === '24h') {
                    dateStr = dateObj.toLocaleString('zh-CN', { hour12: false, hour: 'numeric', minute: 'numeric' });
                } else {
                    dateStr = dateObj.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric' });
                }

                // Trend Data
                if (!timeMap[dateStr]) timeMap[dateStr] = { name: dateStr, tokens: 0, requests: 0 };
                timeMap[dateStr].tokens += row.tokens;
                timeMap[dateStr].requests += (row.request_count || 0);

                // Calculate Model Totals for Ranking
                if (!modelTotals[row.model_name]) modelTotals[row.model_name] = 0;
                modelTotals[row.model_name] += row.tokens;
            });

            // Identify Top 5 Models
            const topModels = Object.entries(modelTotals)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([name]) => name);
            const topModelsSet = new Set(topModels);

            // Build Stacked Data with "Others" grouping
            statsRes.forEach(row => {
                const dateObj = new Date(row.hour * 1000);
                let dateStr;
                if (period === '1h' || period === '6h' || period === '12h' || period === '24h') {
                    dateStr = dateObj.toLocaleString('zh-CN', { hour12: false, hour: 'numeric', minute: 'numeric' });
                } else {
                    dateStr = dateObj.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric' });
                }

                if (!stackedMap[dateStr]) stackedMap[dateStr] = { name: dateStr, Others: 0 };

                const modelKey = topModelsSet.has(row.model_name) ? row.model_name : 'Others';

                if (!stackedMap[dateStr][modelKey]) stackedMap[dateStr][modelKey] = 0;
                stackedMap[dateStr][modelKey] += row.tokens;
            });

            setTrendData(Object.values(timeMap));
            setStackedData(Object.values(stackedMap));

            // Cache the fetched data
            localStorage.setItem('dashboard_cache', JSON.stringify({
                summary: summaryRes,
                trendData: Object.values(timeMap),
                stackedData: Object.values(stackedMap),
                modelData: modelRes,
                channelData: mappedChannelData,
                timestamp: Date.now()
            }));

        } catch (err) {
            console.error("Failed to load dashboard data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Try to load from cache first
        const cache = localStorage.getItem('dashboard_cache');
        if (cache) {
            try {
                const parsed = JSON.parse(cache);
                // Use cache if less than 5 minutes old
                if (Date.now() - parsed.timestamp < 300000) {
                    setSummary(parsed.summary);
                    setTrendData(parsed.trendData);
                    setStackedData(parsed.stackedData);
                    setModelData(parsed.modelData);
                    setChannelData(parsed.channelData);
                    setLoading(false);
                }
            } catch (e) {
                console.error("Failed to parse dashboard cache", e);
            }
        }

        loadData();
        const interval = setInterval(loadData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [period, channelsMap]); // Reload when period or channelsMap changes

    // Skeleton Loading Component
    const Skeleton = ({ className }) => (
        <div className={`animate-pulse bg-gray-200 rounded ${className}`}></div>
    );

    const periods = [
        { value: '1h', label: '1 小时' },
        { value: '6h', label: '6 小时' },
        { value: '12h', label: '12 小时' },
        { value: '24h', label: '24 小时' },
        { value: '7d', label: '7 天' },
        { value: '30d', label: '30 天' },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">数据看板</h1>
                    <p className="text-slate-500 mt-1 font-medium">实时监控 Token 消耗与 API 调用情况</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                    {periods.map((p) => (
                        <button
                            key={p.value}
                            onClick={() => setPeriod(p.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${period === p.value
                                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/20'
                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading State */}
            {loading && !summary.total_tokens ? (
                <div className="space-y-8 animate-pulse">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-gray-200 rounded-2xl"></div>
                        ))}
                    </div>
                    <div className="h-[400px] bg-gray-200 rounded-2xl"></div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="h-[400px] bg-gray-200 rounded-2xl"></div>
                        <div className="h-[400px] bg-gray-200 rounded-2xl"></div>
                    </div>
                </div>
            ) : (
                <>
                    <SummaryCards data={summary} />
                    <AnalyticsCharts
                        trendData={trendData}
                        modelData={modelData}
                        channelData={channelData}
                        stackedData={stackedData}
                    />
                </>
            )}
        </div>
    );
};

export default Dashboard;
