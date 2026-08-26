// components/GameLinkModal.tsx
import { useState, useEffect } from "react";
import { GameHistory, GameLink } from "../types";
import { PlatformIcon } from "./Icons";

interface GameLinkModalProps {
  isOpen: boolean;
  appId: string;
  gameHistory: Record<string, GameHistory>;
  currentLink: GameLink | null;
  onLink: (otherAppId: string) => void;
  onUnlink: (appIdToUnlink: string) => void;
  onClose: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function GameLinkModal({ isOpen, appId, gameHistory, currentLink, onLink, onUnlink, onClose, t }: GameLinkModalProps) {
  const [search, setSearch] = useState("");
  const [selectedUnlinkId, setSelectedUnlinkId] = useState(appId);

  useEffect(() => {
    if (isOpen) {
      setSelectedUnlinkId(appId);
      setSearch("");
    }
  }, [isOpen, appId]);

  if (!isOpen) return null;

  const isGrouped = !!currentLink && currentLink.appIds.length > 1;
  const selectedName = gameHistory[selectedUnlinkId]?.name || selectedUnlinkId;
  const selfPlatform = gameHistory[appId]?.platform;

  const candidates = Object.entries(gameHistory)
    .filter(([id]) => id !== appId && !(currentLink?.appIds.includes(id)))
    .filter(([, g]) => !selfPlatform || g.platform === selfPlatform)
    .filter(([, g]) => !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()))
    .sort(([, a], [, b]) => b.lastPlayed - a.lastPlayed)
    .slice(0, 25);

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div
        className="confirm-dialog game-link-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-link-title"
      >
        <h3 id="game-link-title" className="confirm-dialog-title">{t("link.title")}</h3>
        <p className="confirm-dialog-message game-link-modal-message">
          {t("link.desc")}
        </p>

        {isGrouped && currentLink && (
          <div className="game-link-current">
            <div className="game-link-current-label">{t("link.current_label")}</div>
            <div className="game-link-current-list">
              {currentLink.appIds.map(id => (
                <button
                  key={id}
                  className={`game-link-current-item ${selectedUnlinkId === id ? "active" : ""}`}
                  onClick={() => setSelectedUnlinkId(id)}
                >
                  <PlatformIcon platform={gameHistory[id]?.platform || "STEAM"} size={14} />
                  {gameHistory[id]?.name || id}
                </button>
              ))}
            </div>
            <button
              className="confirm-dialog-btn danger game-link-unlink-btn"
              onClick={() => onUnlink(selectedUnlinkId)}
            >
              {t("link.unlink_btn", { name: selectedName })}
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder={t("link.search_placeholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="game-link-search-input"
        />

        <div className="game-link-candidates">
          {candidates.length === 0 && (
            <p className="game-link-empty">{t("link.empty")}</p>
          )}
          {candidates.map(([id, g]) => (
            <button
              key={id}
              onClick={() => onLink(id)}
              className="game-link-candidate-btn"
            >
              <PlatformIcon platform={g.platform} size={14} />
              {g.name}
            </button>
          ))}
        </div>

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose}>{t("link.close_btn")}</button>
        </div>
      </div>
    </div>
  );
}