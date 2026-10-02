import { readCollection, commit } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { isValidDateStr, today } from '../utils/dates';
import { trimText, throwFields, validateHours } from '../utils/validators';
import { MAX_HOURS_PER_DAY } from '../constants';
import { resolveActor, loadReadableTask, loadWorkableTask, nowIso } from './common';

const round2 = (n) => Math.round(n * 100) / 100;

export function listTimeLogs(actor, taskId) {
  const me = resolveActor(actor);
  loadReadableTask(me, taskId);
  return readCollection('timelogs')
    .filter((l) => l.taskId === taskId)
    .sort((a, b) => b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt));
}

// Timesheet entry. Only the assigned user, only on an active task. Entries are never edited or removed,
// so the timesheet stays a reliable record.
export function addTimeLog(actor, taskId, { hours, workDate, note } = {}) {
  const me = resolveActor(actor);
  loadWorkableTask(me, taskId, { assigneeOnly: true });

  const h = validateHours(hours);
  if (!isValidDateStr(workDate)) throwFields({ workDate: 'Choose a valid date.' });
  if (workDate > today()) throwFields({ workDate: 'You cannot log hours for a future date.' });
  const n = trimText(note);
  if (n.length > 200) throwFields({ note: 'Notes must be 200 characters or fewer.' });

  const logs = readCollection('timelogs');
  const already = logs.filter((l) => l.userId === me._id && l.workDate === workDate).reduce((s, l) => s + l.hours, 0);
  if (round2(already + h) > MAX_HOURS_PER_DAY) {
    throw new AppError(
      ERR.VALIDATION,
      `You have already logged ${round2(already)}h on ${workDate}. A day cannot exceed ${MAX_HOURS_PER_DAY}h.`,
      { fields: { hours: `Only ${round2(MAX_HOURS_PER_DAY - already)}h left for this day.` } },
    );
  }
  const log = { _id: newId(), taskId, userId: me._id, hours: h, workDate, note: n, createdAt: nowIso() };
  commit({ timelogs: [...logs, log] });
  return log;
}
