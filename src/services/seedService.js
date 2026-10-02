// Loads a realistic demo workspace by calling the real services (so the demo data obeys every rule).
import { readCollection, commit } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { today, addDays } from '../utils/dates';
import { nowIso } from './common';
import * as tasks from './taskService';
import * as users from './userService';
import { addComment } from './commentService';
import { addTimeLog } from './timeLogService';

export function seedDemoData() {
  if (readCollection('users').length) {
    throw new AppError(ERR.CONFLICT, 'Demo data can only be loaded into an empty workspace.');
  }
  const at = nowIso();
  const mk = (name, employeeId, role) => ({ _id: newId(), name, employeeId, role, isActive: true, createdAt: at });
  const meera = mk('Meera Iyer', 'EMP001', 'admin');
  const arjun = mk('Arjun Nair', 'EMP002', 'admin');
  const priya = mk('Priya Sharma', 'EMP101', 'user');
  const rahul = mk('Rahul Verma', 'EMP102', 'user');
  const divya = mk('Divya Krishnan', 'EMP103', 'user');
  const sanjay = mk('Sanjay Patel', 'EMP104', 'user');
  const naveen = mk('Naveen Raj', 'EMP105', 'user');
  commit({ users: [meera, arjun, priya, rahul, divya, sanjay, naveen] });

  const T = today();
  const d = (n) => addDays(T, n);
  const create = (o) => tasks.createTask(meera, { estimatedHours: '', labels: [], description: '', ...o });
  const log = (who, t, daysAgo, hours, note) => addTimeLog(who, t._id, { hours, workDate: d(-daysAgo), note });

  // 1. Finished task with hours + comments
  const t1 = create({ title: 'Design login screen wireframes', description: 'Low-fidelity wireframes for the sign-in and first-run screens.', startDate: d(-10), endDate: d(-3), assigneeId: priya._id, priority: 'high', type: 'story', labels: ['design', 'ui'], estimatedHours: 12 });
  log(priya, t1, 9, 4, 'Sketched flows'); log(priya, t1, 8, 5, 'Wireframes v1'); log(priya, t1, 6, 3.5, 'Review changes');
  addComment(priya, t1._id, 'Wireframes shared for review. Waiting on feedback for the empty states.');
  tasks.changeStatus(priya, t1._id, 'done');

  // 2. In progress backend task
  const t2 = create({ title: 'Build task list API', description: 'REST endpoints for listing, filtering and paginating tasks.', startDate: d(-6), endDate: d(2), assigneeId: rahul._id, priority: 'high', type: 'task', labels: ['backend'], estimatedHours: 20 });
  log(rahul, t2, 5, 6, 'Schema and routes'); log(rahul, t2, 4, 7, 'Filtering'); log(rahul, t2, 2, 5.5, 'Pagination'); log(rahul, t2, 1, 4, 'Tests');
  addComment(rahul, t2._id, 'Filtering and pagination are done. Sorting is next.');
  tasks.changeStatus(rahul, t2._id, 'in_progress');

  // 3. Overdue bug
  const t3 = create({ title: 'Fix date validation bug on export', description: 'Exports fail when the end date is on a month boundary.', startDate: d(-5), endDate: d(-1), assigneeId: divya._id, priority: 'high', type: 'bug', labels: ['bug', 'export'], estimatedHours: 4 });
  log(divya, t3, 3, 2, 'Reproduced the failure');
  tasks.changeStatus(divya, t3._id, 'in_progress');

  // 4. Not started
  create({ title: 'Write onboarding guide', description: 'A short guide for new joiners.', startDate: d(-1), endDate: d(5), assigneeId: priya._id, priority: 'low', type: 'task', labels: ['docs'], estimatedHours: 6 });

  // 5. With checklist
  const t5 = create({ title: 'QA the weekly timesheet grid', startDate: d(0), endDate: d(3), assigneeId: sanjay._id, priority: 'medium', type: 'task', labels: ['qa'], estimatedHours: 8 });
  tasks.addChecklistItem(sanjay, t5._id, 'Check totals against raw entries');
  tasks.addChecklistItem(sanjay, t5._id, 'Check week navigation');
  tasks.addChecklistItem(sanjay, t5._id, 'Check CSV export');
  const t5full = tasks.getTask(sanjay, t5._id);
  tasks.toggleChecklistItem(sanjay, t5._id, t5full.checklist[0].id);

  // 6. Upcoming
  create({ title: 'Prepare sprint demo', startDate: d(1), endDate: d(4), assigneeId: rahul._id, priority: 'medium', type: 'story', labels: ['demo'], estimatedHours: 5 });

  // 7. Done, older
  const t7 = create({ title: 'Migrate legacy reports', startDate: d(-14), endDate: d(-6), assigneeId: divya._id, priority: 'medium', type: 'task', labels: ['migration'], estimatedHours: 10 });
  log(divya, t7, 12, 4, 'Inventory'); log(divya, t7, 10, 6, 'Migration scripts');
  tasks.changeStatus(divya, t7._id, 'done');

  // 8. Due soon
  const t8 = create({ title: 'Customer feedback triage', startDate: d(-2), endDate: d(1), assigneeId: priya._id, priority: 'medium', type: 'task', labels: ['support'], estimatedHours: 3 });
  log(priya, t8, 1, 1.5, 'First pass');
  tasks.changeStatus(priya, t8._id, 'in_progress');

  // 9. Reassigned (history) : Naveen -> Sanjay
  const t9 = create({ title: 'Update API documentation', startDate: d(-4), endDate: d(6), assigneeId: naveen._id, priority: 'low', type: 'task', labels: ['docs', 'api'], estimatedHours: 6 });
  log(naveen, t9, 3, 2.5, 'Outline of changes');
  addComment(naveen, t9._id, 'Outline done. Endpoint tables still need updating.');
  tasks.reassignTask(meera, t9._id, sanjay._id);

  // 10. Soft-deleted task whose assignee is later removed -> restore needs a new assignee
  const t10 = create({ title: 'Vendor invoice reconciliation', description: 'Cancelled after the vendor contract changed.', startDate: d(-8), endDate: d(-2), assigneeId: naveen._id, priority: 'medium', type: 'task', labels: ['finance'], estimatedHours: 8 });
  log(naveen, t10, 6, 3, 'Matched Q2 invoices');
  addComment(naveen, t10._id, 'Q2 invoices matched. Q3 is pending vendor data.');
  tasks.softDeleteTask(arjun, t10._id);

  // 11. Soft-deleted task that can be restored directly
  const t11 = create({ title: 'Duplicate: login wireframes', startDate: d(-3), endDate: d(2), assigneeId: priya._id, priority: 'low', type: 'task', labels: ['design'], estimatedHours: 2 });
  tasks.softDeleteTask(meera, t11._id);

  // 12. Later
  create({ title: 'Security review checklist', startDate: d(3), endDate: d(9), assigneeId: rahul._id, priority: 'high', type: 'story', labels: ['security'], estimatedHours: 10 });

  // Naveen leaves: his open tasks are gone (reassigned / deleted), so he can be removed.
  users.deactivateUser(meera, naveen._id);
  return { users: 7, tasks: 12 };
}
