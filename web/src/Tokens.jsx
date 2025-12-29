import { useState, useEffect } from 'react';
import { fetchTokensOverview } from './api';
import { Key, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';

const Tokens = () => {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const data = await fetchTokensOverview();
        setTokens(data.tokens || []);
        setLoading(false);
    };

    const formatQuota = (quota) => {
        if (quota >= 1000000) return `${(quota / 1000000).toFixed(2)}M`;
        if (quota >= 1000) return `${(quota / 1000).toFixed(1)}K`;
        return quota.toString();
    };

    const getStatusBadge = (status) => {
        const map = {
            1: { text: '正常', color: 'bg-green-100 text-green-700' },
            2: { text: '禁用', color: 'bg-red-100 text-red-700' },
            3: { text: '过期', color: 'bg-gray-100 text-gray-700' },
            4: { text: '耗尽', color: 'bg-yellow-100 text-yellow-700' }
        };
        const s = map[status] || { text: '未知', color: 'bg-gray-100 text-gray-500' };
        return <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.color}`}>{s.text}</span>;
    };

    const formatTime = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : '-';

    const summary = {
        total: tokens.length,
        active: tokens.filter(t => t.status === 1).length,
        lowQuota: tokens.filter(t => !t.unlimitedQuota && t.remainQuota < 100000).length,
        unlimited: tokens.filter(t => t.unlimitedQuota).length
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white">
                    <Key size={24} />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Token 管理</h1>
            </div>

            {/* 汇总卡片 */}
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                            <Key className="text-slate-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-slate-800">{summary.total}</div>
                            <div className="text-slate-500 text-sm">总 Token 数</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <CheckCircle className="text-green-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-600">{summary.active}</div>
                            <div className="text-slate-500 text-sm">正常运行</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <AlertCircle className="text-yellow-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-yellow-600">{summary.lowQuota}</div>
                            <div className="text-slate-500 text-sm">额度不足</div>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-xl border shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <DollarSign className="text-blue-600" size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-blue-600">{summary.unlimited}</div>
                            <div className="text-slate-500 text-sm">无限额度</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Token 列表 */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800">Token 列表</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">名称</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">状态</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">已用额度</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">剩余额度</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">请求次数</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">过期时间</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-20 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-20 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                    </tr>
                                ))
                            ) : tokens.map(t => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-800">{t.name}</div>
                                        <div className="text-xs text-slate-400">ID: {t.id}</div>
                                    </td>
                                    <td className="px-4 py-3">{getStatusBadge(t.status)}</td>
                                    <td className="px-4 py-3 text-right font-mono">{formatQuota(t.usedQuota)}</td>
                                    <td className="px-4 py-3 text-right">
                                        {t.unlimitedQuota ? (
                                            <span className="text-blue-600 font-bold">∞</span>
                                        ) : (
                                            <span className={`font-mono ${t.remainQuota < 100000 ? 'text-red-600' : 'text-slate-700'}`}>
                                                {formatQuota(t.remainQuota)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{t.usedCount.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {t.expiredTime === -1 ? '永不过期' : formatTime(t.expiredTime)}
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

export default Tokens;