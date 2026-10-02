const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());

export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}
export const isValidDateStr = (s) => parseDate(s) !== null;

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}
export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

// Weeks start on Monday.
export function startOfWeek(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
}

export function formatDate(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}
export function formatShort(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-';
}
export function formatWeekday(s) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : '';
}
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const isOverdue = (task) => !task.isDeleted && task.status !== 'done' && task.endDate < today();
