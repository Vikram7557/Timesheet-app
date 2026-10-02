import { describe, it, expect, beforeEach } from 'vitest';
import * as storage from '../src/repository/storage';
import * as users from '../src/services/userService';
import * as tasks from '../src/services/taskService';
import * as comments from '../src/services/commentService';
import * as logs from '../src/services/timeLogService';
import * as history from '../src/services/historyService';
import * as reports from '../src/services/reportService';
import * as backup from '../src/services/backupService';
import * as notes from '../src/services/notificationService';
import { seedDemoData } from '../src/services/seedService';
import { today, addDays } from '../src/utils/dates';

let admin, admin2, alice, bob;
const T = () => today();

function base(over = {}) {
  return { title: 'Write spec', description: 'desc', startDate: T(), endDate: addDays(T(), 3), assigneeId: alice._id, ...over };
}
const expectCode = (fn, code) => {
  try { fn(); } catch (e) { expect(e.code).toBe(code); return e; }
  throw new Error('expected an error with code ' + code);
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  admin = users.bootstrapAdmin({ name: 'Root Admin', employeeId: 'a1' });
  admin2 = users.createUser(admin, { name: 'Second Admin', employeeId: 'A2', role: 'admin' });
  alice = users.createUser(admin, { name: 'Alice', employeeId: 'U1', role: 'user' });
  bob = users.createUser(admin, { name: 'Bob', employeeId: 'U2', role: 'user' });
});

describe('users', () => {
  it('supports multiple admins and rejects duplicate employee IDs (case-insensitive)', () => {
    expect(storage.readCollection('users').filter((u) => u.role === 'admin')).toHaveLength(2);
    expectCode(() => users.createUser(admin, { name: 'Dup', employeeId: 'u1', role: 'user' }), 'VALIDATION');
  });
  it('blocks non-admins from managing users', () => {
    expectCode(() => users.createUser(alice, { name: 'Eve', employeeId: 'E1', role: 'user' }), 'FORBIDDEN');
  });
  it('cannot bootstrap when users already exist', () => {
    expectCode(() => users.bootstrapAdmin({ name: 'Evil', employeeId: 'X1' }), 'FORBIDDEN');
  });
  it('login by employee id works and inactive users cannot log in', () => {
    expect(users.findLoginUser(' u1 ')._id).toBe(alice._id);
    users.deactivateUser(admin, alice._id);
    expectCode(() => users.findLoginUser('U1'), 'FORBIDDEN');
    expectCode(() => users.findLoginUser('NOPE'), 'NOT_FOUND');
    const accounts = users.listSignInAccounts();
    expect(accounts.some((u) => u._id === alice._id)).toBe(false);
    expect(accounts.some((u) => u._id === admin._id)).toBe(true);
  });
  it('open-task counts skip deleted and done work', () => {
    const open = tasks.createTask(admin, base({ title: 'Open' }));
    const done = tasks.createTask(admin, base({ title: 'Done' }));
    tasks.changeStatus(alice, done._id, 'done');
    tasks.softDeleteTask(admin, open._id);
    const remaining = tasks.createTask(admin, base({ title: 'Still open' }));
    expect(users.countOpenTasks(admin, alice._id)).toBe(1);
    expect(users.countOpenTasksByAssignee(admin)[alice._id]).toBe(1);
    expect(remaining.assigneeId).toBe(alice._id);
  });
  it('removing a user with open tasks requires reassignment and is atomic', () => {
    const t = tasks.createTask(admin, base());
    const e = expectCode(() => users.deactivateUser(admin, alice._id), 'CONFLICT');
    expect(e.details.reason).toBe('OPEN_TASKS');
    expect(storage.readCollection('users').find((u) => u._id === alice._id).isActive).toBe(true);
    users.deactivateUser(admin, alice._id, { reassignTo: bob._id });
    expect(tasks.getTask(admin, t._id).assigneeId).toBe(bob._id);
    expect(storage.readCollection('users').find((u) => u._id === alice._id).isActive).toBe(false);
  });
  it('cannot remove yourself or the last admin; can reactivate', () => {
    expectCode(() => users.deactivateUser(admin, admin._id), 'CONFLICT');
    const e = expectCode(() => users.deactivateUser(admin, admin2._id), 'CONFLICT');
    expect(e.details.reason).toBe('CONFIRM_ADMIN');
    expect(storage.readCollection('users').find((u) => u._id === admin2._id).isActive).toBe(true);
    users.deactivateUser(admin, admin2._id, { confirmAdminRemoval: true });
    expectCode(() => users.deactivateUser(admin, admin._id), 'CONFLICT');
    users.reactivateUser(admin, admin2._id);
    expect(storage.readCollection('users').find((u) => u._id === admin2._id).isActive).toBe(true);
  });
  it('a removed admin loses all rights immediately', () => {
    users.deactivateUser(admin, admin2._id, { confirmAdminRemoval: true });
    expectCode(() => tasks.createTask(admin2, base()), 'FORBIDDEN');
  });
});

