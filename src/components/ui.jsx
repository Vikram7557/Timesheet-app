import { cloneElement, isValidElement, useId } from 'react';
import { STATUSES, PRIORITIES, TYPES, labelOf } from '../constants';

export const StatusBadge = ({ value }) => <span className={`badge status-${value}`}>{labelOf(STATUSES, value)}</span>;
export const PriorityBadge = ({ value }) => <span className={`badge prio-${value}`}>{labelOf(PRIORITIES, value)}</span>;
export const TypeBadge = ({ value }) => <span className={`badge type-${value}`}>{labelOf(TYPES, value)}</span>;
export const KeyChip = ({ children }) => <span className="key">{children}</span>;

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  const id = useId();
  const noteId = `${id}-note`;
  const hasNote = Boolean(error || hint);
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': hasNote ? noteId : undefined })
    : children;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <span id={noteId} className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span id={noteId} className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export const fmtHours = (n) => `${Math.round((Number(n) || 0) * 100) / 100}h`;

export function UserName({ map, id }) {
  const u = map[id];
  if (!u) return <span className="muted">Unknown user</span>;
  return (
    <span>
      {u.name}
      {!u.isActive && <span className="tag tag-removed">removed</span>}
    </span>
  );
}

export function Pagination({ page, pageCount, total, onPage }) {
  if (total === 0) return null;
  return (
    <div className="pager">
      <button className="btn btn-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pageCount} ({total} {total === 1 ? 'item' : 'items'})</span>
      <button className="btn btn-small" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
