import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { SyncConfig } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncConfig: SyncConfig;
  setSyncConfig: (config: SyncConfig) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const FILES_TO_SYNC = [
  "settings.json", "history.json", "tracked.json", "chapters.json", 
  "local_edits.json", "checklists.json", "checklist_progress.json", 
  "user_links.json", "game_links.json"
];

export function CloudSyncModal({ isOpen, onClose, syncConfig, setSyncConfig, t }: CloudSyncModalProps) {
  const [token, setToken] = useState("");
  const [gistId, setGistId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showToken, setShowToken] = useState(false);
  
  const [confirmAction, setConfirmAction] = useState<"backup" | "restore" | null>(null);

  useEffect(() => {
    if (isOpen) {
      setToken(syncConfig.githubToken || "");
      setGistId(syncConfig.gistId || "");
      setShowToken(false);
      setConfirmAction(null);
    }
  }, [isOpen, syncConfig]);

  if (!isOpen) return null;

  const saveConfigToDisk = async (newToken: string, newGistId: string, lastSync: number) => {
    const newConfig = { githubToken: newToken.trim(), gistId: newGistId.trim(), lastSync };
    setSyncConfig(newConfig);
    await invoke("save_sync_config", { data: JSON.stringify(newConfig) }).catch(console.error);
  };

  const handleBackup = async () => {
    if (!token.trim()) return toast.error(t("sync.toast.tokenReq"));
    setIsProcessing(true);
    const toastId = toast.loading(t("sync.toast.gathering"));

    try {
      const files: Record<string, { content: string }> = {};
      
      for (const file of FILES_TO_SYNC) {
        const commandName = `load_${file.replace(".json", "")}`;
        const content = await invoke<string>(commandName).catch(() => "{}");
        files[`scavenger_${file}`] = { content: content.trim() || "{}" };
      }

      const payload = {
        description: "Achievement Scavenger Cloud Sync",
        public: false,
        files
      };

      const url = gistId.trim() 
        ? `https://api.github.com/gists/${gistId.trim()}` 
        : `https://api.github.com/gists`;

      toast.loading(gistId.trim() ? t("sync.toast.updating") : t("sync.toast.creating"), { id: toastId });

      const res = await fetch(url, {
        method: gistId.trim() ? "PATCH" : "POST",
        headers: {
          "Authorization": `token ${token.trim()}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(t("sync.toast.backupFailed"));

      const data = await res.json();
      
      setGistId(data.id);
      await saveConfigToDisk(token, data.id, Date.now());

      toast.success(t("sync.toast.backupSuccess"), { id: toastId });
    } catch (e: any) {
      toast.error(e.message || t("sync.toast.backupFailed"), { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!token.trim() || !gistId.trim()) return toast.error(t("sync.toast.restoreReq"));
    setIsProcessing(true);
    const toastId = toast.loading(t("sync.toast.fetching"));

    try {
      const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, {
        headers: {
          "Authorization": `token ${token.trim()}`,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (!res.ok) throw new Error(t("sync.toast.fetchFailed"));

      const data = await res.json();
      toast.loading(t("sync.toast.applying"), { id: toastId });

      for (const file of FILES_TO_SYNC) {
        const gistFile = data.files[`scavenger_${file}`];
        if (gistFile && gistFile.content) {
          const commandName = `save_${file.replace(".json", "")}`;
          await invoke(commandName, { data: gistFile.content }).catch(console.error);
        }
      }

      await saveConfigToDisk(token, gistId, Date.now());

      toast.success(t("sync.toast.restoreSuccess"), { id: toastId });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast.error(e.message || t("sync.toast.fetchFailed"), { id: toastId });
      setIsProcessing(false);
    }
  };

  const copyGistId = () => {
    navigator.clipboard.writeText(gistId);
    toast.success(t("sync.toast.copied"));
  };

  const executeConfirmedAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "backup") handleBackup();
    if (action === "restore") handleRestore();
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="confirm-dialog cloud-sync-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title" style={{ marginBottom: "16px" }}>{t("sync.title")}</h3>
        
        <div className="cloud-sync-info-box">
          <strong>{t("sync.howTo")}</strong>
          <ol>
            <li dangerouslySetInnerHTML={{ __html: t("sync.step1") }} />
            <li dangerouslySetInnerHTML={{ __html: t("sync.step2") }} />
            <li dangerouslySetInnerHTML={{ __html: t("sync.step3") }} />
          </ol>
        </div>

        <div className="cloud-sync-form-group">
          <label className="cloud-sync-label">
            {t("sync.labelToken")}
            <a href="#" onClick={(e) => { e.preventDefault(); open("https://github.com/settings/tokens/new?scopes=gist&description=Achievement+Scavenger+Sync"); }} className="cloud-sync-label-link">{t("sync.linkGenerate")}</a>
          </label>
          <div className="cloud-sync-input-wrapper">
            <input 
              type={showToken ? "text" : "password"} 
              className="edit-input" 
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxx" 
              value={token} 
              onChange={e => setToken(e.target.value)} 
              onBlur={() => saveConfigToDisk(token, gistId, syncConfig.lastSync)} 
            />
            <button 
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="cloud-sync-eye-btn"
              title={showToken ? t("sync.hideToken") : t("sync.showToken")}
            >
              {showToken ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              )}
            </button>
          </div>
          <p className="cloud-sync-help-text" dangerouslySetInnerHTML={{ __html: t("sync.tokenHelp") }}></p>
        </div>

        <div className="cloud-sync-form-group large-margin">
          <label className="cloud-sync-label">
            {t("sync.labelGist")}
            {gistId && (
              <a href="#" onClick={(e) => { e.preventDefault(); open(`https://gist.github.com/${gistId}`); }} className="cloud-sync-label-link">{t("sync.linkView")}</a>
            )}
          </label>
          <div className="cloud-sync-flex-row">
            <input 
              type="text" 
              className="edit-input" 
              placeholder={t("sync.placeholderGist")} 
              value={gistId} 
              onChange={e => setGistId(e.target.value)} 
              onBlur={() => saveConfigToDisk(token, gistId, syncConfig.lastSync)} 
            />
            {gistId && (
              <button className="btn-small" onClick={copyGistId} title={t("sync.copyTooltip")}>
                {t("sync.copy")}
              </button>
            )}
          </div>
        </div>

        <div className="cloud-sync-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose} disabled={isProcessing}>{t("sync.close")}</button>
          
          <div className="cloud-sync-btn-group">
            <button 
              className="confirm-dialog-btn btn-restore" 
              onClick={() => setConfirmAction("restore")}
              disabled={isProcessing || !gistId.trim() || !token.trim()}
            >
              {t("sync.btnRestore")}
            </button>
            <button 
              className="confirm-dialog-btn btn-backup" 
              onClick={() => setConfirmAction("backup")}
              disabled={isProcessing || !token.trim()}
            >
              {t("sync.btnBackup")}
            </button>
          </div>
        </div>

        {syncConfig.lastSync > 0 && (
          <p className="cloud-sync-last-time">
            {t("sync.lastSync")} {new Date(syncConfig.lastSync).toLocaleString()}
          </p>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmAction}
        title={confirmAction === "backup" ? t("sync.confirmBackupTitle") : t("sync.confirmRestoreTitle")}
        message={confirmAction === "backup" ? t("sync.confirmBackupMsg") : t("sync.confirmRestoreMsg")}
        confirmLabel={confirmAction === "backup" ? t("sync.confirmBackupBtn") : t("sync.confirmRestoreBtn")}
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}