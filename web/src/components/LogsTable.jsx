import React, { useState, useEffect } from 'react';
import { fetchAvailableModels, fetchLogs } from '../api';
import { usePaginatedData } from '../hooks/usePaginatedData';
import { Search, Calendar, Filter, FileJson, Eye, DollarSign, X } from 'lucide-react';
import { ChannelSelect, EmptyState, FilterBar, FilterSelect, PaginationBar, PanelCard, StatCard } from './PageUI';
import { useChannels } from '../hooks/useChannels';
import CustomDateTimePicker from './CustomDateTimePicker';
const formatInteger = (value) => Math.round(value || 0).toLocaleString();
const formatCost = (value) => `$${(value || 0).toFixed(6)}`;
const toModelOptions = (result) => {
    const models = Array.isArray(result?.data) ? result.data : [];
    return models.map((model) => ({
        value: model.model_name,
        label: model.is_active ? `${model.model_name} (${model.request_count_24h || 0})` : model.model_name
    }));
};

const getRequestId = (log) => {
    const requestId = log?.requestId || log?.request_id;
    return requestId ? String(requestId).trim() : '';
};

const LogDetailsDrawer = ({ log, onClose }) => {
    if (!log) return null;
    const requestId = getRequestId(log);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Drawer */}
            <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                            <FileJson size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">日志详情</h2>
                            <p className="text-xs text-slate-500 font-mono">ID: {log.id}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">时间</p>
                            <p className="text-sm font-mono text-slate-700">
                                {new Date(parseInt(log.createdAt) * 1000).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">耗时</p>
                            <p className={`text-sm font-mono font-bold ${log.useTime > 2 ? 'text-amber-500' : 'text-slate-700'}`}>
                                {log.useTime} s
                            </p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">模型</p>
                            <p className="text-sm font-bold text-slate-700">{log.modelName}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">渠道 ID</p>
                            <p className="text-sm font-mono text-slate-700">#{log.channelId}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">Token</p>
                            <p className="text-sm font-medium text-slate-700 break-all">{log.tokenName || '-'}</p>
                            <p className="text-xs font-mono text-slate-400">#{log.tokenId || '-'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-xs text-slate-500 font-medium mb-1">分组</p>
                            <p className="text-sm font-medium text-slate-700 break-all">{log.group || '-'}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 col-span-2">
                            <p className="text-xs text-slate-500 font-medium mb-1">请求 ID</p>
                            <p className="text-sm font-mono text-slate-700 break-all">{requestId || '-'}</p>
                        </div>
                    </div>

                    {/* Token Usage */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Token 消耗</h3>
                        <div className="flex items-center gap-4 text-sm flex-wrap">
                            <div>
                                <span className="text-slate-500 text-xs">Prompt:</span>
                                <span className="ml-2 font-mono font-medium">{formatInteger(log.inputTokens ?? log.promptTokens)}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Completion:</span>
                                <span className="ml-2 font-mono font-medium">{formatInteger(log.outputTokens ?? log.completionTokens)}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Cache Hit:</span>
                                <span className="ml-2 font-mono font-medium text-amber-600">{formatInteger(log.cacheHitTokens)}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Total:</span>
                                <span className="ml-2 font-mono font-bold text-cyan-600">{formatInteger(log.totalTokens ?? ((log.promptTokens || 0) + (log.completionTokens || 0)))}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Quota:</span>
                                <span className="ml-2 font-mono font-medium">{formatInteger(log.billingQuota ?? log.quota)}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 text-xs">Cost:</span>
                                <span className="ml-2 font-mono font-bold text-emerald-600">{formatCost(log.cost ?? ((log.quota || 0) / 500000))}</span>
                            </div>
                        </div>
                    </div>

                    {/* JSON Content */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <FileJson size={16} className="text-slate-400" />
                            完整内容
                        </h3>
                        <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-inner">
                            <pre className="text-xs font-mono text-emerald-400 leading-relaxed">
                                {(() => {
                                    // 尝试解析content字段
                                    if (log.content && log.content.trim()) {
                                        try {
                                            const content = typeof log.content === 'string' ? JSON.parse(log.content) : log.content;
                                            return JSON.stringify(content, null, 2);
                                        } catch {
                                            return log.content;
                                        }
                                    }

                                    // 如果content为空，显示基本信息
                                    const basicInfo = {
                                        message: 'New API 未记录详细请求内容',
                                        tip: '如需记录完整请求/响应，请在 New API 中启用详细日志功能',
                                        available_info: {
                                            model: log.modelName,
                                            channel_id: log.channelId,
                                            request_id: requestId,
                                            input_tokens: log.inputTokens ?? log.promptTokens,
                                            output_tokens: log.outputTokens ?? log.completionTokens,
                                            total_tokens: log.totalTokens ?? ((log.promptTokens || 0) + (log.completionTokens || 0)),
                                            cache_hit_tokens: log.cacheHitTokens || 0,
                                            quota: log.billingQuota ?? log.quota,
                                            cost: formatCost(log.cost ?? ((log.quota || 0) / 500000)),
                                            timestamp: new Date(parseInt(log.createdAt) * 1000).toISOString()
                                        }
                                    };
                                    return JSON.stringify(basicInfo, null, 2);
                                })()}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const LogsTable = () => {
    const [dateInputs, setDateInputs] = useState({ start: '', end: '' });
    const [selectedLog, setSelectedLog] = useState(null);
    const [modelOptions, setModelOptions] = useState([]);
    const { channels } = useChannels();

    const {
        data: logs,
        total,
        stats,
        page,
        setPage,
        loading,
        filters,
        setFilters,
        handleSearch: runSearch,
        totalPages
    } = usePaginatedData(fetchLogs, {
        channel_id: '',
        model_name: '',
        request_id: '',
        start_ts: '',
        end_ts: ''
    }, { pageSize: 20, cacheKey: 'logs_cache' });

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

    const safeStats = stats || { total_tokens: 0, total_cost: 0 };

    const handleSearch = (e) => {
        e.preventDefault();
        const apiFilters = { ...filters };
        if (dateInputs.start) apiFilters.start_ts = Math.floor(new Date(dateInputs.start).getTime() / 1000);
        else apiFilters.start_ts = '';
        if (dateInputs.end) apiFilters.end_ts = Math.floor(new Date(dateInputs.end).getTime() / 1000);
        else apiFilters.end_ts = '';
        runSearch(apiFilters);
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    icon={Filter}
                    iconWrapperClassName="bg-blue-50"
                    iconClassName="text-blue-600"
                    value={total.toLocaleString()}
                    label="当前筛选总日志"
                />
                <StatCard
                    icon={Search}
                    iconWrapperClassName="bg-cyan-50"
                    iconClassName="text-cyan-600"
                    value={safeStats.total_tokens.toLocaleString()}
                    label="总 Token 消耗"
                    valueClassName="text-cyan-600"
                />
                <StatCard
                    icon={DollarSign}
                    value={`$${safeStats.total_cost.toFixed(4)}`}
                    label="预估总费用"
                    valueClassName="text-emerald-600"
                    iconWrapperClassName="bg-emerald-50"
                    iconClassName="text-emerald-600"
                />
            </div>

            <FilterBar contentClassName="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-6 bg-cyan-500 rounded-full"></div>
                    <h3 className="text-lg font-bold text-slate-800">请求日志</h3>
                </div>
                <form onSubmit={handleSearch} className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,220px)_minmax(220px,1fr)_minmax(190px,220px)_minmax(360px,420px)_auto] xl:items-center xl:w-full">
                    <ChannelSelect channels={channels} value={filters.channel_id} onChange={value => setFilters({ ...filters, channel_id: value })} wrapperClassName="w-full" selectClassName="w-full min-w-0 max-w-none" />
                    <FilterSelect label="模型" value={filters.model_name} onChange={value => setFilters({ ...filters, model_name: value })} options={modelOptions} allLabel="全部模型" wrapperClassName="w-full" selectClassName="w-full min-w-0 max-w-none" />
                    <div className="flex w-full items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-1.5 hover:border-cyan-400 transition-colors focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 focus-within:bg-white">
                        <Search size={18} className="shrink-0 text-slate-400" />
                        <input
                            type="search"
                            value={filters.request_id}
                            onChange={event => setFilters({ ...filters, request_id: event.target.value })}
                            placeholder="请求 ID"
                            aria-label="请求 ID"
                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
                        />
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-1.5 hover:border-cyan-400 transition-colors group focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 focus-within:bg-white md:col-span-2 xl:col-span-1">
                        <Calendar size={18} className="mr-1 shrink-0 text-slate-400 group-hover:text-cyan-500 transition-colors" />
                        <div className="min-w-0 flex-1">
                            <CustomDateTimePicker
                                label="开始时间"
                                value={dateInputs.start}
                                onChange={val => setDateInputs({ ...dateInputs, start: val })}
                                minWidthClassName="min-w-0"
                            />
                        </div>
                        <span className="text-slate-300 font-medium px-1">→</span>
                        <div className="min-w-0 flex-1">
                            <CustomDateTimePicker
                                label="结束时间"
                                value={dateInputs.end}
                                onChange={val => setDateInputs({ ...dateInputs, end: val })}
                                minWidthClassName="min-w-0"
                            />
                        </div>
                    </div>
                    <button type="submit" className="inline-flex h-full min-h-[42px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-2.5 font-medium text-white transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-95 md:col-span-2 xl:col-span-1 xl:w-auto">
                        <Search size={18} /> 查询
                    </button>
                </form>
            </FilterBar>

            <PanelCard>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">ID</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">时间</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">渠道</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">请求 ID</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">模型</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">耗时</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Token</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">费用 ($)</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan="9" className="text-center py-12 text-slate-400">加载中...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="9"><EmptyState title="暂无日志" /></td></tr>
                            ) : (
                                logs.map(log => {
                                    const inputTokens = log.inputTokens ?? log.promptTokens ?? 0;
                                    const outputTokens = log.outputTokens ?? log.completionTokens ?? 0;
                                    const totalTokens = log.totalTokens ?? (inputTokens + outputTokens);
                                    const requestId = getRequestId(log);
                                    return (
                                        <tr
                                            key={log.id}
                                            className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                            onClick={() => setSelectedLog(log)}
                                        >
                                            <td className="px-6 py-4 font-mono text-slate-400 text-xs">#{log.id}</td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {new Date(parseInt(log.createdAt) * 1000).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 group-hover:border-cyan-200 group-hover:bg-cyan-50 group-hover:text-cyan-700 transition-colors">
                                                    {log.channelId}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-500 max-w-[180px] truncate font-mono" title={requestId}>
                                                {requestId || '-'}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-700 max-w-[320px]">
                                                <div className="bg-slate-50 px-2 py-1 rounded text-slate-600 border border-slate-100 whitespace-normal break-all" title={log.modelName}>{log.modelName}</div>
                                                {(log.tokenName || log.tokenId || log.group) ? (
                                                    <div className="mt-1 text-xs text-slate-400 break-all">
                                                        {log.tokenName || (log.tokenId ? `Token #${log.tokenId}` : '')}{log.group ? ` · ${log.group}` : ''}
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`font-mono font-medium ${log.useTime > 2 ? 'text-amber-500' : 'text-slate-600'}`}>
                                                    {log.useTime} s
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-col items-end gap-0.5">
                                                    <span className="font-mono font-bold text-cyan-600">
                                                        {formatInteger(totalTokens)}
                                                    </span>
                                                    <span className="text-xs text-slate-400 font-mono">
                                                        {formatInteger(inputTokens)}↑ / {formatInteger(outputTokens)}↓
                                                    </span>
                                                    {log.cacheHitTokens ? (
                                                        <span className="text-xs text-amber-600 font-mono">
                                                            cache {formatInteger(log.cacheHitTokens)}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-emerald-600 bg-emerald-50/30">
                                                <div>{formatCost(log.cost ?? ((log.quota || 0) / 500000))}</div>
                                                <div className="text-xs font-mono text-slate-400">Quota {formatInteger(log.billingQuota ?? log.quota)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button type="button" className="p-1.5 hover:bg-cyan-50 text-slate-400 hover:text-cyan-600 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40">
                                                    <Eye size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    summary={`显示 ${logs.length} 条，共 ${total} 条`}
                    className="bg-white"
                    pageClassName="text-slate-500 font-medium"
                    buttonClassName="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-600 transition-colors"
                    showControls={totalPages > 1}
                    onPrevious={() => setPage(p => Math.max(1, p - 1))}
                    onNext={() => setPage(p => Math.min(totalPages || 1, p + 1))}
                />
            </PanelCard>

            {selectedLog && (
                <LogDetailsDrawer
                    log={selectedLog}
                    onClose={() => setSelectedLog(null)}
                />
            )}
        </div>
    );
};

export default LogsTable;
