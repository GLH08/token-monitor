import React, { useState, useEffect, useRef } from 'react';
import { fetchAlerts, createAlert, deleteAlert, updateAlert, toggleAlert } from './api';
import { Trash2, Plus, Bell, Zap, Edit, ToggleLeft, ToggleRight, Calendar, X, Check, Clock } from 'lucide-react';

// Custom Date Time Picker Component (from LogsTable)
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
                className={`flex items-center gap-2 cursor-pointer px-3 py-2 border border-gray-300 rounded-lg transition-colors ${value ? 'text-slate-700 bg-white' : 'text-slate-400 bg-gray-50 hover:bg-white'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Calendar size={16} className="text-gray-400" />
                <span className="text-sm truncate">
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
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none text-slate-700"
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
                                        className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none text-slate-700 bg-white"
                                        value={tempHour}
                                        onChange={e => setTempHour(e.target.value)}
                                    >
                                        {hours.map(h => <option key={h} value={h}>{h} 时</option>)}
                                    </select>
                                </div>
                                <span className="text-slate-300 font-bold">:</span>
                                <div className="relative flex-1">
                                    <select
                                        className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 outline-none text-slate-700 bg-white"
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
                            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 text-white py-2 rounded-lg font-bold text-sm hover:shadow-md hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <Check size={16} /> 确认
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const Alerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        type: 'channel',
        target: '',
        threshold: 1000,
        period: 'daily',
        customStartTime: '',
        customEndTime: '',
        start_time: '00:00',
        end_time: '23:59',
        notify_telegram: true,
        notify_feishu: false,
        notify_wecom: false,
        trigger_action: 'notify'
    });

    useEffect(() => {
        loadAlerts();
    }, []);

    const loadAlerts = async () => {
        try {
            const data = await fetchAlerts();
            setAlerts(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Build rule object
            const rule = {
                type: formData.type,
                target: formData.target,
                threshold: parseInt(formData.threshold),
                period: formData.period
            };

            // If custom period, add custom time range
            if (formData.period === 'custom') {
                if (formData.customStartTime) {
                    rule.customStartTs = Math.floor(new Date(formData.customStartTime).getTime() / 1000);
                }
                if (formData.customEndTime) {
                    rule.customEndTs = Math.floor(new Date(formData.customEndTime).getTime() / 1000);
                }
            }

            const payload = {
                name: formData.name,
                rule,
                enabled: true,
                start_time: formData.start_time,
                end_time: formData.end_time,
                notify_telegram: formData.notify_telegram,
                notify_feishu: formData.notify_feishu,
                notify_wecom: formData.notify_wecom,
                trigger_action: formData.trigger_action
            };

            if (editingId) {
                await updateAlert(editingId, payload);
            } else {
                await createAlert(payload);
            }

            setShowForm(false);
            setEditingId(null);
            resetForm();
            loadAlerts();
        } catch (error) {
            alert('Failed to save alert');
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure?')) {
            await deleteAlert(id);
            loadAlerts();
        }
    };

    const handleEdit = (alert) => {
        const rule = JSON.parse(alert.rule);
        setFormData({
            name: alert.name,
            type: rule.type,
            target: rule.target,
            threshold: rule.threshold,
            period: rule.period || 'daily',
            customStartTime: rule.customStartTs ? new Date(rule.customStartTs * 1000).toISOString().slice(0, 16) : '',
            customEndTime: rule.customEndTs ? new Date(rule.customEndTs * 1000).toISOString().slice(0, 16) : '',
            start_time: alert.start_time || '00:00',
            end_time: alert.end_time || '23:59',
            notify_telegram: !!alert.notify_telegram,
            notify_feishu: !!alert.notify_feishu,
            notify_wecom: !!alert.notify_wecom,
            trigger_action: alert.trigger_action || 'notify'
        });
        setEditingId(alert.id);
        setShowForm(true);
    };

    const handleToggle = async (alert) => {
        try {
            await toggleAlert(alert.id, !alert.enabled);
            loadAlerts();
        } catch (error) {
            console.error("Toggle failed", error);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            type: 'channel',
            target: '',
            threshold: 1000,
            period: 'daily',
            customStartTime: '',
            customEndTime: '',
            start_time: '00:00',
            end_time: '23:59',
            notify_telegram: true,
            notify_feishu: false,
            notify_wecom: false,
            trigger_action: 'notify'
        });
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">告警配置 (Alerts)</h1>
                    <p className="text-gray-500 text-sm mt-1">管理 Token 使用量告警规则与熔断策略</p>
                </div>
                <button
                    onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <Plus size={18} />
                    新建告警
                </button>
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-xl w-full max-w-lg shadow-2xl transform transition-all">
                        <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">
                            {editingId ? '编辑告警规则' : '新建告警规则'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
                                <input
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="例如：OpenAI 渠道日限额"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">监控对象类型</label>
                                    <select
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.type}
                                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                                    >
                                        <option value="channel">渠道 (Channel ID)</option>
                                        <option value="model">模型 (Model Name)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">对象标识</label>
                                    <input
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.target}
                                        onChange={e => setFormData({ ...formData, target: e.target.value })}
                                        placeholder={formData.type === 'channel' ? "例如: 1" : "例如: gpt-4"}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">统计周期</label>
                                    <select
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.period}
                                        onChange={e => setFormData({ ...formData, period: e.target.value })}
                                    >
                                        <option value="1h">最近 1 小时</option>
                                        <option value="6h">最近 6 小时</option>
                                        <option value="12h">最近 12 小时</option>
                                        <option value="24h">最近 24 小时</option>
                                        <option value="48h">最近 48 小时</option>
                                        <option value="72h">最近 72 小时</option>
                                        <option value="168h">最近 7 天</option>
                                        <option value="720h">最近 30 天</option>
                                        <option value="daily">自然日 (Today)</option>
                                        <option value="custom">自定义时间范围</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">阈值 (Tokens)</label>
                                    <input
                                        type="number"
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.threshold}
                                        onChange={e => setFormData({ ...formData, threshold: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Custom Time Range (shown when period is 'custom') */}
                            {formData.period === 'custom' && (
                                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                                    <label className="block text-sm font-medium text-indigo-700 mb-3">自定义统计时间范围</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">开始时间</label>
                                            <CustomDateTimePicker
                                                label="选择开始时间"
                                                value={formData.customStartTime}
                                                onChange={val => setFormData({ ...formData, customStartTime: val })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">结束时间 (留空表示到当前)</label>
                                            <CustomDateTimePicker
                                                label="选择结束时间"
                                                value={formData.customEndTime}
                                                onChange={val => setFormData({ ...formData, customEndTime: val })}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-indigo-600 mt-2">
                                        💡 提示：自定义时间范围用于统计历史固定时段的 Token 总量，适合月度/季度统计
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">生效开始时间</label>
                                    <input
                                        type="time"
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.start_time}
                                        onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">生效结束时间</label>
                                    <input
                                        type="time"
                                        className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={formData.end_time}
                                        onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">通知渠道</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.notify_telegram}
                                            onChange={e => setFormData({ ...formData, notify_telegram: e.target.checked })}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-gray-700">Telegram</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.notify_feishu}
                                            onChange={e => setFormData({ ...formData, notify_feishu: e.target.checked })}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-gray-700">飞书 (Feishu)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.notify_wecom}
                                            onChange={e => setFormData({ ...formData, notify_wecom: e.target.checked })}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-gray-700">企业微信 (WeCom)</span>
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">触发动作</label>
                                <select
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={formData.trigger_action}
                                    onChange={e => setFormData({ ...formData, trigger_action: e.target.value })}
                                >
                                    <option value="notify">仅通知 (Notify Only)</option>
                                    <option value="disable">通知并禁用渠道 (Circuit Breaker)</option>
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.trigger_action === 'disable'
                                        ? '⚠️ 警告：触发后将自动调用 New API 禁用该渠道。仅对"渠道"类型规则生效。'
                                        : '仅发送通知，不会影响渠道状态。'}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    保存规则
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid gap-4">
                    {alerts.map(alert => {
                        const rule = JSON.parse(alert.rule);
                        // Format period display
                        const getPeriodDisplay = () => {
                            if (rule.period === 'custom') {
                                const start = rule.customStartTs ? new Date(rule.customStartTs * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : '起始';
                                const end = rule.customEndTs ? new Date(rule.customEndTs * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : '当前';
                                return `${start} → ${end}`;
                            }
                            const periodMap = {
                                '1h': '最近1小时', '6h': '最近6小时', '12h': '最近12小时',
                                '24h': '最近24小时', '48h': '最近48小时', '72h': '最近72小时',
                                '168h': '最近7天', '720h': '最近30天', 'daily': '自然日', 'today': '自然日'
                            };
                            return periodMap[rule.period] || rule.period;
                        };
                        return (
                            <div key={alert.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex justify-between items-center">
                                <div className="flex items-start gap-4">
                                    <div className={`p-3 rounded-lg ${alert.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                                        <Bell size={24} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className={`font-semibold text-lg ${!alert.enabled && 'text-gray-400'}`}>{alert.name}</h3>
                                            {alert.trigger_action === 'disable' && (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium flex items-center gap-1">
                                                    <Zap size={10} /> 熔断开启
                                                </span>
                                            )}
                                            {!alert.enabled && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">已禁用</span>
                                            )}
                                        </div>
                                        <div className="text-gray-500 mt-1 flex flex-wrap items-center gap-2 text-sm">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded">
                                                {rule.type === 'channel' ? '渠道' : '模型'}: {rule.target}
                                            </span>
                                            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded">阈值: {rule.threshold.toLocaleString()}</span>
                                            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">周期: {getPeriodDisplay()}</span>
                                            <span className="bg-gray-50 px-2 py-0.5 rounded">生效时段: {alert.start_time}-{alert.end_time}</span>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            {alert.notify_telegram === 1 && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Telegram</span>}
                                            {alert.notify_feishu === 1 && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">Feishu</span>}
                                            {alert.notify_wecom === 1 && <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">WeCom</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => handleToggle(alert)}
                                        className={`p-2 rounded-lg transition-colors ${alert.enabled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                        title={alert.enabled ? "点击禁用" : "点击启用"}
                                    >
                                        {alert.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                    </button>
                                    <button
                                        onClick={() => handleEdit(alert)}
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="编辑"
                                    >
                                        <Edit size={20} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(alert.id)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="删除"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Alerts;
