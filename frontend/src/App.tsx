import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { OrganizationsPage } from './pages/OrganizationsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { DashboardPage } from './pages/DashboardPage';
import { QueuesPage } from './pages/QueuesPage';
import { QueueDetailPage } from './pages/QueueDetailPage';
import { WorkersPage } from './pages/WorkersPage';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void text-text-muted text-sm">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/orgs" element={<RequireAuth><OrganizationsPage /></RequireAuth>} />
      <Route path="/orgs/:orgId/projects" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
      <Route path="/orgs/:orgId/projects/:projectId/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/orgs/:orgId/projects/:projectId/queues" element={<RequireAuth><QueuesPage /></RequireAuth>} />
      <Route
        path="/orgs/:orgId/projects/:projectId/queues/:queueId"
        element={<RequireAuth><QueueDetailPage /></RequireAuth>}
      />
      <Route path="/workers" element={<RequireAuth><WorkersPage /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/orgs" replace />} />
      <Route path="*" element={<Navigate to="/orgs" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
