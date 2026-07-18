// components/PsnReauthModal.tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { PSNIcon } from "./Icons";

interface PsnReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (psn: { accessToken: string; accountId: string; npsso: string }) => void;
}

export function PsnReauthModal({ isOpen, onClose, onSaved }: PsnReauthModalProps) {
  const [npsso, setNpsso] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    const trimmed = npsso.trim();
    if (!trimmed) { setError("Please paste your NPSSO token."); return; }
    if (trimmed.length !== 64) { setError("NPSSO tokens are exactly 64 characters."); return; }

    setIsValidating(true);
    setError("");
    try {
      const authStr = await invoke<string>("authenticate_psn", { npsso: trimmed });
      const parsedAuth = JSON.parse(authStr);
      if (parsedAuth.accessToken && parsedAuth.accountId) {
        const psnResult = { accessToken: parsedAuth.accessToken, accountId: parsedAuth.accountId, npsso: trimmed };
        await invoke("save_psn_credentials", { data: JSON.stringify(psnResult) });
        setNpsso("");
        setIsValidating(false);
        onSaved(psnResult);
      } else {
        setError("Failed to verify NPSSO token. It may already be expired — grab a fresh one and try again.");
        setIsValidating(false);
      }
    } catch (e: any) {
      console.error("PSN re-auth error:", e);
      setError(typeof e === "string" ? e : "Failed to verify NPSSO token.");
      setIsValidating(false);
    }
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="psn-reauth-title"
        style={{ maxWidth: "440px", width: "100%", textAlign: "left" }}
      >
        <h3 id="psn-reauth-title" className="confirm-dialog-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <PSNIcon size={20} /> Reconnect PlayStation Network
        </h3>
        <p className="confirm-dialog-message" style={{ textAlign: "left" }}>
          Your PSN session has expired. Log in to{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); open("https://playstation.com"); }} style={{ color: "var(--accent-green)", textDecoration: "underline" }}>
            PlayStation.com
          </a>, then open{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); open("https://ca.account.sony.com/api/v1/ssocookie"); }} style={{ color: "var(--accent-green)", textDecoration: "underline" }}>
            this link
          </a>{" "}
          and copy the <code>npsso</code> value (exactly 64 chars) below.
        </p>

        <input
          type="password"
          placeholder="NPSSO Token..."
          value={npsso}
          onChange={e => { setNpsso(e.target.value); setError(""); }}
          style={{ padding: "10px 14px", borderRadius: "6px", border: "1px solid var(--border-color)", backgroundColor: "var(--bg-color)", color: "white", fontSize: "0.9rem", width: "100%", boxSizing: "border-box", margin: "4px 0 12px 0" }}
        />

        {error && <p style={{ color: "var(--accent-red)", fontSize: "0.85rem", margin: "0 0 12px 0" }}>⚠ {error}</p>}

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose}>Cancel</button>
          <button
            className="confirm-dialog-btn danger"
            onClick={handleSave}
            disabled={isValidating}
            style={{ backgroundColor: isValidating ? "var(--border-color)" : "var(--accent-green)", color: isValidating ? "var(--text-muted)" : "#000" }}
          >
            {isValidating ? "Verifying..." : "Reconnect"}
          </button>
        </div>
      </div>
    </div>
  );
}