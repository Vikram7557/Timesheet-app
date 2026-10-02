// NOTE: there is intentionally NO function in this codebase that removes a task record.
// Deleting only sets isDeleted/deletedAt/deletedBy, so comments, hours and history survive.
import { readCollection, readMeta, commit } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { oneLine, throwFields, validateTaskInput } from '../utils/validators';
import { STATUSES, values } from '../constants';
import {
  resolveActor, requireAdmin, findAssignableUser, historyEntry, notificationEntry,
  buildReassign, loadTask, loadReadableTask, loadWorkableTask, replaceById, nowIso,
} from './common';

const sortNewest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');

export function listTasks(actor) {
  const me = resolveActor(actor);
  const tasks = readCollection('tasks').filter((t) => !t.isDeleted);
  return (me.role === 'admin' ? tasks : tasks.filter((t) => t.assigneeId === me._id)).sort(sortNewest);
}

export function listDeletedTasks(actor) {
  requireAdmin(actor);
  return readCollection('tasks')
    .filter((t) => t.isDeleted)
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

export function getTask(actor, taskId) {
  const me = resolveActor(actor);
  return loadReadableTask(me, taskId);
}

export function createTask(actor, input) {
  const admin = requireAdmin(actor);
  const data = validateTaskInput(input);
  const assignee = findAssignableUser(data.assigneeId);
  const meta = readMeta();
  const at = nowIso();
  const task = {
    _id: newId(),
    key: `TSK-${meta.nextTaskNumber}`,
    ...data,
    checklist: [],
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdBy: admin._id,
    createdAt: at,
    updatedAt: at,
  };
  commit({
    tasks: [...readCollection('tasks'), task],
    history: [
      ...readCollection('history'),
      historyEntry({ taskId: task._id, action: 'CREATED', by: admin._id, to: assignee._id, at }),
    ],
    notifications: [
      ...readCollection('notifications'),
      notificationEntry({ userId: assignee._id, taskId: task._id, type: 'ASSIGNED', message: `${task.key} "${task.title}" was assigned to you.`, at }),
    ],
    meta: { ...meta, nextTaskNumber: meta.nextTaskNumber + 1 },
  });
  return task;
}

const EDITABLE = ['title', 'description', 'startDate', 'endDate', 'priority', 'type', 'labels', 'estimatedHours', 'status'];

export function updateTask(actor, taskId, input) {
  const admin = requireAdmin(actor);
  const task = loadWorkableTask(admin, taskId);
  const data = validateTaskInput({ ...task, ...input }, { requireAssignee: false });
  const changed = EDITABLE.filter((f) => JSON.stringify(data[f]) !== JSON.stringify(task[f]));
  if (!changed.length) return task;

  const at = nowIso();
  const next = { ...task, updatedAt: at };
  for (const f of changed) next[f] = data[f];

  const entries = [];
  const others = changed.filter((f) => f !== 'status');
  if (others.length) entries.push(historyEntry({ taskId, action: 'UPDATED', by: admin._id, details: `Changed ${others.join(', ')}`, at }));
  if (changed.includes('status')) entries.push(historyEntry({ taskId, action: 'STATUS_CHANGED', by: admin._id, from: task.status, to: data.status, at }));

  commit({ tasks: replaceById(readCollection('tasks'), next), history: [...readCollection('history'), ...entries] });
  return next;
}

export function changeStatus(actor, taskId, status) {
  const me = resolveActor(actor);
  if (!values(STATUSES).includes(status)) throwFields({ status: 'Choose a valid status.' });
  const task = loadWorkableTask(me, taskId);
  if (task.status === status) return task;
  const at = nowIso();
  const next = { ...task, status, updatedAt: at };
  commit({
    tasks: replaceById(readCollection('tasks'), next),
    history: [...readCollection('history'), historyEntry({ taskId, action: 'STATUS_CHANGED', by: me._id, from: task.status, to: status, at })],
  });
  return next;
}

export function reassignTask(actor, taskId, newAssigneeId) {
  const admin = requireAdmin(actor);
  const task = loadWorkableTask(admin, taskId);
  const to = findAssignableUser(newAssigneeId);
  if (task.assigneeId === to._id) throw new AppError(ERR.CONFLICT, `This task is already assigned to ${to.name}.`);
  const r = buildReassign(task, to, admin, nowIso());
  commit({
    tasks: replaceById(readCollection('tasks'), r.task),
    history: [...readCollection('history'), ...r.history],
    notifications: [...readCollection('notifications'), ...r.notifications],
  });
  return r.task;
}

export function softDeleteTask(actor, taskId) {
  const admin = requireAdmin(actor);
  const task = loadTask(taskId);
  if (task.isDeleted) throw new AppError(ERR.CONFLICT, 'This task is already deleted.');
  const at = nowIso();
  const next = { ...task, isDeleted: true, deletedAt: at, deletedBy: admin._id, updatedAt: at };
  commit({
    tasks: replaceById(readCollection('tasks'), next),
    history: [...readCollection('history'), historyEntry({ taskId, action: 'DELETED', by: admin._id, at })],
    notifications: [
      ...readCollection('notifications'),
      notificationEntry({ userId: task.assigneeId, taskId, type: 'DELETED', message: `${task.key} "${task.title}" was removed by an admin.`, at }),
    ],
  });
  return next;
}

// Restores a deleted task. If the previous assignee is no longer active the admin must choose a new one.
export function restoreTask(actor, taskId, { assigneeId } = {}) {
  const admin = requireAdmin(actor);
  const task = loadTask(taskId);
  if (!task.isDeleted) throw new AppError(ERR.CONFLICT, 'This task is not deleted.');

  const users = readCollection('users');
  const previous = users.find((u) => u._id === task.assigneeId);
  const previousUsable = previous && previous.isActive && previous.role === 'user';
  const target = assigneeId || (previousUsable ? previous._id : null);
  if (!target) {
    throw new AppError(ERR.CONFLICT, 'The previous assignee is no longer active. Choose a new assignee to restore this task.', { reason: 'ASSIGNEE_INACTIVE' });
  }
  const to = findAssignableUser(target);

  const at = nowIso();
  let next = { ...task, isDeleted: false, deletedAt: null, deletedBy: null, updatedAt: at };
  const history = [historyEntry({ taskId, action: 'RESTORED', by: admin._id, at })];
  let notifications = [];
  if (to._id !== task.assigneeId) {
    const r = buildReassign(next, to, admin, at, 'Assignee chosen while restoring');
    next = r.task;
    history.push(...r.history);
    notifications = r.notifications;
  } else {
    notifications = [notificationEntry({ userId: to._id, taskId, type: 'RESTORED', message: `${task.key} "${task.title}" was restored.`, at })];
  }
  commit({
    tasks: replaceById(readCollection('tasks'), next),
    history: [...readCollection('history'), ...history],
    notifications: [...readCollection('notifications'), ...notifications],
  });
  return next;
}

// ---- Bulk actions: validate everything first, then write once (all-or-nothing) ----
function loadMany(taskIds) {
  if (!Array.isArray(taskIds) || !taskIds.length) throw new AppError(ERR.VALIDATION, 'Select at least one task.');
  const all = readCollection('tasks');
  return [...new Set(taskIds)].map((id) => {
    const t = all.find((x) => x._id === id);
    if (!t) throw new AppError(ERR.NOT_FOUND, 'One of the selected tasks no longer exists. Nothing was changed.');
    if (t.isDeleted) throw new AppError(ERR.CONFLICT, `${t.key} is already deleted. Nothing was changed.`);
    return t;
  });
}

export function bulkReassign(actor, taskIds, newAssigneeId) {
  const admin = requireAdmin(actor);
  const tasks = loadMany(taskIds);
  const to = findAssignableUser(newAssigneeId);
  const at = nowIso();
  let all = readCollection('tasks');
  const history = [];
  const notifications = [];
  let count = 0;
  for (const t of tasks) {
    if (t.assigneeId === to._id) continue;
    const r = buildReassign(t, to, admin, at);
    all = replaceById(all, r.task);
    history.push(...r.history);
    notifications.push(...r.notifications);
    count++;
  }
  if (!count) throw new AppError(ERR.CONFLICT, `All selected tasks are already assigned to ${to.name}.`);
  commit({
    tasks: all,
    history: [...readCollection('history'), ...history],
    notifications: [...readCollection('notifications'), ...notifications],
  });
  return { updated: count };
}

export function bulkSoftDelete(actor, taskIds) {
  const admin = requireAdmin(actor);
  const tasks = loadMany(taskIds);
  const at = nowIso();
  let all = readCollection('tasks');
  const history = [];
  const notifications = [];
  for (const t of tasks) {
    all = replaceById(all, { ...t, isDeleted: true, deletedAt: at, deletedBy: admin._id, updatedAt: at });
    history.push(historyEntry({ taskId: t._id, action: 'DELETED', by: admin._id, at }));
    notifications.push(notificationEntry({ userId: t.assigneeId, taskId: t._id, type: 'DELETED', message: `${t.key} "${t.title}" was removed by an admin.`, at }));
  }
  commit({
    tasks: all,
    history: [...readCollection('history'), ...history],
    notifications: [...readCollection('notifications'), ...notifications],
  });
  return { updated: tasks.length };
}

// ---- Checklist (sub-tasks) ----
function mutateChecklist(actor, taskId, fn) {
  const me = resolveActor(actor);
  const task = loadWorkableTask(me, taskId);
  const checklist = fn([...(task.checklist || [])]);
  const next = { ...task, checklist, updatedAt: nowIso() };
  commit({ tasks: replaceById(readCollection('tasks'), next) });
  return next;
}

export function addChecklistItem(actor, taskId, text) {
  const t = oneLine(text);
  if (!t) throwFields({ checklist: 'Enter the checklist item.' });
  if (t.length > 120) throwFields({ checklist: 'Checklist items must be 120 characters or fewer.' });
  return mutateChecklist(actor, taskId, (list) => {
    if (list.length >= 30) throw new AppError(ERR.VALIDATION, 'A task can have at most 30 checklist items.');
    list.push({ id: newId(), text: t, done: false });
    return list;
  });
}

export function toggleChecklistItem(actor, taskId, itemId) {
  return mutateChecklist(actor, taskId, (list) => {
    const item = list.find((i) => i.id === itemId);
    if (!item) throw new AppError(ERR.NOT_FOUND, 'That checklist item no longer exists.');
    return list.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i));
  });
}

export function removeChecklistItem(actor, taskId, itemId) {
  return mutateChecklist(actor, taskId, (list) => {
    if (!list.some((i) => i.id === itemId)) throw new AppError(ERR.NOT_FOUND, 'That checklist item no longer exists.');
    return list.filter((i) => i.id !== itemId);
  });
}