describe('task creation and validation', () => {
  it('creates tasks with sequential keys and history', () => {
    const a = tasks.createTask(admin, base());
    const b = tasks.createTask(admin, base({ title: 'Second' }));
    expect(a.key).toBe('TSK-101');
    expect(b.key).toBe('TSK-102');
    expect(history.listHistory(admin, a._id)[0].action).toBe('CREATED');
  });
  it('rejects end date before start date, empty title, bad assignee', () => {
    expectCode(() => tasks.createTask(admin, base({ endDate: addDays(T(), -1) })), 'VALIDATION');
    expectCode(() => tasks.createTask(admin, base({ title: '   ' })), 'VALIDATION');
    expectCode(() => tasks.createTask(admin, base({ assigneeId: 'nope' })), 'VALIDATION');
    expectCode(() => tasks.createTask(admin, base({ assigneeId: admin2._id })), 'VALIDATION');
    expectCode(() => tasks.createTask(admin, base({ startDate: '2026-02-31' })), 'VALIDATION');
  });
  it('rejects creating tasks as a normal user', () => {
    expectCode(() => tasks.createTask(alice, base()), 'FORBIDDEN');
  });
  it('cannot assign to a removed user', () => {
    users.deactivateUser(admin, bob._id);
    expectCode(() => tasks.createTask(admin, base({ assigneeId: bob._id })), 'VALIDATION');
  });
  it('failed create does not consume a task number', () => {
    expectCode(() => tasks.createTask(admin, base({ title: '' })), 'VALIDATION');
    expect(tasks.createTask(admin, base()).key).toBe('TSK-101');
  });
});

