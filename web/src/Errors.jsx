import { useState, useEffect } from 'react';
import { fetchErrorLogs } from './api';
import { AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const Errors = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [filters, setFilters] = useState({ channel_id: '', model_name: '' });
    const pageSize = 50;

    useEffect(() => { loadData(); }, [page, filters]);

    const loadData = async () => {
        setLoading(true);
        const params = { page, pageSize, ...filters };
        const result = await fetchErrorLogs(params);
        setLogs(result.logs || []);
        setTotal(result.total || 0);
        setLoading(false);
    };

    const formatTime = (ts) => {
        if (!ts) return '-';
        return new Date(ts * 1000).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center text-white">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">错误日志</h1>
                        <p className="text-slate-500 text-sm">共 {total.toLocaleString()} 条错误记录</p>
                    </div>
                </div>
                <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-slate-50 transition">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    刷新
                </button>
            </div>

            {/* 筛选 */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex gap-4 items-center">
                <Filter size={18} className="text-slate-400" />
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="渠道 ID"
                        className="px-3 py-1.5 border rounded-lg text-sm w-28 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                        value={filters.channel_id}
                        onChange={e => { setFilters({ ...filters, channel_id: e.target.value }); setPage(1); }}
                    />
                    <input
                        type="text"
                        placeholder="模型名称"
                        className="px-3 py-1.5 border rounded-lg text-sm w-40 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                        value={filters.model_name}
                        onChange={e => { setFilters({ ...filters, model_name: e.target.value }); setPage(1); }}
                    />
                </div>
                {(filters.channel_id || filters.model_name) && (
                    <button onClick={() => { setFilters({ channel_id: '', model_name: '' }); setPage(1); }}
                        className="text-sm text-red-600 hover:underline">
                        清除筛选
                    </button>
                )}
            </div>

            {/* 错误列表 */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">时间</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">渠道</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">模型</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">错误内容</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                [...Array(10)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                        <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-64"></div></td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400">
                                        <AlertTriangle size={48} className="mx-auto mb-3 opacity-30" />
                                        <p>暂无错误日志</p>
                                    </td>
                                </tr>
                            ) : logs.map((log, i) => (
                                <tr key={i} className="hover:bg-red-50/50">
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatTime(log.created_at)}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs font-mono">
                                            {log.channel_id || '-'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-700">{log.model_name || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="max-w-xl truncate text-red-600" title={log.content}>
                                            {log.content || '-'}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 分页 */}
                {totalPages > 1 && (
                    <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
                        <span className="text-sm text-slate-500">
                            第 {page} / {totalPages} 页
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Errors;
