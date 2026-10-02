import { AppError, ERR } from './errors';
import { isValidDateStr } from './dates';
import { STATUSES, PRIORITIES, TYPES, MAX_HOURS_PER_ENTRY, values } from '../constants';

export function throwFields(errors) {
  const first = Object.values(errors)[0];
  throw new AppError(ERR.VALIDATION, first, { fields: errors });
}

export const trimText = (v) => (typeof v === 'string' ? v.trim() : '');
export const oneLine = (v) => trimText(v).replace(/\s+/g, ' ');

const NUM_RE = /^\d+(\.\d{1,2})?$/;
// Accepts "3", "3.5", "3.25" or a number with at most 2 decimals. Returns NaN otherwise.
export function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.round(value * 100) / 100 === value ? value : NaN;
  }
  if (typeof value === 'string' && NUM_RE.test(value.trim())) return Number(value.trim());
  return NaN;
}

export function validateHours(value) {
  if (value === '' || value === null || value === undefined) {
    throwFields({ hours: 'Enter the hours spent.' });
  }
  const n = toNumber(value);
  if (Number.isNaN(n)) throwFields({ hours: 'Hours must be a number with at most 2 decimals, for example 1.5.' });
  if (n <= 0) throwFields({ hours: 'Hours must be greater than 0.' });
  if (n > MAX_HOURS_PER_ENTRY) throwFields({ hours: `A single entry cannot exceed ${MAX_HOURS_PER_ENTRY} hours.` });
  return n;
}

export function normalizeLabels(v) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out = [];
  for (const raw of arr) {
    const l = String(raw).trim().toLowerCase().replace(/\s+/g, '-');
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

export function validateTaskInput(input, { requireAssignee = true } = {}) {
  const src = input || {};
  const errors = {};

  const title = oneLine(src.title);
  if (!title) errors.title = 'Title is required.';
  else if (title.length > 120) errors.title = 'Title must be 120 characters or fewer.';

  const description = trimText(src.description);
  if (description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';

  if (!isValidDateStr(src.startDate)) errors.startDate = 'Choose a valid start date.';
  if (!isValidDateStr(src.endDate)) errors.endDate = 'Choose a valid end date.';
  if (!errors.startDate && !errors.endDate && src.endDate < src.startDate) {
    errors.endDate = 'End date cannot be before the start date.';
  }

  let assigneeId = null;
  if (requireAssignee) {
    assigneeId = typeof src.assigneeId === 'string' ? src.assigneeId : '';
    if (!assigneeId) errors.assigneeId = 'Choose who this task is assigned to.';
  }

  const status = src.status ?? 'todo';
  if (!values(STATUSES).includes(status)) errors.status = 'Choose a valid status.';
  const priority = src.priority ?? 'medium';
  if (!values(PRIORITIES).includes(priority)) errors.priority = 'Choose a valid priority.';
  const type = src.type ?? 'task';
  if (!values(TYPES).includes(type)) errors.type = 'Choose a valid type.';

  const labels = normalizeLabels(src.labels);
  if (labels.length > 8) errors.labels = 'Use at most 8 labels.';
  else if (labels.some((l) => l.length > 20)) errors.labels = 'Each label must be 20 characters or fewer.';

  let estimatedHours = null;
  const est = src.estimatedHours;
  if (est !== '' && est !== null && est !== undefined) {
    const n = toNumber(est);
    if (Number.isNaN(n) || n < 0 || n > 1000) {
      errors.estimatedHours = 'Estimated hours must be between 0 and 1000 (up to 2 decimals).';
    } else estimatedHours = n;
  }

  if (Object.keys(errors).length) throwFields(errors);
  return { title, description, startDate: src.startDate, endDate: src.endDate, assigneeId, status, priority, type, labels, estimatedHours };
}