describe('soft delete and restore', () => {
  it('soft delete keeps the record, comments and hours, and hides it from normal lists', () => {
    const t = tasks.createTask(admin, base());
    comments.addComment(alice, t._id, 'progress');
    logs.addTimeLog(alice, t._id, { hours: '2', workDate: T(), note: '' });
    tasks.softDeleteTask(admin, t._id);

    const raw = storage.readCollection('tasks').find((x) => x._id === t._id);
    expect(raw).toBeTruthy();
    expect(raw.isDeleted).toBe(true);
    expect(raw.deletedBy).toBe(admin._id);
    expect(raw.deletedAt).toBeTruthy();
    expect(storage.readCollection('comments')).toHaveLength(1);
    expect(storage.readCollection('timelogs')).toHaveLength(1);

    expect(tasks.listTasks(admin)).toHaveLength(0);
    expect(tasks.listTasks(alice)).toHaveLength(0);
    expect(tasks.listDeletedTasks(admin)).toHaveLength(1);
    // admin can still audit comments and hours of a deleted task
    expect(comments.listComments(admin, t._id)).toHaveLength(1);
    expect(logs.listTimeLogs(admin, t._id)).toHaveLength(1);
    expect(reports.listDeletedTasksWithStats(admin)[0].actualHours).toBe(2);
  });
  it('there is no hard delete anywhere in the service API', () => {
    const names = Object.keys(tasks).concat(Object.keys(comments), Object.keys(logs), Object.keys(users));
    expect(names.filter((n) => /^(hard|purge|remove|destroy)/i.test(n) && !/Checklist/.test(n))).toEqual([]);
    expect(names.filter((n) => /^delete/i.test(n))).toEqual([]);
  });
  it('users cannot delete or see deleted tasks; double delete is rejected', () => {
    const t = tasks.createTask(admin, base());
    expectCode(() => tasks.softDeleteTask(alice, t._id), 'FORBIDDEN');
    tasks.softDeleteTask(admin, t._id);
    expectCode(() => tasks.softDeleteTask(admin, t._id), 'CONFLICT');
    expectCode(() => tasks.getTask(alice, t._id), 'NOT_FOUND');
    expectCode(() => tasks.listDeletedTasks(alice), 'FORBIDDEN');
  });
  it('restore brings the task back with everything intact', () => {
    const t = tasks.createTask(admin, base());
    comments.addComment(alice, t._id, 'hello');
    tasks.softDeleteTask(admin, t._id);
    tasks.restoreTask(admin, t._id);
    const back = tasks.getTask(alice, t._id);
    expect(back.isDeleted).toBe(false);
    expect(back.deletedAt).toBe(null);
    expect(comments.listComments(alice, t._id)).toHaveLength(1);
    expect(history.listHistory(admin, t._id).map((h) => h.action)).toEqual(expect.arrayContaining(['CREATED', 'DELETED', 'RESTORED']));
    expectCode(() => tasks.restoreTask(admin, t._id), 'CONFLICT');
  });
  it('restoring a task whose assignee was removed demands a new assignee', () => {
    const t = tasks.createTask(admin, base());
    tasks.softDeleteTask(admin, t._id);
    users.deactivateUser(admin, alice._id); // no open tasks (deleted), so allowed
    const e = expectCode(() => tasks.restoreTask(admin, t._id), 'CONFLICT');
    expect(e.details.reason).toBe('ASSIGNEE_INACTIVE');
    tasks.restoreTask(admin, t._id, { assigneeId: bob._id });
    expect(tasks.getTask(bob, t._id).assigneeId).toBe(bob._id);
  });
  it('a deleted task cannot be modified', () => {
    const t = tasks.createTask(admin, base());
    tasks.softDeleteTask(admin, t._id);
    expectCode(() => tasks.updateTask(admin, t._id, { title: 'x' }), 'NOT_FOUND');
    expectCode(() => tasks.reassignTask(admin, t._id, bob._id), 'NOT_FOUND');
    expectCode(() => comments.addComment(alice, t._id, 'late'), 'NOT_FOUND');
    expectCode(() => logs.addTimeLog(alice, t._id, { hours: 1, workDate: T() }), 'NOT_FOUND');
  });
});

