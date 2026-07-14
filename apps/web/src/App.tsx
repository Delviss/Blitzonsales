import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import LoginPage from './pages/LoginPage';
import OrganisationenPage from './pages/verwaltung/OrganisationenPage';
import VerkaeuferPage from './pages/verwaltung/VerkaeuferPage';
import ProduktePage from './pages/verwaltung/ProduktePage';
import BenutzerPage from './pages/verwaltung/BenutzerPage';
import StatusMasterPage from './pages/verwaltung/StatusMasterPage';
import ProvisionsregelnPage from './pages/verwaltung/ProvisionsregelnPage';
import ProvisionslaeufePage from './pages/ProvisionslaeufePage';
import ProvisionslaufDetailPage from './pages/ProvisionslaufDetailPage';
import ImportPage from './pages/ImportPage';
import DataQualityPage from './pages/DataQualityPage';
import { AppShell } from './components/app-shell';
import { Dashboard } from './components/dashboard';
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
      <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="verwaltung/organisationen" element={<OrganisationenPage />} />
        <Route path="verwaltung/verkaeufer" element={<VerkaeuferPage />} />
        <Route path="verwaltung/produkte" element={<ProduktePage />} />
        <Route path="verwaltung/statusstammdaten" element={<StatusMasterPage />} />
        <Route path="verwaltung/benutzer" element={<BenutzerPage />} />
        <Route path="verwaltung/provisionsregeln" element={<ProvisionsregelnPage />} />
        <Route path="provisionslaeufe" element={<ProvisionslaeufePage />} />
        <Route path="provisionslaeufe/:id" element={<ProvisionslaufDetailPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="datenqualitaet" element={<DataQualityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
