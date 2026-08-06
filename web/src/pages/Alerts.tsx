import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
    AlertCircle,
    Bell,
    Check,
    History,
    Pencil,
    Plus,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Zap,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import KpiStrip from '../components/KpiStrip';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
    useAlertHistory,
    useAlerts,
    useAlertTypes,
    useCreateAlert,
    useDeleteAlert,
    useToggleAlert,
    useUpdateAlert,
} from '../api/hooks';
import type { Alert, AlertHistory, AlertInput } from '../api/client';
import { formatNumber } from '../lib/format';
import { formatEpochSeconds } from '../lib/time';
import { cn } from '../lib/cn';
import type { StatCardProps } from '../components/StatCard';

// ==================== Alert type / rule metadata ====================

const ALERT_TYPE_LABELS: Record<string, string> = {
    token_usage: 'Token 用量',
    error_rate: '错误率',
    latency: '延迟',
    channel_down: '渠道宕机',
    quota_low: 'Token 额度不足',
    request_spike: '请求量突增',
};

const FALLBACK_ALERT_TYPES = [
    'token_usage',
    'error_rate',
    'latency',
    'channel_down',
    'quota_low',
    'request_spike',
];

const PERIOD_OPTIONS: { value: string; label: string }[] = [
    { value: '1', label: '最近 1 小时' },
    { value: '6', label: '最近 6 小时' },
    { value: '24', label: '最近 24 小时' },
    { value: 'today', label: '自然日' },
];

const PERIOD_LABELS: Record<string, string> = Object.fromEntries(
    PERIOD_OPTIONS.map((o) => [o.value, o.label]),
);

