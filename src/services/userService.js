import { readCollection, commit, hasAnyUsers } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { oneLine, throwFields } from '../utils/validators';
import { ROLES, values } from '../constants';
import { resolveActor, requireAdmin, findAssignableUser, buildReassign, nowIso, replaceById } from './common';

const EMP_RE = /^[A-Za-z0-9_-]{2,20}$/;

const publicUser = (u) => ({ _id: u._id, name: u.name, employeeId: u.employeeId, role: u.role, isActive: u.isActive });

export function needsSetup() {
  return !hasAnyUsers();
}

// Login screen only: active accounts, no actor required (nobody is signed in yet).
export function listSignInAccounts() {
  return readCollection('users')
    .filter((u) => u.isActive)
    .map((u) => ({ _id: u._id, name: u.name, employeeId: u.employeeId, role: u.role }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1));
}

// Any signed-in person may read the user directory (needed to show names). Admins get all fields.
export function listAllUsers(actor) {
  const me = resolveActor(actor);
  const users = readCollection('users');
  const list = me.role === 'admin' ? users : users.map(publicUser);
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

export function listAssignableUsers(actor) {
  requireAdmin(actor);
  return readCollection('users')
    .filter((u) => u.isActive && u.role === 'user')
    .sort((a, b) => a.name.localeCompare(b.name));
}

function validateNewUser(input, existing) {
  const errors = {};
  const name = oneLine(input?.name);
  if (name.length < 2) errors.name = 'Name must be at least 2 characters.';
  else if (name.length > 60) errors.name = 'Name must be 60 characters or fewer.';

  const employeeId = typeof input?.employeeId === 'string' ? input.employeeId.trim().toUpperCase() : '';
  if (!EMP_RE.test(employeeId)) errors.employeeId = 'Employee ID must be 2-20 letters, numbers, dashes or underscores.';
  else if (existing.some((u) => u.employeeId.toUpperCase() === employeeId)) errors.employeeId = `Employee ID ${employeeId} is already in use.`;

  const role = input?.role ?? 'user';
  if (!values(ROLES).includes(role)) errors.role = 'Choose a valid role.';

  if (Object.keys(errors).length) throwFields(errors);
  return { name, employeeId, role };
}

export function createUser(actor, input) {
  requireAdmin(actor);
  const users = readCollection('users');
  const data = validateNewUser(input, users);
  const user = { _id: newId(), ...data, isActive: true, createdAt: nowIso() };
  commit({ users: [...users, user] });
  return user;
}

// First-run only: create the very first admin when the workspace is empty.
export function bootstrapAdmin(input) {
  if (hasAnyUsers()) throw new AppError(ERR.FORBIDDEN, 'The workspace already has users.');
  const data = validateNewUser({ ...input, role: 'admin' }, []);
  const user = { _id: newId(), ...data, isActive: true, createdAt: nowIso() };
  commit({ users: [user] });
  return user;
}

// Login by employee ID (simulated auth, no password by design).
export function findLoginUser(employeeId) {
  const id = typeof employeeId === 'string' ? employeeId.trim().toUpperCase() : '';
  if (!id) throwFields({ employeeId: 'Enter your employee ID.' });
  const u = readCollection('users').find((x) => x.employeeId.toUpperCase() === id);
  if (!u) throw new AppError(ERR.NOT_FOUND, `No account found for employee ID ${id}.`);
  if (!u.isActive) throw new AppError(ERR.FORBIDDEN, 'This account has been removed. Ask an admin to reactivate it.');
  return u;
}

const isOpen = (t) => !t.isDeleted && t.status !== 'done';

export function countOpenTasks(actor, userId) {
  requireAdmin(actor);
  return readCollection('tasks').filter((t) => t.assigneeId === userId && isOpen(t)).length;
}

export function countOpenTasksByAssignee(actor) {
  requireAdmin(actor);
  const counts = {};
  for (const t of readCollection('tasks')) {
    if (isOpen(t)) counts[t.assigneeId] = (counts[t.assigneeId] || 0) + 1;
  }
  return counts;
}

// "Remove" a user = deactivate. The record, their comments, hours and history all stay.
// If they still hold open tasks, reassignTo is required and everything happens in one commit.
export function deactivateUser(actor, userId, { reassignTo, confirmAdminRemoval } = {}) {
  const admin = requireAdmin(actor);
  const users = readCollection('users');
  const target = users.find((u) => u._id === userId);
  if (!target) throw new AppError(ERR.NOT_FOUND, 'That user does not exist.');
  if (!target.isActive) throw new AppError(ERR.CONFLICT, `${target.name} is already removed.`);
  if (target._id === admin._id) throw new AppError(ERR.CONFLICT, 'You cannot remove your own account.');
  if (target.role === 'admin') {
    if (users.filter((u) => u.isActive && u.role === 'admin').length <= 1) {
      throw new AppError(ERR.CONFLICT, 'The last active admin cannot be removed.');
    }
    if (!confirmAdminRemoval) {
      throw new AppError(ERR.CONFLICT, 'Removing an admin needs a second confirmation.', { reason: 'CONFIRM_ADMIN' });
    }
  }

  const tasks = readCollection('tasks');
  const open = tasks.filter((t) => t.assigneeId === userId && isOpen(t));
  const changes = {};

  if (open.length) {
    if (!reassignTo) {
      throw new AppError(ERR.CONFLICT, `${target.name} has ${open.length} open task${open.length === 1 ? '' : 's'}. Reassign them before removing this user.`, {
        reason: 'OPEN_TASKS',
        openCount: open.length,
      });
    }
    if (reassignTo === userId) throwFields({ reassignTo: 'Choose a different user to take over the tasks.' });
    const to = findAssignableUser(reassignTo);
    const at = nowIso();
    let nextTasks = tasks;
    const history = readCollection('history');
    const notifications = readCollection('notifications');
    const newHistory = [];
    const newNotes = [];
    for (const t of open) {
      const r = buildReassign(t, to, admin, at, `Reassigned because ${target.name} was removed`);
      nextTasks = replaceById(nextTasks, r.task);
      newHistory.push(...r.history);
      newNotes.push(...r.notifications);
    }
    changes.tasks = nextTasks;
    changes.history = [...history, ...newHistory];
    changes.notifications = [...notifications, ...newNotes];
  }

  changes.users = replaceById(users, { ...target, isActive: false, deactivatedAt: nowIso() });
  commit(changes);
  return { reassigned: open.length };
}

export function reactivateUser(actor, userId) {
  requireAdmin(actor);
  const users = readCollection('users');
  const target = users.find((u) => u._id === userId);
  if (!target) throw new AppError(ERR.NOT_FOUND, 'That user does not exist.');
  if (target.isActive) throw new AppError(ERR.CONFLICT, `${target.name} is already active.`);
  commit({ users: replaceById(users, { ...target, isActive: true, deactivatedAt: null }) });
}
