import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAlerts, createAlert, deleteAlert, updateAlert, toggleAlert } from './api';
import { Trash2, Plus, Bell, Zap, Edit, ToggleLeft, ToggleRight } from 'lucide-react';
import CustomDateTimePicker from './components/CustomDateTimePicker';
import { EmptyState, LoadingState, PageHeader, PanelCard, StatCard } from './components/PageUI';

const DEFAULT_FORM_DATA = {
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
    trigger_action: 'notify'
};

const PERIOD_LABELS = {
    '1h': '最近 1 小时',
    '6h': '最近 6 小时',
    '12h': '最近 12 小时',
    '24h': '最近 24 小时',
    '48h': '最近 48 小时',
    '72h': '最近 72 小时',
    '168h': '最近 7 天',
    '720h': '最近 30 天',
    daily: '自然日',
    today: '自然日'
};

const formatCustomRange = (startTs, endTs) => {
    const format = (ts, fallback) => (
        ts
            ? new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
            : fallback
    );

    return `${format(startTs, '起始')} → ${format(endTs, '当前')}`;
};

const getPeriodDisplay = (rule) => {
    if (rule.period === 'custom') {
        return formatCustomRange(rule.customStartTs, rule.customEndTs);
    }
    return PERIOD_LABELS[rule.period] || rule.period || '未设置';
};

const parseRule = (value) => {
    if (!value) {
        return {};
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        console.error('Failed to parse alert rule:', error);
        return {};
    }
};

const ensureAlertMutationSucceeded = (result, { allowId = false, fallbackMessage }) => {
    if (!result || typeof result !== 'object') {
        throw new Error(fallbackMessage);
    }

    if (result.error) {
        throw new Error(result.error);
    }

    if (result.success === true || (allowId && Number.isInteger(result.id))) {
        return result;
    }

    throw new Error(fallbackMessage);
};

