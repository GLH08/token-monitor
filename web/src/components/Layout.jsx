import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Bell, LogOut, Activity, Menu } from 'lucide-react';

const Layout = ({ children, onLogout }) => {
    const location = useLocation();
    const activeTab = location.pathname;

    const navItems = [
        { path: '/', label: '概览', icon: LayoutDashboard },
        { path: '/performance', label: '性能分析', icon: Activity },
        { path: '/logs', label: '日志明细', icon: FileText },
        { path: '/alerts', label: '告警配置', icon: Bell },
    ];

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Sidebar */}
            <div className="w-72 bg-white shadow-lg z-20 hidden md:flex flex-col">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
                        <Activity size={24} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                        TokenMonitor
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium ${isActive
                                    ? 'bg-cyan-50 text-cyan-600 shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <Icon size={20} className={isActive ? 'text-cyan-500' : 'text-slate-400'} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-100">
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 font-medium"
                    >
                        <LogOut size={20} />
                        退出登录
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                <header className="h-16 flex items-center justify-between px-8 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
                    <button className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                        <Menu size={24} />
                    </button>

                    <div className="flex items-center gap-4 ml-auto">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-slate-700">管理员</span>
                            <span className="text-xs text-slate-400">Admin</span>
                        </div>
                        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold shadow-md shadow-cyan-500/20 ring-2 ring-white">
                            A
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
