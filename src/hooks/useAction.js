import { useCallback, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../utils/errors';

// Wraps a write. Blocks double submits, refreshes views, shows toasts, and never lets an error escape.
// Pass { inline: true } when the form shows field errors itself (validation errors then skip the toast).
export function useAction() {
  const { refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const run = useCallback(
    async (fn, successMessage, { inline = false } = {}) => {
      if (lock.current) return { ok: false, skipped: true };
      lock.current = true;
      setBusy(true);
      try {
        const result = await fn();
        refresh();
        if (successMessage) toast.success(successMessage);
        return { ok: true, result };
      } catch (error) {
        if (!(inline && error?.details?.fields)) toast.error(errorMessage(error));
        refresh(); // the data may have changed under us (e.g. task deleted elsewhere)
        return { ok: false, error };
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [refresh, toast],
  );
  return [run, busy];
}
