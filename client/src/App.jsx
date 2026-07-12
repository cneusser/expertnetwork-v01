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
import ExpertDashboard from './pages/ExpertDashboard';
import ExpertProfil from './pages/ExpertProfil';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verfuegbarkeit" element={<Verfuegbarkeit />} />
          <Route path="/einladung" element={<Einladung />} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/experten" element={<ProtectedRoute roles={['admin']}><AdminExperts /></ProtectedRoute>} />
          <Route path="/admin/experten/:id" element={<ProtectedRoute roles={['admin']}><AdminExpertDetail /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute roles={['expert']}><ExpertDashboard /></ProtectedRoute>} />
          <Route path="/profil" element={<ProtectedRoute roles={['expert']}><ExpertProfil /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
