// components/PsnReauthModal.tsx
import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { PSNIcon } from "./Icons";

interface PsnCredsLike {
  accessToken: string;
  accountId: string;
  npsso: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface PsnReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (psn: PsnCredsLike) => void;
  currentPsn?: PsnCredsLike;
}

export function PsnReauthModal({ isOpen, onClose, onSaved, currentPsn }: PsnReauthModalProps) {
  const [npsso, setNpsso] = useState("");
  const [error, setError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [autoStatus, setAutoStatus] = useState<"idle" | "trying" | "failed">("idle");
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      attemptedRef.current = false;
      setAutoStatus("idle");
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const refreshToken = currentPsn?.refreshToken;
    if (!refreshToken) return;

    setAutoStatus("trying");
    (async () => {
      try {
        const authStr = await invoke<string>("refresh_psn_token", { refreshToken });
        const parsedAuth = JSON.parse(authStr);
        if (parsedAuth.accessToken && parsedAuth.accountId) {
          const psnResult: PsnCredsLike = {
            accessToken: parsedAuth.accessToken,
            accountId: parsedAuth.accountId,
            npsso: currentPsn?.npsso || "",
            refreshToken: parsedAuth.refreshToken || refreshToken,
            expiresAt: parsedAuth.expiresAt,
          };
          await invoke("save_psn_credentials", { data: JSON.stringify(psnResult) });
          setAutoStatus("idle");
          onSaved(psnResult);
        } else {
          setAutoStatus("failed");
        }
      } catch (e) {
        console.warn("PSN silent refresh failed, falling back to manual reconnect:", e);
        setAutoStatus("failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
        const psnResult: PsnCredsLike = {
          accessToken: parsedAuth.accessToken,
          accountId: parsedAuth.accountId,
          npsso: trimmed,
          refreshToken: parsedAuth.refreshToken,
          expiresAt: parsedAuth.expiresAt,
        };
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

  if (autoStatus === "trying") {
    return (
      <div className="confirm-dialog-overlay">
        <div
          className="confirm-dialog"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="psn-reauth-title"
          style={{ maxWidth: "440px", width: "100%", textAlign: "left" }}
        >
          <h3 id="psn-reauth-title" className="confirm-dialog-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <PSNIcon size={20} /> Reconnecting to PlayStation Network
          </h3>
          <p className="confirm-dialog-message" style={{ textAlign: "left" }}>
            Trying to restore your session using your saved credentials — no need to log in again if this works.
          </p>
        </div>
      </div>
    );
  }

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
          {autoStatus === "failed"
            ? "Your saved session couldn't be restored automatically, so you'll need to reconnect manually. Log in to"
            : "Your PSN session has expired. Log in to"}{" "}
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