describe('reassignment', () => {
  it('moves the task, keeps old hours with the old user, records history', () => {
    const t = tasks.createTask(admin, base());
    logs.addTimeLog(alice, t._id, { hours: '3', workDate: T(), note: 'a' });
    tasks.reassignTask(admin, t._id, bob._id);
    expect(tasks.listTasks(alice)).toHaveLength(0);
    expect(tasks.listTasks(bob)).toHaveLength(1);
    expect(storage.readCollection('timelogs')[0].userId).toBe(alice._id);
    const h = history.listHistory(admin, t._id).find((x) => x.action === 'REASSIGNED');
    expect(h.from).toBe(alice._id);
    expect(h.to).toBe(bob._id);
    // old assignee can no longer act on it
    expectCode(() => comments.addComment(alice, t._id, 'x'), 'FORBIDDEN');
    expectCode(() => logs.addTimeLog(alice, t._id, { hours: 1, workDate: T() }), 'FORBIDDEN');
    // and the new assignee can
    logs.addTimeLog(bob, t._id, { hours: 1, workDate: T() });
    // alice's hours still show in her own timesheet
    const sheet = reports.getWeeklyTimesheet(alice, {});
    expect(sheet.total).toBe(3);
  });
  it('rejects reassigning to the same user, or as a non-admin', () => {
    const t = tasks.createTask(admin, base());
    expectCode(() => tasks.reassignTask(admin, t._id, alice._id), 'CONFLICT');
    expectCode(() => tasks.reassignTask(alice, t._id, bob._id), 'FORBIDDEN');
  });
  it('bulk operations are all-or-nothing', () => {
    const a = tasks.createTask(admin, base());
    const b = tasks.createTask(admin, base({ title: 'B' }));
    tasks.softDeleteTask(admin, b._id);
    expectCode(() => tasks.bulkReassign(admin, [a._id, b._id], bob._id), 'CONFLICT');
    expect(tasks.getTask(admin, a._id).assigneeId).toBe(alice._id);
    expectCode(() => tasks.bulkSoftDelete(admin, [a._id, b._id]), 'CONFLICT');
    expect(tasks.getTask(admin, a._id).isDeleted).toBe(false);
    const c = tasks.createTask(admin, base({ title: 'C' }));
    expect(tasks.bulkReassign(admin, [a._id, c._id], bob._id).updated).toBe(2);
    expect(tasks.bulkSoftDelete(admin, [a._id, c._id]).updated).toBe(2);
  });
});

describe('user workspace isolation', () => {
  it('users only see and touch their own tasks', () => {
    const a = tasks.createTask(admin, base());
    const b = tasks.createTask(admin, base({ title: 'Bobs', assigneeId: bob._id }));
    expect(tasks.listTasks(alice).map((t) => t._id)).toEqual([a._id]);
    expectCode(() => tasks.getTask(alice, b._id), 'NOT_FOUND');
    expectCode(() => comments.addComment(alice, b._id, 'sneaky'), 'FORBIDDEN');
    expectCode(() => logs.addTimeLog(alice, b._id, { hours: 1, workDate: T() }), 'FORBIDDEN');
    expectCode(() => tasks.changeStatus(alice, b._id, 'done'), 'FORBIDDEN');
    expectCode(() => comments.listComments(alice, b._id), 'NOT_FOUND');
  });
  it('a forged actor object cannot escalate its role', () => {
    expectCode(() => tasks.createTask({ ...alice, role: 'admin' }, base()), 'FORBIDDEN');
    expectCode(() => tasks.listDeletedTasks({ _id: alice._id, role: 'admin' }), 'FORBIDDEN');
  });
  it('admins cannot post comments or hours on behalf of users', () => {
    const t = tasks.createTask(admin, base());
    expectCode(() => comments.addComment(admin, t._id, 'x'), 'FORBIDDEN');
    expectCode(() => logs.addTimeLog(admin, t._id, { hours: 1, workDate: T() }), 'FORBIDDEN');
  });
});

