import { NavLink } from 'react-router-dom';
import {
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

/** The 7 C3 pages in IA order. Login is handled by the auth gate. */
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
    <div className="flex h-full flex-col px-4 pb-5 pt-7">
        <div className="px-3 pb-6">
            <div className="font-display text-[26px] leading-tight tracking-tight text-foreground">
                Token
            </div>
            <div className="mt-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                Monitor · Light
            </div>
        </div>

        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            导航
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
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
                                'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors',
                                isActive
                                    ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)] [&_svg]:text-primary-500'
                                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground [&_svg]:opacity-80',
                            )
                        }
                    >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{item.label}</span>
                    </NavLink>
                );
            })}
        </nav>

        {showLogout && onLogout ? (
            <div className="mt-3 border-t border-border/60 px-1 pt-3">
                <button
                    type="button"
                    onClick={onLogout}
                    className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                >
                    <LogOut className="h-[18px] w-[18px] shrink-0" />
                    <span>退出登录</span>
                </button>
            </div>
        ) : null}
    </div>
);

export default Sidebar;
