import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import Overview from './pages/Overview';
import UsageAnalytics from './pages/UsageAnalytics';
import Models from './pages/Models';
import Channels from './pages/Channels';
import Performance from './pages/Performance';
import Logs from './pages/Logs';
import Alerts from './pages/Alerts';

interface AppRoutesProps {
    authEnabled: boolean;
    isAuthenticated: boolean;
    onLogin?: () => void;
    onLogout?: () => void;
}

/**
 * Route table with auth gate baked in:
 * - auth required + not authenticated -> Login on every path,
 * - authenticated -> /login redirects home, otherwise AppShell + 7 pages,
 * - unknown paths -> redirect to /.
 */
const AppRoutes = ({ authEnabled, isAuthenticated, onLogin, onLogout }: AppRoutesProps) => {
    if (authEnabled && !isAuthenticated) {
        return (
            <Routes>
                <Route path="*" element={<Login onLogin={onLogin} />} />
            </Routes>
        );
    }

    return (
        <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route element={<AppShell onLogout={onLogout} authEnabled={authEnabled} />}>
                <Route path="/" element={<Overview />} />
                <Route path="/usage" element={<UsageAnalytics />} />
                <Route path="/models" element={<Models />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/alerts" element={<Alerts />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

export default AppRoutes;
