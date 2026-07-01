import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrganisationenPage from './pages/verwaltung/OrganisationenPage';
import VerkaeuferPage from './pages/verwaltung/VerkaeuferPage';
import ProduktePage from './pages/verwaltung/ProduktePage';
import BenutzerPage from './pages/verwaltung/BenutzerPage';
import Layout from './components/Layout';
import { getUser } from './lib/auth';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getUser() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [, forceRender] = useState(0);
  const rerender = () => forceRender(n => n + 1);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLogin={rerender} />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="verwaltung/organisationen" element={<OrganisationenPage />} />
        <Route path="verwaltung/verkaeufer" element={<VerkaeuferPage />} />
        <Route path="verwaltung/produkte" element={<ProduktePage />} />
        <Route path="verwaltung/benutzer" element={<BenutzerPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
