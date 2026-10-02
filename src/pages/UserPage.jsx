import { useState } from 'react';
import AppHeader from '../components/AppHeader';
import Dashboard from '../components/Dashboard';
import TaskList from '../components/TaskList';
import TaskDetail from '../components/TaskDetail';
import Timesheet from '../components/Timesheet';
import CalendarView from '../components/CalendarView';
import NotificationBell from '../components/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useQuery } from '../hooks/useQuery';
import { listTasksWithHours } from '../services/reportService';
import { listAllUsers } from '../services/userService';
import { errorMessage } from '../utils/errors';

const TABS = [['tasks', 'My tasks'], ['overview', 'Overview'], ['timesheet', 'Timesheet'], ['calendar', 'Calendar']];

export default function UserPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('tasks');
  const [openId, setOpenId] = useState(null);
  const { data: tasks, error } = useQuery(() => listTasksWithHours(user), [user._id], []);
  const { data: users } = useQuery(() => listAllUsers(user), [user._id], []);

  return (
    <>
      <AppHeader tabs={TABS} active={tab} onTab={setTab} extra={<NotificationBell onOpenTask={setOpenId} />} />
      <main id="main" className="page">
        {error && <p className="notice">{errorMessage(error)}</p>}
        {tab === 'tasks' && (
          <>
            <div className="toolbar"><h2>My tasks</h2></div>
            <TaskList tasks={tasks} users={users} isAdmin={false} onOpen={setOpenId} />
          </>
        )}
        {tab === 'overview' && <Dashboard />}
        {tab === 'timesheet' && <Timesheet onOpenTask={setOpenId} />}
        {tab === 'calendar' && <CalendarView tasks={tasks} onOpen={setOpenId} />}
      </main>
      {openId && <TaskDetail taskId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
