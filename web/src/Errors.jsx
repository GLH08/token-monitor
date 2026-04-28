import { useEffect, useMemo, useState } from 'react';
import { fetchAvailableModels, fetchErrorLogs } from './api';
import { AlertTriangle, RefreshCw, Filter, Eye, X, Clock3, Server, Cpu, FileText, TimerReset } from 'lucide-react';
import { ChannelSelect, EmptyState, FilterBar, FilterSelect, LoadingState, PageHeader, PaginationBar, PanelCard, StatCard } from './components/PageUI';
import { usePaginatedData } from './hooks/usePaginatedData';
import { useChannels } from './hooks/useChannels';
import CustomDateTimePicker from './components/CustomDateTimePicker';

const toModelOptions = (result) => {
    const models = Array.isArray(result?.data) ? result.data : [];
    return models.map((model) => ({
        value: model.model_name,
        label: model.is_active ? `${model.model_name} (${model.request_count_24h || 0})` : model.model_name
    }));
};

const fromDateTimeInput = (value) => value ? Math.floor(new Date(value).getTime() / 1000) : '';

const formatTime = (ts) => {
    if (!ts) {
        return '-';
    }

    return new Date(ts * 1000).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

const formatUseTime = (value) => (
    value === null || value === undefined ? '-' : `${value} s`
);

const buildErrorPreview = (log) => {
    const rawContent = typeof log.content === 'string' ? log.content.trim() : '';
    if (rawContent) {
        return rawContent.length > 120 ? `${rawContent.slice(0, 120)}...` : rawContent;
    }

    const rawOther = typeof log.other === 'string' ? log.other.trim() : '';
    if (rawOther) {
        return rawOther.length > 120 ? `${rawOther.slice(0, 120)}...` : rawOther;
    }

    return '暂无错误详情';
};

const formatJsonLike = (value, fallback) => {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'string') {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return fallback;
    }
};

