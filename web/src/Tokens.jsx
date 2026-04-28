import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchTokensOverview } from './api';
import { Key, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { PageHeader, StatCard, PanelCard, LoadingState, EmptyState } from './components/PageUI';

const Tokens = () => {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await fetchTokensOverview();
            setTokens(data?.tokens || []);
        } catch (error) {
            console.error('Load data error:', error);
            setTokens([]);
        }
        setLoading(false);
    };

    const formatQuota = (quota) => {
        if (quota >= 1000000) return `${(quota / 1000000).toFixed(2)}M`;
        if (quota >= 1000) return `${(quota / 1000).toFixed(1)}K`;
        return (quota || 0).toString();
    };

    const formatCost = (value) => `$${(value || 0).toFixed(4)}`;

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
            <PageHeader
                icon={Key}
                iconClassName="from-amber-500 to-orange-600"
                title="Token 管理"
            />

            {/* 汇总卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={Key}
                    value={summary.total}
                    label="总 Token 数"
                />
                <StatCard
                    icon={CheckCircle}
                    iconWrapperClassName="bg-green-100"
                    iconClassName="text-green-600"
                    value={summary.active}
                    label="正常运行"
                    valueClassName="text-green-600"
                />
                <StatCard
                    icon={AlertCircle}
                    iconWrapperClassName="bg-yellow-100"
                    iconClassName="text-yellow-600"
                    value={summary.lowQuota}
                    label="额度不足"
                    valueClassName="text-yellow-600"
                />
                <StatCard
                    icon={DollarSign}
                    iconWrapperClassName="bg-blue-100"
                    iconClassName="text-blue-600"
                    value={summary.unlimited}
                    label="无限额度"
                    valueClassName="text-blue-600"
                />
            </div>

            {/* Token 列表 */}
            <PanelCard title="Token 列表">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">名称</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">状态</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">已用额度</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">剩余额度</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">24h 请求</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">24h Token</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">24h 成本</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">过期时间</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">分析</th>
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
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-14 ml-auto"></div></td>
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
                                    <td className="px-4 py-3 text-right font-mono">{formatQuota(t.tokens)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatCost(t.cost)}</td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {t.expiredTime === -1 ? '永不过期' : formatTime(t.expiredTime)}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link to={`/usage?token_id=${t.id}&dimension=model`} className="text-cyan-600 hover:underline font-semibold">
                                            查看
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </PanelCard>
        </div>
    );
};

export default Tokens;