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

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));

  useEffect(() => {
    const handleStorageChange = () => {
      setIsAuthenticated(!!localStorage.getItem('access_token'));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogin = (token) => {
    localStorage.setItem('access_token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
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
        <Route path="/errors" element={<Errors />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};

export default App;