describe('comments and hours', () => {
  it('validates comments', () => {
    const t = tasks.createTask(admin, base());
    expectCode(() => comments.addComment(alice, t._id, '   '), 'VALIDATION');
    expectCode(() => comments.addComment(alice, t._id, 'x'.repeat(1001)), 'VALIDATION');
    expect(comments.addComment(alice, t._id, '  ok  ').text).toBe('ok');
  });
  it('edit keeps previous text and only the author may edit', () => {
    const t = tasks.createTask(admin, base());
    const c = comments.addComment(alice, t._id, 'first');
    const e = comments.editComment(alice, c._id, 'second');
    expect(e.edited).toBe(true);
    expect(e.editHistory[0].text).toBe('first');
    tasks.reassignTask(admin, t._id, bob._id);
    expectCode(() => comments.editComment(bob, c._id, 'hijack'), 'FORBIDDEN');
  });
  it('validates hours: zero, negative, text, too many, too many decimals, future date', () => {
    const t = tasks.createTask(admin, base());
    for (const h of [0, '0', -1, '-2', 'abc', '', null, 25, '24.01', '1.999', '1e3', NaN, Infinity]) {
      expectCode(() => logs.addTimeLog(alice, t._id, { hours: h, workDate: T() }), 'VALIDATION');
    }
    expectCode(() => logs.addTimeLog(alice, t._id, { hours: 1, workDate: addDays(T(), 1) }), 'VALIDATION');
    expectCode(() => logs.addTimeLog(alice, t._id, { hours: 1, workDate: 'not-a-date' }), 'VALIDATION');
    expect(logs.addTimeLog(alice, t._id, { hours: '1.25', workDate: T() }).hours).toBe(1.25);
  });
  it('caps a user at 24h per day across tasks', () => {
    const a = tasks.createTask(admin, base());
    const b = tasks.createTask(admin, base({ title: 'B' }));
    logs.addTimeLog(alice, a._id, { hours: 20, workDate: T() });
    expectCode(() => logs.addTimeLog(alice, b._id, { hours: 5, workDate: T() }), 'VALIDATION');
    logs.addTimeLog(alice, b._id, { hours: 4, workDate: T() });
  });
  it('actual hours are computed from logs, not stored', () => {
    const t = tasks.createTask(admin, base({ estimatedHours: '10' }));
    logs.addTimeLog(alice, t._id, { hours: 2.5, workDate: T() });
    logs.addTimeLog(alice, t._id, { hours: 1.5, workDate: addDays(T(), -1) });
    const row = reports.listTasksWithHours(admin).find((x) => x._id === t._id);
    expect(row.actualHours).toBe(4);
    expect(row.estimatedHours).toBe(10);
    expect(storage.readCollection('tasks')[0].actualHours).toBeUndefined();
  });
});

describe('status, edit, checklist', () => {
  it('assignee can change status; invalid status rejected; history written', () => {
    const t = tasks.createTask(admin, base());
    tasks.changeStatus(alice, t._id, 'in_progress');
    expectCode(() => tasks.changeStatus(alice, t._id, 'weird'), 'VALIDATION');
    expect(history.listHistory(alice, t._id)[0].action).toBe('STATUS_CHANGED');
  });
  it('admin edit validates and logs changed fields', () => {
    const t = tasks.createTask(admin, base());
    expectCode(() => tasks.updateTask(admin, t._id, { endDate: addDays(T(), -5) }), 'VALIDATION');
    const n = tasks.updateTask(admin, t._id, { title: 'New title', labels: 'a, B, a' });
    expect(n.labels).toEqual(['a', 'b']);
    expect(history.listHistory(admin, t._id)[0].details).toContain('title');
  });
  it('checklist add / toggle / remove with permissions', () => {
    const t = tasks.createTask(admin, base());
    const a = tasks.addChecklistItem(alice, t._id, ' step one ');
    expect(a.checklist[0].text).toBe('step one');
    expectCode(() => tasks.addChecklistItem(alice, t._id, ''), 'VALIDATION');
    expectCode(() => tasks.addChecklistItem(bob, t._id, 'x'), 'FORBIDDEN');
    const b = tasks.toggleChecklistItem(alice, t._id, a.checklist[0].id);
    expect(b.checklist[0].done).toBe(true);
    expect(tasks.removeChecklistItem(alice, t._id, a.checklist[0].id).checklist).toHaveLength(0);
  });
});

describe('storage resilience', () => {
  it('corrupt JSON falls back to empty data instead of crashing', () => {
    localStorage.setItem('tms_tasks', '{not json');
    localStorage.setItem('tms_meta', '"garbage"');
    expect(storage.readCollection('tasks')).toEqual([]);
    expect(storage.readMeta().nextTaskNumber).toBe(101);
    expect(tasks.listTasks(admin)).toEqual([]);
  });
  it('a failed write rolls every key back', () => {
    const t = tasks.createTask(admin, base());
    const before = JSON.stringify(storage.readAllData());
    const orig = Storage.prototype.setItem;
    let n = 0;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith('tms_') && ++n === 2) throw new Error('QuotaExceededError');
      return orig.call(this, k, v);
    };
    try {
      expectCode(() => tasks.softDeleteTask(admin, t._id), 'STORAGE');
    } finally {
      Storage.prototype.setItem = orig;
    }
    expect(JSON.stringify(storage.readAllData())).toBe(before);
    expect(tasks.getTask(admin, t._id).isDeleted).toBe(false);
  });
});

