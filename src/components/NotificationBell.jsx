import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useAction } from '../hooks/useAction';
import { useQuery } from '../hooks/useQuery';
import { listNotifications, markAllRead, markRead, syncDueSoon } from '../services/notificationService';
import { formatDateTime } from '../utils/dates';

export default function NotificationBell({ onOpenTask }) {
  const { user } = useAuth();
  const { version, refresh } = useData();
  const [run] = useAction();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const { data: list } = useQuery(() => listNotifications(user), [user._id], []);
  const unread = list.filter((n) => !n.read).length;

  // Create "due soon" reminders on load; refresh only if something new was created.
  useEffect(() => {
    try {
      if (syncDueSoon(user) > 0) refresh();
    } catch { /* reminders are best-effort */ }
  }, [user._id, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="bell" ref={box}>
      <button className="btn btn-small" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Notifications{unread > 0 && <span className="count">{unread}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="popover-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link small" onClick={() => run(() => markAllRead(user), null)}>Mark all read</button>}
          </div>
          {list.length === 0 ? <p className="muted pad">Nothing yet.</p> : (
            <ul className="notes">
              {list.map((n) => (
                <li key={n._id} className={n.read ? '' : 'unread'}>
                  <button
                    className="note-btn"
                    onClick={() => {
                      run(() => markRead(user, n._id), null);
                      setOpen(false);
                      if (n.taskId) onOpenTask(n.taskId);
                    }}
                  >
                    <span>{n.message}</span>
                    <span className="muted small">{formatDateTime(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
