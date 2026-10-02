import { readAllData, commit, COLLECTIONS, SCHEMA_VERSION } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { isValidDateStr } from '../utils/dates';
import { STATUSES, PRIORITIES, TYPES, ROLES, values } from '../constants';
import { requireAdmin, nowIso } from './common';

const MAX_BYTES = 4 * 1024 * 1024;

export function exportBackup(actor) {
  requireAdmin(actor);
  return JSON.stringify({ app: 'tasklog', schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), data: readAllData() }, null, 2);
}

const bad = (msg) => {
  throw new AppError(ERR.VALIDATION, `This backup cannot be restored: ${msg} Nothing was changed.`);
};
const isStr = (v) => typeof v === 'string' && v.length > 0;

function validateBackup(payload) {
  if (!payload || typeof payload !== 'object' || payload.app !== 'tasklog') bad('it is not a Tasklog backup file.');
  if (payload.schemaVersion !== SCHEMA_VERSION) bad(`schema version ${payload.schemaVersion} is not supported.`);
  const d = payload.data;
  if (!d || typeof d !== 'object') bad('the data section is missing.');
  for (const c of COLLECTIONS) if (!Array.isArray(d[c])) bad(`"${c}" is missing or not a list.`);
  if (!d.meta || !Number.isInteger(d.meta.nextTaskNumber) || d.meta.nextTaskNumber < 1) bad('"meta.nextTaskNumber" is invalid.');

  const unique = (name, field = '_id') => {
    const seen = new Set();
    d[name].forEach((x, i) => {
      if (!isStr(x[field])) bad(`${name}[${i}].${field} is missing.`);
      if (seen.has(x[field])) bad(`${name}[${i}].${field} is duplicated.`);
      seen.add(x[field]);
    });
    return seen;
  };

  const userIds = unique('users');
  unique('users', 'employeeId');
  d.users.forEach((u, i) => {
    if (!isStr(u.name)) bad(`users[${i}].name is missing.`);
    if (!values(ROLES).includes(u.role)) bad(`users[${i}].role is invalid.`);
    if (typeof u.isActive !== 'boolean') bad(`users[${i}].isActive must be true or false.`);
  });
  if (d.users.length && !d.users.some((u) => u.role === 'admin' && u.isActive)) bad('it contains no active admin.');

  const taskIds = unique('tasks');
  unique('tasks', 'key');
  let maxNum = 0;
  d.tasks.forEach((t, i) => {
    if (!isStr(t.title)) bad(`tasks[${i}].title is missing.`);
    const m = /^TSK-(\d+)$/.exec(t.key);
    if (!m) bad(`tasks[${i}].key is invalid.`);
    maxNum = Math.max(maxNum, Number(m[1]));
    if (!isValidDateStr(t.startDate) || !isValidDateStr(t.endDate) || t.endDate < t.startDate) bad(`tasks[${i}] has invalid dates.`);
    if (!userIds.has(t.assigneeId)) bad(`tasks[${i}].assigneeId does not match any user.`);
    if (!values(STATUSES).includes(t.status)) bad(`tasks[${i}].status is invalid.`);
    if (!values(PRIORITIES).includes(t.priority)) bad(`tasks[${i}].priority is invalid.`);
    if (!values(TYPES).includes(t.type)) bad(`tasks[${i}].type is invalid.`);
    if (typeof t.isDeleted !== 'boolean') bad(`tasks[${i}].isDeleted must be true or false.`);
    if (!Array.isArray(t.labels) || !Array.isArray(t.checklist)) bad(`tasks[${i}] labels/checklist must be lists.`);
  });
  if (d.meta.nextTaskNumber <= maxNum) bad('"meta.nextTaskNumber" would create duplicate task keys.');

  unique('comments');
  d.comments.forEach((c, i) => {
    if (!taskIds.has(c.taskId) || !userIds.has(c.userId)) bad(`comments[${i}] points to a missing task or user.`);
    if (!isStr(c.text)) bad(`comments[${i}].text is missing.`);
  });
  unique('timelogs');
  d.timelogs.forEach((l, i) => {
    if (!taskIds.has(l.taskId) || !userIds.has(l.userId)) bad(`timelogs[${i}] points to a missing task or user.`);
    if (typeof l.hours !== 'number' || !(l.hours > 0) || l.hours > 24) bad(`timelogs[${i}].hours is invalid.`);
    if (!isValidDateStr(l.workDate)) bad(`timelogs[${i}].workDate is invalid.`);
  });
  unique('history');
  d.history.forEach((h, i) => {
    if (!taskIds.has(h.taskId)) bad(`history[${i}] points to a missing task.`);
  });
  unique('notifications');
  d.notifications.forEach((n, i) => {
    if (!userIds.has(n.userId)) bad(`notifications[${i}] points to a missing user.`);
  });
  return d;
}

// Replaces ALL data with the backup, but only after the whole file validates. One atomic commit.
export function importBackup(actor, text) {
  requireAdmin(actor);
  if (typeof text !== 'string' || !text.trim()) bad('the file is empty.');
  if (text.length > MAX_BYTES) bad('the file is larger than 4 MB.');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    bad('the file is not valid JSON.');
  }
  const d = validateBackup(payload);
  commit({
    users: d.users, tasks: d.tasks, comments: d.comments, timelogs: d.timelogs,
    history: d.history, notifications: d.notifications, meta: { ...d.meta, schemaVersion: SCHEMA_VERSION },
  });
  return { users: d.users.length, tasks: d.tasks.length, comments: d.comments.length, timelogs: d.timelogs.length };
}

export function summarizeBackup(text) {
  try {
    const p = JSON.parse(text);
    const d = validateBackup(p);
    return { users: d.users.length, tasks: d.tasks.length, exportedAt: p.exportedAt };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(ERR.VALIDATION, 'This backup cannot be restored: the file is not valid JSON. Nothing was changed.');
  }
}
