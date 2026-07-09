import { NavLink } from 'react-router-dom';
import {
    Activity,
    BarChart3,
    Bell,
    Cpu,
    FileText,
    Gauge,
    LayoutDashboard,
    LogOut,
    Server,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';

export interface NavItem {
    path: string;
    label: string;
    icon: LucideIcon;
}

/** The 7 C3 pages in IA order (parent design §5). Login is handled by the auth gate. */
export const NAV_ITEMS: NavItem[] = [
    { path: '/', label: '概览', icon: LayoutDashboard },
    { path: '/usage', label: '用量分析', icon: BarChart3 },
    { path: '/models', label: '模型分析', icon: Cpu },
    { path: '/channels', label: '渠道监控', icon: Server },
    { path: '/performance', label: '性能分析', icon: Gauge },
    { path: '/logs', label: '日志明细', icon: FileText },
    { path: '/alerts', label: '告警配置', icon: Bell },
];

interface SidebarProps {
    onNavigate?: () => void;
    onLogout?: () => void;
    showLogout?: boolean;
}

const Sidebar = ({ onNavigate, onLogout, showLogout = false }: SidebarProps) => (
    <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/30">
                <Activity className="h-5 w-5" />
            </div>
            <h1 className="text-base font-bold tracking-tight">TokenMonitor</h1>
        </div>

        <nav className="flex-1 space-y-1 overflow-auto px-3 pb-3">
            {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.path === '/'}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                            cn(
                                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            )
                        }
                    >
                        <Icon className="h-[18px] w-[18px]" />
                        {item.label}
                    </NavLink>
                );
            })}
        </nav>

        {showLogout && onLogout ? (
            <div className="border-t p-3">
                <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                    <LogOut className="h-5 w-5" />
                    退出登录
                </button>
            </div>
        ) : null}
    </div>
);

export default Sidebar;
