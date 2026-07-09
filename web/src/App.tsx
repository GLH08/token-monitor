import { useCallback, useEffect, useState } from 'react';
import { fetchAuthConfig, fetchAuthMe, getStoredToken, logout } from './api/client';
import AppRoutes from './routes';
import LoadingState from './components/LoadingState';

/**
 * Auth gate. Mirrors the legacy `App.jsx` flow: fetch /auth/config; if auth is
 * disabled the app is open; if enabled, a valid stored token is verified via
 * /auth/me. Listens for `storage` + `auth-changed` (fired by `client.ts` on 401
 * and on login/logout) to re-sync.
 */
const App = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authEnabled, setAuthEnabled] = useState(true);
    const [authLoading, setAuthLoading] = useState(true);

    const syncAuth = useCallback(async () => {
        try {
            const config = await fetchAuthConfig();
            const enabled = config?.data?.enabled !== false;
            setAuthEnabled(enabled);

            if (!enabled) {
                setIsAuthenticated(true);
                return;
            }

            const token = getStoredToken();
            if (!token) {
                setIsAuthenticated(false);
                return;
            }

            await fetchAuthMe();
            setIsAuthenticated(true);
        } catch {
            setIsAuthenticated(false);
        } finally {
            setAuthLoading(false);
        }
    }, []);

    useEffect(() => {
        syncAuth();
        const handler = () => syncAuth();
        window.addEventListener('storage', handler);
        window.addEventListener('auth-changed', handler);
        return () => {
            window.removeEventListener('storage', handler);
            window.removeEventListener('auth-changed', handler);
        };
    }, [syncAuth]);

    const handleLogin = useCallback(() => {
        syncAuth();
    }, [syncAuth]);

    const handleLogout = useCallback(async () => {
        await logout();
        syncAuth();
    }, [syncAuth]);

    if (authLoading) {
        return <LoadingState label="加载中..." className="min-h-screen" />;
    }

    return (
        <AppRoutes
            authEnabled={authEnabled}
            isAuthenticated={isAuthenticated}
            onLogin={handleLogin}
            onLogout={handleLogout}
        />
    );
};

export default App;
