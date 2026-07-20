import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { 
  GameHistory, LibraryFilter, LibrarySortOrder, CompletionStatus 
} from "../types";
import { COMPLETION_CONFIG, COMPLETION_KEYS } from "../constants";
import { PlatformIcon } from "./Icons";
import { timeAgo } from "../utils";
import { BatchImportModal } from "./BatchImportModal";

type PlatformFilter = "ALL" | "STEAM" | "RA" | "XBOX" | "PSN";

const PLATFORM_FILTER_LABELS: Record<PlatformFilter, string> = {
  ALL: "All Platforms",
  STEAM: "Steam",
  RA: "RetroAchievements",
  XBOX: "Xbox",
  PSN: "PlayStation",
};

interface LibraryDashboardProps {
  gameHistory: Record<string, GameHistory>;
  runningAppIds: string[];
  libraryFilter: LibraryFilter;
  setLibraryFilter: (f: LibraryFilter) => void;
  librarySort: LibrarySortOrder;
  setLibrarySort: (s: LibrarySortOrder) => void;
  librarySearch: string;
  setLibrarySearch: (s: string) => void;
  handleSelectTab: (id: string) => void;
  handleRemoveGame: (g: GameHistory) => void;
  setGameHistory: React.Dispatch<React.SetStateAction<Record<string, GameHistory>>>;
  t: (key: string) => string;
  steamApiKey: string;
  raCreds: { user: string; key: string };
  xboxCreds: { apiKey: string; xuid: string; gamertag: string };
  psnCreds: { accessToken: string; accountId: string };
}

let imgCacheSaveTimer: ReturnType<typeof setTimeout>;

