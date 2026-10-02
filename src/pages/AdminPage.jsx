import { useState } from 'react';
import AppHeader from '../components/AppHeader';
import Dashboard from '../components/Dashboard';
import TaskList from '../components/TaskList';
import TaskForm from '../components/TaskForm';
import TaskDetail from '../components/TaskDetail';
import UsersTab from '../components/UsersTab';
import DeletedTab from '../components/DeletedTab';
import Timesheet from '../components/Timesheet';
import CalendarView from '../components/CalendarView';
import SettingsTab from '../components/SettingsTab';
import NotificationBell from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useQuery } from '../hooks/useQuery';
import { listTasksWithHours, tasksCsv } from '../services/reportService';
import { listAllUsers } from '../services/userService';
import { downloadCsv } from '../utils/download';
import { errorMessage } from '../utils/errors';
import { today } from '../utils/dates';

const TABS = [['dashboard', 'Dashboard'], ['tasks', 'Tasks'], ['users', 'Users'], ['deleted', 'Deleted'], ['timesheet', 'Timesheet'], ['calendar', 'Calendar'], ['settings', 'Settings']];

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('tasks');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);
  const { data: tasks, error } = useQuery(() => listTasksWithHours(user), [user._id], []);
  const { data: users } = useQuery(() => listAllUsers(user), [user._id], []);

  function exportTasks() {
    try { downloadCsv(`tasks_${today()}.csv`, tasksCsv(user)); } catch (e) { toast.error(errorMessage(e)); }
  }

  return (
    <>
      <AppHeader tabs={TABS} active={tab} onTab={setTab} extra={<NotificationBell onOpenTask={setOpenId} />} />
      <main id="main" className="page">
        {error && <p className="notice">{errorMessage(error)}</p>}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'tasks' && (
          <>
            <div className="toolbar">
              <h2>Tasks</h2>
              <div className="row">
                <button className="btn" onClick={exportTasks}>Export CSV</button>
                <button className="btn btn-primary" onClick={() => setCreating(true)}>New task</button>
              </div>
            </div>
            <TaskList tasks={tasks} users={users} isAdmin onOpen={setOpenId} />
          </>
        )}
        {tab === 'users' && <UsersTab />}
        {tab === 'deleted' && <DeletedTab onOpen={setOpenId} />}
        {tab === 'timesheet' && <Timesheet onOpenTask={setOpenId} />}
        {tab === 'calendar' && <CalendarView tasks={tasks} onOpen={setOpenId} />}
        {tab === 'settings' && <SettingsTab />}
      </main>
      {creating && <TaskForm onClose={() => setCreating(false)} />}
      {openId && <TaskDetail taskId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
