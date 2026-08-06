import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppShellProps {
    onLogout?: () => void;
    authEnabled?: boolean;
}

/** App chrome: ambient backdrop, glass sidebar, top bar, Outlet. */
const AppShell = ({ onLogout, authEnabled = false }: AppShellProps) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
        <div className="relative flex h-screen overflow-hidden bg-background">
            <div className="ambient" aria-hidden="true">
                <div className="blob b1" />
                <div className="blob b2" />
                <div className="blob b3" />
                <div className="blob b4" />
                <div className="noise" />
            </div>

            <aside className="glass-sidebar relative z-10 hidden w-[248px] shrink-0 md:block">
                <Sidebar showLogout={authEnabled} onLogout={onLogout} />
            </aside>

            {mobileNavOpen ? (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setMobileNavOpen(false)}
                        aria-hidden="true"
                    />
                    <div className="glass-sidebar relative h-full w-[248px] shadow-lg">
                        <Sidebar
                            onNavigate={() => setMobileNavOpen(false)}
                            showLogout={authEnabled}
                            onLogout={onLogout}
                        />
                    </div>
                </div>
            ) : null}

            <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
                <TopBar onOpenNav={() => setMobileNavOpen(true)} />
                <main className="flex-1 overflow-auto px-4 pb-12 pt-3 md:px-8">
                    <div className="mx-auto max-w-7xl space-y-4">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AppShell;
