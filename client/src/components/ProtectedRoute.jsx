import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const home = user.role === 'vendor' ? '/vendor' : ['admin', 'tenant_owner'].includes(user.role) ? '/admin' : '/dashboard';
    return <Navigate to={home} replace />;
  }
  return children;
}
