import { useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { useAction } from '../hooks/useAction';
import { exportBackup, importBackup, summarizeBackup } from '../services/backupService';
import { storageUsage } from '../repository/storage';
import { downloadText } from '../utils/download';
import { errorMessage } from '../utils/errors';
import { today } from '../utils/dates';
import { useData } from '../context/DataContext';

export default function SettingsTab() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { version } = useData();
  const [run, busy] = useAction();
  const fileRef = useRef(null);
  const kb = Math.round(storageUsage() / 1024);
  void version;

  function doExport() {
    try {
      downloadText(`tasklog-backup-${today()}.json`, exportBackup(user), 'application/json');
      toast.success('Backup downloaded');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let text;
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error('big');
      text = await file.text();
    } catch {
      toast.error('That file could not be read. Choose a Tasklog backup under 4 MB.');
      return;
    }
    let info;
    try {
      info = summarizeBackup(text); // validates the whole file before asking
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }
    const ok = await confirm({
      title: 'Restore backup',
      message: `This replaces ALL current data with the backup (${info.users} users, ${info.tasks} tasks${info.exportedAt ? `, exported ${new Date(info.exportedAt).toLocaleString('en-GB')}` : ''}).\nDownload a backup of the current data first if you might need it. If your account is not in the backup you will be signed out.`,
      confirmLabel: 'Replace data',
      danger: true,
    });
    if (ok) await run(() => importBackup(user, text), 'Backup restored');
  }

  return (
    <div className="stack-lg narrow">
      <section>
        <h3>Backup</h3>
        <p>All data lives in this browser's storage. Download a backup to keep a copy or move to another browser.</p>
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={doExport}>Download backup (JSON)</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy} aria-describedby="restore-hint">
            Restore from backup...
          </button>
          <input
            ref={fileRef}
            id="backup-file"
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            onChange={onFile}
            aria-hidden="true"
          />
        </div>
        <p id="restore-hint" className="muted small">Restoring checks the whole file first. If anything is wrong, nothing is changed. Choose a JSON backup via the Restore button (keyboard and mouse both work).</p>
      </section>
      <section>
        <h3>Storage</h3>
        <p>Using about {kb} KB of the roughly 5,000 KB this browser allows.</p>
      </section>
    </div>
  );
}
