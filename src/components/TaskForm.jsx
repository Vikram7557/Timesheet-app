import { useState } from 'react';
import Modal from './Modal';
import { Field } from './ui';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useQuery';
import { createTask, updateTask } from '../services/taskService';
import { listAssignableUsers } from '../services/userService';
import { STATUSES, PRIORITIES, TYPES } from '../constants';
import { today, addDays } from '../utils/dates';

// Create (task = undefined) or edit (task = existing) form. Validation lives in the service; this only shows its messages.
export default function TaskForm({ task, onClose, onSaved }) {
  const { user } = useAuth();
  const isEdit = Boolean(task);
  const [run, busy] = useAction();
  const { data: assignees } = useQuery(() => listAssignableUsers(user), [user._id], []);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(() => ({
    title: task?.title ?? '',
    description: task?.description ?? '',
    startDate: task?.startDate ?? today(),
    endDate: task?.endDate ?? addDays(today(), 7),
    assigneeId: task?.assigneeId ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    type: task?.type ?? 'task',
    labels: (task?.labels ?? []).join(', '),
    estimatedHours: task?.estimatedHours ?? '',
  }));
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  async function submit(e) {
    e.preventDefault();
    const res = await run(
      () => (isEdit ? updateTask(user, task._id, form) : createTask(user, form)),
      isEdit ? 'Task updated' : 'Task created',
      { inline: true },
    );
    if (res.ok) {
      onSaved?.(res.result);
      onClose();
    } else if (res.error?.details?.fields) {
      setErrors(res.error.details.fields);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${task.key}` : 'New task'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" form="task-form" type="submit" disabled={busy}>
            {busy ? 'Saving...' : isEdit ? 'Save changes' : 'Create task'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} noValidate className="form-grid">
        <div className="span-2">
          <Field label="Title" error={errors.title}>
            <input value={form.title} onChange={set('title')} maxLength={140} autoFocus />
          </Field>
        </div>
        <div className="span-2">
          <Field label="Description" error={errors.description}>
            <textarea rows={3} value={form.description} onChange={set('description')} />
          </Field>
        </div>
        <Field label="Start date" error={errors.startDate}>
          <input type="date" value={form.startDate} onChange={set('startDate')} />
        </Field>
        <Field label="End date" error={errors.endDate}>
          <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} />
        </Field>
        {!isEdit && (
          <div className="span-2">
            <Field label="Assign to" error={errors.assigneeId} hint={assignees.length ? undefined : 'No active users yet. Add a user first.'}>
              <select value={form.assigneeId} onChange={set('assigneeId')}>
                <option value="">Choose a user</option>
                {assignees.map((u) => (
                  <option key={u._id} value={u._id}>{u.name} ({u.employeeId})</option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Priority" error={errors.priority}>
          <select value={form.priority} onChange={set('priority')}>
            {PRIORITIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Type" error={errors.type}>
          <select value={form.type} onChange={set('type')}>
            {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {isEdit && (
          <Field label="Status" error={errors.status}>
            <select value={form.status} onChange={set('status')}>
              {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Estimated hours" error={errors.estimatedHours} hint="Optional">
          <input inputMode="decimal" value={form.estimatedHours} onChange={set('estimatedHours')} placeholder="e.g. 8" />
        </Field>
        <div className="span-2">
          <Field label="Labels" error={errors.labels} hint="Separate with commas, for example design, urgent">
            <input value={form.labels} onChange={set('labels')} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
