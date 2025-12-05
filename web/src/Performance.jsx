import React, { useState, useEffect } from 'react';
import { fetchLatencyAnalysis } from './api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Activity, Clock, AlertTriangle, Zap } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-4 border border-slate-100 shadow-xl rounded-xl">
                <p className="text-slate-500 text-xs font-semibold mb-2">{label}</p>
                <p className="text-cyan-600 font-bold text-lg">
                    {payload[0].value} ms
                </p>
                <p className="text-slate-400 text-xs">平均延迟</p>
            </div>
        );
    }
    return null;
};

const Performance = () => {
    const [data, setData] = useState({ latency_trend: [], slow_requests: [] });
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(24); // hours

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const end = Math.floor(Date.now() / 1000);
            const start = end - (period * 3600);
            const res = await fetchLatencyAnalysis(start, end);
            setData(res || { latency_trend: [], slow_requests: [] });
            setLoading(false);
        };
        loadData();
    }, [period]);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
                        <Activity size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 tracking-tight">性能分析</h1>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {[1, 6, 24, 72].map((h) => (
                        <button
                            key={h}
                            onClick={() => setPeriod(h)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${period === h ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {h}H
                        </button>
                    ))}
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* RPM Trend Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Activity size={20} className="text-blue-500" />
                        请求量趋势 (Requests)
                    </h2>
                    <div className="h-[250px] w-full">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">加载数据中...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.latency_trend}>
                                    <defs>
                                        <linearGradient id="colorRpm" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} minTickGap={30} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => [value, 'Requests']}
                                    />
                                    <Area type="monotone" dataKey="rpm" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRpm)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* TPM Trend Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Zap size={20} className="text-amber-500" />
                        Token 消耗趋势 (TPM)
                    </h2>
                    <div className="h-[250px] w-full">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">加载数据中...</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data.latency_trend}>
                                    <defs>
                                        <linearGradient id="colorTpm" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} minTickGap={30} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => [value.toLocaleString(), 'Tokens']}
                                    />
                                    <Area type="monotone" dataKey="tpm" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorTpm)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Latency Trend Chart (Secondary) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Clock size={20} className="text-violet-500" />
                    API 平均延迟趋势 (Latency)
                </h2>
                <div className="h-[250px] w-full">
                    {loading ? (
                        <div className="h-full flex items-center justify-center text-slate-400 animate-pulse">加载数据中...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.latency_trend}>
                                <defs>
                                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} minTickGap={30} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} unit=" ms" />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="avg_latency" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorLatency)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Slow Requests Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={20} className="text-amber-500" />
                        <h2 className="text-lg font-bold text-slate-800">Top 20 慢请求 (Slow Log)</h2>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">时间</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">模型</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">渠道 ID</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">耗时 (ms)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-32"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-24"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-12"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-100 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : (
                                data.slow_requests.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                                            {new Date(Number(log.createdAt) * 1000).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-700">{log.modelName}</td>
                                        <td className="px-6 py-4">
                                            <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">
                                                #{log.channelId}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-mono font-bold ${log.useTime > 5000 ? 'text-red-500' : (log.useTime > 2000 ? 'text-amber-500' : 'text-slate-700')}`}>
                                                {log.useTime.toLocaleString()} ms
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Performance;
