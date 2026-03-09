import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Clock, X } from 'lucide-react';

const DEFAULT_ACCENT = {
    container: 'focus:border-cyan-500 focus:ring-cyan-500/10',
    button: 'from-cyan-500 to-cyan-600 hover:shadow-cyan-500/20',
};

const CustomDateTimePicker = ({
    label,
    value,
    onChange,
    minWidthClassName = 'min-w-[140px]',
    triggerClassName = '',
    inputAccentClassName,
    buttonGradientClassName,
    showCalendarIcon = false,
}) => {
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

    // removed global mousedown listener in favor of fixed overlay

    const handleConfirm = () => {
        if (tempDate) {
            onChange(`${tempDate}T${tempHour}:${tempMinute}`);
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
    const accentClassName = inputAccentClassName || DEFAULT_ACCENT.container;
    const confirmButtonClassName = buttonGradientClassName || DEFAULT_ACCENT.button;

    return (
        <div className="relative" ref={containerRef}>
            <div
                className={`flex items-center gap-2 cursor-pointer px-2 py-1 rounded-lg transition-colors ${minWidthClassName} ${value ? 'text-slate-700' : 'text-slate-400 hover:text-slate-600'} ${triggerClassName}`.trim()}
                onClick={() => setIsOpen(!isOpen)}
            >
                {showCalendarIcon ? <Calendar size={16} className="text-gray-400" /> : null}
                <span className="text-sm font-medium truncate">
                    {value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }) : label}
                </span>
                {value && (
                    <button type="button" onClick={handleClear} className="p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600">
                        <X size={12} />
                    </button>
                )}
            </div>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}></div>
                    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 p-4 z-50 w-[280px] animate-in fade-in zoom-in-95 duration-200">
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 ml-1">日期</label>
                                <input
                                    type="date"
                                    className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none text-slate-700 ${accentClassName}`.trim()}
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
                                            className={`w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none text-slate-700 bg-white ${accentClassName}`.trim()}
                                            value={tempHour}
                                            onChange={e => setTempHour(e.target.value)}
                                        >
                                            {hours.map(h => <option key={h} value={h}>{h} 时</option>)}
                                        </select>
                                    </div>
                                    <span className="text-slate-300 font-bold">:</span>
                                    <div className="relative flex-1">
                                        <select
                                            className={`w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none text-slate-700 bg-white ${accentClassName}`.trim()}
                                            value={tempMinute}
                                            onChange={e => setTempMinute(e.target.value)}
                                        >
                                            {minutes.map(m => <option key={m} value={m}>{m} 分</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleConfirm}
                                className={`w-full bg-gradient-to-r text-white py-2 rounded-lg font-bold text-sm hover:shadow-md transition-all flex items-center justify-center gap-2 ${confirmButtonClassName}`.trim()}
                            >
                                <Check size={16} /> 确认
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CustomDateTimePicker;
