// components/GameLinkModal.tsx
import { useState } from "react";
import { GameHistory, GameLink } from "../types";
import { PlatformIcon } from "./Icons";

interface GameLinkModalProps {
  isOpen: boolean;
  appId: string;
  gameHistory: Record<string, GameHistory>;
  currentLink: GameLink | null;
  onLink: (otherAppId: string) => void;
  onUnlink: () => void;
  onClose: () => void;
}

export function GameLinkModal({ isOpen, appId, gameHistory, currentLink, onLink, onUnlink, onClose }: GameLinkModalProps) {
  const [search, setSearch] = useState("");
  if (!isOpen) return null;

  const isGrouped = !!currentLink && currentLink.appIds.length > 1;
  const selfName = gameHistory[appId]?.name || appId;
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
        <h3 id="game-link-title" className="confirm-dialog-title">🔗 Link Game Sets</h3>
        <p className="confirm-dialog-message game-link-modal-message">
          Linking two entries (e.g. a base game and a subset) makes them
          share one tab, one set of chapters, and merged achievements. So tracking one doesn't hijack the tab from the other.
        </p>

        {isGrouped && currentLink && (
          <div className="game-link-current">
            <div className="game-link-current-label">Currently linked as one set:</div>
            {currentLink.appIds.map(id => (
              <div key={id} className="game-link-current-item">
                <PlatformIcon platform={gameHistory[id]?.platform || "STEAM"} size={14} />
                {gameHistory[id]?.name || id}
              </div>
            ))}
            <button
              className="confirm-dialog-btn danger game-link-unlink-btn"
              onClick={onUnlink}
            >
              Unlink "{selfName}" from this set
            </button>
          </div>
        )}

        <input
          type="text"
          placeholder="Search your tracked games..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="game-link-search-input"
        />

        <div className="game-link-candidates">
          {candidates.length === 0 && (
            <p className="game-link-empty">No other games to link with.</p>
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
          <button className="confirm-dialog-btn cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}