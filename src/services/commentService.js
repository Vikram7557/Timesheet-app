import { readCollection, commit } from '../repository/storage';
import { AppError, ERR } from '../utils/errors';
import { newId } from '../utils/ids';
import { trimText, throwFields } from '../utils/validators';
import { resolveActor, loadReadableTask, loadWorkableTask, loadTask, nowIso } from './common';

const MAX = 1000;

function cleanComment(text) {
  const t = trimText(text);
  if (!t) throwFields({ text: 'Write a comment before posting.' });
  if (t.length > MAX) throwFields({ text: `Comments must be ${MAX} characters or fewer.` });
  return t;
}

export function listComments(actor, taskId) {
  const me = resolveActor(actor);
  loadReadableTask(me, taskId);
  return readCollection('comments')
    .filter((c) => c.taskId === taskId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Only the assigned user can add progress comments, and only on an active task.
export function addComment(actor, taskId, text) {
  const me = resolveActor(actor);
  loadWorkableTask(me, taskId, { assigneeOnly: true });
  const clean = cleanComment(text);
  const c = { _id: newId(), taskId, userId: me._id, text: clean, edited: false, editHistory: [], createdAt: nowIso() };
  commit({ comments: [...readCollection('comments'), c] });
  return c;
}

// Authors may correct their own comment. The previous text is kept in editHistory; comments are never deleted.
export function editComment(actor, commentId, text) {
  const me = resolveActor(actor);
  const comments = readCollection('comments');
  const c = comments.find((x) => x._id === commentId);
  if (!c) throw new AppError(ERR.NOT_FOUND, 'That comment no longer exists.');
  if (c.userId !== me._id) throw new AppError(ERR.FORBIDDEN, 'You can only edit your own comments.');
  const task = loadTask(c.taskId);
  if (task.isDeleted) throw new AppError(ERR.NOT_FOUND, 'This task has been deleted and can no longer be changed.');
  const clean = cleanComment(text);
  if (clean === c.text) return c;
  const next = { ...c, text: clean, edited: true, editHistory: [...(c.editHistory || []), { text: c.text, at: nowIso() }] };
  commit({ comments: comments.map((x) => (x._id === c._id ? next : x)) });
  return next;
}
