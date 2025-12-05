import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#84cc16', '#14b8a6', '#f43f5e', '#6366f1'];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-4 border border-slate-100 shadow-xl rounded-xl backdrop-blur-sm bg-white/95">
                <p className="text-sm font-bold text-slate-800 mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm mb-1.5 last:mb-0">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-500 font-medium">{entry.name}:</span>
                        <span className="font-bold text-slate-700 font-mono">
                            {entry.value.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const ChartCard = ({ title, children }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-6 bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full shadow-sm"></div>
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                {title}
            </h3>
        </div>
        <div className="h-[400px] w-full">
            {children}
        </div>
    </div>
);

const AnalyticsCharts = ({ trendData, modelData, channelData, stackedData }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Hourly Stacked Bar Chart (Model Usage) */}
            <div className="lg:col-span-2">
                <ChartCard title="模型消耗分布 (按小时)">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stackedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(6, 182, 212, 0.05)' }} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                            {(() => {
                                const allKeys = new Set();
                                stackedData.forEach(item => {
                                    Object.keys(item).forEach(key => {
                                        if (key !== 'name') allKeys.add(key);
                                    });
                                });
                                const keysArray = Array.from(allKeys);

                                return keysArray.map((key, index) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="a"
                                        fill={key === 'Others' ? '#cbd5e1' : COLORS[index % COLORS.length]}
                                        radius={index === keysArray.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                                        barSize={28}
                                    />
                                ));
                            })()}
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Trend Chart */}
            <div className="lg:col-span-2">
                <ChartCard title="Token 消耗趋势">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                            <Line type="monotone" dataKey="tokens" stroke="#06b6d4" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: '#06b6d4' }} name="Tokens" />
                            <Line type="monotone" dataKey="requests" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} name="请求数" />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Model Distribution (Top Models) */}
            <ChartCard title="模型消耗排行 (Top 10)">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={modelData} margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={180}
                            tick={{ fontSize: 13, fill: '#475569', fontWeight: 500 }}
                            interval={0}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20} background={{ fill: '#f8fafc', radius: [0, 8, 8, 0] }}>
                            {modelData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* Channel Distribution (Donut Chart) */}
            <ChartCard title="渠道消耗占比">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={channelData}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={130}
                            paddingAngle={4}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={6}
                        >
                            {channelData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '12px', color: '#64748b' }} iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>
            </ChartCard>
        </div>
    );
};

export default AnalyticsCharts;
