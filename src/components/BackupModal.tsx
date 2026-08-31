// components/BackupModal.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { safeParseJSON } from "../utils";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

interface BackupItem {
  id: string;
  timestamp: number;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupModal({ isOpen, onClose, t }: BackupModalProps) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<BackupItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BackupItem | null>(null);

  useEffect(() => {
    if (isOpen) fetchBackups();
  }, [isOpen]);

  if (!isOpen) return null;

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const str = await invoke<string>("list_backups");
      const data = safeParseJSON(str, []);
      setBackups(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNow = async () => {
    setIsCreating(true);
    const toastId = toast.loading(t("backup.toast.creating") || "Creating backup...");
    try {
      await invoke("create_backup_now");
      toast.success(t("backup.toast.created") || "Backup created", { id: toastId });
      await fetchBackups();
    } catch (e: any) {
      toast.error(e?.toString() || t("backup.toast.createFailed") || "Backup failed", { id: toastId });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async () => {
    if (!pendingRestore) return;
    const id = pendingRestore.id;
    setPendingRestore(null);
    const toastId = toast.loading(t("backup.toast.restoring") || "Restoring backup...");
    try {
      await invoke("restore_backup", { id });
      toast.success(t("backup.toast.restored") || "Backup restored. Reloading...", { id: toastId });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      toast.error(e?.toString() || t("backup.toast.restoreFailed") || "Restore failed", { id: toastId });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await invoke("delete_backup", { id });
      setBackups(prev => prev.filter(b => b.id !== id));
      toast.success(t("backup.toast.deleted") || "Backup deleted");
    } catch (e: any) {
      toast.error(e?.toString() || t("backup.toast.deleteFailed") || "Delete failed");
    }
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog cloud-sync-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title" style={{ marginBottom: "16px" }}>
          {t("backup.title") || "Local Backups"}
        </h3>

        <div className="cloud-sync-info-box">
          <strong>{t("backup.howTo") || "How this works"}</strong>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.5 }}>
            {t("backup.desc") ||
              "The app automatically saves a full snapshot of your library, settings, checklists and links every 5 minutes, keeping the last 20. You can also trigger one manually below, and restore or delete any snapshot."}
          </p>
        </div>

        <div className="batch-import-list-header" style={{ marginTop: "14px" }}>
          <span>{t("backup.count", { count: backups.length }) || `${backups.length} backup${backups.length === 1 ? "" : "s"} saved`}</span>
        </div>

        <div className="batch-import-list" style={{ marginTop: "6px" }}>
          {loading ? (
            <p className="batch-import-empty">{t("backup.loading") || "Loading backups..."}</p>
          ) : backups.length === 0 ? (
            <p className="batch-import-empty">{t("backup.empty") || "No backups yet."}</p>
          ) : (
            backups.map(b => (
              <div key={b.id} className="batch-import-item">
                <div className="batch-import-item-info">
                  <span className="batch-import-item-name">{new Date(b.timestamp).toLocaleString()}</span>
                  <span className="batch-import-item-meta">{formatSize(b.sizeBytes)}</span>
                </div>
                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button className="btn-small btn-small-success" onClick={() => setPendingRestore(b)}>
                    {t("backup.restore_btn") || "Restore"}
                  </button>
                  <button className="btn-small btn-small-danger" onClick={() => setPendingDelete(b)}>
                    {t("backup.delete_btn") || "Delete"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose}>
            {t("backup.close_btn") || "Close"}
          </button>
          <button className="confirm-dialog-btn btn-backup" onClick={handleCreateNow} disabled={isCreating}>
            {isCreating ? (t("backup.creating") || "Creating...") : (t("backup.create_now_btn") || "Back Up Now")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pendingRestore}
        title={t("backup.confirmRestoreTitle") || "Restore this backup?"}
        message={
          pendingRestore
            ? (t("backup.confirmRestoreMsg", { date: new Date(pendingRestore.timestamp).toLocaleString() }) ||
               `This will overwrite your current library, settings, checklists and links with the snapshot from ${new Date(pendingRestore.timestamp).toLocaleString()}. The app will reload afterward.`)
            : ""
        }
        confirmLabel={t("backup.confirmRestoreBtn") || "Restore"}
        onConfirm={handleRestore}
        onCancel={() => setPendingRestore(null)}
      />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t("backup.confirmDeleteTitle") || "Delete this backup?"}
        message={
          pendingDelete
            ? (t("backup.confirmDeleteMsg", { date: new Date(pendingDelete.timestamp).toLocaleString() }) ||
               `This will permanently delete the snapshot from ${new Date(pendingDelete.timestamp).toLocaleString()}.`)
            : ""
        }
        confirmLabel={t("backup.confirmDeleteBtn") || "Delete"}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}