import { useState, useEffect } from 'react';
import { fetchChannelsOverview, fetchChannelPerformance } from './api';
import { Server, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const TYPE_MAP = {
    1: 'OpenAI', 3: 'Azure', 8: 'Claude', 11: 'Google', 14: 'Anthropic',
    15: 'Baidu', 17: 'Ali', 18: 'Xunfei', 19: 'AI360', 24: 'Gemini',
    25: 'Moonshot', 31: 'DeepSeek', 33: 'Doubao', 40: 'Ollama'
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const Channels = () => {
    const [overview, setOverview] = useState({ channels: [], statusCount: { enabled: 0, disabled: 0, autoDisabled: 0 }, total: 0 });
    const [performance, setPerformance] = useState([]);
    const [period, setPeriod] = useState('24h');
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, [period]);

    const loadData = async () => {
        setLoading(true);
        try {
            const now = Math.floor(Date.now() / 1000);
            const periodMap = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
            const start_ts = now - periodMap[period];

            const [overviewData, perfData] = await Promise.all([
                fetchChannelsOverview().catch(e => {
                    console.error('fetchChannelsOverview error:', e);
                    return { channels: [], statusCount: { enabled: 0, disabled: 0, autoDisabled: 0 }, total: 0 };
                }),
                fetchChannelPerformance({ start_ts, end_ts: now }).catch(e => {
                    console.error('fetchChannelPerformance error:', e);
                    return [];
                })
            ]);

            setOverview(overviewData || { channels: [], statusCount: { enabled: 0, disabled: 0, autoDisabled: 0 }, total: 0 });
            setPerformance(perfData || []);
        } catch (error) {
            console.error('Load data error:', error);
        }
        setLoading(false);
    };

    const maxRequests = Math.max(...(performance.map(p => p.requests) || [1]), 1);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white">
                        <Server size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">渠道监控</h1>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-lg border">
                    {['1h', '6h', '24h', '7d'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${period === p ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* 状态卡片 */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                            <Server className="text-slate-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-slate-800">{overview.total || 0}</div>
                            <div className="text-slate-500 text-sm">总渠道数</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-green-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-600">{overview.statusCount?.enabled || 0}</div>
                            <div className="text-slate-500 text-sm">正常运行</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <XCircle className="text-yellow-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-yellow-600">{overview.statusCount?.disabled || 0}</div>
                            <div className="text-slate-500 text-sm">手动禁用</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                            <AlertTriangle className="text-red-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-red-600">{overview.statusCount?.autoDisabled || 0}</div>
                            <div className="text-slate-500 text-sm">自动禁用</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 简洁进度条图表 */}
            <div className="grid grid-cols-2 gap-6">
                {/* 渠道状态分布 */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">渠道状态分布</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-700">正常运行</span>
                                <span className="text-sm font-mono text-green-600">{overview.statusCount?.enabled || 0}</span>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                                    style={{ width: overview.total ? `${((overview.statusCount?.enabled || 0) / overview.total) * 100}%` : '0%' }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-700">手动禁用</span>
                                <span className="text-sm font-mono text-yellow-600">{overview.statusCount?.disabled || 0}</span>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                                    style={{ width: overview.total ? `${((overview.statusCount?.disabled || 0) / overview.total) * 100}%` : '0%' }} />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-slate-700">自动禁用</span>
                                <span className="text-sm font-mono text-red-600">{overview.statusCount?.autoDisabled || 0}</span>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full transition-all duration-500"
                                    style={{ width: overview.total ? `${((overview.statusCount?.autoDisabled || 0) / overview.total) * 100}%` : '0%' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 请求量排行 */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">请求量 Top 10</h2>
                    <div className="space-y-3">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                </div>
                            ))
                        ) : performance.length === 0 ? (
                            <div className="text-center text-slate-400 py-8">暂无数据</div>
                        ) : performance.slice(0, 10).map((ch, i) => (
                            <div key={ch.channelId}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-700 truncate max-w-[180px]" title={ch.channelName}>
                                        {ch.channelName}
                                    </span>
                                    <span className="text-sm font-mono text-slate-500">{ch.requests.toLocaleString()}</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${(ch.requests / maxRequests) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 渠道性能表格 */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800">渠道性能详情</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">渠道</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">类型</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">请求数</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">Token</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">费用</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">错误率</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">平均延迟</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : performance.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                                        <Server size={48} className="mx-auto mb-3 opacity-30" />
                                        <p>暂无渠道数据</p>
                                    </td>
                                </tr>
                            ) : performance.map(ch => (
                                <tr key={ch.channelId} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{ch.channelName}</div>
                                        <div className="text-xs text-slate-400">ID: {ch.channelId}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">
                                            {TYPE_MAP[ch.channelType] || `Type ${ch.channelType}`}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{ch.requests.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono">{ch.tokens.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono text-green-600">${ch.cost.toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${parseFloat(ch.errorRate) > 5 ? 'bg-red-100 text-red-700' : parseFloat(ch.errorRate) > 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                            {ch.errorRate}%
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`font-mono ${ch.avgLatency > 5000 ? 'text-red-600' : ch.avgLatency > 2000 ? 'text-yellow-600' : 'text-slate-600'}`}>
                                            {ch.avgLatency}ms
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Channels;