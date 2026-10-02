# Tasklog - Task Management & Timesheet App

A lightweight, Jira-style task manager with an **Admin panel** and a **User workspace**.
Built with React (Vite) and browser LocalStorage, so it runs with no backend and no database.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 47 automated tests (business rules + UI flows)
npm run build      # production build in /dist (static, host anywhere)
```

## Try it in 30 seconds

1. Open the app and click **Load demo data** (or create your own first admin).
2. Sign in from the account list, or type an employee ID.

| Employee ID | Name | Role |
|---|---|---|
| EMP001 | Veeramanigandan | Admin |
| EMP002 | Satheesh | Admin |
| EMP101 | Vivek | User |
| EMP102 | Nivas | User |
| EMP103 | Anand | User |
| EMP104 | Vikram | User |
| EMP105 | Rajasekar | Removed (demo: restore a deleted task that needs a new assignee) |

Tip: sessions are per browser tab, so you can be Admin in one tab and a User in another at the same time.

## What is covered from the requirements

| Requirement | Where |
|---|---|
| Multiple admins, identical privileges | Any user with role Admin; no sub-tiers |
| Admin: add / view / remove users | **Users** tab. "Remove" deactivates (see decisions) |
| Admin: create task (title, description, start, end, assignee) | **Tasks** tab > New task |
| Admin: reassign a task at any time | Task detail > Reassign, or bulk reassign |
| **Soft delete, never hard delete** | Delete sets `isDeleted/deletedAt/deletedBy`. No function that erases a task exists |
| Dedicated UI to inspect and restore deleted tasks | **Deleted** tab (comments, hours, history viewable; Restore button) |
| User sees only their own tasks with dates | **My tasks**, enforced in the service layer |
| User adds progress comments | Task detail > Comments |
| User logs hours per task | Task detail > Hours, plus weekly **Timesheet** grid |
| Full client-side error handling | Validation in services, action wrapper, error boundary, storage rollback |

Extras: task keys (TSK-101), status, priority, type, labels, estimated vs actual hours, checklists, search, filters,
sorting, pagination, overdue highlighting, dashboard, weekly timesheet, calendar, CSV export, in-app notifications,
comment editing (with kept history), bulk reassign/delete, JSON backup/restore, dark mode, toasts and confirm dialogs.

## Architecture

```
src/
  pages/         LoginPage, AdminPage, UserPage        (3 pages)
  components/    TaskList, TaskDetail, TaskForm, Timesheet, CalendarView, Dashboard, ...
  context/       Auth (session), Data (refresh), Toast, Confirm
  services/      ALL business rules + permission checks
  repository/    storage.js  <- the ONLY file that touches localStorage
  utils/         validators, dates, ids, errors
