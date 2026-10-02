import { useState } from 'react';
import Modal from './Modal';
import { Empty, Field } from './ui';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useQuery';
import { createUser, deactivateUser, reactivateUser, listAllUsers, countOpenTasks, countOpenTasksByAssignee } from '../services/userService';
import { ROLES, labelOf } from '../constants';

export default function UsersTab() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const { data: users } = useQuery(() => listAllUsers(me), [me._id], []);
  const { data: openCounts } = useQuery(() => countOpenTasksByAssignee(me), [me._id], {});
  const [form, setForm] = useState({ name: '', employeeId: '', role: 'user' });
  const [errors, setErrors] = useState({});
  const [reassign, setReassign] = useState(null); // user being removed while holding open tasks
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function add(e) {
    e.preventDefault();
    const res = await run(() => createUser(me, form), 'User added', { inline: true });
    if (res.ok) { setForm({ name: '', employeeId: '', role: 'user' }); setErrors({}); }
    else if (res.error?.details?.fields) setErrors(res.error.details.fields);
  }

  async function confirmRemoval(u) {
    if (u.role === 'admin') {
      const first = await confirm({
        title: 'Remove an admin?',
        message: `${u.name} (${u.employeeId}) is an Admin, with the same access as you.\nRemoving them only deactivates the account (they can be reactivated later), but they will lose all admin rights immediately.\nThis needs a second confirmation so admins are not removed by accident.`,
        confirmLabel: 'Continue',
        danger: true,
      });
      if (!first) return false;
    }
    return confirm({
      title: u.role === 'admin' ? 'Confirm remove admin' : 'Remove user',
      message: `Remove ${u.name} (${u.employeeId})?\nThey can no longer sign in or receive tasks. Their comments, hours and history are kept, and you can reactivate them later.`,
      confirmLabel: u.role === 'admin' ? 'Remove admin' : 'Remove user',
      danger: true,
    });
  }

  async function remove(u) {
    let open = 0;
    try { open = countOpenTasks(me, u._id); } catch { open = 0; }
    if (open > 0) { setReassign({ user: u, open }); return; }
    const ok = await confirmRemoval(u);
    if (ok) await run(() => deactivateUser(me, u._id, { confirmAdminRemoval: u.role === 'admin' }), `${u.name} removed`);
  }

  const active = users.filter((u) => u.isActive);
  const removed = users.filter((u) => !u.isActive);

  return (
    <div className="stack-lg">
      <section>
        <h3>Add a user</h3>
        <form className="form-inline" onSubmit={add} noValidate>
          <Field label="Full name" error={errors.name}><input value={form.name} onChange={set('name')} maxLength={70} /></Field>
          <Field label="Employee ID" error={errors.employeeId}><input value={form.employeeId} onChange={set('employeeId')} maxLength={20} placeholder="e.g. EMP110" /></Field>
          <Field label="Role" error={errors.role}>
            <select value={form.role} onChange={set('role')}>{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
          </Field>
          <button className="btn btn-primary" type="submit" disabled={busy}>Add user</button>
        </form>
      </section>

      <section>
        <h3>Team ({active.length})</h3>
        {active.length === 0 ? <Empty title="No active users" /> : (
          <div className="table-wrap">
            <table className="table table-cards">
              <thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th className="num">Open tasks</th><th /></tr></thead>
              <tbody>
                {active.map((u) => (
                  <tr key={u._id}>
                    <td data-label="Name">{u.name}{u._id === me._id && <span className="tag">you</span>}</td>
                    <td data-label="Employee ID" className="mono">{u.employeeId}</td>
                    <td data-label="Role">{labelOf(ROLES, u.role)}</td>
                    <td data-label="Open tasks" className="num">{u.role === 'user' ? openCounts[u._id] || 0 : '-'}</td>
                    <td className="actions">
                      {u._id !== me._id && (
                        <button type="button" className="btn btn-small btn-danger-quiet" disabled={busy} onClick={() => remove(u)}>
                          {u.role === 'admin' ? 'Remove admin' : 'Remove'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {removed.length > 0 && (
        <section>
          <h3>Removed users ({removed.length})</h3>
          <div className="table-wrap">
            <table className="table table-cards">
              <thead><tr><th>Name</th><th>Employee ID</th><th>Role</th><th /></tr></thead>
              <tbody>
                {removed.map((u) => (
                  <tr key={u._id}>
                    <td data-label="Name">{u.name}</td><td data-label="Employee ID" className="mono">{u.employeeId}</td><td data-label="Role">{labelOf(ROLES, u.role)}</td>
                    <td className="actions"><button type="button" className="btn btn-small" disabled={busy} onClick={() => run(() => reactivateUser(me, u._id), `${u.name} reactivated`)}>Reactivate</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {reassign && <ReassignBeforeRemove target={reassign.user} open={reassign.open} users={active} onClose={() => setReassign(null)} />}
    </div>
  );
}

function ReassignBeforeRemove({ target, open, users, onClose }) {
  const { user: me } = useAuth();
  const [run, busy] = useAction();
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const options = users.filter((u) => u.role === 'user' && u._id !== target._id);

  async function submit() {
    if (!to) { setError('Choose who takes over these tasks.'); return; }
    const res = await run(
      () => deactivateUser(me, target._id, { reassignTo: to, confirmAdminRemoval: target.role === 'admin' }),
      `${target.name} removed and ${open} task${open === 1 ? '' : 's'} reassigned`,
      { inline: true },
    );
    if (res.ok) onClose();
    else if (res.error?.details?.fields) setError(Object.values(res.error.details.fields)[0]);
  }
  return (
    <Modal title={`Remove ${target.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={submit} disabled={busy}>Reassign and remove</button></>}>
      <p>{target.name} has <strong>{open}</strong> open task{open === 1 ? '' : 's'}. They will be reassigned first, then {target.name} is removed. Hours already logged stay with {target.name}.</p>
      <Field label="Reassign open tasks to" error={error}>
        <select value={to} onChange={(e) => { setTo(e.target.value); setError(''); }}>
          <option value="">Choose a user</option>
          {options.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.employeeId})</option>)}
        </select>
      </Field>
    </Modal>
  );
}