const ErrorDetailsDrawer = ({ log, onClose }) => {
    if (!log) {
        return null;
    }

    const contentText = formatJsonLike(log.content, '暂无 content 字段');
    const otherText = formatJsonLike(log.other, '暂无 other 字段');

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">错误详情</h2>
                            <p className="text-xs font-mono text-slate-500">ID: {log.id}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                        aria-label="关闭错误详情"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Clock3 size={14} /> 时间
                            </div>
                            <div className="font-mono text-sm text-slate-700">{formatTime(log.created_at)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <TimerReset size={14} /> 耗时
                            </div>
                            <div className={`font-mono text-sm ${log.use_time > 2 ? 'text-amber-600' : 'text-slate-700'}`}>
                                {formatUseTime(log.use_time)}
                            </div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Server size={14} /> 渠道
                            </div>
                            <div className="font-mono text-sm text-slate-700">{log.channel_id || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Cpu size={14} /> 模型
                            </div>
                            <div className="text-sm font-medium text-slate-700">{log.model_name || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <FileText size={14} /> Token
                            </div>
                            <div className="text-sm font-medium text-slate-700 break-all">{log.token_name || '-'}</div>
                            <div className="font-mono text-xs text-slate-400">#{log.token_id || '-'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <Filter size={14} /> 分组
                            </div>
                            <div className="text-sm font-medium text-slate-700 break-all">{log.group || '-'}</div>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                            <FileText size={16} className="text-slate-400" />
                            content
                        </h3>
                        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4">
                            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-emerald-400">{contentText}</pre>
                        </div>
                    </div>

                    <div>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
                            <FileText size={16} className="text-slate-400" />
                            other
                        </h3>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">{otherText}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Errors = () => {
    const [selectedLog, setSelectedLog] = useState(null);
    const [dateInputs, setDateInputs] = useState({ start: '', end: '' });
    const [modelOptions, setModelOptions] = useState([]);
    const { channels } = useChannels();

    const {
        data: logs,
        total,
        page,
        setPage,
        loading,
        refreshing,
        error,
        filters,
        setFilters,
        loadData,
        totalPages
    } = usePaginatedData(fetchErrorLogs, {
        channel_id: '',
        model_name: '',
        start_ts: '',
        end_ts: ''
    }, { pageSize: 50 });

    useEffect(() => {
        let cancelled = false;
        fetchAvailableModels()
            .then((result) => {
                if (!cancelled) {
                    setModelOptions(toModelOptions(result));
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error('Load model options error:', error);
                    setModelOptions([]);
                }
            });
        return () => { cancelled = true; };
    }, []);

    const applyFilters = () => {
        setFilters({
            ...filters,
            start_ts: fromDateTimeInput(dateInputs.start),
            end_ts: fromDateTimeInput(dateInputs.end)
        });
        setPage(1);
    };

    const clearFilters = () => {
        setDateInputs({ start: '', end: '' });
        setFilters({ channel_id: '', model_name: '', start_ts: '', end_ts: '' });
        setPage(1);
    };

    const hasFilters = Boolean(filters.channel_id || filters.model_name || filters.start_ts || filters.end_ts || dateInputs.start || dateInputs.end);
    const loadError = error && logs.length === 0 ? error : '';
    const refreshError = error && logs.length > 0 ? error : '';

    const summary = useMemo(() => ({
        total,
        visible: logs.length,
        slow: logs.filter((log) => (log.use_time || 0) > 2).length,
        withContent: logs.filter((log) => Boolean(log.content)).length,
    }), [logs, total]);

    return (
        <div className="space-y-6">
            <PageHeader
                icon={AlertTriangle}
                iconClassName="from-red-500 to-orange-600"
                title="错误日志"
                description={`共 ${total.toLocaleString()} 条错误记录`}
                actions={
                    <button
                        type="button"
                        onClick={() => loadData({ silent: true })}
                        className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        刷新
                    </button>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={AlertTriangle}
                    iconWrapperClassName="bg-red-100"
                    iconClassName="text-red-600"
                    value={summary.total.toLocaleString()}
                    label="错误总数"
                    valueClassName="text-red-600"
                />
                <StatCard
                    icon={Eye}
                    iconWrapperClassName="bg-slate-100"
                    iconClassName="text-slate-600"
                    value={summary.visible.toLocaleString()}
                    label="当前页记录"
                />
                <StatCard
                    icon={TimerReset}
                    iconWrapperClassName="bg-amber-100"
                    iconClassName="text-amber-600"
                    value={summary.slow.toLocaleString()}
                    label="慢错误 (>2s)"
                    valueClassName="text-amber-600"
                />
                <StatCard
                    icon={FileText}
                    iconWrapperClassName="bg-blue-100"
                    iconClassName="text-blue-600"
                    value={summary.withContent.toLocaleString()}
                    label="含 content 详情"
                    valueClassName="text-blue-600"
                />
            </div>

            <FilterBar
                icon={Filter}
                contentClassName="flex flex-wrap gap-3 items-center"
                action={(
                    hasFilters ? (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-sm text-red-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 rounded"
                        >
                            清除筛选
                        </button>
                    ) : null
                )}
            >
                <ChannelSelect channels={channels} value={filters.channel_id} onChange={(value) => { setFilters({ ...filters, channel_id: value }); setPage(1); }} />
                <FilterSelect label="模型" value={filters.model_name} onChange={(value) => { setFilters({ ...filters, model_name: value }); setPage(1); }} options={modelOptions} allLabel="全部模型" selectClassName="max-w-72" />
                <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5">
                    <Clock3 size={16} className="text-slate-400" />
                    <CustomDateTimePicker label="开始时间" value={dateInputs.start} onChange={(value) => setDateInputs({ ...dateInputs, start: value })} />
                    <span className="text-slate-300">→</span>
                    <CustomDateTimePicker label="结束时间" value={dateInputs.end} onChange={(value) => setDateInputs({ ...dateInputs, end: value })} />
                    <button
                        type="button"
                        onClick={applyFilters}
                        className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                    >
                        应用
                    </button>
                </div>
            </FilterBar>

            <PanelCard title="错误明细" description="保留表格视图，同时增加摘要与详情抽屉，便于快速定位异常" bodyClassName="p-0">
                {refreshing ? (
                    <div className="border-b px-4 py-3 text-right text-sm text-slate-500">正在刷新错误日志...</div>
                ) : null}
                {refreshError ? (
                    <div className="border-b px-4 py-3 text-sm text-red-600">{refreshError}</div>
                ) : null}

                {loading ? (
                    <LoadingState label="加载错误日志中..." className="h-64" />
                ) : loadError ? (
                    <EmptyState
                        icon={AlertTriangle}
                        title="加载失败"
                        description={loadError}
                        className="py-16"
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">时间</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">渠道</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">模型</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">错误摘要</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">耗时</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">操作</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <EmptyState icon={AlertTriangle} title="暂无错误日志" description="当前筛选条件下没有匹配的错误记录。" />
                                        </td>
                                    </tr>
                                ) : logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-red-50/40 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatTime(log.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono">{log.channel_id || '-'}</span>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-slate-700 max-w-[280px]">
                                            <div className="whitespace-normal break-all" title={log.model_name || '-'}>{log.model_name || '-'}</div>
                                            {(log.token_name || log.token_id || log.group) ? (
                                                <div className="mt-1 text-xs text-slate-400 break-all">
                                                    {log.token_name || (log.token_id ? `Token #${log.token_id}` : '')}{log.group ? ` · ${log.group}` : ''}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <div className="max-w-xl text-red-600">{buildErrorPreview(log)}</div>
                                                {(log.content || log.other) ? (
                                                    <div className="text-xs text-slate-400">点击“查看详情”可展开完整错误上下文</div>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`font-mono ${log.use_time > 2 ? 'text-amber-600' : 'text-slate-600'}`}>
                                                {formatUseTime(log.use_time)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedLog(log)}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                                            >
                                                <Eye size={14} />
                                                查看详情
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {totalPages > 1 ? (
                    <PaginationBar
                        page={page}
                        totalPages={totalPages}
                        summary={`第 ${page} / ${totalPages} 页，共 ${total.toLocaleString()} 条`}
                        className="bg-slate-50"
                        pageClassName="text-slate-500"
                        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
                    />
                ) : null}
            </PanelCard>

            <ErrorDetailsDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default Errors;
