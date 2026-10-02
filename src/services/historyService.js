import { readCollection } from '../repository/storage';
import { resolveActor, loadReadableTask } from './common';

// Newest first. Entries written in the same millisecond keep their insertion order (later = newer).
export function listHistory(actor, taskId) {
  const me = resolveActor(actor);
  loadReadableTask(me, taskId);
  return readCollection('history')
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.taskId === taskId)
    .sort((a, b) => b.h.at.localeCompare(a.h.at) || b.i - a.i)
    .map(({ h }) => h);
}
