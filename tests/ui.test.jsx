import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

beforeEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '#/login';
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() { }, removeListener() { } }));
});

async function loadDemoAndLogin(user, name) {
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /load demo data/i }));
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
}

describe('app smoke tests', () => {
  it('admin: walks every tab without crashing, deletes and restores a task', async () => {
    const user = userEvent.setup();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    await loadDemoAndLogin(user, 'Meera Iyer');

    for (const t of ['Dashboard', 'Tasks', 'Users', 'Deleted', 'Timesheet', 'Calendar', 'Settings']) {
      await user.click(await screen.findByRole('tab', { name: t }));
    }
    // Tasks tab: open a task, delete it via confirm dialog
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    await user.click(await screen.findByRole('button', { name: 'Build task list API' }));
    const dialog = await screen.findByRole('dialog', { name: 'TSK-102' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    const confirmDlg = await screen.findByRole('dialog', { name: 'Delete task' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete task' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'TSK-102' })).toBeTruthy();
    await user.click(within(screen.getByRole('dialog', { name: 'TSK-102' })).getByRole('button', { name: 'Delete task' }));
    const confirmAgain = await screen.findByRole('dialog', { name: 'Delete task' });
    await user.click(within(confirmAgain).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Build task list API' })).toBeNull());

    // it appears in Deleted and can be restored
    await user.click(screen.getByRole('tab', { name: 'Deleted' }));
    expect(await screen.findByText('Build task list API')).toBeTruthy();
    const row = screen.getByText('Build task list API').closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Restore' }));
    const restore = await screen.findByRole('dialog', { name: 'Restore task' });
    await user.click(within(restore).getByRole('button', { name: 'Restore task' }));
    await waitFor(() => expect(screen.queryByText('Build task list API')).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(await screen.findByRole('button', { name: 'Build task list API' })).toBeTruthy();
    const real = errSpy.mock.calls.filter((c) => !String(c[0]).includes('not wrapped in act'));
    expect(real.map((c) => String(c[0]).slice(0, 200))).toEqual([]);
  });

  it('admin: create-task form shows validation errors instead of crashing', async () => {
    const user = userEvent.setup();
    await loadDemoAndLogin(user, 'Meera Iyer');
    await user.click(screen.getByRole('button', { name: 'New task' }));
    const dlg = await screen.findByRole('dialog', { name: 'New task' });
    await user.click(within(dlg).getByRole('button', { name: 'Create task' }));
    expect(await within(dlg).findByText('Title is required.')).toBeTruthy();
    expect(within(dlg).getByText('Choose who this task is assigned to.')).toBeTruthy();
  });

  it('user: sees only own tasks, logs hours with validation, and cannot reach /admin', async () => {
    const user = userEvent.setup();
    await loadDemoAndLogin(user, 'Priya Sharma');
    expect(await screen.findByRole('button', { name: 'Write onboarding guide' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Build task list API' })).toBeNull(); // Rahul's task
    expect(screen.queryByRole('button', { name: 'Duplicate: login wireframes' })).toBeNull(); // deleted

    window.location.hash = '#/admin';
    await waitFor(() => expect(window.location.hash).toBe('#/me'));

    await user.click(screen.getByRole('button', { name: 'Write onboarding guide' }));
    const dlg = await screen.findByRole('dialog', { name: /TSK-/ });
    await user.click(within(dlg).getByRole('tab', { name: /Hours/ }));
    await user.type(within(dlg).getByLabelText('Hours'), '30');
    await user.click(within(dlg).getByRole('button', { name: 'Log hours' }));
    expect(await within(dlg).findByText(/cannot exceed 24 hours/)).toBeTruthy();
    await user.clear(within(dlg).getByLabelText('Hours'));
    await user.type(within(dlg).getByLabelText('Hours'), '2.5');
    await user.click(within(dlg).getByRole('button', { name: 'Log hours' }));
    await waitFor(() => expect(within(dlg).getAllByText('2.5h').length).toBeGreaterThan(0));

    // comments
    await user.click(within(dlg).getByRole('tab', { name: /Comments/ }));
    await user.click(within(dlg).getByRole('button', { name: 'Post comment' }));
    expect(await within(dlg).findByText('Write a comment before posting.')).toBeTruthy();
    await user.type(within(dlg).getByPlaceholderText('What did you get done?'), 'Draft finished');
    await user.click(within(dlg).getByRole('button', { name: 'Post comment' }));
    expect(await within(dlg).findByText('Draft finished')).toBeTruthy();
  });

  it('sign out clears only the session, and another user can then sign in', async () => {
    const user = userEvent.setup();
    await loadDemoAndLogin(user, 'Priya Sharma');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(sessionStorage.getItem('tms_session')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tms_tasks')).length).toBeGreaterThan(0);
    await user.type(await screen.findByLabelText('Employee ID'), 'emp102');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: 'Build task list API' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Write onboarding guide' })).toBeNull();
  });

  it('survives corrupted storage', async () => {
    localStorage.setItem('tms_users', '{{{bad');
    localStorage.setItem('tms_tasks', 'null');
    render(<App />);
    expect(await screen.findByRole('button', { name: /load demo data/i })).toBeTruthy();
  });

  it('admin: restoring a deleted task whose assignee was removed requires a new assignee', async () => {
    const user = userEvent.setup();
    await loadDemoAndLogin(user, 'Meera Iyer');
    await user.click(screen.getByRole('tab', { name: 'Deleted' }));
    const title = await screen.findByText('Vendor invoice reconciliation');
    const row = title.closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Restore' }));
    const restore = await screen.findByRole('dialog', { name: 'Restore task' });
    expect(within(restore).getByText(/has been removed/i)).toBeTruthy();
    await user.click(within(restore).getByRole('button', { name: 'Restore task' }));
    expect(await within(restore).findByText(/choose who this task should be assigned to/i)).toBeTruthy();
    await user.selectOptions(
      within(restore).getByLabelText('Assign to'),
      within(restore).getByRole('option', { name: /Priya Sharma/ }),
    );
    await user.click(within(restore).getByRole('button', { name: 'Restore task' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Restore task' })).toBeNull());
    await user.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(await screen.findByRole('button', { name: 'Vendor invoice reconciliation' })).toBeTruthy();
  });

  it('admin: removing another admin asks for two confirmations and keeps them if cancelled', async () => {
    const user = userEvent.setup();
    await loadDemoAndLogin(user, 'Meera Iyer');
    await user.click(screen.getByRole('tab', { name: 'Users' }));
    const row = (await screen.findByText('Arjun Nair')).closest('tr');
    await user.click(within(row).getByRole('button', { name: 'Remove admin' }));
    const first = await screen.findByRole('dialog', { name: 'Remove an admin?' });
    await user.click(within(first).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remove an admin?' })).toBeNull());
    expect(within(row).getByRole('button', { name: 'Remove admin' })).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: 'Remove admin' }));
    const warn = await screen.findByRole('dialog', { name: 'Remove an admin?' });
    await user.click(within(warn).getByRole('button', { name: 'Continue' }));
    const second = await screen.findByRole('dialog', { name: 'Confirm remove admin' });
    await user.click(within(second).getByRole('button', { name: 'Remove admin' }));
    await waitFor(() => {
      const removedRow = screen.getByText('Arjun Nair').closest('tr');
      expect(within(removedRow).getByRole('button', { name: 'Reactivate' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Remove admin' })).toBeNull();
  });
});
