import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { 
  GameHistory, LibraryFilter, LibrarySortOrder, CompletionStatus, GameLink 
} from "../types";
import { COMPLETION_CONFIG, COMPLETION_KEYS } from "../constants";
import { PlatformIcon } from "./Icons";
import { timeAgo } from "../utils";
import { BatchImportModal } from "./BatchImportModal";
import { CommunityDbModal } from "./CommunityDbModal";
import { ProgressiveImage } from "./ProgressiveImage";

type PlatformFilter = "ALL" | "STEAM" | "RA" | "XBOX" | "PSN";

interface LibraryDashboardProps {
  gameHistory: Record<string, GameHistory>;
  gameLinks: Record<string, GameLink>;
  runningAppIds: string[];
  libraryFilter: LibraryFilter;
  setLibraryFilter: (f: LibraryFilter) => void;
  librarySort: LibrarySortOrder;
  setLibrarySort: (s: LibrarySortOrder) => void;
  librarySearch: string;
  setLibrarySearch: (s: string) => void;
  handleSelectTab: (id: string) => void;
  onSelectAchievement: (appId: string, apiname: string) => void;
  handleRemoveGame: (g: GameHistory) => void;
  setGameHistory: React.Dispatch<React.SetStateAction<Record<string, GameHistory>>>;
  t: (key: string, options?: Record<string, any>) => string;
  language: string;
  steamApiKey: string;
  raCreds: { user: string; key: string };
  xboxCreds: { apiKey: string; xuid: string; gamertag: string };
  psnCreds: { accessToken: string; accountId: string };
}

let imgCacheSaveTimer: ReturnType<typeof setTimeout>;

