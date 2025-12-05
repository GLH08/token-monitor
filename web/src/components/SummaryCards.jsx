import React from 'react';
import { Coins, Activity, Server } from 'lucide-react';

const Card = ({ title, value, subValue, icon: Icon, gradient, iconColor }) => (
    <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 border border-slate-100">
        <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${gradient} text-white shadow-lg shadow-cyan-500/20`}>
                <Icon size={24} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="text-3xl font-bold text-slate-800 tracking-tight mb-1">{value}</h3>
                <p className="text-sm font-medium text-slate-500 mb-2">{title}</p>
                {subValue && (
                    <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-50 text-xs font-medium text-slate-600">
                        {subValue}
                    </div>
                )}
            </div>
        </div>
    </div>
);

const SummaryCards = ({ data }) => {
    const { total_tokens = 0, total_requests = 0, active_models = 0 } = data;

    // Format numbers
    const formatNum = (num) => new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short" }).format(num);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card
                title="总 Token 消耗"
                value={formatNum(total_tokens)}
                subValue="所选时间段内"
                icon={Coins}
                gradient="from-cyan-500 to-cyan-600"
            />
            <Card
                title="总请求数"
                value={formatNum(total_requests)}
                subValue="API 调用次数"
                icon={Activity}
                gradient="from-emerald-500 to-emerald-600"
            />
            <Card
                title="活跃模型"
                value={active_models}
                subValue="使用过的模型数量"
                icon={Server}
                gradient="from-violet-500 to-violet-600"
            />
        </div>
    );
};

export default SummaryCards;
