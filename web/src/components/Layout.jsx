import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Bell, LogOut, Activity, Menu, Server, Cpu, Key, AlertTriangle, HeartPulse, X } from 'lucide-react';

const Layout = ({ children, onLogout }) => {
    const location = useLocation();
    const activeTab = location.pathname;
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const mobileMenuButtonRef = useRef(null);
    const mobileDrawerRef = useRef(null);
    const mobileCloseButtonRef = useRef(null);
    const desktopSidebarRef = useRef(null);
    const mainContentRef = useRef(null);
    const mobileCloseReasonRef = useRef('manual');
    const shouldFocusMainOnRouteChangeRef = useRef(false);

    const navGroups = useMemo(() => ([
        {
            title: '运营概览',
            items: [
                { path: '/', label: '概览', icon: LayoutDashboard },
                { path: '/performance', label: '性能分析', icon: Activity },
            ]
        },
        {
            title: '资源监控',
            items: [
                { path: '/channels', label: '渠道监控', icon: Server },
                { path: '/models', label: '模型分析', icon: Cpu },
                { path: '/tokens', label: 'Token 管理', icon: Key },
            ]
        },
        {
            title: '稳定性',
            items: [
                { path: '/model-status', label: '模型状态', icon: HeartPulse },
                { path: '/errors', label: '错误日志', icon: AlertTriangle },
                { path: '/alerts', label: '告警配置', icon: Bell },
            ]
        },
        {
            title: '数据追踪',
            items: [
                { path: '/logs', label: '日志明细', icon: FileText },
            ]
        }
    ]), []);

    const activeGroup = navGroups.find((group) => group.items.some((item) => item.path === activeTab)) || navGroups[0];
    const activeItem = activeGroup.items.find((item) => item.path === activeTab) || activeGroup.items[0];

    useEffect(() => {
        if (mobileMenuOpen) {
            mobileCloseReasonRef.current = 'navigation';
            shouldFocusMainOnRouteChangeRef.current = true;
            setMobileMenuOpen(false);
        }
    }, [location.pathname, mobileMenuOpen]);

    useEffect(() => {
        if (!mobileMenuOpen && shouldFocusMainOnRouteChangeRef.current) {
            mainContentRef.current?.focus();
            shouldFocusMainOnRouteChangeRef.current = false;
        }
    }, [location.pathname, mobileMenuOpen]);

    useEffect(() => {
        if (!mobileMenuOpen) {
            return undefined;
        }

        const mediaQuery = window.matchMedia('(min-width: 768px)');
        const handleViewportChange = (event) => {
            if (event.matches) {
                mobileCloseReasonRef.current = 'breakpoint';
                setMobileMenuOpen(false);
            }
        };

        mediaQuery.addEventListener('change', handleViewportChange);
        return () => {
            mediaQuery.removeEventListener('change', handleViewportChange);
        };
    }, [mobileMenuOpen]);

    useEffect(() => {
        if (!mobileMenuOpen) {
            return undefined;
        }

        const previousFocusedElement = document.activeElement;
        mobileCloseButtonRef.current?.focus();

        const restoreFocus = () => {
            const isElementVisible = (element) => (
                element instanceof HTMLElement
                && element.isConnected
                && element.getClientRects().length > 0
            );

            if (isElementVisible(previousFocusedElement)) {
                previousFocusedElement.focus();
                return;
            }

            if (window.matchMedia('(min-width: 768px)').matches) {
                const activeDesktopLink = desktopSidebarRef.current?.querySelector('[aria-current="page"]');
                if (isElementVisible(activeDesktopLink)) {
                    activeDesktopLink.focus();
                    return;
                }
            }

            if (isElementVisible(mobileMenuButtonRef.current)) {
                mobileMenuButtonRef.current.focus();
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                mobileCloseReasonRef.current = 'manual';
                setMobileMenuOpen(false);
                return;
            }

            if (event.key !== 'Tab' || !mobileDrawerRef.current) {
                return;
            }

            const focusableElements = Array.from(
                mobileDrawerRef.current.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
            );

            if (focusableElements.length === 0) {
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
                return;
            }

            if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (mobileCloseReasonRef.current !== 'navigation') {
                restoreFocus();
            }
            mobileCloseReasonRef.current = 'manual';
        };
    }, [mobileMenuOpen]);

    const renderNavItems = () => navGroups.map((group) => (
        <div key={group.title} className="space-y-2">
            <div className="px-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{group.title}</div>
            {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.path;
                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => {
                            mobileCloseReasonRef.current = 'navigation';
                            shouldFocusMainOnRouteChangeRef.current = true;
                            setMobileMenuOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${isActive
                            ? 'bg-cyan-50 text-cyan-600 shadow-sm'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                    >
                        <Icon size={20} className={isActive ? 'text-cyan-500' : 'text-slate-400'} />
                        {item.label}
                    </Link>
                );
            })}
        </div>
    ));

    const renderSidebarContent = (showMobileClose = false) => (
        <>
            <div className="p-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
                        <Activity size={24} />
                    </div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                        TokenMonitor
                    </h1>
                </div>
                {showMobileClose ? (
                    <button
                        ref={mobileCloseButtonRef}
                        type="button"
                        aria-label="关闭导航菜单"
                        className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
                        onClick={() => {
                            mobileCloseReasonRef.current = 'manual';
                            setMobileMenuOpen(false);
                        }}
                    >
                        <X size={20} />
                    </button>
                ) : null}
            </div>

            <nav className="flex-1 px-4 pb-6 space-y-6 overflow-auto">
                {renderNavItems()}
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
        </>
    );

    return (
        <div className="flex h-screen bg-gray-50">
            {mobileMenuOpen ? (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div className="absolute inset-0 bg-slate-900/40" onClick={() => {
                        mobileCloseReasonRef.current = 'manual';
                        setMobileMenuOpen(false);
                    }} />
                    <div
                        id="mobile-navigation-drawer"
                        ref={mobileDrawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="主导航"
                        className="relative inset-y-0 left-0 w-72 h-full bg-white shadow-lg flex flex-col"
                    >
                        {renderSidebarContent(true)}
                    </div>
                </div>
            ) : null}

            <div ref={desktopSidebarRef} className="hidden md:flex md:w-72 bg-white shadow-lg md:flex-col">
                {renderSidebarContent(false)}
            </div>

            <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
                <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            ref={mobileMenuButtonRef}
                            type="button"
                            aria-label="打开导航菜单"
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-navigation-drawer"
                            className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                            onClick={() => setMobileMenuOpen(true)}
                        >
                            <Menu size={24} />
                        </button>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">{activeGroup.title}</div>
                            <div className="text-sm md:text-base font-semibold text-slate-700 truncate">{activeItem.label}</div>
                        </div>
                    </div>

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

                <main ref={mainContentRef} tabIndex={-1} className="flex-1 overflow-auto p-4 md:p-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-inset">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Layout;
