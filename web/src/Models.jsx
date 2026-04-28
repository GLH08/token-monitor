import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Cpu, TrendingUp, Zap, DollarSign, Filter, HeartPulse } from 'lucide-react';
import { EmptyState, FilterBar, PageHeader, PanelCard, StatCard, MODEL_ANALYSIS_TIME_RANGE_OPTIONS, TimeRangeTabs, mapAnalysisWindowToStatusWindow, getSupportedWindow, updateUrlSearchParams, buildPathWithQuery, ChannelSelect } from './components/PageUI';
import { useChannels } from './hooks/useChannels';
import { useModelsAnalysis } from './hooks/useModelsAnalysis';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

const Models = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const period = getSupportedWindow(MODEL_ANALYSIS_TIME_RANGE_OPTIONS, searchParams.get('window'), '24h');
    const selectedChannel = searchParams.get('channel_id') || '';

    const { channels } = useChannels();
    const { data, loading } = useModelsAnalysis(period, selectedChannel);

    const updateSearchParams = useCallback((updates) => {
        updateUrlSearchParams(setSearchParams, updates);
    }, [setSearchParams]);




    // 计算最大值用于进度条
    const maxRequests = Math.max(...(data.models.map(m => m.requests) || [1]), 1);
    const maxTokens = Math.max(...(data.models.map(m => m.tokens) || [1]), 1);
    const statusWindow = mapAnalysisWindowToStatusWindow(period);
    const buildStatusLink = (modelName) => buildPathWithQuery('/model-status', {
        model: modelName,
        channel_id: selectedChannel || null,
        window: statusWindow !== '24h' ? statusWindow : null,
    });

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Cpu}
                iconClassName="from-purple-500 to-pink-600"
                title="模型分析"
                description="聚合查看模型请求、Token、费用和错误率表现"
                actions={
                    <TimeRangeTabs
                        value={period}
                        onChange={(value) => updateSearchParams({ window: value })}
                        options={MODEL_ANALYSIS_TIME_RANGE_OPTIONS}
                        activeClassName="bg-purple-500 text-white"
                    />
                }
            />

            <FilterBar
                icon={Filter}
                action={
                    selectedChannel ? (
                        <button
                            onClick={() => updateSearchParams({ channel_id: '' })}
                            className="text-sm text-purple-600 hover:underline"
                        >
                            清除筛选
                        </button>
                    ) : null
                }
            >
                <ChannelSelect
                    channels={channels}
                    value={selectedChannel}
                    onChange={(val) => updateSearchParams({ channel_id: val })}
                />
            </FilterBar>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={Cpu}
                    iconWrapperClassName="bg-purple-100"
                    iconClassName="text-purple-600"
                    value={data.summary.totalModels || 0}
                    label="使用模型数"
                />
                <StatCard
                    icon={TrendingUp}
                    iconWrapperClassName="bg-blue-100"
                    iconClassName="text-blue-600"
                    value={(data.summary.totalRequests || 0).toLocaleString()}
                    label="总请求数"
                    valueClassName="text-blue-600"
                />
                <StatCard
                    icon={Zap}
                    iconWrapperClassName="bg-amber-100"
                    iconClassName="text-amber-600"
                    value={`${((data.summary.totalTokens || 0) / 1000000).toFixed(2)}M`}
                    label="总 Token"
                    valueClassName="text-amber-600"
                />
                <StatCard
                    icon={DollarSign}
                    iconWrapperClassName="bg-green-100"
                    iconClassName="text-green-600"
                    value={`$${(data.summary.totalCost || 0).toFixed(4)}`}
                    label="总费用"
                    valueClassName="text-green-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PanelCard title="请求量 Top 10" bodyClassName="p-6">
                    <div className="space-y-3">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                </div>
                            ))
                        ) : data.models.length === 0 ? (
                            <EmptyState title="暂无数据" className="py-8" />
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
                </PanelCard>

                <PanelCard title="Token 消耗 Top 10" bodyClassName="p-6">
                    <div className="space-y-3">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <div key={i} className="animate-pulse">
                                    <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                                </div>
                            ))
                        ) : data.models.length === 0 ? (
                            <EmptyState title="暂无数据" className="py-8" />
                        ) : data.models.slice(0, 10).map((m, i) => (
                            <div key={i} className="group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm text-slate-700 truncate max-w-[200px]" title={m.model_name}>
                                        {m.model_name}
                                    </span>
                                    <span className="text-sm font-mono text-slate-500">
                                        {m.tokens >= 1000000 ? `${(m.tokens / 1000000).toFixed(1)}M` :
                                            m.tokens >= 1000 ? `${(m.tokens / 1000).toFixed(0)}K` : m.tokens}
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
                </PanelCard>
            </div>

            <PanelCard title="模型使用详情">
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
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">状态监控</th>
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
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-20 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : data.models.length === 0 ? (
                                <tr>
                                    <td colSpan={7}>
                                        <EmptyState icon={Cpu} title="暂无模型数据" />
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
                                    <td className="px-4 py-3 text-right font-mono text-slate-600">{m.avgLatency}s</td>
                                    <td className="px-4 py-3 text-right">
                                        <Link
                                            to={buildStatusLink(m.model_name)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-medium transition"
                                        >
                                            <HeartPulse size={14} />
                                            查看状态
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

export default Models;