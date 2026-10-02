import { useState } from 'react';
import { Empty, fmtHours } from './ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { getWeeklyTimesheet, timesheetCsv } from '../services/reportService';
import { listAllUsers } from '../services/userService';
import { addDays, formatShort, formatWeekday, startOfWeek, today } from '../utils/dates';
import { downloadCsv } from '../utils/download';
import { errorMessage } from '../utils/errors';

export default function Timesheet({ onOpenTask }) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today()));
  const [userId, setUserId] = useState('all');
  const { data: users } = useQuery(() => (isAdmin ? listAllUsers(user) : []), [user._id], []);
  const { data: sheet, error } = useQuery(() => getWeeklyTimesheet(user, { weekStart, userId }), [user._id, weekStart, userId], null);

  function exportCsv() {
    try {
      const { csv, label } = timesheetCsv(user, { weekStart, userId });
      downloadCsv(`timesheet_${label}.csv`, csv);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const isCurrentWeek = weekStart === startOfWeek(today());
  const maxCell = sheet ? Math.max(8, ...sheet.rows.flatMap((r) => r.hours)) : 8;

  return (
    <div>
      <div className="toolbar">
        <div className="row">
          <button className="btn btn-small" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous</button>
          <strong className="week-label">{formatShort(weekStart)} to {formatShort(addDays(weekStart, 6))}</strong>
          <button className="btn btn-small" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next</button>
          {!isCurrentWeek && <button className="btn btn-small btn-quiet" onClick={() => setWeekStart(startOfWeek(today()))}>This week</button>}
        </div>
        <div className="row">
          {isAdmin && (
            <select aria-label="Person" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="all">Everyone</option>
              {users.filter((u) => u.role === 'user').map((u) => <option key={u._id} value={u._id}>{u.name}{u.isActive ? '' : ' (removed)'}</option>)}
            </select>
          )}
          <button className="btn btn-small" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {error && <p className="notice">{errorMessage(error)}</p>}
      {sheet && sheet.rows.length === 0 && <Empty title="No hours logged this week">Hours you log against tasks show up here as a weekly grid.</Empty>}
      {sheet && sheet.rows.length > 0 && (
        <>
          <p className="muted small scroll-hint">On a small screen, swipe sideways to see each day of the week.</p>
          <div className="table-wrap">
          <table className="table grid">
            <thead>
              <tr>
                <th>Task</th>
                {sheet.days.map((d) => (
                  <th key={d} className={`num${d === today() ? ' today' : ''}`}>{formatWeekday(d)}<span className="th-sub">{formatShort(d)}</span></th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => (
                <tr key={r.task._id}>
                  <td>
                    <span className="key">{r.task.key}</span>{' '}
                    <button className="link" onClick={() => onOpenTask(r.task._id)}>{r.task.title}</button>
                    {r.task.isDeleted && <span className="badge badge-deleted">Deleted</span>}
                  </td>
                  {r.hours.map((h, i) => (
                    <td key={i} className="num cell" style={h ? { '--heat': Math.round(Math.min(1, h / maxCell) * 60) + 8 } : undefined}>
                      {h ? fmtHours(h) : <span className="muted">-</span>}
                    </td>
                  ))}
                  <td className="num"><strong>{fmtHours(r.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Daily total</td>
                {sheet.dayTotals.map((h, i) => <td key={i} className="num">{h ? fmtHours(h) : '-'}</td>)}
                <td className="num"><strong>{fmtHours(sheet.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
          </div>
        </>
      )}
    </div>
  );
}
