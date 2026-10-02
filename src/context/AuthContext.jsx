import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readCollection, readSession, writeSession, clearSession } from '../repository/storage';
import { findLoginUser } from '../services/userService';
import { useData } from './DataContext';
import { useToast } from './ToastContext';

const Ctx = createContext(null);

// Simulated auth: the session (who am I) lives in sessionStorage, the data lives in localStorage.
// Logging out removes only the session; it never touches the data.
export function AuthProvider({ children }) {
  const { version } = useData();
  const toast = useToast();
  const [userId, setUserId] = useState(() => readSession()?.userId ?? null);

  const user = useMemo(() => {
    if (!userId) return null;
    return readCollection('users').find((u) => u._id === userId && u.isActive) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, version]);

  // If the account disappears or is deactivated (e.g. in another tab), drop the session.
  useEffect(() => {
    if (userId && !user) {
      clearSession();
      setUserId(null);
      toast.info('You were signed out because your account is no longer active.');
    }
  }, [userId, user, toast]);

  const login = useCallback((employeeId) => {
    const u = findLoginUser(employeeId);
    writeSession({ userId: u._id });
    setUserId(u._id);
    return u;
  }, []);

  const loginAs = useCallback((u) => {
    writeSession({ userId: u._id });
    setUserId(u._id);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUserId(null);
  }, []);

  const value = useMemo(() => ({ user, login, loginAs, logout }), [user, login, loginAs, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
