import { useMemo, useState } from 'react';
import Modal from './Modal';
import TaskForm from './TaskForm';
import RestoreDialog from './RestoreDialog';
import { StatusBadge, PriorityBadge, TypeBadge, KeyChip, Empty, Field, UserName, fmtHours } from './ui';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useQuery';
import * as taskSvc from '../services/taskService';
import * as commentSvc from '../services/commentService';
import * as logSvc from '../services/timeLogService';
import { listHistory } from '../services/historyService';
import { listAllUsers, listAssignableUsers } from '../services/userService';
import { STATUSES, labelOf } from '../constants';
import { errorMessage } from '../utils/errors';
import { formatDate, formatDateTime, isOverdue, today } from '../utils/dates';

export default function TaskDetail({ taskId, onClose }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [tab, setTab] = useState('comments');
  const [reassignTo, setReassignTo] = useState('');

  const { data: task, error } = useQuery(() => taskSvc.getTask(user, taskId), [taskId, user._id], null);
  const { data: users } = useQuery(() => listAllUsers(user), [user._id], []);
  const { data: assignees } = useQuery(() => (isAdmin ? listAssignableUsers(user) : []), [user._id], []);
  const { data: comments } = useQuery(() => commentSvc.listComments(user, taskId), [taskId, user._id], []);
  const { data: logs } = useQuery(() => logSvc.listTimeLogs(user, taskId), [taskId, user._id], []);
  const { data: history } = useQuery(() => listHistory(user, taskId), [taskId, user._id], []);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  if (error || !task) {
    return (
      <Modal title="Task unavailable" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
        <p>{error ? errorMessage(error) : 'This task is no longer available.'}</p>
      </Modal>
    );
  }

  const deleted = task.isDeleted;
  const isAssignee = task.assigneeId === user._id;
  const canWork = !deleted && (isAdmin || isAssignee);
  const canParticipate = !deleted && !isAdmin && isAssignee; // comments and hours
  const actual = Math.round(logs.reduce((s, l) => s + l.hours, 0) * 100) / 100;
  const late = isOverdue(task);
  const done = task.checklist.filter((c) => c.done).length;

  async function onStatus(e) {
    await run(() => taskSvc.changeStatus(user, task._id, e.target.value), 'Status updated');
  }
  async function onReassign() {
    if (!reassignTo) return;
    const to = userMap[reassignTo];
    const ok = await confirm({
      title: 'Reassign task',
      message: `Reassign ${task.key} to ${to?.name}?\nHours already logged stay with ${userMap[task.assigneeId]?.name ?? 'the previous assignee'}.`,
      confirmLabel: 'Reassign',
    });
    if (!ok) return;
    const res = await run(() => taskSvc.reassignTask(user, task._id, reassignTo), `Reassigned to ${to?.name}`);
    if (res.ok) setReassignTo('');
  }
  async function onDelete() {
    const ok = await confirm({
      title: 'Delete task',
      message: `Delete ${task.key} "${task.title}"?\nIt moves to the Deleted view. Comments and hours are kept, and you can restore it at any time.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await run(() => taskSvc.softDeleteTask(user, task._id), `${task.key} moved to Deleted`);
    if (res.ok) onClose();
  }

  return (
    <>
      <Modal title={task.key} onClose={onClose} wide>
        <div className="detail-head">
          <KeyChip>{task.key}</KeyChip>
          <h3>{task.title}</h3>
          <div className="row wrap">
            <TypeBadge value={task.type} />
            <PriorityBadge value={task.priority} />
            {late && <span className="badge badge-late">Overdue</span>}
            {deleted && <span className="badge badge-deleted">Deleted</span>}
            {task.labels.map((l) => <span key={l} className="tag">{l}</span>)}
          </div>
        </div>

        {deleted && (
          <div className="notice">
            Deleted on {formatDateTime(task.deletedAt)} by <UserName map={userMap} id={task.deletedBy} />. It is read-only until restored.
            {isAdmin && <button className="btn btn-small btn-primary" onClick={() => setRestoring(true)}>Restore</button>}
          </div>
        )}

        <dl className="meta">
          <div><dt>Assignee</dt><dd><UserName map={userMap} id={task.assigneeId} /></dd></div>
          <div><dt>Start</dt><dd>{formatDate(task.startDate)}</dd></div>
          <div><dt>End</dt><dd>{formatDate(task.endDate)}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>
              {canWork ? (
                <select aria-label="Status" value={task.status} onChange={onStatus} disabled={busy}>
                  {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : <StatusBadge value={task.status} />}
            </dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>
              {fmtHours(actual)} logged{task.estimatedHours != null && <span className="muted"> of {fmtHours(task.estimatedHours)} estimated</span>}
              {task.estimatedHours > 0 && (
                <span className="meter" aria-hidden="true">
                  <span className={actual > task.estimatedHours ? 'over' : ''} style={{ width: `${Math.min(100, (actual / task.estimatedHours) * 100)}%` }} />
                </span>
              )}
            </dd>
          </div>
          <div><dt>Created</dt><dd>{formatDateTime(task.createdAt)}</dd></div>
        </dl>

        {task.description && <p className="desc pre-wrap">{task.description}</p>}

        {isAdmin && !deleted && (
          <div className="admin-actions">
            <button className="btn btn-small" onClick={() => setEditing(true)}>Edit details</button>
            <span className="row">
              <select aria-label="Reassign to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                <option value="">Reassign to...</option>
                {assignees.filter((u) => u._id !== task.assigneeId).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
              <button className="btn btn-small" disabled={!reassignTo || busy} onClick={onReassign}>Reassign</button>
            </span>
            <button className="btn btn-small btn-danger" onClick={onDelete} disabled={busy}>Delete task</button>
          </div>
        )}

        <Checklist task={task} canWork={canWork} done={done} />

        <div className="tabs tabs-inner" role="tablist">
          {[['comments', `Comments (${comments.length})`], ['hours', `Hours (${logs.length})`], ['activity', `Activity (${history.length})`]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab active' : 'tab'} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'comments' && <Comments task={task} comments={comments} userMap={userMap} canAdd={canParticipate} />}
        {tab === 'hours' && <Hours task={task} logs={logs} userMap={userMap} canAdd={canParticipate} />}
        {tab === 'activity' && <Activity history={history} userMap={userMap} />}
      </Modal>
      {editing && <TaskForm task={task} onClose={() => setEditing(false)} />}
      {restoring && <RestoreDialog task={task} onClose={() => setRestoring(false)} />}
    </>
  );
}

function Checklist({ task, canWork, done }) {
  const { user } = useAuth();
  const [run, busy] = useAction();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  if (!canWork && task.checklist.length === 0) return null;

  async function add(e) {
    e.preventDefault();
    const res = await run(() => taskSvc.addChecklistItem(user, task._id, text), null, { inline: true });
    if (res.ok) { setText(''); setError(''); }
    else if (res.error?.details?.fields) setError(Object.values(res.error.details.fields)[0]);
  }
  return (
    <section className="section">
      <h4>Checklist {task.checklist.length > 0 && <span className="muted">{done}/{task.checklist.length}</span>}</h4>
      <ul className="checklist">
        {task.checklist.map((c) => (
          <li key={c.id}>
            <label className="check">
              <input type="checkbox" checked={c.done} disabled={!canWork || busy} onChange={() => run(() => taskSvc.toggleChecklistItem(user, task._id, c.id), null)} />
              <span className={c.done ? 'struck' : ''}>{c.text}</span>
            </label>
            {canWork && <button className="icon-btn" aria-label={`Remove "${c.text}"`} disabled={busy} onClick={() => run(() => taskSvc.removeChecklistItem(user, task._id, c.id), null)}>×</button>}
          </li>
        ))}
      </ul>
      {canWork && (
        <form className="inline-form" onSubmit={add} noValidate>
          <input aria-label="New checklist item" placeholder="Add a step" value={text} maxLength={130} onChange={(e) => { setText(e.target.value); setError(''); }} />
          <button className="btn btn-small" type="submit" disabled={busy}>Add</button>
          {error && <span className="field-error" role="alert">{error}</span>}
        </form>
      )}
    </section>
  );
}

function Comments({ task, comments, userMap, canAdd }) {
  const { user } = useAuth();
  const [run, busy] = useAction();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  async function add(e) {
    e.preventDefault();
    const res = await run(() => commentSvc.addComment(user, task._id, text), 'Comment added', { inline: true });
    if (res.ok) { setText(''); setError(''); }
    else if (res.error?.details?.fields) setError(res.error.details.fields.text);
  }
  async function saveEdit(id) {
    const res = await run(() => commentSvc.editComment(user, id, editText), 'Comment updated', { inline: true });
    if (res.ok) setEditId(null);
    else if (res.error?.details?.fields) setError(res.error.details.fields.text);
  }

  return (
    <section>
      {comments.length === 0 ? <Empty title="No comments yet">{canAdd ? 'Add a progress update below.' : 'Progress updates from the assignee appear here.'}</Empty> : (
        <ul className="feed">
          {comments.map((c) => (
            <li key={c._id}>
              <div className="feed-head">
                <strong><UserName map={userMap} id={c.userId} /></strong>
                <span className="muted small">{formatDateTime(c.createdAt)}</span>
                {c.edited && <span className="tag" title={`${c.editHistory.length} earlier version(s) kept`}>edited</span>}
                {!task.isDeleted && c.userId === user._id && editId !== c._id && (
                  <button className="link small" onClick={() => { setEditId(c._id); setEditText(c.text); setError(''); }}>Edit</button>
                )}
              </div>
              {editId === c._id ? (
                <div>
                  <textarea rows={3} value={editText} maxLength={1000} onChange={(e) => setEditText(e.target.value)} aria-label="Edit comment" />
                  {error && <span className="field-error" role="alert">{error}</span>}
                  <div className="row">
                    <button className="btn btn-small btn-primary" disabled={busy} onClick={() => saveEdit(c._id)}>Save</button>
                    <button className="btn btn-small" onClick={() => { setEditId(null); setError(''); }}>Cancel</button>
                  </div>
                </div>
              ) : <p className="pre-wrap">{c.text}</p>}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form onSubmit={add} noValidate className="stack">
          <Field label="Progress update" error={error}>
            <textarea rows={3} value={text} maxLength={1000} placeholder="What did you get done?" onChange={(e) => { setText(e.target.value); setError(''); }} />
          </Field>
          <div className="row"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Posting...' : 'Post comment'}</button><span className="muted small">{text.length}/1000</span></div>
        </form>
      )}
    </section>
  );
}

function Hours({ task, logs, userMap, canAdd }) {
  const { user } = useAuth();
  const [run, busy] = useAction();
  const [form, setForm] = useState({ hours: '', workDate: today(), note: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function add(e) {
    e.preventDefault();
    const res = await run(() => logSvc.addTimeLog(user, task._id, form), 'Hours logged', { inline: true });
    if (res.ok) { setForm({ hours: '', workDate: form.workDate, note: '' }); setErrors({}); }
    else if (res.error?.details?.fields) setErrors(res.error.details.fields);
  }

  return (
    <section>
      {logs.length === 0 ? <Empty title="No hours logged yet">{canAdd ? 'Log the time you spend on this task below.' : 'Time entries appear here.'}</Empty> : (
        <div className="table-wrap">
          <table className="table table-compact table-cards">
            <thead><tr><th>Date</th><th>Person</th><th>Note</th><th className="num">Hours</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td data-label="Date" className="nowrap">{formatDate(l.workDate)}</td>
                  <td data-label="Person"><UserName map={userMap} id={l.userId} /></td>
                  <td data-label="Note">{l.note || <span className="muted">-</span>}</td>
                  <td data-label="Hours" className="num">{fmtHours(l.hours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>Total</td><td className="num">{fmtHours(logs.reduce((s, l) => s + l.hours, 0))}</td></tr></tfoot>
          </table>
        </div>
      )}
      {canAdd && (
        <form onSubmit={add} noValidate className="form-grid hours-form">
          <Field label="Hours" error={errors.hours}>
            <input inputMode="decimal" placeholder="e.g. 1.5" value={form.hours} onChange={set('hours')} />
          </Field>
          <Field label="Date worked" error={errors.workDate}>
            <input type="date" max={today()} value={form.workDate} onChange={set('workDate')} />
          </Field>
          <div className="span-2">
            <Field label="Note" error={errors.note} hint="Optional">
              <input value={form.note} maxLength={200} onChange={set('note')} />
            </Field>
          </div>
          <div className="span-2"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Log hours'}</button></div>
        </form>
      )}
    </section>
  );
}

function Activity({ history, userMap }) {
  const name = (id) => userMap[id]?.name ?? 'Unknown user';
  const text = (h) => {
    switch (h.action) {
      case 'CREATED': return `created the task and assigned it to ${name(h.to)}`;
      case 'UPDATED': return h.details || 'updated the task';
      case 'STATUS_CHANGED': return `changed status from ${labelOf(STATUSES, h.from)} to ${labelOf(STATUSES, h.to)}`;
      case 'REASSIGNED': return `reassigned from ${name(h.from)} to ${name(h.to)}${h.details ? ` (${h.details})` : ''}`;
      case 'DELETED': return 'moved the task to Deleted';
      case 'RESTORED': return 'restored the task';
      default: return h.action;
    }
  };
  if (!history.length) return <Empty title="No activity yet" />;
  return (
    <ul className="feed">
      {history.map((h) => (
        <li key={h._id}>
          <div className="feed-head"><strong>{name(h.by)}</strong><span className="muted small">{formatDateTime(h.at)}</span></div>
          <p>{text(h)}</p>
        </li>
      ))}
    </ul>
  );
}
