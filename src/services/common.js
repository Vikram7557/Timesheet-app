// Shared helpers for the service layer. Every exported service function starts by calling
// resolveActor()/requireAdmin(), which re-reads the user from storage, so a stale or tampered
// "current user" object in the UI can never grant extra rights.
import { readCollection } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { throwFields } from '../utils/validators';

export const nowIso = () => new Date().toISOString();

export function resolveActor(actor) {
  const id = actor && actor._id;
  if (!id) throw new AppError(ERR.FORBIDDEN, 'Please sign in to continue.');
  const user = readCollection('users').find((u) => u._id === id);
  if (!user || !user.isActive) {
    throw new AppError(ERR.FORBIDDEN, 'Your account is not active. Please sign in again.');
  }
  return user;
}

export function requireAdmin(actor) {
  const user = resolveActor(actor);
  if (user.role !== 'admin') throw new AppError(ERR.FORBIDDEN, 'Only admins can do this.');
  return user;
}

// An assignee must exist, be active, and have the "user" role.
export function findAssignableUser(id) {
  const u = readCollection('users').find((x) => x._id === id);
  if (!u) throwFields({ assigneeId: 'The selected assignee does not exist.' });
  if (!u.isActive) throwFields({ assigneeId: `${u.name} has been removed and cannot be assigned tasks.` });
  if (u.role !== 'user') throwFields({ assigneeId: 'Tasks can only be assigned to users with the User role.' });
  return u;
}

export function historyEntry({ taskId, action, by, from = null, to = null, details = null, at }) {
  return { _id: newId(), taskId, action, by, from, to, details, at: at || nowIso() };
}

export function notificationEntry({ userId, taskId = null, type, message, dedupeKey = null, at }) {
  return { _id: newId(), userId, taskId, type, message, dedupeKey, read: false, createdAt: at || nowIso() };
}

export const replaceById = (list, next) => list.map((x) => (x._id === next._id ? next : x));

export function loadTask(taskId) {
  const t = readCollection('tasks').find((x) => x._id === taskId);
  if (!t) throw new AppError(ERR.NOT_FOUND, 'This task no longer exists.');
  return t;
}

// Read access: admins see everything (including deleted); users only their own active tasks.
export function loadReadableTask(user, taskId) {
  const task = loadTask(taskId);
  if (user.role === 'admin') return task;
  if (task.isDeleted || task.assigneeId !== user._id) {
    throw new AppError(ERR.NOT_FOUND, 'This task is no longer available to you.');
  }
  return task;
}

// Write access on an active task. assigneeOnly = only the person it is assigned to (comments, hours).
export function loadWorkableTask(user, taskId, { assigneeOnly = false } = {}) {
  const task = loadTask(taskId);
  if (task.isDeleted) throw new AppError(ERR.NOT_FOUND, 'This task has been deleted and can no longer be changed.');
  if (user.role === 'admin') {
    if (assigneeOnly) throw new AppError(ERR.FORBIDDEN, 'Only the assigned user can do this.');
    return task;
  }
  if (task.assigneeId !== user._id) throw new AppError(ERR.FORBIDDEN, 'This task is no longer assigned to you.');
  return task;
}

// Builds the updated task + audit entry + notifications for a reassignment (does not write).
export function buildReassign(task, toUser, byUser, at, note = null) {
  const next = { ...task, assigneeId: toUser._id, updatedAt: at };
  const history = [
    historyEntry({ taskId: task._id, action: 'REASSIGNED', by: byUser._id, from: task.assigneeId, to: toUser._id, details: note, at }),
  ];
  const notifications = [
    notificationEntry({ userId: toUser._id, taskId: task._id, type: 'ASSIGNED', message: `${task.key} "${task.title}" was assigned to you.`, at }),
  ];
  if (task.assigneeId && task.assigneeId !== toUser._id) {
    notifications.push(
      notificationEntry({ userId: task.assigneeId, taskId: task._id, type: 'UNASSIGNED', message: `${task.key} "${task.title}" was reassigned to someone else.`, at }),
    );
  }
  return { task: next, history, notifications };
}
