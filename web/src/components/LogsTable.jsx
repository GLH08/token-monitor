import React, { useState, useEffect, useRef } from 'react';
import { fetchLogs } from '../api';
import { ChevronLeft, ChevronRight, Search, Calendar, Filter, X, Check, Clock, FileJson, Eye } from 'lucide-react';

// Custom Date Time Picker Component
const CustomDateTimePicker = ({ label, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [tempDate, setTempDate] = useState('');
    const [tempHour, setTempHour] = useState('00');
    const [tempMinute, setTempMinute] = useState('00');
    const containerRef = useRef(null);

    useEffect(() => {
        if (value) {
            const d = new Date(value);
            setTempDate(d.toISOString().split('T')[0]);
            setTempHour(String(d.getHours()).padStart(2, '0'));
            setTempMinute(String(d.getMinutes()).padStart(2, '0'));
        } else {
            const now = new Date();
            setTempDate(now.toISOString().split('T')[0]);
            setTempHour(String(now.getHours()).padStart(2, '0'));
            setTempMinute(String(now.getMinutes()).padStart(2, '0'));
        }
    }, [value, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleConfirm = () => {
        if (tempDate) {
            const dateStr = `${tempDate}T${tempHour}:${tempMinute}`;
            onChange(dateStr);
        }
        setIsOpen(false);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange('');
        setIsOpen(false);
    };

    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    return (
        <div className="relative" ref={containerRef}>
            <div
                className={`flex items-center gap-2 cursor-pointer min-w-[140px] px-2 py-1 rounded-lg transition-colors ${value ? 'text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="text-sm font-medium truncate">
                    {value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : label}
                </span>
                {value && (
                    <button onClick={handleClear} className="p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600">
                        <X size={12} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 p-4 z-50 w-[280px] animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1">日期</label>
                            <input
                                type="date"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 outline-none text-slate-700"
                                value={tempDate}
                                onChange={e => setTempDate(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1">
                                <Clock size={12} /> 时间
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <select
                                        className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 outline-none text-slate-700 bg-white"
                                        value={tempHour}
                                        onChange={e => setTempHour(e.target.value)}
                                    >
                                        {hours.map(h => <option key={h} value={h}>{h} 时</option>)}
                                    </select>
                                </div>
                                <span className="text-slate-300 font-bold">:</span>
                                <div className="relative flex-1">
                                    <select
                                        className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 outline-none text-slate-700 bg-white"
                                        value={tempMinute}
                                        onChange={e => setTempMinute(e.target.value)}
                                    >
                                        {minutes.map(m => <option key={m} value={m}>{m} 分</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleConfirm}
                            className="w-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-white py-2 rounded-lg font-bold text-sm hover:shadow-md hover:shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Check size={16} /> 确认
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const LogDetailsDrawer = ({ log, onClose }) => {
    if (!log) return null;

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
                            <p className={`text-sm font-mono font-bold ${log.useTime > 2000 ? 'text-amber-500' : 'text-slate-700'}`}>
                                {log.useTime} ms
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
                    </div>

                    {/* Token Usage */}
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Token 消耗</h3>
                        <div className="flex items-center gap-4 text-sm">
                            <div>
                                <span className="text-slate-500 text-xs">Prompt:</span>
                                <span className="ml-2 font-mono font-medium">{log.promptTokens}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Completion:</span>
                                <span className="ml-2 font-mono font-medium">{log.completionTokens}</span>
                            </div>
                            <div className="w-px h-4 bg-slate-200"></div>
                            <div>
                                <span className="text-slate-500 text-xs">Total:</span>
                                <span className="ml-2 font-mono font-bold text-cyan-600">{log.promptTokens + log.completionTokens}</span>
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
                                        } catch (e) {
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
                                            prompt_tokens: log.promptTokens,
                                            completion_tokens: log.completionTokens,
                                            total_tokens: log.promptTokens + log.completionTokens,
                                            duration_ms: log.useTime,
                                            cost: (log.quota / 500000).toFixed(6) + ' USD',
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
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState({ total_tokens: 0, total_cost: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [filters, setFilters] = useState({
        channel_id: '',
        model_name: '',
        start_ts: '',
        end_ts: ''
    });

    const [dateInputs, setDateInputs] = useState({ start: '', end: '' });
    const pageSize = 20;

    const loadLogs = async () => {
        setLoading(true);
        try {
            const apiFilters = { ...filters };
            if (dateInputs.start) apiFilters.start_ts = Math.floor(new Date(dateInputs.start).getTime() / 1000);
            if (dateInputs.end) apiFilters.end_ts = Math.floor(new Date(dateInputs.end).getTime() / 1000);

            const res = await fetchLogs(page, pageSize, apiFilters);
            setLogs(res.data);
            setTotal(res.total);
            if (res.stats) setStats(res.stats);

            if (page === 1 && !filters.channel_id && !filters.model_name && !filters.start_ts) {
                sessionStorage.setItem('logs_cache', JSON.stringify({
                    data: res.data,
                    total: res.total,
                    stats: res.stats,
                    timestamp: Date.now()
                }));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (page === 1 && !filters.channel_id && !filters.model_name) {
            const cache = sessionStorage.getItem('logs_cache');
            if (cache) {
                try {
                    const parsed = JSON.parse(cache);
                    if (Date.now() - parsed.timestamp < 300000) {
                        setLogs(parsed.data);
                        setTotal(parsed.total);
                        if (parsed.stats) setStats(parsed.stats);
                    }
                } catch (e) {
                    console.error("Failed to parse logs cache", e);
                }
            }
        }
        loadLogs();
    }, [page]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        loadLogs();
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="space-y-6">
            {/* Stats Summary Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Filter size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">当前筛选总日志</p>
                        <p className="text-2xl font-bold text-slate-800">{total.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                        <Search size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">总 Token 消耗</p>
                        <p className="text-2xl font-bold text-cyan-600">{stats.total_tokens.toLocaleString()}</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <span className="text-xl font-bold">$</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">预估总费用</p>
                        <p className="text-2xl font-bold text-emerald-600">${stats.total_cost.toFixed(4)}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-1 h-6 bg-cyan-500 rounded-full"></div>
                        <h3 className="text-lg font-bold text-slate-800">请求日志</h3>
                    </div>
                    <form onSubmit={handleSearch} className="flex flex-wrap gap-3 w-full xl:w-auto">
                        <div className="relative group">
                            <input
                                placeholder="渠道 ID"
                                className="border-2 border-slate-200 px-4 py-2.5 rounded-xl text-sm w-full sm:w-32 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all bg-slate-50 focus:bg-white"
                                value={filters.channel_id}
                                onChange={e => setFilters({ ...filters, channel_id: e.target.value })}
                            />
                        </div>
                        <div className="relative group">
                            <input
                                placeholder="模型名称"
                                className="border-2 border-slate-200 px-4 py-2.5 rounded-xl text-sm w-full sm:w-40 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all bg-slate-50 focus:bg-white"
                                value={filters.model_name}
                                onChange={e => setFilters({ ...filters, model_name: e.target.value })}
                            />
                        </div>

                        <div className="flex items-center gap-1 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-1.5 hover:border-cyan-400 transition-colors group focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 focus-within:bg-white">
                            <Calendar size={18} className="text-slate-400 group-hover:text-cyan-500 transition-colors mr-2" />
                            <CustomDateTimePicker
                                label="开始时间"
                                value={dateInputs.start}
                                onChange={val => setDateInputs({ ...dateInputs, start: val })}
                            />
                            <span className="text-slate-300 font-medium px-1">→</span>
                            <CustomDateTimePicker
                                label="结束时间"
                                value={dateInputs.end}
                                onChange={val => setDateInputs({ ...dateInputs, end: val })}
                            />
                        </div>

                        <button type="submit" className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-6 py-2.5 rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all duration-200 flex items-center gap-2 font-medium active:scale-95">
                            <Search size={18} /> 查询
                        </button>
                    </form>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">ID</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">时间</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">渠道</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">模型</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">耗时</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">Token</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-right">费用 ($)</th>
                                <th className="px-6 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan="8" className="text-center py-12 text-slate-400">加载中...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="8" className="text-center py-12 text-slate-400">暂无日志</td></tr>
                            ) : (
                                logs.map(log => (
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
                                        <td className="px-6 py-4 font-medium text-slate-700">
                                            <span className="bg-slate-50 px-2 py-1 rounded text-slate-600 border border-slate-100">{log.modelName}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-mono font-medium ${log.useTime > 2000 ? 'text-amber-500' : 'text-slate-600'}`}>
                                                {log.useTime} ms
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="font-mono font-bold text-cyan-600">
                                                    {(log.promptTokens + log.completionTokens).toLocaleString()}
                                                </span>
                                                <span className="text-xs text-slate-400 font-mono">
                                                    {log.promptTokens.toLocaleString()}↑ / {log.completionTokens.toLocaleString()}↓
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-emerald-600 bg-emerald-50/30">${(log.quota / 500000).toFixed(6)}</td>
                                        <td className="px-6 py-4 text-center">
                                            <button className="p-1.5 hover:bg-cyan-50 text-slate-400 hover:text-cyan-600 rounded-lg transition-colors">
                                                <Eye size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-white">
                    <span className="text-sm text-slate-500 font-medium">
                        显示 {logs.length} 条，共 {total} 条
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-600 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="flex items-center px-4 text-sm font-bold text-slate-700 bg-slate-50 rounded-lg border border-slate-100">
                            {page} / {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-600 transition-colors"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Details Drawer */}
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