tests/           services.test.js (40), ui.test.jsx (7)
```

Rule: **UI -> services -> storage.js**. Components never read storage directly for business decisions.

### Simulated authentication and authorization

- Login is by employee ID (no password, as the brief says security is not the focus).
- The session (`tms_session`) lives in **sessionStorage**. **Logout removes only the session.** The data
  (localStorage) is never cleared on logout, so the next person can sign in.
- Route guards send users to the right area (`/admin` vs `/me`).
- **Every service function re-verifies the actor** from stored data (must exist, be active, and have the required
  role). A tampered client-side user object cannot escalate its role. Users can only read, comment on, log hours on,
  or change the status of tasks assigned to them.
- **Honest limitation:** LocalStorage is readable by anyone using dev tools on that browser, and data is per browser.
  This is a single-browser simulation. Real security needs a backend (see migration path).

## Data model (MongoDB-ready)

One localStorage key per collection, each an array of flat documents. Ids are 24-char hex strings shaped like
ObjectIds, dates are ISO strings, and relations are by id.

| Key | Documents |
|---|---|
| `tms_users` | `_id, name, employeeId, role, isActive, createdAt` |
| `tms_tasks` | `_id, key, title, description, startDate, endDate, assigneeId, status, priority, type, labels[], estimatedHours, checklist[], isDeleted, deletedAt, deletedBy, createdBy, createdAt, updatedAt` |
| `tms_comments` | `_id, taskId, userId, text, edited, editHistory[], createdAt` |
| `tms_timelogs` | `_id, taskId, userId, hours, workDate, note, createdAt` |
| `tms_history` | `_id, taskId, action, by, from, to, details, at` (audit trail) |
| `tms_notifications` | `_id, userId, taskId, type, message, dedupeKey, read, createdAt` |
| `tms_meta` | `schemaVersion, nextTaskNumber` |

Actual hours are **computed** from time logs, never stored on the task, so they cannot drift.

**Migration path:** Settings > Download backup produces JSON with one array per collection, which loads with
`mongoimport`. To add a backend, rewrite `repository/storage.js` (or the service functions) to call an Express API,
turn the session into a JWT, and move the permission checks into middleware. The UI does not change.

## Key design decisions and edge cases

**Soft delete**
- Deleting sets a flag and records who/when. Comments, hours and history are untouched.
- Deleted tasks disappear from every normal list, from the user's workspace and from user timesheets.
- They stay visible to admins in the **Deleted** tab (including hours and comments) and can be restored.
- Deleted tasks are read-only: no edits, reassignment, comments or hours until restored.
- Restoring when the old assignee was removed forces choosing a new assignee. In the demo, that is Rajasekar (EMP105) and the deleted task **Vendor invoice reconciliation**.
- A test asserts the service API has no delete/purge/remove-record function.

**Removing users** = deactivating (`isActive:false`). Hard-deleting would orphan their comments and hours.
Removed users cannot sign in or receive tasks, but stay visible in history ("removed" tag). A user with open tasks
must have them reassigned first, in one atomic step. You cannot remove yourself or the last admin. Removing another
admin requires a second confirmation (the service also rejects the call unless that confirmation is passed). Removed
users can be reactivated.

**Reassignment** keeps the previous assignee's logged hours and comments attributed to them. The new assignee sees
the earlier comments and hours as context. The old assignee immediately loses access. Every change is in the audit trail.

**Validation** (all in the service layer, shown inline in the forms)
- End date cannot be before start date; impossible dates such as 31 Feb are rejected.
- Hours: greater than 0, at most 24 per entry, at most 2 decimals, no future dates, and at most 24h per user per day.
- Time entries are append-only so the timesheet stays a reliable record.
- Comments: trimmed, non-empty, at most 1000 characters. Edits keep previous text; comments cannot be deleted.
- Duplicate employee IDs (case-insensitive) rejected.

**Robustness**
- Corrupt or missing localStorage falls back to empty defaults instead of crashing.
- Multi-key writes are atomic: if one write fails (storage full), every key is rolled back.
- If localStorage is blocked, the app keeps working in memory for the session.
- Buttons disable while saving, and double submits are ignored.
- If a task is deleted or reassigned while someone has it open, their next action shows a clear message and the view refreshes.
- Changes in another tab refresh this tab (storage event). A user removed elsewhere is signed out.
- A React error boundary catches unexpected rendering errors.
- Bulk actions validate everything first and write once (all-or-nothing).
- Backup restore validates the whole file (structure, enums, references, duplicates) before replacing anything.
- CSV export neutralises spreadsheet formula injection.

## Testing

`npm test` runs 47 tests: permissions, isolation between users, soft delete and restore, reassignment, user removal,
validation, the 24h/day cap, storage corruption and rollback, backup round-trip, CSV escaping, notifications,
plus UI flows (admin tour, nested-dialog Escape, delete then restore, restore with a removed assignee,
removing another admin with two confirmations, validation messages, user isolation, sign-out then sign-in).

## Not built (needs a backend, or too risky for the value)

Recurring tasks (needs a scheduler), task dependencies, file attachments (5 MB LocalStorage limit; links would be the
alternative), multiple assignees, @mentions, CSV import, Excel/PDF export, real authentication, email/push notifications,
editing or voiding time entries (a correction-entry workflow would be the next step).

## Deploy

`npm run build` outputs a static site in `dist/`. Routes are real paths (`/login`, `/admin`, `/me`), so the host must
serve `index.html` for those URLs (already configured for Vercel and Netlify).

**Vercel:** import the Git repo (or `npx vercel`). `vercel.json` sets the build, `dist` output, and SPA rewrites.

**Netlify:** import the Git repo (or drag the `dist` folder). `netlify.toml` sets `npm run build`, `publish = dist`,
and a 200 rewrite of `/*` to `index.html`.

**GitHub Pages:** project sites under a subpath need extra setup; a custom domain or a user/org site at the root is simpler.

After deploy, each visitor gets their own LocalStorage copy. Demo data is not shared between browsers.
