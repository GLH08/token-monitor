import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './Dashboard';
import LogsTable from './components/LogsTable';
import Alerts from './Alerts';
import Login from './Login';
import Performance from './Performance';
import Channels from './Channels';
import Models from './Models';
import Tokens from './Tokens';
import Errors from './Errors';
import ModelStatus from './ModelStatus';
import CostTokenAnalysis from './CostTokenAnalysis';
import { fetchAuthConfig, fetchAuthMe, getStoredToken, logout } from './api';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const syncAuth = async () => {
      try {
        const config = await fetchAuthConfig();
        const enabled = config?.data?.enabled !== false;
        setAuthEnabled(enabled);

        if (!enabled) {
          setIsAuthenticated(true);
          setAuthLoading(false);
          return;
        }

        const token = getStoredToken();
        if (!token) {
          setIsAuthenticated(false);
          setAuthLoading(false);
          return;
        }

        await fetchAuthMe();
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };

    syncAuth();

    const handleAuthChange = () => {
      syncAuth();
    };

    window.addEventListener('storage', handleAuthChange);
    window.addEventListener('auth-changed', handleAuthChange);
    return () => {
      window.removeEventListener('storage', handleAuthChange);
      window.removeEventListener('auth-changed', handleAuthChange);
    };
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(!authEnabled);
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">加载中...</div>;
  }

  if (authEnabled && !isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Layout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/logs" element={<LogsTable />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/channels" element={<Channels />} />
        <Route path="/models" element={<Models />} />
        <Route path="/model-status" element={<ModelStatus />} />
        <Route path="/tokens" element={<Tokens />} />
        <Route path="/usage" element={<CostTokenAnalysis />} />
        <Route path="/errors" element={<Errors />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

export default App;