export function LibraryDashboard({
  gameHistory, runningAppIds, libraryFilter, setLibraryFilter,
  librarySort, setLibrarySort, librarySearch, setLibrarySearch,
  handleSelectTab, handleRemoveGame, setGameHistory, t,
  steamApiKey, raCreds, xboxCreds, psnCreds
}: LibraryDashboardProps) {

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const togglePin = (e: React.MouseEvent, appId: string) => {
    e.stopPropagation();
    setGameHistory(prev => {
      const updated = { ...prev, [appId]: { ...prev[appId], pinned: !prev[appId].pinned } };
      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
      return updated;
    });
  };

  const setStatus = (e: React.MouseEvent, appId: string, status: CompletionStatus | undefined) => {
    e.stopPropagation();
    setGameHistory(prev => {
      const updated = { ...prev, [appId]: { ...prev[appId], completionStatus: status } };
      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
      return updated;
    });
  };

  let games = Object.values(gameHistory).filter(g => {
    if (libraryFilter !== "ALL" && g.completionStatus !== libraryFilter) return false;
    if (platformFilter !== "ALL" && g.platform !== platformFilter) return false;
    if (librarySearch.trim()) return g.name.toLowerCase().includes(librarySearch.trim().toLowerCase());
    return true;
  });

  games.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (librarySort === "LAST_PLAYED")    return b.lastPlayed - a.lastPlayed;
    if (librarySort === "NAME_AZ")        return a.name.localeCompare(b.name);
    if (librarySort === "COMPLETION_DESC") return ((b.unlockedAch / (b.totalAch || 1)) - (a.unlockedAch / (a.totalAch || 1)));
    if (librarySort === "COMPLETION_ASC")  return ((a.unlockedAch / (a.totalAch || 1)) - (b.unlockedAch / (b.totalAch || 1)));
    return 0;
  });

  if (Object.keys(gameHistory).length === 0) {
    return (
      <div className="setup-card" style={{ maxWidth: "100%", marginBottom: "20px", textAlign: "center", padding: "40px 20px" }}>
        <h1 className="app-title" style={{ fontSize: "2rem", marginBottom: "10px" }}>{t("lib.title")}</h1>
        <p className="status-text" style={{ justifyContent: "center" }}>
          Launch any Steam game, or play any game on RetroAchievements. We'll automatically detect it and create a tab for it here!
        </p>
        <button className="library-filter-chip library-import-btn" style={{ marginTop: "16px" }} onClick={() => setIsImportOpen(true)}>
          ＋ Batch Import Games
        </button>

        <BatchImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          gameHistory={gameHistory}
          setGameHistory={setGameHistory}
          steamApiKey={steamApiKey}
          raCreds={raCreds}
          xboxCreds={xboxCreds}
          psnCreds={psnCreds}
          t={t}
        />
      </div>
    );
  }

  return (
    <>
      <div className="library-dashboard-wrapper">
        <h2 style={{ fontSize: "1.2rem", color: "var(--text-main)", margin: 0 }}>
          Library
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "8px" }}>
            {games.length} {games.length === 1 ? "game" : "games"}
          </span>
        </h2>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {(["ALL", "STEAM", "RA", "XBOX", "PSN"] as PlatformFilter[]).map(p => (
            <button key={p} onClick={() => setPlatformFilter(p)}
              className={`library-filter-chip${platformFilter === p ? " active" : ""}`}>
              {PLATFORM_FILTER_LABELS[p]}
            </button>
          ))}

          <div style={{ width: "1px", height: "18px", background: "var(--border-color)", margin: "0 2px" }} />

          {(["ALL", "in_progress", "complete", "not_started", "abandoned"] as (LibraryFilter)[]).map(f => {
            const cfg = f === "ALL" ? null : COMPLETION_CONFIG[f as CompletionStatus];
            return (
              <button key={f} onClick={() => setLibraryFilter(f)}
                className={`library-filter-chip${libraryFilter === f ? " active" : ""}`}
                style={libraryFilter === f && cfg ? { borderColor: cfg.color, color: cfg.color, background: cfg.bg } : {}}>
                {f === "ALL" ? t("lib.all") : t(COMPLETION_KEYS[f])}
              </button>
            );
          })}
          <select value={librarySort} onChange={e => setLibrarySort(e.target.value as LibrarySortOrder)}
            className="control-select" style={{ padding: "4px 8px", fontSize: "0.8rem", height: "28px" }}>
            <option value="LAST_PLAYED">{t("lib.last_played")}</option>
            <option value="NAME_AZ">{t("lib.name_az")}</option>
            <option value="COMPLETION_DESC">{t("lib.most_complete")}</option>
            <option value="COMPLETION_ASC">{t("lib.least_complete")}</option>
          </select>

          <button className="library-filter-chip library-import-btn" onClick={() => setIsImportOpen(true)}>
            ＋ Batch Import
          </button>
        </div>
        <input
          type="text"
          placeholder={t("search.library")}
          value={librarySearch}
          onChange={e => setLibrarySearch(e.target.value)}
          className="search-input"
          style={{ width: "100%"}}
        />
      </div>

      {games.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", padding: "32px 0" }}>{t("lib.empty")}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: "16px" }}>
          {games.map(game => {
            const percent = game.totalAch > 0 ? Math.round((game.unlockedAch / game.totalAch) * 100) : 0;
            const isRunning = runningAppIds.includes(game.appId);

            const barColor = game.totalAch === 0 ? "var(--border-color)"
              : percent >= 100 ? "#a78bfa"
              : percent >= 70  ? "var(--accent-green)"
              : percent >= 30  ? "var(--accent-yellow)"
              : "var(--accent-red)";
            const pctColor = game.totalAch === 0 ? "var(--text-muted)" : barColor;

            return (
              <div key={game.appId} className={`achievement-card library-card${game.pinned ? " library-card--pinned" : ""}`}
                onClick={() => handleSelectTab(game.appId)}>

                {(() => {
                  const isSteam = game.platform === "STEAM";
                  const steamSrcs = isSteam ? Array.from(new Set([
                    ...(game.raImageIcon ? [game.raImageIcon] : []),
                    `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
                    `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/capsule_231x87.jpg`,
                    `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/capsule_sm_120.jpg`,
                  ])) : [];
                  
                  const isXbox = game.platform === "XBOX";
                  const isPSN = game.platform === "PSN";
                  const raSrc = (!isSteam && game.raImageIcon)
                    ? (isXbox || isPSN) ? game.raImageIcon : `https://media.retroachievements.org${game.raImageIcon}`
                    : null;

                  const imgSrc = isSteam ? steamSrcs[0] : raSrc;
                  const fallbacks = isSteam ? steamSrcs.slice(1) : [];

                  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (isSteam && img.src && game.raImageIcon !== img.src && img.src.startsWith("http")) {
                      setGameHistory(prev => {
                        const existing = prev[game.appId];
                        if (!existing || existing.raImageIcon === img.src) return prev;
                        const updated = { ...prev, [game.appId]: { ...existing, raImageIcon: img.src } };
                        if (imgCacheSaveTimer) clearTimeout(imgCacheSaveTimer);
                        imgCacheSaveTimer = setTimeout(() => {
                          invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
                        }, 2500);
                        return updated;
                      });
                    }
                  };

                  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    const srcs: string[] = JSON.parse(img.dataset.fallbacks || "[]");
                    if (srcs.length > 0) {
                      img.src = srcs[0];
                      img.dataset.fallbacks = JSON.stringify(srcs.slice(1));
                    } else if (isSteam && img.dataset.apiTried !== "1") {
                      img.dataset.apiTried = "1";
                      invoke<string>("get_steam_header_image", { appId: game.appId })
                        .then((url) => {
                          if (url) { img.src = url; } 
                          else { img.style.display = "none"; img.parentElement?.classList.add("library-card-banner--fallback"); }
                        })
                        .catch(() => { img.style.display = "none"; img.parentElement?.classList.add("library-card-banner--fallback"); });
                    } else {
                      img.style.display = "none";
                      img.parentElement?.classList.add("library-card-banner--fallback");
                    }
                  };

                  return (
                    <div className={`library-card-banner${!imgSrc ? " library-card-banner--fallback" : ""}`}>
                      {imgSrc ? (
                        <img src={imgSrc} data-fallbacks={JSON.stringify(fallbacks)} alt="" className="library-card-banner-img" onLoad={handleImgLoad} onError={handleImgError} />
                      ) : null}
                      <div className="library-card-banner-placeholder">
                        <PlatformIcon platform={game.platform} size={20}/>
                        <span>{game.name}</span>
                      </div>
                      <button className="game-card-remove library-card-banner-remove" disabled={isRunning}
                        onClick={(e) => { e.stopPropagation(); handleRemoveGame(game); }}>×</button>
                      <button className={`library-pin-btn library-card-banner-pin${game.pinned ? " pinned" : ""}`}
                        title={game.pinned ? "Unpin game" : "Pin game to top"}
                        onClick={(e) => togglePin(e, game.appId)}>📌</button>
                      {isRunning && (
                        <span className="library-card-banner-live">
                          <span className="live-dot" style={{ position: "relative" }}></span> Live
                        </span>
                      )}
                    </div>
                  );
                })()}

                <div style={{ padding: "12px 12px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <h3 style={{ display: "flex", gap: "6px", fontSize: "0.95rem", margin: 0, lineHeight: 1.3, alignItems: "center", flexWrap: "wrap" }}>
                      <PlatformIcon platform={game.platform} size={16}/>
                      {game.name}
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: pctColor, background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: "4px", fontWeight: 600, flexShrink: 0, marginLeft: "6px" }}>
                      {game.totalAch === 0 ? "—" : `${percent}%`}
                    </span>
                  </div>

                  <div className="progress-bar-track" style={{ height: "4px", marginBottom: "10px" }}>
                    <div style={{ height: "100%", width: `${percent}%`, background: barColor, borderRadius: "10px", transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "10px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span>{game.unlockedAch} / {game.totalAch} {t("card.achievements")}</span>
                      {!isRunning && (
                        <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>🕐 {timeAgo(game.lastPlayed)}</span>
                      )}
                    </div>
                    {!isRunning && game.platform === "STEAM" && (
                      <button onClick={async (e) => { e.stopPropagation(); try { await invoke("launch_steam_game", { appId: game.appId }); toast("Launching…", { icon: "🚀" }); } catch { toast.error("Failed to launch"); } }}
                        className="library-play-btn">{t("card.play")}</button>
                    )}
                    {isRunning && <span style={{ color: "var(--accent-green)", fontWeight: "bold" }}>{t("card.running")}</span>}
                  </div>

                  {game.rarestUnlocked && (
                    <div className="library-rarest-badge" style={{ borderColor: game.rarestUnlocked.color + "55", color: game.rarestUnlocked.color }}
                      title={`Rarest unlocked: ${game.rarestUnlocked.name} (${game.rarestUnlocked.percent.toFixed(1)}% of players)`}>
                      <span style={{ fontSize: "0.7rem", opacity: 0.7, marginRight: "3px" }}>{t("card.rarest")}</span>
                      <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {game.rarestUnlocked.name}
                      </span>
                      <span style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.85 }}>
                        {game.rarestUnlocked.percent.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  <div className="library-status-row" onClick={e => e.stopPropagation()}>
                    {(["in_progress", "complete", "not_started", "abandoned"] as CompletionStatus[]).map(s => {
                      const active = game.completionStatus === s;
                      const cfg = COMPLETION_CONFIG[s];
                      return (
                        <button key={s}
                          className={`library-status-chip${active ? " active" : ""}`}
                          style={active ? { borderColor: cfg.color, color: cfg.color, background: cfg.bg } : {}}
                          onClick={(e) => setStatus(e, game.appId, active ? undefined : s)}
                          title={active ? `Remove "${cfg.label}" tag` : `Mark as ${cfg.label}`}>
                          {t(COMPLETION_KEYS[s])}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BatchImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        gameHistory={gameHistory}
        setGameHistory={setGameHistory}
        steamApiKey={steamApiKey}
        raCreds={raCreds}
        xboxCreds={xboxCreds}
        psnCreds={psnCreds}
        t={t}
      />
    </>
  );
}