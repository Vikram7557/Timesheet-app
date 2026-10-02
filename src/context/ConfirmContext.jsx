import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Modal from '../components/Modal';

const Ctx = createContext(() => Promise.resolve(false));

// const ok = await confirm({ title, message, confirmLabel, danger })
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const pending = useRef(null);

  const settle = useCallback((value) => {
    if (pending.current) pending.current(value);
    pending.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((opts) => {
    if (pending.current) pending.current(false);
    return new Promise((resolve) => {
      pending.current = resolve;
      setState(opts);
    });
  }, []);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title || 'Are you sure?'}
          onClose={() => settle(false)}
          footer={
            <>
              <button className="btn" onClick={() => settle(false)}>Cancel</button>
              <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => settle(true)} autoFocus>
                {state.confirmLabel || 'Confirm'}
              </button>
            </>
          }
        >
          <p className="pre-wrap">{state.message}</p>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