export function LibraryDashboard({
  gameHistory, gameLinks, runningAppIds, libraryFilter, setLibraryFilter,
  librarySort, setLibrarySort, librarySearch, setLibrarySearch,
  handleSelectTab, onSelectAchievement, handleRemoveGame, setGameHistory, t, language,
  steamApiKey, raCreds, xboxCreds, psnCreds
}: LibraryDashboardProps) {

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDbBrowserOpen, setIsDbBrowserOpen] = useState(false);

  const [visibleCount, setVisibleCount] = useState(40);
  const [screenshots, setScreenshots] = useState<any[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    invoke("get_screenshots")
      .then(res => setScreenshots(JSON.parse(res as string)))
      .catch(console.error);
  }, [gameHistory]);

  useEffect(() => {
    setVisibleCount(40);
  }, [libraryFilter, platformFilter, librarySearch, librarySort]);

  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = (node: HTMLDivElement | null) => {
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 40);
      }
    }, { rootMargin: "800px" });

    if (node) observer.current.observe(node);
  };

  const groupedGames: any[] = [];
  const processedLinkIds = new Set<string>();

  for (const g of Object.values(gameHistory)) {
    const link = Object.values(gameLinks).find(l => l.appIds.includes(g.appId));

    if (link) {
      if (processedLinkIds.has(link.id)) continue;
      processedLinkIds.add(link.id);

      const linkedGames = link.appIds.map(id => gameHistory[id]).filter(Boolean);
      if (linkedGames.length === 0) continue;

      const totalAch = linkedGames.reduce((sum, curr) => sum + curr.totalAch, 0);
      const unlockedAch = linkedGames.reduce((sum, curr) => sum + curr.unlockedAch, 0);
      const lastPlayed = Math.max(...linkedGames.map(curr => curr.lastPlayed));
      const pinned = linkedGames.some(curr => curr.pinned);
      
      const unlockedRarities = linkedGames.map(curr => curr.rarestUnlocked).filter(Boolean);
      const rarestUnlocked = unlockedRarities.length > 0 
        ? unlockedRarities.reduce((min, curr) => curr!.percent < min!.percent ? curr : min) 
        : null;

      const name = link.name || linkedGames.map(curr => curr.name).join(" | ");

      groupedGames.push({
        isGroup: true,
        appId: linkedGames[0].appId,
        name,
        platform: linkedGames[0].platform,
        allPlatforms: Array.from(new Set(linkedGames.map(curr => curr.platform))),
        totalAch,
        unlockedAch,
        lastPlayed,
        pinned,
        completionStatus: linkedGames[0].completionStatus,
        rarestUnlocked,
        linkedGames
      });
    } else {
      groupedGames.push({
        isGroup: false,
        appId: g.appId,
        name: g.name,
        platform: g.platform,
        allPlatforms: [g.platform],
        totalAch: g.totalAch,
        unlockedAch: g.unlockedAch,
        lastPlayed: g.lastPlayed,
        pinned: g.pinned,
        completionStatus: g.completionStatus,
        rarestUnlocked: g.rarestUnlocked,
        linkedGames: [g]
      });
    }
  }

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

  let games = groupedGames.filter(g => {
    if (libraryFilter !== "ALL" && g.completionStatus !== libraryFilter) return false;
    if (platformFilter !== "ALL" && !g.allPlatforms.includes(platformFilter)) return false;
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

  const visibleGames = games.slice(0, visibleCount);

  const playNextCandidates = Object.values(gameHistory)
    .filter(g => g.easiestNext && g.completionStatus !== "abandoned" && g.completionStatus !== "complete" && g.unlockedAch < g.totalAch)
    .sort((a, b) => (b.easiestNext!.percent - a.easiestNext!.percent))
    .slice(0, 20);

  if (Object.keys(gameHistory).length === 0) {
    return (
      <div className="setup-card" style={{ maxWidth: "100%", marginBottom: "20px", textAlign: "center", padding: "40px 20px" }}>
        <h1 className="app-title" style={{ fontSize: "2rem", marginBottom: "10px" }}>{t("lib.title")}</h1>
        <p className="status-text" style={{ justifyContent: "center" }}>
          Launch any Steam game, or play any game on RetroAchievements. We'll automatically detect it and create a tab for it here!
        </p>
        
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px", flexWrap: "wrap" }}>
          <button className="library-filter-chip library-import-btn" onClick={() => setIsImportOpen(true)}>
            {t("batch.import_games_btn")}
          </button>
          <button className="library-filter-chip library-import-btn" onClick={() => setIsDbBrowserOpen(true)}>
            🔍 {t("lib.browse_db")}
          </button>
        </div>

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

        <CommunityDbModal
          isOpen={isDbBrowserOpen}
          onClose={() => setIsDbBrowserOpen(false)}
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
<div id="library-section" className="library-dashboard-wrapper">
        <h2 style={{ fontSize: "1.2rem", color: "var(--text-main)", margin: 0 }}>
          {t("lib.title")}
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 400, marginLeft: "8px" }}>
            {games.length === 1 ? t("lib.game_single") : t("lib.game_plural", { count: games.length })}
          </span>
        </h2>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {(["ALL", "STEAM", "RA", "XBOX", "PSN"] as PlatformFilter[]).map(p => {
             let label = p as string;
             if (p === "ALL") label = t("platform.all");
             else if (p === "STEAM") label = t("platform.steam", { defaultValue: "Steam" });
             else if (p === "RA") label = t("platform.ra", { defaultValue: "RetroAchievements" });
             else if (p === "XBOX") label = t("platform.xbox", { defaultValue: "Xbox" });
             else if (p === "PSN") label = t("platform.psn", { defaultValue: "PlayStation" });

             return (
              <button key={p} onClick={() => setPlatformFilter(p)}
                className={`library-filter-chip${platformFilter === p ? " active" : ""}`}>
                {label}
              </button>
            );
          })}

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
            {t("batch.import_btn_short")}
          </button>
          <button className="library-filter-chip library-import-btn" onClick={() => setIsDbBrowserOpen(true)}>
            🔍 {t("lib.browse_db")}
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
        <div className="library-card-grid">
          {visibleGames.map(game => {
            const percent = game.totalAch > 0 ? Math.round((game.unlockedAch / game.totalAch) * 100) : 0;
            const isRunning = game.linkedGames.some((sub: any) => runningAppIds.includes(sub.appId));

            const barColor = game.totalAch === 0 ? "var(--border-color)"
              : percent >= 100 ? "#a78bfa"
              : percent >= 70  ? "var(--accent-green)"
              : percent >= 30  ? "var(--accent-yellow)"
              : "var(--accent-red)";
            const pctColor = game.totalAch === 0 ? "var(--text-muted)" : barColor;

            return (
              <div key={game.appId} className={`achievement-card library-card${game.pinned ? " library-card--pinned" : ""}${percent >= 100 && game.totalAch > 0 ? " library-card--100" : ""}`}
                onClick={() => handleSelectTab(game.appId)}>

                <div className={`library-card-banner`}>
                  <div className="library-card-banner-multi">
                    {game.linkedGames.map((subGame: any) => {
                      const isSteam = subGame.platform === "STEAM";
                      const steamSrcs = isSteam ? Array.from(new Set([
                        ...(subGame.raImageIcon ? [subGame.raImageIcon] : []),
                        `https://cdn.akamai.steamstatic.com/steam/apps/${subGame.appId}/header.jpg`,
                        `https://cdn.akamai.steamstatic.com/steam/apps/${subGame.appId}/capsule_231x87.jpg`,
                        `https://cdn.akamai.steamstatic.com/steam/apps/${subGame.appId}/capsule_sm_120.jpg`,
                      ])) : [];
                      
                      const isXbox = subGame.platform === "XBOX";
                      const isPSN = subGame.platform === "PSN";
                      const raSrc = (!isSteam && subGame.raImageIcon)
                        ? (isXbox || isPSN) ? subGame.raImageIcon : `https://media.retroachievements.org${subGame.raImageIcon}`
                        : null;

                      const imgSrc = isSteam ? steamSrcs[0] : raSrc;
                      const fallbacks = isSteam ? steamSrcs.slice(1) : [];

                      const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
                        const img = e.currentTarget;
                        if (isSteam && img.src && subGame.raImageIcon !== img.src && img.src.startsWith("http")) {
                          setGameHistory(prev => {
                            const existing = prev[subGame.appId];
                            if (!existing || existing.raImageIcon === img.src) return prev;
                            const updated = { ...prev, [subGame.appId]: { ...existing, raImageIcon: img.src } };
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
                          invoke<string>("get_steam_header_image", { appId: subGame.appId })
                            .then((url) => {
                              if (url) { img.src = url; } 
                              else { img.style.display = "none"; }
                            })
                            .catch(() => { img.style.display = "none"; });
                        } else {
                          img.style.display = "none";
                        }
                      };

                      return (
          <div key={subGame.appId} className="banner-slice">
                          {imgSrc ? (
                            <ProgressiveImage src={imgSrc} data-fallbacks={JSON.stringify(fallbacks)} alt="" onLoad={handleImgLoad} onError={handleImgError} />
                          ) : (
                            <div className="banner-slice-placeholder">
                              <PlatformIcon platform={subGame.platform} size={20}/>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button className="game-card-remove library-card-banner-remove" disabled={isRunning}
                    onClick={(e) => { e.stopPropagation(); handleRemoveGame(game.linkedGames[0]); }}>×</button>
                  <button className={`library-pin-btn library-card-banner-pin${game.pinned ? " pinned" : ""}`}
                    title={game.pinned ? "Unpin game" : "Pin game to top"}
                    onClick={(e) => togglePin(e, game.appId)}>📌</button>
                  {isRunning && (
                    <span className="library-card-banner-live">
                      <span className="live-dot" style={{ position: "relative" }}></span> Live
                    </span>
                  )}
                </div>

                <div style={{ padding: "12px 12px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <h3 style={{ display: "flex", gap: "6px", fontSize: "0.95rem", margin: 0, lineHeight: 1.3, alignItems: "center", flexWrap: "wrap" }}>
                      {game.allPlatforms.map((p: any) => <PlatformIcon key={p} platform={p} size={16}/>)}
                      {game.name}
                      {game.isGroup && <span className="library-card-linked-icon" title="Merged linked set">🔗</span>}
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
                        <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>🕐 {timeAgo(game.lastPlayed, t, language)}</span>
                      )}
                    </div>
                    {!isRunning && game.allPlatforms.includes("STEAM") && (
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

          {visibleCount < games.length && (
            <div ref={loadMoreRef} style={{ height: "1px", gridColumn: "1 / -1" }} />
          )}
        </div>
      )}

{screenshots.length > 0 && (
        <div id="gallery-section" className="library-play-next-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "14px" }}>
            <div>
              <h2 className="library-play-next-title">{t("lib.gallery_title") || "Recent Unlocks Gallery"}</h2>
              <p className="library-play-next-desc">{t("lib.gallery_desc") || "Your latest achievement screenshots."}</p>
            </div>
            <button 
              className="library-play-btn" 
              onClick={() => invoke("open_screenshots_folder").catch(console.error)}
              style={{ marginBottom: "14px" }}
            >
              Open Folder
            </button>
          </div>
          
          <div className="library-gallery-scroll">
            {screenshots.map(s => {
              // Extract achievement name by removing the _YYYYMMDD_HHMMSS.png from the end
              const cleanAchName = s.filename.replace(/_\d{8}_\d{6}\.png$/, '').replace(/_/g, ' ');
              const cleanGameName = s.game_name.replace(/_/g, ' ');

              return (
                <div key={s.path} className="library-gallery-card" onClick={() => setLightboxSrc(convertFileSrc(s.path))}>
                  <ProgressiveImage src={convertFileSrc(s.path)} alt={cleanAchName} loading="lazy" />
                  <div className="library-gallery-info">
                    <span className="gallery-ach-name">{cleanAchName}</span>
                    <span className="gallery-game-name">{cleanGameName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {playNextCandidates.length > 0 && (
        <div id="play-next-section" className="library-play-next-section">
          <h2 className="library-play-next-title">{t("lib.play_next_title")}</h2>
          <p className="library-play-next-desc">
            {t("lib.play_next_desc")}
          </p>
          <div className="library-play-next-grid">
            {playNextCandidates.map(game => {
              const next = game.easiestNext!;
              return (
                <button
                  key={game.appId}
                  onClick={() => onSelectAchievement(game.appId, next.apiname)}
                  className="library-play-next-card"
                  title={`Jump to "${next.name}" in ${game.name}`}
                >
                  {next.icon ? (
                    <ProgressiveImage src={next.icon} alt="" className="library-play-next-icon" />
                  ) : (
                    <div className="library-play-next-icon library-play-next-icon--fallback" />
                  )}
                  <div className="library-play-next-info">
                    <div className="library-play-next-name">{next.name}</div>
                    <div className="library-play-next-source">
                      <PlatformIcon platform={game.platform} size={11} />
                      <span className="library-play-next-source-name">{game.name}</span>
                    </div>
                  </div>
                  <span className="library-play-next-percent" style={{ color: next.color }}>
                    {next.percent.toFixed(1)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {playNextCandidates.length > 0 && (
        <div className="library-float-nav">
          <button
            className="library-float-btn"
            onClick={() => document.getElementById("library-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            title={t("lib.float_library")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
            {t("lib.float_library")}
          </button>
          <button
            className="library-float-btn"
            onClick={() => document.getElementById("play-next-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            title={t("lib.play_next_title")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            {t("lib.float_play_next")}
          </button>
        </div>
      )}

      {lightboxSrc && (
        <div className="cl-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          <img 
            src={lightboxSrc} 
            alt="Preview" 
            onClick={e => e.stopPropagation()} 
            style={{ maxHeight: "90vh", maxWidth: "90vw", borderRadius: "8px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
          />
          <button 
            className="btn-small btn-small-danger" 
            style={{ position: "absolute", top: "24px", right: "24px", width: "32px", height: "32px", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", padding: 0 }}
            onClick={() => setLightboxSrc(null)}
          >
            ✕
          </button>
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

      <CommunityDbModal
        isOpen={isDbBrowserOpen}
        onClose={() => setIsDbBrowserOpen(false)}
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