import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';

const TIME_WINDOWS = [
    { value: '1h', label: '1 小时', slots: 12 },
    { value: '6h', label: '6 小时', slots: 24 },
    { value: '12h', label: '12 小时', slots: 24 },
    { value: '24h', label: '24 小时', slots: 24 },
];

const STATUS_COLORS = {
    green: { bg: 'bg-emerald-500', light: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    yellow: { bg: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    red: { bg: 'bg-red-500', light: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
};

const StatusIcon = ({ status, size = 16 }) => {
    if (status === 'green') return <CheckCircle size={size} className="text-emerald-500" />;
    if (status === 'yellow') return <AlertTriangle size={size} className="text-amber-500" />;
    return <XCircle size={size} className="text-red-500" />;
};

const ModelStatus = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [timeWindow, setTimeWindow] = useState('24h');
    const [selectedModel, setSelectedModel] = useState(null);
    const [modelDetail, setModelDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchOverview = useCallback(async () => {
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch(`/api/model-status/overview?window=${timeWindow}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                setData(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch model status:', error);
        }
    }, [timeWindow]);

    const fetchModelDetail = useCallback(async (modelName) => {
        setDetailLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch(`/api/model-status/${encodeURIComponent(modelName)}?window=${timeWindow}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                setModelDetail(result.data);
            }
        } catch (error) {
            console.error('Failed to fetch model detail:', error);
        } finally {
            setDetailLoading(false);
        }
    }, [timeWindow]);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await fetchOverview();
            setLoading(false);
        };
        loadData();

        // 自动刷新
        const interval = setInterval(fetchOverview, 30000);
        return () => clearInterval(interval);
    }, [fetchOverview]);

    useEffect(() => {
        if (selectedModel) {
            fetchModelDetail(selectedModel);
        }
    }, [selectedModel, fetchModelDetail]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchOverview();
        if (selectedModel) {
            await fetchModelDetail(selectedModel);
        }
        setRefreshing(false);
    };

    const formatTime = (ts) => {
        return new Date(ts * 1000).toLocaleString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-cyan-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center text-white">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">模型状态监控</h1>
                        <p className="text-slate-500 text-sm">实时监控各模型的成功率与健康状态</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        刷新
                    </button>
                    <div className="flex gap-1 bg-white p-1 rounded-lg border">
                        {TIME_WINDOWS.map(w => (
                            <button
                                key={w.value}
                                onClick={() => setTimeWindow(w.value)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                                    timeWindow === w.value
                                        ? 'bg-cyan-500 text-white'
                                        : 'text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                {w.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            {data?.summary && (
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                                <Activity className="text-slate-600" size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-slate-800">{data.summary.total}</div>
                                <div className="text-slate-500 text-sm">监控模型数</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                                <CheckCircle className="text-emerald-600" size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-emerald-600">{data.summary.healthy}</div>
                                <div className="text-slate-500 text-sm">健康 (≥95%)</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                                <AlertTriangle className="text-amber-600" size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-amber-600">{data.summary.warning}</div>
                                <div className="text-slate-500 text-sm">警告 (80-95%)</div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-5 rounded-xl border shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                                <XCircle className="text-red-600" size={24} />
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-red-600">{data.summary.critical}</div>
                                <div className="text-slate-500 text-sm">异常 (&lt;80%)</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Model List */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800">模型健康状态</h2>
                    <p className="text-slate-500 text-sm mt-1">点击模型查看详细的时间槽位分析</p>
                </div>
                <div className="divide-y">
                    {data?.models?.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Activity size={48} className="mx-auto mb-3 opacity-30" />
                            <p>暂无模型数据</p>
                        </div>
                    ) : (
                        data?.models?.map((model, idx) => (
                            <div
                                key={idx}
                                onClick={() => setSelectedModel(model.model_name)}
                                className={`p-4 hover:bg-slate-50 cursor-pointer transition ${
                                    selectedModel === model.model_name ? 'bg-cyan-50 border-l-4 border-l-cyan-500' : ''
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <StatusIcon status={model.current_status} size={20} />
                                        <div>
                                            <div className="font-medium text-slate-800">{model.model_name}</div>
                                            <div className="text-sm text-slate-500">
                                                {model.total_requests.toLocaleString()} 请求
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {/* Mini Slot Preview */}
                                        <div className="flex gap-0.5">
                                            {model.slot_data?.slice(-12).map((slot, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-2 h-6 rounded-sm ${STATUS_COLORS[slot.status].bg}`}
                                                    title={`${formatTime(slot.start_time)}: ${slot.success_rate}%`}
                                                />
                                            ))}
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_COLORS[model.current_status].light} ${STATUS_COLORS[model.current_status].text}`}>
                                            {model.success_rate}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Model Detail Panel */}
            {selectedModel && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">{selectedModel}</h2>
                            <p className="text-slate-500 text-sm">时间槽位详细分析</p>
                        </div>
                        <button
                            onClick={() => setSelectedModel(null)}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            ✕
                        </button>
                    </div>
                    
                    {detailLoading ? (
                        <div className="p-8 flex justify-center">
                            <RefreshCw className="animate-spin text-cyan-500" size={24} />
                        </div>
                    ) : modelDetail ? (
                        <div className="p-4">
                            {/* Slot Grid */}
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2 text-sm text-slate-500">
                                    <Clock size={14} />
                                    <span>时间轴 (从左到右: 旧 → 新)</span>
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                    {modelDetail.slot_data?.map((slot, i) => (
                                        <div
                                            key={i}
                                            className={`group relative w-8 h-12 rounded ${STATUS_COLORS[slot.status].bg} hover:scale-110 transition cursor-pointer`}
                                            title={`${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}\n成功率: ${slot.success_rate}%\n请求数: ${slot.total_requests}`}
                                        >
                                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                                                <div>{formatTime(slot.start_time)}</div>
                                                <div>{slot.success_rate}% ({slot.total_requests})</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Stats Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium text-slate-600">时间段</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-600">请求数</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-600">成功数</th>
                                            <th className="px-3 py-2 text-right font-medium text-slate-600">成功率</th>
                                            <th className="px-3 py-2 text-center font-medium text-slate-600">状态</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {modelDetail.slot_data?.slice().reverse().slice(0, 12).map((slot, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 font-mono text-slate-600">
                                                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">{slot.total_requests}</td>
                                                <td className="px-3 py-2 text-right font-mono">{slot.success_count}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold">{slot.success_rate}%</td>
                                                <td className="px-3 py-2 text-center">
                                                    <StatusIcon status={slot.status} size={16} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export default ModelStatus;