const ACTION_TAKEN_META: Record<string, { label: string; className: string }> = {
    notify: { label: '通知', className: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
    disable_channel: { label: '熔断禁用', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    disable_failed: { label: '熔断失败', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
};

const HISTORY_WINDOW_OPTIONS: { value: 'all' | '1h' | '24h' | '7d' | '30d'; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: '1h', label: '最近 1 小时' },
    { value: '24h', label: '最近 24 小时' },
    { value: '7d', label: '最近 7 天' },
    { value: '30d', label: '最近 30 天' },
];

const HISTORY_WINDOW_SECONDS: Record<string, number> = {
    '1h': 3600,
    '24h': 86400,
    '7d': 604800,
    '30d': 2592000,
};

function needsTarget(alertType: string): boolean {
    return ['token_usage', 'error_rate', 'latency', 'request_spike'].includes(alertType);
}

function needsThreshold(alertType: string): boolean {
    return alertType !== 'channel_down';
}

function needsPeriod(alertType: string): boolean {
    return needsTarget(alertType);
}

function thresholdLabel(alertType: string): string {
    switch (alertType) {
        case 'token_usage':
            return 'Token 阈值';
        case 'error_rate':
            return '错误率阈值 (%)';
        case 'latency':
            return '延迟阈值 (ms)';
        case 'quota_low':
            return '剩余额度阈值';
        case 'request_spike':
            return '增长阈值 (%)';
        default:
            return '阈值';
    }
}

function parseRule(rule: string): Record<string, unknown> {
    if (!rule) return {};
    try {
        const parsed = JSON.parse(rule);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

function describeRule(ruleStr: string): string {
    const rule = parseRule(ruleStr);
    const alertType = typeof rule.alertType === 'string' ? rule.alertType : '';
    const parts: string[] = [ALERT_TYPE_LABELS[alertType] ?? alertType ?? '-'];
    const targetType = typeof rule.type === 'string' ? rule.type : '';
    if (targetType === 'channel') parts.push(`渠道 ${String(rule.target ?? '')}`);
    else if (targetType === 'model') parts.push(`模型 ${String(rule.target ?? '')}`);
    if (alertType !== 'channel_down' && rule.threshold !== undefined) {
        parts.push(`> ${rule.threshold}`);
    }
    if (needsPeriod(alertType)) {
        const period = typeof rule.period === 'string' ? rule.period : '';
        if (period) parts.push(PERIOD_LABELS[period] ?? period);
    }
    return parts.join(' · ');
}

/** `alerts.last_triggered` is stored in milliseconds (Date.now()). */
function formatLastTriggered(ms: number): string {
    if (!ms) return '未触发';
    return new Date(ms).toLocaleString('zh-CN');
}

// ==================== Form ====================

interface AlertFormData {
    name: string;
    alertType: string;
    targetType: string;
    target: string;
    threshold: string;
    period: string;
    trigger_action: string;
    notify_telegram: boolean;
    start_time: string;
    end_time: string;
    enabled: boolean;
}

const DEFAULT_FORM: AlertFormData = {
    name: '',
    alertType: 'token_usage',
    targetType: 'global',
    target: '',
    threshold: '1000',
    period: '24',
    trigger_action: 'notify',
    notify_telegram: true,
    start_time: '',
    end_time: '',
    enabled: true,
};

function buildRule(form: AlertFormData): unknown {
    const rule: Record<string, unknown> = { alertType: form.alertType };
    if (needsTarget(form.alertType)) {
        rule.type = form.targetType;
        if (form.targetType !== 'global') rule.target = form.target;
    }
    if (needsThreshold(form.alertType)) {
        rule.threshold = Number(form.threshold) || 0;
    }
    if (needsPeriod(form.alertType)) {
        rule.period = form.period;
    }
    return rule;
}

const CheckToggle = ({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
}) => (
    <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
            checked
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-input bg-background text-muted-foreground',
        )}
    >
        <span
            className={cn(
                'flex h-4 w-4 items-center justify-center rounded-sm border',
                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
            )}
        >
            {checked ? <Check className="h-3 w-3" /> : null}
        </span>
        {label}
    </button>
);

const AlertFormDialog = ({
    open,
    onOpenChange,
    editing,
    alertTypes,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editing: Alert | null;
    alertTypes: Record<string, string>;
}) => {
    const createAlert = useCreateAlert();
    const updateAlert = useUpdateAlert();
    const [form, setForm] = useState<AlertFormData>(DEFAULT_FORM);
    const [error, setError] = useState<string | null>(null);

    const typeValues =
        alertTypes && Object.keys(alertTypes).length ? Object.values(alertTypes) : FALLBACK_ALERT_TYPES;
    const typeOptions = typeValues.map((v) => ({ value: v, label: ALERT_TYPE_LABELS[v] ?? v }));

    // Reset the form when the dialog opens or the editing target changes.
    useEffect(() => {
        if (!open) return;
        setError(null);
        if (editing) {
            const rule = parseRule(editing.rule);
            setForm({
                name: editing.name,
                alertType: typeof rule.alertType === 'string' ? rule.alertType : 'token_usage',
                targetType: typeof rule.type === 'string' ? rule.type : 'global',
                target: rule.target !== undefined ? String(rule.target) : '',
                threshold: rule.threshold !== undefined ? String(rule.threshold) : '1000',
                period: typeof rule.period === 'string' ? rule.period : '24',
                trigger_action: editing.trigger_action || 'notify',
                notify_telegram: Boolean(editing.notify_telegram),
                start_time: editing.start_time ?? '',
                end_time: editing.end_time ?? '',
                enabled: Boolean(editing.enabled),
            });
        } else {
            setForm(DEFAULT_FORM);
        }
    }, [open, editing]);

    const setField = <K extends keyof AlertFormData>(key: K, value: AlertFormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError('请输入告警名称');
            return;
        }
        const payload: AlertInput = {
            name: form.name.trim(),
            rule: buildRule(form),
            enabled: form.enabled,
            start_time: form.start_time || null,
            end_time: form.end_time || null,
            notify_telegram: form.notify_telegram,
            trigger_action: form.trigger_action,
        };
        try {
            if (editing) {
                await updateAlert.mutateAsync({ id: editing.id, data: payload });
            } else {
                await createAlert.mutateAsync(payload);
            }
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : '保存失败');
        }
    };

    const saving = createAlert.isPending || updateAlert.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editing ? '编辑告警' : '新建告警'}</DialogTitle>
                    <DialogDescription>
                        {editing ? `修改规则 #${editing.id}` : '配置告警规则与触发动作'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="alert-name">告警名称</Label>
                        <Input
                            id="alert-name"
                            value={form.name}
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="如：渠道错误率告警"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>告警类型</Label>
                            <Select value={form.alertType} onValueChange={(v) => setField('alertType', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {typeOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {needsTarget(form.alertType) ? (
                            <div className="space-y-1.5">
                                <Label>目标范围</Label>
                                <Select
                                    value={form.targetType}
                                    onValueChange={(v) => setField('targetType', v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="global">全局</SelectItem>
                                        <SelectItem value="channel">指定渠道</SelectItem>
                                        <SelectItem value="model">指定模型</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </div>

                    {needsTarget(form.alertType) && form.targetType !== 'global' ? (
                        <div className="space-y-1.5">
                            <Label>{form.targetType === 'channel' ? '渠道 ID' : '模型名称'}</Label>
                            <Input
                                value={form.target}
                                onChange={(e) => setField('target', e.target.value)}
                                placeholder={form.targetType === 'channel' ? '渠道 ID' : '模型名称'}
                            />
                        </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                        {needsThreshold(form.alertType) ? (
                            <div className="space-y-1.5">
                                <Label>{thresholdLabel(form.alertType)}</Label>
                                <Input
                                    type="number"
                                    value={form.threshold}
                                    onChange={(e) => setField('threshold', e.target.value)}
                                />
                            </div>
                        ) : null}
                        {needsPeriod(form.alertType) ? (
                            <div className="space-y-1.5">
                                <Label>统计周期</Label>
                                <Select value={form.period} onValueChange={(v) => setField('period', v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PERIOD_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-1.5">
                        <Label>触发动作</Label>
                        <Select
                            value={form.trigger_action}
                            onValueChange={(v) => setField('trigger_action', v)}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="notify">仅通知</SelectItem>
                                <SelectItem value="disable">熔断禁用渠道</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>生效开始 (可选)</Label>
                            <Input
                                type="time"
                                value={form.start_time}
                                onChange={(e) => setField('start_time', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>生效结束 (可选)</Label>
                            <Input
                                type="time"
                                value={form.end_time}
                                onChange={(e) => setField('end_time', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <CheckToggle
                            checked={form.notify_telegram}
                            onChange={(v) => setField('notify_telegram', v)}
                            label="Telegram 通知"
                        />
                        <CheckToggle
                            checked={form.enabled}
                            onChange={(v) => setField('enabled', v)}
                            label="启用规则"
                        />
                    </div>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            取消
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? '保存中...' : '保存'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

// ==================== Alerts page ====================

const EnabledToggle = ({ enabled, onClick }: { enabled: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors',
            enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground',
        )}
    >
        {enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
        {enabled ? '启用' : '已停用'}
    </button>
);

const Alerts = () => {
    const alertsQuery = useAlerts();
    const alertTypesQuery = useAlertTypes();
    const toggleAlert = useToggleAlert();
    const deleteAlert = useDeleteAlert();

    const [historyWindow, setHistoryWindow] = useState<'all' | '1h' | '24h' | '7d' | '30d'>('all');
    const [historyLimit, setHistoryLimit] = useState(100);
    const historyQuery = useAlertHistory(historyLimit, null);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Alert | null>(null);

    const alerts = alertsQuery.data ?? [];
    const alertTypes = alertTypesQuery.data ?? {};

    const filteredHistory = useMemo(() => {
        const list = historyQuery.data ?? [];
        if (historyWindow === 'all') return list;
        const cutoff = Math.floor(Date.now() / 1000) - HISTORY_WINDOW_SECONDS[historyWindow];
        return list.filter((h) => h.triggered_at >= cutoff);
    }, [historyQuery.data, historyWindow]);

    const summary = useMemo(() => {
        const list = alertsQuery.data ?? [];
        return {
            total: list.length,
            enabled: list.filter((a) => a.enabled).length,
            circuitBreakers: list.filter((a) => a.trigger_action === 'disable').length,
            triggers: list.reduce((acc, a) => acc + (a.trigger_count || 0), 0),
        };
    }, [alertsQuery.data]);

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (alert: Alert) => {
        setEditing(alert);
        setFormOpen(true);
    };

    const handleToggle = async (alert: Alert) => {
        try {
            await toggleAlert.mutateAsync({ id: alert.id, enabled: !alert.enabled });
        } catch {
            /* invalidation surfaces errors via the query */
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('确定删除该告警规则？')) return;
        try {
            await deleteAlert.mutateAsync(id);
        } catch {
            /* ignore */
        }
    };

    const ruleColumns: ColumnDef<Alert>[] = [
        {
            accessorKey: 'name',
            header: '名称',
            cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        },
        {
            id: 'rule',
            header: '规则',
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground">{describeRule(row.original.rule)}</span>
            ),
        },
        {
            accessorKey: 'enabled',
            header: '状态',
            cell: ({ row }) => (
                <EnabledToggle
                    enabled={Boolean(row.original.enabled)}
                    onClick={() => handleToggle(row.original)}
                />
            ),
        },
        {
            accessorKey: 'trigger_action',
            header: '动作',
            cell: ({ row }) =>
                row.original.trigger_action === 'disable' ? (
                    <Badge className="border-transparent bg-red-500/15 text-red-400">熔断</Badge>
                ) : (
                    <Badge variant="secondary">通知</Badge>
                ),
        },
        {
            accessorKey: 'last_triggered',
            header: '最近触发',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatLastTriggered(row.original.last_triggered)}
                </span>
            ),
        },
        {
            accessorKey: 'trigger_count',
            header: '触发次数',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">{formatNumber(row.original.trigger_count, 0)}</span>
            ),
        },
        {
            id: 'actions',
            header: '操作',
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(row.original)}
                        aria-label="编辑"
                    >
                        <Pencil />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-red-400 hover:text-red-500"
                        onClick={() => handleDelete(row.original.id)}
                        aria-label="删除"
                    >
                        <Trash2 />
                    </Button>
                </div>
            ),
        },
    ];

    const historyColumns: ColumnDef<AlertHistory>[] = [
        {
            accessorKey: 'triggered_at',
            header: '触发时间',
            cell: ({ row }) => (
                <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {formatEpochSeconds(row.original.triggered_at)}
                </span>
            ),
        },
        {
            accessorKey: 'alert_name',
            header: '告警',
            cell: ({ row }) => (
                <span className="font-medium">{row.original.alert_name || '-'}</span>
            ),
        },
        {
            accessorKey: 'value',
            header: '当前值',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">{formatNumber(row.original.value, 2)}</span>
            ),
        },
        {
            accessorKey: 'threshold',
            header: '阈值',
            cell: ({ row }) => (
                <span className="font-mono text-xs tabular-nums">{formatNumber(row.original.threshold, 2)}</span>
            ),
        },
        {
            accessorKey: 'message',
            header: '详情',
            cell: ({ row }) => (
                <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={row.original.message ?? ''}>
                    {row.original.message || '-'}
                </span>
            ),
        },
        {
            accessorKey: 'action_taken',
            header: '动作',
            cell: ({ row }) => {
                const action = row.original.action_taken;
                const meta = action ? ACTION_TAKEN_META[action] : null;
                return meta ? (
                    <Badge className={cn('border-transparent', meta.className)}>{meta.label}</Badge>
                ) : (
                    <span className="text-xs text-muted-foreground">{action || '-'}</span>
                );
            },
        },
    ];

    const kpiItems: StatCardProps[] = [
        { label: '规则总数', value: formatNumber(summary.total, 0), icon: Bell, loading: alertsQuery.isLoading },
        { label: '启用中', value: formatNumber(summary.enabled, 0), icon: ToggleRight, loading: alertsQuery.isLoading },
        { label: '熔断规则', value: formatNumber(summary.circuitBreakers, 0), icon: Zap, loading: alertsQuery.isLoading },
        { label: '累计触发', value: formatNumber(summary.triggers, 0), icon: History, loading: alertsQuery.isLoading },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="告警配置"
                description="管理告警规则、熔断策略与触发历史"
                icon={Bell}
            />

            <KpiStrip items={kpiItems} />

            <Tabs defaultValue="rules">
                <TabsList>
                    <TabsTrigger value="rules">告警规则</TabsTrigger>
                    <TabsTrigger value="history">触发历史</TabsTrigger>
                </TabsList>

                <TabsContent value="rules">
                    <Card>
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                            <CardTitle>规则列表</CardTitle>
                            <Button size="sm" onClick={openCreate}>
                                <Plus />
                                新建告警
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {alertsQuery.isError ? (
                                <EmptyState icon={AlertCircle} title="加载失败" description="告警规则获取失败" />
                            ) : (
                                <DataTable
                                    columns={ruleColumns}
                                    data={alerts}
                                    loading={alertsQuery.isLoading}
                                    emptyTitle="暂无告警规则"
                                    emptyDescription="点击右上角「新建告警」创建第一条规则"
                                    skeletonRows={4}
                                    renderMobileCard={(a) => (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{a.name}</span>
                                                <EnabledToggle
                                                    enabled={Boolean(a.enabled)}
                                                    onClick={() => handleToggle(a)}
                                                />
                                            </div>
                                            <div className="text-xs text-muted-foreground">{describeRule(a.rule)}</div>
                                            <div className="text-xs text-muted-foreground">
                                                触发 {formatNumber(a.trigger_count, 0)} 次 · {formatLastTriggered(a.last_triggered)}
                                            </div>
                                            <div className="flex items-center gap-1 pt-1">
                                                <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                                                    <Pencil />
                                                    编辑
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-red-400 hover:text-red-500"
                                                    onClick={() => handleDelete(a.id)}
                                                >
                                                    <Trash2 />
                                                    删除
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader className="flex-row items-center justify-between space-y-0">
                            <CardTitle>触发历史</CardTitle>
                            <div className="flex items-center gap-2">
                                <Select value={historyWindow} onValueChange={(v) => setHistoryWindow(v as typeof historyWindow)}>
                                    <SelectTrigger className="h-9 w-36">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {HISTORY_WINDOW_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={String(historyLimit)}
                                    onValueChange={(v) => setHistoryLimit(Number(v))}
                                >
                                    <SelectTrigger className="h-9 w-28">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="50">50 条</SelectItem>
                                        <SelectItem value="100">100 条</SelectItem>
                                        <SelectItem value="200">200 条</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {historyQuery.isError ? (
                                <EmptyState icon={AlertCircle} title="加载失败" description="触发历史获取失败" />
                            ) : (
                                <DataTable
                                    columns={historyColumns}
                                    data={filteredHistory}
                                    loading={historyQuery.isLoading}
                                    emptyTitle="暂无触发记录"
                                    skeletonRows={6}
                                    renderMobileCard={(h) => (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{h.alert_name || '-'}</span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {formatEpochSeconds(h.triggered_at)}
                                                </span>
                                            </div>
                                            <div className="font-mono text-xs tabular-nums text-muted-foreground">
                                                值 {formatNumber(h.value, 2)} / 阈值 {formatNumber(h.threshold, 2)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{h.message || '-'}</div>
                                        </div>
                                    )}
                                />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <AlertFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                editing={editing}
                alertTypes={alertTypes}
            />
        </div>
    );
};

export default Alerts;
