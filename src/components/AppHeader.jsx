import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getTheme, setTheme } from '../utils/theme';

export default function AppHeader({ tabs, active, onTab, extra }) {
  const { user, logout } = useAuth();
  const [theme, setThemeState] = useState(getTheme);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  function onTabsKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex(([key]) => key === active);
    const next = e.key === 'ArrowRight'
      ? (i + 1) % tabs.length
      : (i - 1 + tabs.length) % tabs.length;
    onTab(tabs[next][0]);
  }
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Tasklog</div>
        <div className="topbar-right">
          {extra}
          <button type="button" className="btn btn-small btn-quiet" onClick={flip} aria-pressed={theme === 'dark'}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <span className="whoami"><strong>{user.name}</strong><span className="muted small">{user.role === 'admin' ? 'Admin' : 'User'} {user.employeeId}</span></span>
          <button type="button" className="btn btn-small" onClick={logout}>Sign out</button>
        </div>
      </div>
      <nav className="tabs" role="tablist" aria-label="Sections" onKeyDown={onTabsKey}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={active === key} className={active === key ? 'tab active' : 'tab'} onClick={() => onTab(key)}>{label}</button>
        ))}
      </nav>
    </header>
  );
}