describe('reports, notifications, backup, seed', () => {
  it('weekly timesheet totals rows and days; deleted tasks hidden from users but visible to admins', () => {
    const t = tasks.createTask(admin, base());
    logs.addTimeLog(alice, t._id, { hours: 2, workDate: T() });
    logs.addTimeLog(alice, t._id, { hours: 3, workDate: T() });
    let sheet = reports.getWeeklyTimesheet(alice, { weekStart: T() });
    expect(sheet.total).toBe(5);
    expect(sheet.rows).toHaveLength(1);
    tasks.softDeleteTask(admin, t._id);
    expect(reports.getWeeklyTimesheet(alice, {}).rows).toHaveLength(0);
    sheet = reports.getWeeklyTimesheet(admin, { weekStart: T(), userId: alice._id });
    expect(sheet.rows[0].task.isDeleted).toBe(true);
    // a user cannot ask for someone else's timesheet
    expect(reports.getWeeklyTimesheet(bob, { userId: alice._id }).total).toBe(0);
  });
  it('CSV escapes quotes, commas and formula injection', () => {
    tasks.createTask(admin, base({ title: '=SUM(A1), "danger"' }));
    const csv = reports.tasksCsv(admin);
    expect(csv).toContain(`"'=SUM(A1), ""danger"""`);
  });
  it('notifications: assigned, due-soon dedupe', () => {
    tasks.createTask(admin, base({ endDate: addDays(T(), 1) }));
    expect(notes.listNotifications(alice)[0].type).toBe('ASSIGNED');
    expect(notes.syncDueSoon(alice)).toBe(1);
    expect(notes.syncDueSoon(alice)).toBe(0);
    notes.markAllRead(alice);
    expect(notes.listNotifications(alice).every((n) => n.read)).toBe(true);
  });
  it('backup round-trips and rejects bad files without touching data', () => {
    const t = tasks.createTask(admin, base());
    comments.addComment(alice, t._id, 'keep me');
    const json = backup.exportBackup(admin);
    tasks.softDeleteTask(admin, t._id);
    backup.importBackup(admin, json);
    expect(tasks.getTask(admin, t._id).isDeleted).toBe(false);

    const before = JSON.stringify(storage.readAllData());
    for (const bad of ['', 'nope', '{}', '{"app":"tasklog","schemaVersion":1,"data":{}}']) {
      expectCode(() => backup.importBackup(admin, bad), 'VALIDATION');
    }
    const broken = JSON.parse(json);
    broken.data.tasks[0].assigneeId = 'ghost';
    expectCode(() => backup.importBackup(admin, JSON.stringify(broken)), 'VALIDATION');
    expect(JSON.stringify(storage.readAllData())).toBe(before);
    expectCode(() => backup.exportBackup(alice), 'FORBIDDEN');
    expectCode(() => backup.importBackup(alice, json), 'FORBIDDEN');
  });
  it('demo seed loads only into an empty workspace and passes its own validation', () => {
    localStorage.clear();
    const r = seedDemoData();
    expect(r.tasks).toBe(12);
    expectCode(() => seedDemoData(), 'CONFLICT');
    const admin1 = storage.readCollection('users').find((u) => u.role === 'admin');
    expect(tasks.listTasks(admin1)).toHaveLength(10);
    expect(tasks.listDeletedTasks(admin1)).toHaveLength(2);
    expect(reports.getDashboard(admin1).counts.overdue).toBeGreaterThan(0);
    // the demo backup must itself be restorable
    backup.importBackup(admin1, backup.exportBackup(admin1));
  });
});
