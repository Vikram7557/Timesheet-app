import { useState } from 'react';
import Modal from './Modal';
import { Field, KeyChip } from './ui';
import { useAuth } from '../context/AuthContext';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useQuery';
import { restoreTask } from '../services/taskService';
import { listAssignableUsers, listAllUsers } from '../services/userService';

export default function RestoreDialog({ task, onClose, onRestored }) {
  const { user } = useAuth();
  const [run, busy] = useAction();
  const { data: assignees } = useQuery(() => listAssignableUsers(user), [user._id], []);
  const { data: all } = useQuery(() => listAllUsers(user), [user._id], []);
  const previous = all.find((u) => u._id === task.assigneeId);
  const previousUsable = previous?.isActive && previous?.role === 'user';
  const [assigneeId, setAssigneeId] = useState(previousUsable ? previous._id : '');
  const [error, setError] = useState('');

  async function submit() {
    if (!assigneeId) {
      setError('Choose who this task should be assigned to.');
      return;
    }
    const res = await run(() => restoreTask(user, task._id, { assigneeId }), `${task.key} restored`, { inline: true });
    if (res.ok) {
      onRestored?.();
      onClose();
    } else if (res.error?.details?.fields) {
      setError(Object.values(res.error.details.fields)[0]);
    }
  }

  return (
    <Modal
      title="Restore task"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Restoring...' : 'Restore task'}</button>
        </>
      }
    >
      <p><KeyChip>{task.key}</KeyChip> {task.title}</p>
      {!previousUsable && (
        <p className="notice">
          The previous assignee{previous ? ` (${previous.name})` : ''} has been removed. Choose a new assignee to restore this task.
        </p>
      )}
      <Field label="Assign to" error={error}>
        <select value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setError(''); }}>
          <option value="">Choose a user</option>
          {assignees.map((u) => (
            <option key={u._id} value={u._id}>{u.name} ({u.employeeId}){u._id === task.assigneeId ? ' - previous assignee' : ''}</option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}
