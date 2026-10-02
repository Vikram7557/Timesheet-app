import { useEffect, useMemo, useState } from 'react';
import { StatusBadge, PriorityBadge, TypeBadge, KeyChip, Empty, Pagination, UserName, fmtHours } from './ui';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAction } from '../hooks/useAction';
import { bulkReassign, bulkSoftDelete } from '../services/taskService';
import { STATUSES, PRIORITIES, TYPES, PAGE_SIZE } from '../constants';
import { formatShort, isOverdue } from '../utils/dates';

const INITIAL = { q: '', status: '', priority: '', type: '', assignee: '', overdue: false, from: '', to: '' };
const PRIO_RANK = { high: 0, medium: 1, low: 2 };
const STATUS_RANK = { in_progress: 0, todo: 1, done: 2 };

const SORTS = {
  newest: { label: 'Newest first', fn: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') },
  due: { label: 'Due date (soonest)', fn: (a, b) => a.endDate.localeCompare(b.endDate) || a.key.localeCompare(b.key) },
  priority: { label: 'Priority (high first)', fn: (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.endDate.localeCompare(b.endDate) },
  status: { label: 'Status', fn: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] },
  title: { label: 'Title (A-Z)', fn: (a, b) => a.title.localeCompare(b.title) },
};

// Filters + sort + pagination run client-side over the tasks the service already scoped to this user.
export default function TaskList({ tasks, users, isAdmin, onOpen }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [f, setF] = useState(INITIAL);
  const [sort, setSort] = useState(isAdmin ? 'newest' : 'due');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [bulkTo, setBulkTo] = useState('');

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);
  const assignable = useMemo(() => users.filter((u) => u.isActive && u.role === 'user'), [users]);
  const setField = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (q) {
          const hay = `${t.key} ${t.title} ${t.description} ${t.labels.join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (f.status && t.status !== f.status) return false;
        if (f.priority && t.priority !== f.priority) return false;
        if (f.type && t.type !== f.type) return false;
        if (f.assignee && t.assigneeId !== f.assignee) return false;
        if (f.overdue && !isOverdue(t)) return false;
        if (f.from && t.endDate < f.from) return false;
        if (f.to && t.startDate > f.to) return false;
        return true;
      })
      .sort(SORTS[sort].fn);
  }, [tasks, f, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersActive = JSON.stringify(f) !== JSON.stringify(INITIAL);

  useEffect(() => setPage(1), [f, sort]);
  useEffect(() => {
    setSelected((s) => {
      const next = s.filter((id) => tasks.some((t) => t._id === id));
      return next.length === s.length ? s : next;
    });
  }, [tasks]);

  const pageIds = rows.map((t) => t._id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const togglePage = () => setSelected((s) => (allOnPage ? s.filter((id) => !pageIds.includes(id)) : [...new Set([...s, ...pageIds])]));

  async function doBulkReassign() {
    if (!bulkTo) return;
    const to = userMap[bulkTo];
    const ok = await confirm({
      title: 'Reassign tasks',
      message: `Reassign ${selected.length} task${selected.length === 1 ? '' : 's'} to ${to?.name}?\nHours already logged stay with the previous assignee.`,
      confirmLabel: 'Reassign',
    });
    if (!ok) return;
    const res = await run(() => bulkReassign(user, selected, bulkTo), null);
    if (res.ok) {
      setSelected([]);
      setBulkTo('');
    }
  }
  async function doBulkDelete() {
    const ok = await confirm({
      title: 'Delete tasks',
      message: `Move ${selected.length} task${selected.length === 1 ? '' : 's'} to Deleted?\nComments and hours are kept and you can restore them at any time.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await run(() => bulkSoftDelete(user, selected), null);
    if (res.ok) setSelected([]);
  }

  return (
    <div>
      <div className="filters">
        <input type="search" placeholder="Search key, title, label" aria-label="Search tasks" value={f.q} onChange={setField('q')} />
        <select aria-label="Filter by status" value={f.status} onChange={setField('status')}>
          <option value="">All statuses</option>
          {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Filter by priority" value={f.priority} onChange={setField('priority')}>
          <option value="">All priorities</option>
          {PRIORITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Filter by type" value={f.type} onChange={setField('type')}>
          <option value="">All types</option>
          {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isAdmin && (
          <select aria-label="Filter by assignee" value={f.assignee} onChange={setField('assignee')}>
            <option value="">All assignees</option>
            {users.filter((u) => u.role === 'user').map((u) => (
              <option key={u._id} value={u._id}>{u.name}{u.isActive ? '' : ' (removed)'}</option>
            ))}
          </select>
        )}
        <label className="inline-field">
          <span>Active from</span>
          <input type="date" value={f.from} onChange={setField('from')} />
        </label>
        <label className="inline-field">
          <span>to</span>
          <input type="date" value={f.to} min={f.from || undefined} onChange={setField('to')} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.overdue} onChange={setField('overdue')} /> Overdue only
        </label>
        <select aria-label="Sort tasks" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </select>
        {filtersActive && <button className="btn btn-small" onClick={() => setF(INITIAL)}>Clear filters</button>}
      </div>

      {isAdmin && selected.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <select aria-label="Reassign selected to" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)}>
            <option value="">Reassign to...</option>
            {assignable.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
          <button className="btn btn-small" disabled={!bulkTo || busy} onClick={doBulkReassign}>Reassign</button>
          <button className="btn btn-small btn-danger" disabled={busy} onClick={doBulkDelete}>Delete selected</button>
          <button className="btn btn-small btn-quiet" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <Empty title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match these filters'}>
          {tasks.length === 0 ? (isAdmin ? 'Create the first task with "New task".' : 'Tasks assigned to you will appear here.') : 'Try clearing a filter.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                {isAdmin && (
                  <th className="col-check">
                    <input type="checkbox" aria-label="Select all tasks on this page" checked={allOnPage} onChange={togglePage} />
                  </th>
                )}
                <th>Task</th>
                {isAdmin && <th>Assignee</th>}
                <th>Status</th>
                <th>Priority</th>
                <th>Schedule</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const late = isOverdue(t);
                return (
                  <tr key={t._id} className={late ? 'row-overdue' : ''}>
                    {isAdmin && (
                      <td className="col-check">
                        <input type="checkbox" aria-label={`Select ${t.key}`} checked={selected.includes(t._id)} onChange={() => toggle(t._id)} />
                      </td>
                    )}
                    <td data-label="Task">
                      <div className="task-cell">
                        <KeyChip>{t.key}</KeyChip>
                        <button type="button" className="link" onClick={() => onOpen(t._id)}>{t.title}</button>
                      </div>
                      <div className="task-sub">
                        <TypeBadge value={t.type} />
                        {t.labels.map((l) => <span key={l} className="tag">{l}</span>)}
                        {t.checklist?.length > 0 && <span className="muted small">{t.checklist.filter((c) => c.done).length}/{t.checklist.length} steps</span>}
                      </div>
                    </td>
                    {isAdmin && <td data-label="Assignee"><UserName map={userMap} id={t.assigneeId} /></td>}
                    <td data-label="Status"><StatusBadge value={t.status} /></td>
                    <td data-label="Priority"><PriorityBadge value={t.priority} /></td>
                    <td data-label="Schedule" className="nowrap">
                      {formatShort(t.startDate)} to {formatShort(t.endDate)}
                      {late && <span className="badge badge-late">Overdue</span>}
                    </td>
                    <td data-label="Hours" className="num nowrap">
                      {fmtHours(t.actualHours)}
                      {t.estimatedHours != null && <span className="muted"> / {fmtHours(t.estimatedHours)}</span>}
                      {t.estimatedHours > 0 && t.actualHours > t.estimatedHours && <span className="badge badge-late">Over</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={safePage} pageCount={pageCount} total={filtered.length} onPage={setPage} />
    </div>
  );
}
