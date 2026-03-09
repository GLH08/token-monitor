import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

export const TIME_RANGE_PRESETS = {
    short: [
        { value: '1h', label: '1 小时' },
        { value: '6h', label: '6 小时' },
        { value: '24h', label: '24 小时' },
        { value: '7d', label: '7 天' },
    ],
    dashboard: [
        { value: '1h', label: '1 小时' },
        { value: '6h', label: '6 小时' },
        { value: '12h', label: '12 小时' },
        { value: '24h', label: '24 小时' },
        { value: '7d', label: '7 天' },
        { value: '30d', label: '30 天' },
    ],
    hourly: [
        { value: 1, label: '1H' },
        { value: 6, label: '6H' },
        { value: 24, label: '24H' },
        { value: 72, label: '72H' },
    ],
};

export const MODEL_ANALYSIS_TIME_RANGE_OPTIONS = TIME_RANGE_PRESETS.short;

export const MODEL_ANALYSIS_WINDOW_TO_SECONDS = {
    '1h': 3600,
    '6h': 21600,
    '24h': 86400,
    '7d': 604800,
};

export const MODEL_STATUS_TIME_RANGE_OPTIONS = [
    { value: '1h', label: '1 小时', slots: 12 },
    { value: '6h', label: '6 小时', slots: 24 },
    { value: '12h', label: '12 小时', slots: 24 },
    { value: '24h', label: '24 小时', slots: 24 },
];

export const getSupportedWindow = (options, value, fallback = '24h') => (
    options.some((option) => option.value === value) ? value : fallback
);

export const updateUrlSearchParams = (setSearchParams, updates, { replace = true } = {}) => {
    setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        Object.entries(updates).forEach(([key, value]) => {
            if (!value || (key === 'window' && value === '24h')) {
                nextParams.delete(key);
                return;
            }
            nextParams.set(key, value);
        });

        return nextParams.toString() === currentParams.toString() ? currentParams : nextParams;
    }, { replace });
};

export const buildPathWithQuery = (path, paramsObject = {}) => {
    const params = new URLSearchParams();
    Object.entries(paramsObject).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, value);
        }
    });
    const query = params.toString();
    return query ? `${path}?${query}` : path;
};

export const mapAnalysisWindowToStatusWindow = (value) => getSupportedWindow(MODEL_STATUS_TIME_RANGE_OPTIONS, value, '24h');

export const mapStatusWindowToAnalysisWindow = (value) => getSupportedWindow(MODEL_ANALYSIS_TIME_RANGE_OPTIONS, value, '24h');


export const PageHeader = ({ icon: Icon, iconClassName = 'from-cyan-500 to-blue-600', title, description, actions }) => (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
            {Icon ? (
                <div className={`w-10 h-10 bg-gradient-to-br ${iconClassName} rounded-xl flex items-center justify-center text-white shadow-sm`}>
                    <Icon size={22} />
                </div>
            ) : null}
            <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
                {description ? <p className="text-sm text-slate-500 mt-1">{description}</p> : null}
            </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
);

export const TimeRangeTabs = ({ value, onChange, options, activeClassName = 'bg-cyan-500 text-white', containerClassName = 'bg-white border border-slate-200 shadow-sm' }) => (
    <div className={`flex flex-wrap gap-2 rounded-xl p-1.5 ${containerClassName}`}>
        {options.map((option) => (
            <button
                key={String(option.value)}
                onClick={() => onChange(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${value === option.value
                    ? activeClassName
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
            >
                {option.label}
            </button>
        ))}
    </div>
);

export const StatCard = ({ icon: Icon, iconWrapperClassName = 'bg-slate-100', iconClassName = 'text-slate-600', value, label, valueClassName = 'text-slate-800', cardClassName = '' }) => (
    <div className={`bg-white p-5 rounded-xl border shadow-sm ${cardClassName}`}>
        <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${iconWrapperClassName}`}>
                {Icon ? <Icon className={iconClassName} size={24} /> : null}
            </div>
            <div>
                <div className={`text-3xl font-bold ${valueClassName}`}>{value}</div>
                <div className="text-slate-500 text-sm">{label}</div>
            </div>
        </div>
    </div>
);

export const PanelCard = ({ title, description, children, className = '', bodyClassName = '' }) => (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${className}`}>
        {(title || description) ? (
            <div className="p-4 border-b bg-slate-50">
                {title ? <h2 className="text-lg font-bold text-slate-800">{title}</h2> : null}
                {description ? <p className="text-sm text-slate-500 mt-1">{description}</p> : null}
            </div>
        ) : null}
        <div className={bodyClassName}>{children}</div>
    </div>
);

export const FilterBar = ({ icon: Icon, children, action, className = '', contentClassName = 'flex flex-wrap gap-3' }) => (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${className}`.trim()}>
        <div className="flex flex-wrap items-center gap-4">
            {Icon ? <Icon size={18} className="text-slate-400" /> : null}
            <div className={`flex-1 ${contentClassName}`.trim()}>{children}</div>
            {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
    </div>
);

export const PaginationBar = ({
    page,
    totalPages,
    onPrevious,
    onNext,
    summary,
    className = 'bg-slate-50',
    pageClassName = 'text-slate-500',
    buttonClassName = 'px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white transition',
    showControls = true
}) => {
    const safeTotalPages = Math.max(1, totalPages || 1);

    return (
        <div className={`p-4 border-t flex justify-between items-center gap-4 ${className}`.trim()}>
            <span className={`text-sm ${pageClassName}`.trim()}>{summary}</span>
            {showControls ? (
                <div className="flex gap-2">
                    <button onClick={onPrevious} disabled={page <= 1} className={buttonClassName}>
                        <ChevronLeft size={16} />
                    </button>
                    <span className="flex items-center px-4 text-sm font-bold text-slate-700 bg-white rounded-lg border border-slate-200">
                        {page} / {safeTotalPages}
                    </span>
                    <button onClick={onNext} disabled={page >= safeTotalPages} className={buttonClassName}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            ) : null}
        </div>
    );
};

export const EmptyState = ({ icon: Icon, title = '暂无数据', description, className = '' }) => (
    <div className={`p-12 text-center text-slate-400 ${className}`}>
        {Icon ? <Icon size={48} className="mx-auto mb-3 opacity-30" /> : null}
        <p>{title}</p>
        {description ? <p className="text-sm mt-2 text-slate-400">{description}</p> : null}
    </div>
);

export const LoadingState = ({ label = '加载中...', className = 'h-64' }) => (
    <div className={`flex items-center justify-center ${className}`}>
        <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin" size={18} />
            <span>{label}</span>
        </div>
    </div>
);

export const ChannelSelect = ({ channels, value, onChange, className = 'bg-white' }) => (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${className}`}>
        <span className="text-sm text-slate-500">渠道范围</span>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm border-none outline-none bg-transparent text-slate-700 cursor-pointer py-1"
        >
            <option value="">全部渠道</option>
            {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
        </select>
    </div>
);