const Alerts = () => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
    const hasLoadedRef = useRef(false);

    const normalizedAlerts = useMemo(() => alerts.map((alert) => {
        const rule = parseRule(alert.rule);
        return {
            ...alert,
            rule,
            isEnabled: Boolean(alert.enabled),
            telegramEnabled: Boolean(alert.notify_telegram),
        };
    }), [alerts]);

    const summary = useMemo(() => ({
        total: normalizedAlerts.length,
        enabled: normalizedAlerts.filter((alert) => alert.isEnabled).length,
        circuitBreakers: normalizedAlerts.filter((alert) => alert.trigger_action === 'disable').length,
        telegram: normalizedAlerts.filter((alert) => alert.telegramEnabled).length,
    }), [normalizedAlerts]);

    const resetForm = useCallback(() => {
        setFormData(DEFAULT_FORM_DATA);
    }, []);

    const closeForm = useCallback(() => {
        setShowForm(false);
        setEditingId(null);
        resetForm();
    }, [resetForm]);

    const loadAlerts = useCallback(async ({ silent = false } = {}) => {
        if (silent && hasLoadedRef.current) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            const data = await fetchAlerts();
            if (!Array.isArray(data)) {
                throw new Error(data?.error || 'Failed to load alerts');
            }

            setAlerts(data);
            hasLoadedRef.current = true;
            return true;
        } catch (error) {
            console.error('Failed to load alerts:', error);
            return false;
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadAlerts();
    }, [loadAlerts]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const rule = {
                type: formData.type,
                target: formData.target,
                threshold: Number.parseInt(formData.threshold, 10),
                period: formData.period,
            };

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
                trigger_action: formData.trigger_action,
            };

            if (editingId) {
                ensureAlertMutationSucceeded(await updateAlert(editingId, payload), {
                    fallbackMessage: 'Failed to update alert'
                });
            } else {
                ensureAlertMutationSucceeded(await createAlert(payload), {
                    allowId: true,
                    fallbackMessage: 'Failed to create alert'
                });
            }

            closeForm();
            const refreshed = await loadAlerts({ silent: true });
            if (!refreshed) {
                window.alert('Alert saved, but refreshing the latest rule list failed. Please refresh again.');
            }
        } catch (error) {
            window.alert('Failed to save alert');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure?')) {
            return;
        }

        try {
            ensureAlertMutationSucceeded(await deleteAlert(id), {
                fallbackMessage: 'Failed to delete alert'
            });

            const refreshed = await loadAlerts({ silent: true });
            if (!refreshed) {
                window.alert('Alert deleted, but refreshing the latest rule list failed. Please refresh again.');
            }
        } catch (error) {
            window.alert(error.message || 'Failed to delete alert');
        }
    };

    const handleEdit = (alert) => {
        const rule = parseRule(alert.rule);
        setFormData({
            name: alert.name,
            type: rule.type || 'channel',
            target: rule.target || '',
            threshold: rule.threshold ?? 1000,
            period: rule.period || 'daily',
            customStartTime: rule.customStartTs ? new Date(rule.customStartTs * 1000).toISOString().slice(0, 16) : '',
            customEndTime: rule.customEndTs ? new Date(rule.customEndTs * 1000).toISOString().slice(0, 16) : '',
            start_time: alert.start_time || '00:00',
            end_time: alert.end_time || '23:59',
            notify_telegram: Boolean(alert.notify_telegram),
            trigger_action: alert.trigger_action || 'notify'
        });
        setEditingId(alert.id);
        setShowForm(true);
    };

    const handleToggle = async (alert) => {
        try {
            ensureAlertMutationSucceeded(await toggleAlert(alert.id, !alert.isEnabled), {
                fallbackMessage: 'Failed to update alert status'
            });

            const refreshed = await loadAlerts({ silent: true });
            if (!refreshed) {
                window.alert('Alert status updated, but refreshing the latest rule list failed. Please refresh again.');
            }
        } catch (error) {
            console.error('Toggle failed', error);
            window.alert(error.message || 'Failed to update alert status');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Bell}
                iconClassName="from-indigo-500 to-violet-600"
                title="告警配置"
                description="管理 Token 使用量告警规则与熔断策略"
                actions={(
                    <button
                        type="button"
                        onClick={() => { setShowForm(true); setEditingId(null); resetForm(); }}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
                    >
                        <Plus size={18} />
                        新建告警
                    </button>
                )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    icon={Bell}
                    iconWrapperClassName="bg-indigo-100"
                    iconClassName="text-indigo-600"
                    value={summary.total}
                    label="告警规则数"
                    valueClassName="text-indigo-600"
                />
                <StatCard
                    icon={ToggleRight}
                    iconWrapperClassName="bg-emerald-100"
                    iconClassName="text-emerald-600"
                    value={summary.enabled}
                    label="启用中"
                    valueClassName="text-emerald-600"
                />
                <StatCard
                    icon={Zap}
                    iconWrapperClassName="bg-red-100"
                    iconClassName="text-red-600"
                    value={summary.circuitBreakers}
                    label="熔断规则"
                    valueClassName="text-red-600"
                />
                <StatCard
                    icon={Bell}
                    iconWrapperClassName="bg-blue-100"
                    iconClassName="text-blue-600"
                    value={summary.telegram}
                    label="Telegram 通知"
                    valueClassName="text-blue-600"
                />
            </div>

            <PanelCard
                title="规则列表"
                description="查看当前生效范围、统计周期、通知方式与熔断状态"
                bodyClassName="p-4 md:p-6"
            >
                {refreshing ? (
                    <div className="mb-4 flex items-center justify-end text-sm text-slate-500">
                        <span>正在刷新规则...</span>
                    </div>
                ) : null}
                {loading ? (
                    <LoadingState label="加载告警规则中..." className="h-48" />
                ) : normalizedAlerts.length === 0 ? (
                    <EmptyState icon={Bell} title="暂无告警规则" description="创建第一条规则后，这里会显示告警策略与熔断配置。" />
                ) : (
                    <div className="space-y-4">
                        {normalizedAlerts.map((alert) => (
                            <div key={alert.id} className="rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className={`rounded-xl p-3 ${alert.isEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <Bell size={22} />
                                        </div>
                                        <div className="min-w-0 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className={`text-lg font-semibold ${alert.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                                    {alert.name}
                                                </h3>
                                                {alert.trigger_action === 'disable' ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                                                        <Zap size={12} />
                                                        熔断开启
                                                    </span>
                                                ) : null}
                                                {!alert.isEnabled ? (
                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                                                        已禁用
                                                    </span>
                                                ) : null}
                                                {alert.telegramEnabled ? (
                                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                                        Telegram 通知
                                                    </span>
                                                ) : null}
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-sm">
                                                <span className="rounded-lg bg-slate-100 px-3 py-1 text-slate-700">
                                                    {alert.rule.type === 'channel' ? '渠道' : '模型'}：{alert.rule.target || '-'}
                                                </span>
                                                <span className="rounded-lg bg-amber-50 px-3 py-1 text-amber-700">
                                                    阈值：{Number(alert.rule.threshold || 0).toLocaleString()}
                                                </span>
                                                <span className="rounded-lg bg-indigo-50 px-3 py-1 text-indigo-700">
                                                    周期：{getPeriodDisplay(alert.rule)}
                                                </span>
                                                <span className="rounded-lg bg-slate-50 px-3 py-1 text-slate-600">
                                                    生效时段：{alert.start_time || '00:00'} - {alert.end_time || '23:59'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end xl:self-auto">
                                        <button
                                            type="button"
                                            onClick={() => handleToggle(alert)}
                                            className={`rounded-lg p-2 transition ${alert.isEnabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                                            title={alert.isEnabled ? '点击禁用' : '点击启用'}
                                            aria-label={alert.isEnabled ? '禁用规则' : '启用规则'}
                                        >
                                            {alert.isEnabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(alert)}
                                            className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                                            title="编辑"
                                            aria-label="编辑规则"
                                        >
                                            <Edit size={20} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(alert.id)}
                                            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                            title="删除"
                                            aria-label="删除规则"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </PanelCard>

            {showForm ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={editingId ? '编辑告警规则' : '新建告警规则'}
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="border-b bg-slate-50 px-6 py-4">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingId ? '编辑告警规则' : '新建告警规则'}
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                配置监控对象、统计周期、通知方式与熔断动作。
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6 p-6">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">规则名称</label>
                                <input
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                    value={formData.name}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                    placeholder="例如：OpenAI 渠道日限额"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">监控对象类型</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.type}
                                        onChange={(event) => setFormData({ ...formData, type: event.target.value })}
                                    >
                                        <option value="channel">渠道 (Channel ID)</option>
                                        <option value="model">模型 (Model Name)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">对象标识</label>
                                    <input
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.target}
                                        onChange={(event) => setFormData({ ...formData, target: event.target.value })}
                                        placeholder={formData.type === 'channel' ? '例如: 1' : '例如: gpt-4'}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">统计周期</label>
                                    <select
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.period}
                                        onChange={(event) => setFormData({ ...formData, period: event.target.value })}
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
                                    <label className="mb-1 block text-sm font-medium text-slate-700">阈值 (Tokens)</label>
                                    <input
                                        type="number"
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.threshold}
                                        onChange={(event) => setFormData({ ...formData, threshold: event.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {formData.period === 'custom' ? (
                                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                                    <label className="mb-3 block text-sm font-medium text-indigo-700">自定义统计时间范围</label>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <label className="mb-1 block text-xs text-slate-500">开始时间</label>
                                            <CustomDateTimePicker
                                                label="选择开始时间"
                                                value={formData.customStartTime}
                                                onChange={(value) => setFormData({ ...formData, customStartTime: value })}
                                                showCalendarIcon
                                                triggerClassName="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-white"
                                                inputAccentClassName="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                                buttonGradientClassName="from-indigo-500 to-indigo-600 hover:shadow-indigo-500/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs text-slate-500">结束时间 (留空表示到当前)</label>
                                            <CustomDateTimePicker
                                                label="选择结束时间"
                                                value={formData.customEndTime}
                                                onChange={(value) => setFormData({ ...formData, customEndTime: value })}
                                                showCalendarIcon
                                                triggerClassName="rounded-lg border border-slate-300 bg-white px-3 py-2 hover:bg-white"
                                                inputAccentClassName="focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                                buttonGradientClassName="from-indigo-500 to-indigo-600 hover:shadow-indigo-500/20"
                                            />
                                        </div>
                                    </div>
                                    <p className="mt-2 text-xs text-indigo-600">
                                        提示：自定义时间范围适合统计历史固定时段的 Token 总量。
                                    </p>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">生效开始时间</label>
                                    <input
                                        type="time"
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.start_time}
                                        onChange={(event) => setFormData({ ...formData, start_time: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-slate-700">生效结束时间</label>
                                    <input
                                        type="time"
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                        value={formData.end_time}
                                        onChange={(event) => setFormData({ ...formData, end_time: event.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={formData.notify_telegram}
                                        onChange={(event) => setFormData({ ...formData, notify_telegram: event.target.checked })}
                                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    启用 Telegram 通知
                                </label>
                            </div>

                            <div>
                                <label className="mb-1 block text-sm font-medium text-slate-700">触发动作</label>
                                <select
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                    value={formData.trigger_action}
                                    onChange={(event) => setFormData({ ...formData, trigger_action: event.target.value })}
                                >
                                    <option value="notify">仅通知 (Notify Only)</option>
                                    <option value="disable">通知并禁用渠道 (Circuit Breaker)</option>
                                </select>
                                <p className="mt-1 text-xs text-slate-500">
                                    {formData.trigger_action === 'disable'
                                        ? '警告：触发后将自动调用 New API 禁用该渠道，仅对“渠道”类型规则生效。'
                                        : '仅发送通知，不会影响渠道状态。'}
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 border-t pt-4">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="rounded-lg px-4 py-2 text-slate-600 transition hover:bg-slate-100"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="rounded-lg bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
                                >
                                    保存规则
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default Alerts;
