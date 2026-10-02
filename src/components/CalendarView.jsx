import { useMemo, useState } from 'react';
import Modal from './Modal';
import { KeyChip, StatusBadge } from './ui';
import { addDays, isOverdue, toDateStr, today } from '../utils/dates';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarView({ tasks, onOpen }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [dayList, setDayList] = useState(null);

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const start = addDays(toDateStr(first), -lead);
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      return { date, inMonth: Number(date.slice(5, 7)) - 1 === cursor.m, tasks: tasks.filter((t) => t.startDate <= date && t.endDate >= date) };
    });
  }, [cursor, tasks]);

  const title = new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const shift = (n) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <div>
      <div className="toolbar">
        <div className="row">
          <button className="btn btn-small" onClick={() => shift(-1)} aria-label="Previous month">Previous</button>
          <strong className="week-label">{title}</strong>
          <button className="btn btn-small" onClick={() => shift(1)} aria-label="Next month">Next</button>
          <button className="btn btn-small btn-quiet" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Today</button>
        </div>
      </div>
      <p className="muted small scroll-hint">On a small screen, swipe sideways to see the full month.</p>
      <div className="table-wrap">
        <div className="cal" role="grid" aria-label={`Calendar for ${title}`}>
          {WEEKDAYS.map((w) => <div key={w} className="cal-head" role="columnheader">{w}</div>)}
          {cells.map((c) => (
            <div key={c.date} role="gridcell" className={`cal-cell${c.inMonth ? '' : ' out'}${c.date === today() ? ' is-today' : ''}`}>
              <span className="cal-num">{Number(c.date.slice(8))}</span>
              {c.tasks.slice(0, 3).map((t) => (
                <button key={t._id} className={`chip status-${t.status}${isOverdue(t) ? ' chip-late' : ''}`} onClick={() => onOpen(t._id)} title={`${t.key} ${t.title}`}>
                  {t.key} {t.title}
                </button>
              ))}
              {c.tasks.length > 3 && <button className="link small" onClick={() => setDayList(c)}>+{c.tasks.length - 3} more</button>}
            </div>
          ))}
        </div>
      </div>
      {dayList && (
        <Modal title={`Tasks on ${dayList.date}`} onClose={() => setDayList(null)}>
          <ul className="plain">
            {dayList.tasks.map((t) => (
              <li key={t._id} className="row between">
                <span><KeyChip>{t.key}</KeyChip> <button className="link" onClick={() => { setDayList(null); onOpen(t._id); }}>{t.title}</button></span>
                <StatusBadge value={t.status} />
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
