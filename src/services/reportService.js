import { readCollection } from '../repository/storage';
import { today, addDays, startOfWeek, isValidDateStr, isOverdue, formatDate } from '../utils/dates';
import { labelOf, STATUSES, PRIORITIES, TYPES } from '../constants';
import { resolveActor, requireAdmin } from './common';

const round2 = (n) => Math.round(n * 100) / 100;

function hoursByTask(logs) {
  const m = new Map();
  for (const l of logs) m.set(l.taskId, round2((m.get(l.taskId) || 0) + l.hours));
  return m;
}

// Active tasks in the actor's scope, each with actualHours computed from time logs (never stored on the task).
export function listTasksWithHours(actor) {
  const me = resolveActor(actor);
  const hours = hoursByTask(readCollection('timelogs'));
  const tasks = readCollection('tasks').filter((t) => !t.isDeleted && (me.role === 'admin' || t.assigneeId === me._id));
  return tasks
    .map((t) => ({ ...t, actualHours: hours.get(t._id) || 0 }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function listDeletedTasksWithStats(actor) {
  requireAdmin(actor);
  const logs = readCollection('timelogs');
  const comments = readCollection('comments');
  const hours = hoursByTask(logs);
  return readCollection('tasks')
    .filter((t) => t.isDeleted)
    .map((t) => ({
      ...t,
      actualHours: hours.get(t._id) || 0,
      commentCount: comments.filter((c) => c.taskId === t._id).length,
      logCount: logs.filter((l) => l.taskId === t._id).length,
    }))
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

export function getDashboard(actor) {
  const me = resolveActor(actor);
  const isAdmin = me.role === 'admin';
  const allTasks = readCollection('tasks');
  const tasks = allTasks.filter((t) => !t.isDeleted && (isAdmin || t.assigneeId === me._id));
  const taskById = new Map(allTasks.map((t) => [t._id, t]));

  let logs = readCollection('timelogs');
  if (!isAdmin) logs = logs.filter((l) => l.userId === me._id && !taskById.get(l.taskId)?.isDeleted);

  const weekStart = startOfWeek(today());
  const weekEnd = addDays(weekStart, 6);
  const inWeek = logs.filter((l) => l.workDate >= weekStart && l.workDate <= weekEnd);
  const sum = (arr) => round2(arr.reduce((s, l) => s + l.hours, 0));

  const counts = { total: tasks.length, overdue: tasks.filter(isOverdue).length };
  for (const s of STATUSES) counts[s.value] = tasks.filter((t) => t.status === s.value).length;
  const byPriority = PRIORITIES.map((p) => ({ ...p, count: tasks.filter((t) => t.priority === p.value).length }));
  const byType = TYPES.map((p) => ({ ...p, count: tasks.filter((t) => t.type === p.value).length }));

  const result = {
    scope: isAdmin ? 'all' : 'mine',
    counts,
    byPriority,
    byType,
    hours: { total: sum(logs), week: sum(inWeek) },
    weekStart,
    weekEnd,
  };

  if (isAdmin) {
    result.counts.deleted = allTasks.filter((t) => t.isDeleted).length;
    const users = readCollection('users');
    result.activeUsers = users.filter((u) => u.isActive && u.role === 'user').length;
    result.workload = users
      .filter((u) => u.role === 'user')
      .map((u) => {
        const mine = tasks.filter((t) => t.assigneeId === u._id);
        const theirLogs = logs.filter((l) => l.userId === u._id);
        return {
          userId: u._id,
          name: u.name,
          isActive: u.isActive,
          open: mine.filter((t) => t.status !== 'done').length,
          overdue: mine.filter(isOverdue).length,
          weekHours: sum(theirLogs.filter((l) => l.workDate >= weekStart && l.workDate <= weekEnd)),
          totalHours: sum(theirLogs),
        };
      })
      .filter((w) => w.isActive || w.totalHours > 0 || w.open > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}

// Weekly grid. Users always see their own hours; admins can pick a user or "all".
export function getWeeklyTimesheet(actor, { weekStart, userId } = {}) {
  const me = resolveActor(actor);
  const start = startOfWeek(isValidDateStr(weekStart) ? weekStart : today());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scope = me.role === 'admin' ? (userId && userId !== 'all' ? userId : 'all') : me._id;

  const taskById = new Map(readCollection('tasks').map((t) => [t._id, t]));
  let logs = readCollection('timelogs').filter((l) => l.workDate >= days[0] && l.workDate <= days[6]);
  if (scope !== 'all') logs = logs.filter((l) => l.userId === scope);

  const rows = new Map();
  for (const l of logs) {
    const t = taskById.get(l.taskId);
    if (!t) continue;
    if (t.isDeleted && me.role !== 'admin') continue; // deleted tasks are hidden from users
    let row = rows.get(t._id);
    if (!row) {
      row = { task: { _id: t._id, key: t.key, title: t.title, isDeleted: t.isDeleted }, hours: Array(7).fill(0), total: 0 };
      rows.set(t._id, row);
    }
    const i = days.indexOf(l.workDate);
    row.hours[i] = round2(row.hours[i] + l.hours);
    row.total = round2(row.total + l.hours);
  }
  const list = [...rows.values()].sort((a, b) => a.task.key.localeCompare(b.task.key, undefined, { numeric: true }));
  const dayTotals = days.map((_, i) => round2(list.reduce((s, r) => s + r.hours[i], 0)));
  return { weekStart: start, days, rows: list, dayTotals, total: round2(dayTotals.reduce((s, n) => s + n, 0)), scope };
}

// ---- CSV ----
export function csvEscape(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');

export function tasksCsv(actor) {
  const tasks = listTasksWithHours(actor);
  const users = new Map(readCollection('users').map((u) => [u._id, u]));
  const header = ['Key', 'Title', 'Type', 'Priority', 'Status', 'Assignee', 'Employee ID', 'Start date', 'End date', 'Overdue', 'Estimated hours', 'Logged hours', 'Labels'];
  const rows = tasks.map((t) => {
    const u = users.get(t.assigneeId);
    return [
      t.key, t.title, labelOf(TYPES, t.type), labelOf(PRIORITIES, t.priority), labelOf(STATUSES, t.status),
      u?.name || '', u?.employeeId || '', t.startDate, t.endDate, isOverdue(t) ? 'Yes' : 'No',
      t.estimatedHours ?? '', t.actualHours, t.labels.join('; '),
    ];
  });
  return toCsv(header, rows);
}

export function timesheetCsv(actor, opts = {}) {
  const me = resolveActor(actor);
  const sheet = getWeeklyTimesheet(me, opts);
  const users = new Map(readCollection('users').map((u) => [u._id, u]));
  const tasks = new Map(readCollection('tasks').map((t) => [t._id, t]));
  const header = ['Date', 'Employee', 'Employee ID', 'Task key', 'Task title', 'Hours', 'Note'];
  const logs = readCollection('timelogs')
    .filter((l) => l.workDate >= sheet.days[0] && l.workDate <= sheet.days[6])
    .filter((l) => sheet.scope === 'all' || l.userId === sheet.scope)
    .filter((l) => me.role === 'admin' || !tasks.get(l.taskId)?.isDeleted)
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
  const rows = logs.map((l) => [l.workDate, users.get(l.userId)?.name || '', users.get(l.userId)?.employeeId || '', tasks.get(l.taskId)?.key || '', tasks.get(l.taskId)?.title || '', l.hours, l.note || '']);
  return { csv: toCsv(header, rows), label: `${sheet.days[0]}_to_${sheet.days[6]}`, human: `${formatDate(sheet.days[0])} - ${formatDate(sheet.days[6])}` };
}
