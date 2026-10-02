import { useMemo, useState } from 'react';
import RestoreDialog from './RestoreDialog';
import { Empty, KeyChip, UserName, fmtHours } from './ui';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { listDeletedTasksWithStats } from '../services/reportService';
import { listAllUsers } from '../services/userService';
import { formatDateTime } from '../utils/dates';
import { errorMessage } from '../utils/errors';

export default function DeletedTab({ onOpen }) {
  const { user } = useAuth();
  const { data: tasks, error } = useQuery(() => listDeletedTasksWithStats(user), [user._id], []);
  const { data: users } = useQuery(() => listAllUsers(user), [user._id], []);
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);
  const [restoring, setRestoring] = useState(null);

  return (
    <div>
      <p className="muted intro">Deleted tasks are never erased. Open one to review its comments, hours and history, or restore it.</p>
      {error && <p className="notice">{errorMessage(error)}</p>}
      {tasks.length === 0 ? <Empty title="No deleted tasks">Tasks you delete will be kept here.</Empty> : (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead><tr><th>Task</th><th>Assignee</th><th>Deleted</th><th className="num">Comments</th><th className="num">Hours</th><th /></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t._id}>
                  <td data-label="Task"><KeyChip>{t.key}</KeyChip> <button type="button" className="link" onClick={() => onOpen(t._id)}>{t.title}</button></td>
                  <td data-label="Assignee"><UserName map={userMap} id={t.assigneeId} /></td>
                  <td data-label="Deleted" className="nowrap">{formatDateTime(t.deletedAt)}<div className="muted small">by <UserName map={userMap} id={t.deletedBy} /></div></td>
                  <td data-label="Comments" className="num">{t.commentCount}</td>
                  <td data-label="Hours" className="num">{fmtHours(t.actualHours)}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-small" onClick={() => onOpen(t._id)}>Inspect</button>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setRestoring(t)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {restoring && <RestoreDialog task={restoring} onClose={() => setRestoring(null)} />}
    </div>
  );
}
