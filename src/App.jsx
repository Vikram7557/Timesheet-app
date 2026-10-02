import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute, { homeFor } from './routes/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import UserPage from './pages/UserPage';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">Skip to content</a>
      <DataProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <HashRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/admin" element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
                  <Route path="/me" element={<ProtectedRoute role="user"><UserPage /></ProtectedRoute>} />
                  <Route path="*" element={<Home />} />
                </Routes>
              </HashRouter>
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </DataProvider>
    </ErrorBoundary>
  );
}
