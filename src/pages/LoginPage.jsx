import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { homeFor } from '../routes/ProtectedRoute';
import { bootstrapAdmin, listSignInAccounts, needsSetup } from '../services/userService';
import { seedDemoData } from '../services/seedService';
import { errorMessage } from '../utils/errors';

export default function LoginPage() {
  const { user, login, loginAs } = useAuth();
  const { version, refresh } = useData();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [setup, setSetup] = useState({ name: '', employeeId: '' });
  const [setupErrors, setSetupErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const empty = needsSetup();
  void version;
  const quick = empty ? [] : listSignInAccounts();

  function submit(e) {
    e.preventDefault();
    try {
      login(employeeId);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  function quickLogin(u) {
    try { login(u.employeeId); } catch (err) { toast.error(errorMessage(err)); refresh(); }
  }
  function loadDemo() {
    if (busy) return;
    setBusy(true);
    try {
      seedDemoData();
      refresh();
      toast.success('Demo data loaded. Pick an account to sign in.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  function createAdmin(e) {
    e.preventDefault();
    try {
      const u = bootstrapAdmin(setup);
      refresh();
      loginAs(u);
    } catch (err) {
      if (err?.details?.fields) setSetupErrors(err.details.fields);
      else toast.error(errorMessage(err));
    }
  }

  return (
    <main id="main" className="login">
      <div className="login-panel">
        <div className="brand brand-large"><span className="brand-mark" aria-hidden="true" />Tasklog</div>
        <p className="login-lede">Assign tasks, track progress and log hours.</p>

        {empty ? (
          <>
            <h1>Set up your workspace</h1>
            <p className="muted">Nothing is stored in this browser yet. Start with sample data, or create the first admin.</p>
            <button className="btn btn-primary btn-block" onClick={loadDemo} disabled={busy}>Load demo data</button>
            <div className="or"><span>or create the first admin</span></div>
            <form onSubmit={createAdmin} noValidate className="stack">
              <Field label="Full name" error={setupErrors.name}><input value={setup.name} onChange={(e) => { setSetup({ ...setup, name: e.target.value }); setSetupErrors({}); }} /></Field>
              <Field label="Employee ID" error={setupErrors.employeeId}><input value={setup.employeeId} onChange={(e) => { setSetup({ ...setup, employeeId: e.target.value }); setSetupErrors({}); }} placeholder="e.g. EMP001" /></Field>
              <button className="btn btn-block" type="submit">Create admin and sign in</button>
            </form>
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <form onSubmit={submit} noValidate className="stack">
              <Field label="Employee ID" error={error}>
                <input value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setError(''); }} placeholder="e.g. EMP001" autoFocus autoComplete="off" />
              </Field>
              <button className="btn btn-primary btn-block" type="submit">Sign in</button>
            </form>
            <div className="or"><span>or pick an account</span></div>
            <ul className="quick">
              {quick.map((u) => (
                <li key={u._id}>
                  <button className="quick-btn" onClick={() => quickLogin(u)}>
                    <span>{u.name}</span>
                    <span className="muted small">{u.role === 'admin' ? 'Admin' : 'User'} {u.employeeId}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="fineprint">Sign-in is simulated for this assessment: there are no passwords and data stays in this browser.</p>
      </div>
    </main>
  );
}
