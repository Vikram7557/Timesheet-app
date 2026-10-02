import { useMemo } from 'react';
import { useData } from '../context/DataContext';

// Runs a read from the service layer. Re-runs whenever data changes. Never throws into the render.
export function useQuery(fn, deps = [], initial = null) {
  const { version } = useData();
  return useMemo(() => {
    try {
      return { data: fn(), error: null };
    } catch (error) {
      return { data: initial, error };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
}
