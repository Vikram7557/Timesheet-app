export const STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];
export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
export const TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'story', label: 'Story' },
];
export const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' },
];

export const MAX_HOURS_PER_ENTRY = 24;
export const MAX_HOURS_PER_DAY = 24;
export const PAGE_SIZE = 10;

export const labelOf = (list, value) => list.find((x) => x.value === value)?.label ?? value ?? '';
export const values = (list) => list.map((x) => x.value);
