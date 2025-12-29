import { useState, useEffect } from 'react';
import { fetchModelsAnalysis } from './api';
import { Cpu, TrendingUp, Zap, DollarSign } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

const Models = () => {
    const [data, setData] = useState({ models: [], summary: {} });
    const [period, setPeriod] = useState('24h');
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, [period]);

    const loadData = async () => {
        setLoading(true);
        try {
            const now = Math.floor(Date.now() / 1000);
            const periodMap = { '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800 };
            const start_ts = now - periodMap[period];
            const result = await fetchModelsAnalysis({ start_ts, end_ts: now });
            setData(result || { models: [], summary: {} });
        } catch (error) {
            console.error('Load data error:', error);
            setData({ models: [], summary: {} });
        }
        setLoading(false);
    };

    // 计算最大值用于进度条
    const maxRequests = Math.max(...(data.models.map(m => m.requests) || [1]), 1);
    const maxTokens = Math.max(...(data.models.map(m => m.tokens) || [1]), 1);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white">
                        <Cpu size={24} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">模型分析</h1>
                </div>
                <div className="flex gap-2 bg-white p-1 rounded-lg border">
                    {['1h', '6h', '24h', '7d'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${period === p ? 'bg-purple-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* 汇总卡片 */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Cpu className="text-purple-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-slate-800">{data.summary.totalModels || 0}</div>
                            <div className="text-slate-500 text-sm">使用模型数</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <TrendingUp className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-blue-600">{(data.summary.totalRequests || 0).toLocaleString()}</div>
                            <div className="text-slate-500 text-sm">总请求数</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Zap className="text-amber-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-amber-600">{((data.summary.totalTokens || 0) / 1000000).toFixed(2)}M</div>
                            <div className="text-slate-500 text-sm">总 Token</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <DollarSign className="text-green-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-600">${(data.summary.totalCost || 0).toFixed(4)}</div>
                            <div className="text-slate-500 text-sm">总费用</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 简洁进度条图表 - 参考 new-api 风格 */}
            <div className="grid grid-cols-2 gap-6">
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
                        ) : data.models.length === 0 ? (
                            <div className="text-center text-slate-400 py-8">暂无数据</div>
                        ) : data.models.slice(0, 10).map((m, i) => (
                            <div key={i} className="group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-700 truncate max-w-[200px]" title={m.model_name}>
                                        {m.model_name}
                                    </span>
                                    <span className="text-sm font-mono text-slate-500">{m.requests.toLocaleString()}</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ 
                                            width: `${(m.requests / maxRequests) * 100}%`,
                                            backgroundColor: COLORS[i % COLORS.length]
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Token 消耗排行 */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Token 消耗 Top 10</h2>
                    <div className="space-y-3">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                </div>
                            ))
                        ) : data.models.length === 0 ? (
                            <div className="text-center text-slate-400 py-8">暂无数据</div>
                        ) : data.models.slice(0, 10).map((m, i) => (
                            <div key={i} className="group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-700 truncate max-w-[200px]" title={m.model_name}>
                                        {m.model_name}
                                    </span>
                                    <span className="text-sm font-mono text-slate-500">
                                        {m.tokens >= 1000000 ? `${(m.tokens/1000000).toFixed(1)}M` : 
                                         m.tokens >= 1000 ? `${(m.tokens/1000).toFixed(0)}K` : m.tokens}
                                    </span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ 
                                            width: `${(m.tokens / maxTokens) * 100}%`,
                                            backgroundColor: COLORS[(i + 3) % COLORS.length]
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 模型详情表格 */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800">模型使用详情</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">模型</th>
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
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : data.models.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                                        <Cpu size={48} className="mx-auto mb-3 opacity-30" />
                                        <p>暂无模型数据</p>
                                    </td>
                                </tr>
                            ) : data.models.map((m, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{m.model_name}</div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{m.requests.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono">{m.tokens.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono text-green-600">${m.cost.toFixed(4)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${parseFloat(m.errorRate) > 5 ? 'bg-red-100 text-red-700' : parseFloat(m.errorRate) > 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                            {m.errorRate}%
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-slate-600">{m.avgLatency}ms</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Models;