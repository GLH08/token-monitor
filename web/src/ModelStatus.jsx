import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock, Filter } from 'lucide-react';
import { EmptyState, FilterBar, LoadingState, PageHeader, PanelCard, StatCard, TimeRangeTabs, MODEL_STATUS_TIME_RANGE_OPTIONS, getSupportedWindow, mapStatusWindowToAnalysisWindow, updateUrlSearchParams, buildPathWithQuery, ChannelSelect } from './components/PageUI';
import { useChannels } from './hooks/useChannels';
import { useModelStatusData } from './hooks/useModelStatusData';

const STATUS_COLORS = {
    green: { bg: 'bg-emerald-500', light: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
    yellow: { bg: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    red: { bg: 'bg-red-500', light: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
    gray: { bg: 'bg-slate-400', light: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

const StatusIcon = ({ status, size = 16 }) => {
    if (status === 'green') return <CheckCircle size={size} className="text-emerald-500" />;
    if (status === 'yellow') return <AlertTriangle size={size} className="text-amber-500" />;
    if (status === 'gray') return <Clock size={size} className="text-slate-500" />;
    return <XCircle size={size} className="text-red-500" />;
};

const ModelStatus = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const timeWindow = getSupportedWindow(MODEL_STATUS_TIME_RANGE_OPTIONS, searchParams.get('window'), '24h');
    const selectedModel = searchParams.get('model') || null;
    const selectedChannel = searchParams.get('channel_id') || '';

    const { channels } = useChannels();
    const {
        data,
        loading,
        refreshing,
        modelDetail,
        detailLoading,
        handleRefresh
    } = useModelStatusData(timeWindow, selectedChannel, selectedModel);

    const updateSearchParams = useCallback((updates) => {
        updateUrlSearchParams(setSearchParams, updates);
    }, [setSearchParams]);



    const clearFilters = () => {
        updateSearchParams({ channel_id: '', model: '' });
    };

    const formatTime = (ts) => new Date(ts * 1000).toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const analysisWindow = mapStatusWindowToAnalysisWindow(timeWindow);
    const analysisLink = buildPathWithQuery('/models', {
        channel_id: selectedChannel || null,
        window: analysisWindow !== '24h' ? analysisWindow : null,
    });

    if (loading) {
        return <LoadingState label="加载模型状态中..." className="h-64" />;
    }

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Activity}
                iconClassName="from-cyan-500 to-blue-600"
                title="模型状态监控"
                description="实时监控各模型的成功率与健康状态"
                actions={(
                    <>
                        <Link
                            to={analysisLink}
                            className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 transition text-slate-600"
                        >
                            查看分析页
                        </Link>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                            刷新
                        </button>
                        <TimeRangeTabs
                            value={timeWindow}
                            onChange={(value) => updateSearchParams({ window: value })}
                            options={MODEL_STATUS_TIME_RANGE_OPTIONS}
                            activeClassName="bg-cyan-500 text-white"
                        />
                    </>
                )}
            />

            <FilterBar
                icon={Filter}
                action={selectedChannel || selectedModel ? (
                    <button onClick={clearFilters} className="text-sm text-cyan-600 hover:underline">
                        清除筛选
                    </button>
                ) : null}
            >
                <ChannelSelect
                    channels={channels}
                    value={selectedChannel}
                    onChange={(val) => updateSearchParams({ channel_id: val })}
                />
                {selectedModel ? (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-sm border border-cyan-100">
                        <span className="text-slate-500">当前模型</span>
                        <span className="font-medium">{selectedModel}</span>
                    </div>
                ) : null}
            </FilterBar>

            {data?.summary ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    <StatCard
                        icon={Activity}
                        iconWrapperClassName="bg-slate-100"
                        iconClassName="text-slate-600"
                        value={data.summary.total}
                        label="监控模型数"
                    />
                    <StatCard
                        icon={CheckCircle}
                        iconWrapperClassName="bg-emerald-100"
                        iconClassName="text-emerald-600"
                        value={data.summary.healthy}
                        label="健康 (≥95%)"
                        valueClassName="text-emerald-600"
                    />
                    <StatCard
                        icon={AlertTriangle}
                        iconWrapperClassName="bg-amber-100"
                        iconClassName="text-amber-600"
                        value={data.summary.warning}
                        label="警告 (80-95%)"
                        valueClassName="text-amber-600"
                    />
                    <StatCard
                        icon={XCircle}
                        iconWrapperClassName="bg-red-100"
                        iconClassName="text-red-600"
                        value={data.summary.critical}
                        label="异常 (<80%)"
                        valueClassName="text-red-600"
                    />
                    <StatCard
                        icon={Clock}
                        iconWrapperClassName="bg-slate-100"
                        iconClassName="text-slate-600"
                        value={data.summary.idle || 0}
                        label="无流量"
                        valueClassName="text-slate-700"
                    />
                </div>
            ) : null}

            <PanelCard title="模型健康状态" description="点击模型查看详细的时间槽位分析">
                <div className="divide-y">
                    {data?.models?.length === 0 ? (
                        <EmptyState icon={Activity} title="暂无模型数据" />
                    ) : (
                        data?.models?.map((model) => (
                            <button
                                key={model.model_name}
                                type="button"
                                onClick={() => updateSearchParams({ model: model.model_name })}
                                className={`w-full p-4 text-left hover:bg-slate-50 cursor-pointer transition ${selectedModel === model.model_name ? 'bg-cyan-50 border-l-4 border-l-cyan-500' : ''}`}
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
                                        <div className="flex gap-0.5">
                                            {model.slot_data?.slice(-12).map((slot, index) => (
                                                <div
                                                    key={index}
                                                    className={`w-2 h-6 rounded-sm ${STATUS_COLORS[slot.status].bg}`}
                                                    title={`${formatTime(slot.start_time)}: ${slot.success_rate == null ? '无流量' : `${slot.success_rate}%`}`}
                                                />
                                            ))}
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-sm font-bold ${STATUS_COLORS[model.current_status].light} ${STATUS_COLORS[model.current_status].text}`}>
                                            {model.success_rate == null ? '无流量' : `${model.success_rate}%`}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </PanelCard>

            {selectedModel ? (
                <PanelCard
                    title={selectedModel}
                    description="时间槽位详细分析"
                    className="overflow-hidden"
                    bodyClassName="p-4"
                >
                    <div className="flex justify-end mb-4">
                        <button
                            type="button"
                            onClick={() => updateSearchParams({ model: '' })}
                            className="text-sm text-slate-400 hover:text-slate-600"
                        >
                            关闭详情
                        </button>
                    </div>

                    {detailLoading ? (
                        <LoadingState label="加载模型详情中..." className="h-40" />
                    ) : modelDetail ? (
                        <>
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2 text-sm text-slate-500">
                                    <Clock size={14} />
                                    <span>时间轴 (从左到右: 旧 → 新)</span>
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                    {modelDetail.slot_data?.map((slot, index) => (
                                        <div
                                            key={index}
                                            className={`group relative w-8 h-12 rounded ${STATUS_COLORS[slot.status].bg} hover:scale-110 transition cursor-pointer`}
                                            title={`${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}\n成功率: ${slot.success_rate == null ? '无流量' : `${slot.success_rate}%`}\n请求数: ${slot.total_requests}`}
                                        >
                                            <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                                                <div>{formatTime(slot.start_time)}</div>
                                                <div>{slot.success_rate == null ? '无流量' : `${slot.success_rate}% (${slot.total_requests})`}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

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
                                        {modelDetail.slot_data?.slice().reverse().slice(0, 12).map((slot, index) => (
                                            <tr key={index} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 font-mono text-slate-600">
                                                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono">{slot.total_requests}</td>
                                                <td className="px-3 py-2 text-right font-mono">{slot.success_count}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold">{slot.success_rate == null ? '无流量' : `${slot.success_rate}%`}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <StatusIcon status={slot.status} size={16} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <EmptyState title="暂无模型详情" className="py-8" />
                    )}
                </PanelCard>
            ) : null}
        </div>
    );
};

export default ModelStatus;
