import { readCollection, commit } from '../repository/storage';
import { today, diffDays } from '../utils/dates';
import { resolveActor, notificationEntry } from './common';

export function listNotifications(actor) {
  const me = resolveActor(actor);
  return readCollection('notifications')
    .filter((n) => n.userId === me._id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
}

export function markRead(actor, id) {
  const me = resolveActor(actor);
  const all = readCollection('notifications');
  if (!all.some((n) => n._id === id && n.userId === me._id && !n.read)) return;
  commit({ notifications: all.map((n) => (n._id === id && n.userId === me._id ? { ...n, read: true } : n)) });
}

export function markAllRead(actor) {
  const me = resolveActor(actor);
  const all = readCollection('notifications');
  if (!all.some((n) => n.userId === me._id && !n.read)) return;
  commit({ notifications: all.map((n) => (n.userId === me._id ? { ...n, read: true } : n)) });
}

// Creates "due soon" / "overdue" reminders on load (there is no server clock). Idempotent via dedupeKey.
export function syncDueSoon(actor) {
  const me = resolveActor(actor);
  if (me.role !== 'user') return 0;
  const all = readCollection('notifications');
  const have = new Set(all.filter((n) => n.userId === me._id && n.dedupeKey).map((n) => n.dedupeKey));
  const t = today();
  const created = [];
  for (const task of readCollection('tasks')) {
    if (task.assigneeId !== me._id || task.isDeleted || task.status === 'done') continue;
    const days = diffDays(t, task.endDate);
    let key = null;
    let message = null;
    if (days < 0) {
      key = `overdue:${task._id}:${task.endDate}`;
      message = `${task.key} "${task.title}" is overdue.`;
    } else if (days <= 2) {
      key = `due:${task._id}:${task.endDate}`;
      message = `${task.key} "${task.title}" is due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in 2 days'}.`;
    }
    if (key && !have.has(key)) {
      created.push(notificationEntry({ userId: me._id, taskId: task._id, type: days < 0 ? 'OVERDUE' : 'DUE_SOON', message, dedupeKey: key }));
      have.add(key);
    }
  }
  if (created.length) commit({ notifications: [...all, ...created] });
  return created.length;
}
