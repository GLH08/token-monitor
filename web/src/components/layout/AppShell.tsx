import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppShellProps {
    onLogout?: () => void;
    authEnabled?: boolean;
}

/** App chrome: fixed desktop sidebar, mobile slide-over drawer, top bar, Outlet. */
const AppShell = ({ onLogout, authEnabled = false }: AppShellProps) => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <aside className="hidden w-56 shrink-0 border-r md:block">
                <Sidebar showLogout={authEnabled} onLogout={onLogout} />
            </aside>

            {mobileNavOpen ? (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setMobileNavOpen(false)}
                        aria-hidden="true"
                    />
                    <div className="relative h-full w-56 bg-background shadow-lg">
                        <Sidebar
                            onNavigate={() => setMobileNavOpen(false)}
                            showLogout={authEnabled}
                            onLogout={onLogout}
                        />
                    </div>
                </div>
            ) : null}

            <div className="flex flex-1 flex-col overflow-hidden">
                <TopBar onOpenNav={() => setMobileNavOpen(true)} />
                <main className="flex-1 overflow-auto p-4 md:p-8">
                    <div className="mx-auto max-w-7xl">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AppShell;
