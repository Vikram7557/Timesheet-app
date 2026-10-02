import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const homeFor = (user) => (user.role === 'admin' ? '/admin' : '/me');

export default function ProtectedRoute({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}
