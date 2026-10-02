import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const Ctx = createContext({ version: 0, refresh: () => {} });

// `version` changes after every write (and when another tab writes), so views re-read from the services.
export function DataProvider({ children }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const onStorage = (e) => {
      if (!e.key || e.key.startsWith('tms_')) refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useData = () => useContext(Ctx);
