import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Verfuegbarkeit from './pages/Verfuegbarkeit';
import Einladung from './pages/Einladung';
import AdminDashboard from './pages/AdminDashboard';
import AdminExperts from './pages/AdminExperts';
import AdminExpertDetail from './pages/AdminExpertDetail';
import AdminAudit from './pages/AdminAudit';
import AdminSearch from './pages/AdminSearch';
import AdminProjects from './pages/AdminProjects';
import AdminProjectDetail from './pages/AdminProjectDetail';
import ExpertProjekte from './pages/ExpertProjekte';
import Konto from './pages/Konto';
import AdminKommunikation from './pages/AdminKommunikation';
import AdminMandanten from './pages/AdminMandanten';
import VendorPortal from './pages/VendorPortal';
import RegisterKunde from './pages/RegisterKunde';
import ProjektOeffentlich from './pages/ProjektOeffentlich';
import ShareView from './pages/ShareView';
import ExpertDashboard from './pages/ExpertDashboard';
import ExpertProfil from './pages/ExpertProfil';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const home = user.role === 'vendor' ? '/vendor' : ['admin', 'tenant_owner'].includes(user.role) ? '/admin' : '/dashboard';
  return <Navigate to={home} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register-kunde" element={<RegisterKunde />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verfuegbarkeit" element={<Verfuegbarkeit />} />
          <Route path="/einladung" element={<Einladung />} />
          <Route path="/p/:referenz" element={<ProjektOeffentlich />} />
          <Route path="/s/:token" element={<ShareView />} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/experten" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminExperts /></ProtectedRoute>} />
          <Route path="/admin/experten/:id" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminExpertDetail /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminAudit /></ProtectedRoute>} />
          <Route path="/admin/suche" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminSearch /></ProtectedRoute>} />
          <Route path="/admin/projekte" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminProjects /></ProtectedRoute>} />
          <Route path="/admin/projekte/:id" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminProjectDetail /></ProtectedRoute>} />
          <Route path="/admin/kommunikation" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminKommunikation /></ProtectedRoute>} />
          <Route path="/projekte" element={<ProtectedRoute roles={['expert']}><ExpertProjekte /></ProtectedRoute>} />
          <Route path="/konto" element={<ProtectedRoute><Konto /></ProtectedRoute>} />
          <Route path="/admin/mandanten" element={<ProtectedRoute roles={['admin', 'tenant_owner']}><AdminMandanten /></ProtectedRoute>} />
          <Route path="/vendor" element={<ProtectedRoute roles={['vendor']}><VendorPortal /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute roles={['expert']}><ExpertDashboard /></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute roles={['expert']}><ExpertProfil /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
