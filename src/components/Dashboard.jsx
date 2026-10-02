import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { getDashboard } from '../services/reportService';
import { STATUSES } from '../constants';
import { fmtHours } from './ui';
import { errorMessage } from '../utils/errors';

function Stat({ label, value, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Bars({ items, total }) {
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.value}>
          <span className="bars-label">{i.label}</span>
          <span className="bars-track" aria-hidden="true"><span className={`bars-fill fill-${i.value}`} style={{ width: total ? `${(i.count / total) * 100}%` : 0 }} /></span>
          <span className="bars-count">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { data: d, error } = useQuery(() => getDashboard(user), [user._id], null);
  if (error) return <p className="notice">{errorMessage(error)}</p>;
  if (!d) return null;
  const statusItems = STATUSES.map((s) => ({ ...s, count: d.counts[s.value] }));

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat label={isAdmin ? 'Active tasks' : 'My tasks'} value={d.counts.total} />
        <Stat label="In progress" value={d.counts.in_progress} />
        <Stat label="Overdue" value={d.counts.overdue} tone={d.counts.overdue ? 'late' : undefined} />
        <Stat label="Done" value={d.counts.done} />
        <Stat label="Hours this week" value={fmtHours(d.hours.week)} />
        <Stat label="Hours in total" value={fmtHours(d.hours.total)} />
        {isAdmin && <Stat label="Deleted tasks" value={d.counts.deleted} />}
      </div>

      <div className="two-col">
        <section>
          <h3>Tasks by status</h3>
          <Bars items={statusItems} total={d.counts.total} />
        </section>
        <section>
          <h3>Tasks by priority</h3>
          <Bars items={d.byPriority} total={d.counts.total} />
        </section>
      </div>

      {isAdmin && (
        <section>
          <h3>Workload by person</h3>
          {d.workload.length === 0 ? <p className="muted">No users yet.</p> : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead><tr><th>Person</th><th className="num">Open tasks</th><th className="num">Overdue</th><th className="num">Hours this week</th><th className="num">Hours in total</th></tr></thead>
                <tbody>
                  {d.workload.map((w) => (
                    <tr key={w.userId}>
                      <td data-label="Person">{w.name}{!w.isActive && <span className="tag tag-removed">removed</span>}</td>
                      <td data-label="Open tasks" className="num">{w.open}</td>
                      <td data-label="Overdue" className={`num${w.overdue ? ' text-late' : ''}`}>{w.overdue}</td>
                      <td data-label="Hours this week" className="num">{fmtHours(w.weekHours)}</td>
                      <td data-label="Hours in total" className="num">{fmtHours(w.totalHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
