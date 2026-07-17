// components/BatchImportModal.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { GameHistory } from "../types";
import { PlatformIcon } from "./Icons";
import { unwrapXboxData, safeParseJSON } from "../utils";

type Platform = "STEAM" | "RA" | "XBOX" | "PSN";

interface ImportItem {
  appId: string;
  name: string;
  icon?: string;
  meta?: string;
  platform: Platform;
  totalAch: number;
  unlockedAch: number;
}

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameHistory: Record<string, GameHistory>;
  setGameHistory: React.Dispatch<React.SetStateAction<Record<string, GameHistory>>>;
  steamApiKey: string;
  raCreds: { user: string; key: string };
  xboxCreds: { apiKey: string; xuid: string };
  psnCreds: { accessToken: string; accountId: string };
}

const TABS: { id: Platform; label: string; color: string; available: (p: BatchImportModalProps) => boolean }[] = [
  { id: "PSN",   label: "PlayStation",        color: "#00439c", available: p => !!(p.psnCreds.accessToken && p.psnCreds.accountId) },
  { id: "XBOX",  label: "Xbox",               color: "#107c10", available: p => !!(p.xboxCreds.apiKey && p.xboxCreds.xuid) },
  { id: "RA",    label: "RetroAchievements",  color: "#f59e0b", available: p => !!(p.raCreds.user && p.raCreds.key) },
  { id: "STEAM", label: "Steam",              color: "#66c0f4", available: p => !!p.steamApiKey },
];

// Fetches a single Steam game's achievement progress via the same command
// used by the main dashboard, and reduces it to a total/unlocked count.
async function fetchSteamAchievementCounts(
  steamId: string,
  appId: string,
  apiKey: string
): Promise<{ total: number; unlocked: number } | null> {
  try {
    const str = await invoke<string>("get_achievements", { steamId, appId, apiKey, lang: "en" });
    const data = safeParseJSON(str, {});
    const achievements = data?.playerstats?.achievements;
    if (Array.isArray(achievements) && achievements.length > 0) {
      const total = achievements.length;
      const unlocked = achievements.filter((a: any) => a.achieved === 1).length;
      return { total, unlocked };
    }
    return null;
  } catch {
    return null;
  }
}

// The RA "recent games" list only gives us g.ImageIcon, a small square
// badge icon - not the box art LibraryDashboard actually wants to show on
// the library card. Fetch each selected game's full info (same endpoint
// used when you open the game and load its achievements) so imported RA
// games get the correct card art right away instead of only after you've
// clicked into them once. Returned as a RAW relative path (e.g.
// "/Images/012345.png") since that's the convention raImageIcon uses for
// RA entries - LibraryDashboard prepends the media domain itself.
async function fetchRABoxArt(
  user: string,
  apiKey: string,
  appId: string
): Promise<string | null> {
  try {
    const pureId = appId.replace("RA_", "");
    const str = await invoke<string>("get_ra_achievements", { user, apiKey, gameId: pureId });
    const data = safeParseJSON(str, {});
    return data.ImageBoxArt || data.ImageTitle || data.ImageIcon || null;
  } catch {
    return null;
  }
}

// Runs async tasks with a concurrency cap so we don't fire off hundreds of
// simultaneous requests against Steam's API when importing a large library.
async function mapWithConcurrency<T, R>(
  list: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(list.length);
  let nextIndex = 0;
  let done = 0;
  async function worker() {
    while (nextIndex < list.length) {
      const i = nextIndex++;
      results[i] = await fn(list[i], i);
      done++;
      onProgress?.(done, list.length);
    }
  }
  await Promise.all(new Array(Math.min(limit, list.length)).fill(0).map(worker));
  return results;
}

export function BatchImportModal(props: BatchImportModalProps) {
  const { isOpen, onClose, gameHistory, setGameHistory, steamApiKey, raCreds, xboxCreds, psnCreds } = props;
  const [activeTab, setActiveTab] = useState<Platform>("PSN");
  const [steamIdInput, setSteamIdInput] = useState("");
  const [items, setItems] = useState<ImportItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedTab, setLoadedTab] = useState<Platform | null>(null);
  const [detectedSteamId, setDetectedSteamId] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen || steamIdInput) return;
    invoke<string>("get_local_steam_status")
      .then(status => {
        const parts = status.split("|||");
        const localId = parts[1];
        if (localId) {
          setSteamIdInput(localId);
          setDetectedSteamId(true);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const switchTab = (tab: Platform) => {
    setActiveTab(tab);
    setItems([]);
    setSelected(new Set());
    setLoadedTab(null);
    setError("");
    setSearch("");
  };

  const fetchTab = async (tab: Platform) => {
    setLoading(true);
    setError("");
    try {
      let list: ImportItem[] = [];

      if (tab === "PSN") {
        const limit = 100;
        let offset = 0;
        let total = Infinity;
        const collected: any[] = [];
        while (offset < total && offset < 1000) {
          const str = await invoke<string>("get_psn_recent_games", {
            accessToken: psnCreds.accessToken, accountId: psnCreds.accountId, limit, offset,
          });
          const data = safeParseJSON(str, { trophyTitles: [], totalItemCount: 0 });
          const titles = Array.isArray(data.trophyTitles) ? data.trophyTitles : [];
          collected.push(...titles);
          total = data.totalItemCount || titles.length;
          offset += limit;
          if (titles.length === 0) break;
        }
        list = collected.map((g: any) => {
          const defined = g.definedTrophies || {};
          const earned = g.earnedTrophies || {};
          const totalT = (defined.bronze || 0) + (defined.silver || 0) + (defined.gold || 0) + (defined.platinum || 0);
          const earnedT = (earned.bronze || 0) + (earned.silver || 0) + (earned.gold || 0) + (earned.platinum || 0);
          return {
            appId: `PSN_${g.npCommunicationId}`,
            name: g.trophyTitleName || `PSN Title: ${g.npCommunicationId}`,
            icon: g.trophyTitleIconUrl,
            meta: totalT > 0 ? `${earnedT}/${totalT} trophies` : undefined,
            platform: "PSN" as Platform,
            totalAch: totalT,
            unlockedAch: earnedT,
          };
        });
      }

      if (tab === "XBOX") {
        const str = await invoke<string>("get_xbox_recent_games", { apiKey: xboxCreds.apiKey, xuid: xboxCreds.xuid });
        const data = unwrapXboxData(safeParseJSON(str, {}));
        const titles = Array.isArray(data.titles) ? data.titles : [];
        list = titles.map((g: any) => {
          const totalA = g.achievement?.totalAchievements ?? 0;
          const currentA = g.achievement?.currentAchievements ?? 0;
          return {
            appId: `XBOX_${g.titleId}`,
            name: g.name || g.titleName || `Title ${g.titleId}`,
            icon: g.displayImage,
            meta: totalA > 0 ? `${currentA}/${totalA} achievements` : undefined,
            platform: "XBOX" as Platform,
            totalAch: totalA,
            unlockedAch: currentA,
          };
        });
      }

      if (tab === "RA") {
        const str = await invoke<string>("get_ra_recent_game", { user: raCreds.user, apiKey: raCreds.key, count: 50 });
        const data = safeParseJSON(str, []);
        const games = Array.isArray(data) ? data : [];
        list = games.map((g: any) => {
          const totalA = g.NumPossibleAchievements ?? 0;
          const earnedA = g.NumAchieved ?? 0;
          return {
            appId: `RA_${g.GameID}`,
            name: g.Title || `RA Game ${g.GameID}`,
            icon: g.ImageIcon ? `https://media.retroachievements.org${g.ImageIcon}` : undefined,
            meta: totalA > 0 ? `${earnedA}/${totalA} achievements` : undefined,
            platform: "RA" as Platform,
            totalAch: totalA,
            unlockedAch: earnedA,
          };
        });
      }

      if (tab === "STEAM") {
        if (!steamIdInput.trim()) {
          setError("Enter your SteamID64 to fetch your owned games.");
          setLoading(false);
          return;
        }
        const str = await invoke<string>("get_steam_owned_games", { steamId: steamIdInput.trim(), apiKey: steamApiKey });
        const data = safeParseJSON(str, { response: { games: [] } });
        if (data.error) {
          setError("Could not fetch Steam library. Check your SteamID64 and API key.");
          setLoading(false);
          return;
        }
        const games = data.response?.games || [];
        list = games.map((g: any) => ({
          appId: String(g.appid),
          name: g.name || `AppID ${g.appid}`,
          icon: g.img_icon_url ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg` : undefined,
          meta: g.playtime_forever ? `${Math.round(g.playtime_forever / 60)}h played` : undefined,
          platform: "STEAM" as Platform,
          totalAch: 0,
          unlockedAch: 0,
        }));
      }

      list.sort((a, b) => a.name.localeCompare(b.name));
      setItems(list);
      setLoadedTab(tab);
      if (list.length === 0) setError("No games found for this account.");
    } catch (e: any) {
      setError(typeof e === "string" ? e : "Failed to fetch games.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (appId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  };

  const toggleAll = () => {
    const selectable = filteredItems.filter(i => !gameHistory[i.appId]).map(i => i.appId);
    const allSelected = selectable.length > 0 && selectable.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        selectable.forEach(id => next.delete(id));
      } else {
        selectable.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selected.size === 0) return;

    const toImport = items.filter(i => selected.has(i.appId) && !gameHistory[i.appId]);

    // Steam's "owned games" endpoint doesn't return achievement counts, so
    // those items come in as 0/0. Fetch each one's real progress now so
    // imported Steam games don't sit at 0/0 forever.
    const steamItems = toImport.filter(i => i.platform === "STEAM");
    let achCounts = new Map<string, { total: number; unlocked: number }>();

    if (steamItems.length > 0) {
      const trimmedSteamId = steamIdInput.trim();
      setImportProgress({ done: 0, total: steamItems.length });
      try {
        const results = await mapWithConcurrency(
          steamItems,
          5,
          async item => {
            const counts = await fetchSteamAchievementCounts(trimmedSteamId, item.appId, steamApiKey);
            return { appId: item.appId, counts };
          },
          (done, total) => setImportProgress({ done, total })
        );
        for (const r of results) {
          if (r.counts) achCounts.set(r.appId, r.counts);
        }
      } finally {
        setImportProgress(null);
      }
    }

    // RA's "recent games" list only gives us a small badge (ImageIcon), not
    // the box art LibraryDashboard shows on library cards. Fetch each
    // selected game's full info to grab the real box art up front, instead
    // of leaving the badge in place until the user opens the game once.
    const raItems = toImport.filter(i => i.platform === "RA");
    const raBoxArt = new Map<string, string>();
    if (raItems.length > 0) {
      setImportProgress({ done: 0, total: raItems.length });
      try {
        const results = await mapWithConcurrency(
          raItems,
          5,
          async item => {
            const boxArt = await fetchRABoxArt(raCreds.user, raCreds.key, item.appId);
            return { appId: item.appId, boxArt };
          },
          (done, total) => setImportProgress({ done, total })
        );
        for (const r of results) {
          if (r.boxArt) raBoxArt.set(r.appId, r.boxArt);
        }
      } finally {
        setImportProgress(null);
      }
    }

    setGameHistory(prev => {
      const updated = { ...prev };
      for (const item of toImport) {
        if (updated[item.appId]) continue;
        const steamCounts = achCounts.get(item.appId);

        // Steam's owned-games list only gives us a tiny 32x32 img_icon_url.
        // Don't cache that as raImageIcon or it'll permanently shadow the
        // higher-res header/capsule art that LibraryDashboard otherwise
        // fetches for Steam games. Xbox/PSN icons ARE already good
        // banner-sized art (and already full URLs), so those get cached as-is.
        let cachedIcon: string | undefined;
        if (item.platform === "STEAM") {
          cachedIcon = undefined;
        } else if (item.platform === "RA") {
          // Store the RAW relative path here (e.g. "/Images/012345.png"),
          // never the full media URL: LibraryDashboard prepends the
          // media.retroachievements.org domain itself when rendering RA
          // cards. item.icon was built with the domain already attached
          // (for display in this modal's own list), so caching it as-is
          // would double up the domain and break the image until the user
          // opened the game once and the achievements loader overwrote it
          // with a correct relative path.
          cachedIcon = raBoxArt.get(item.appId) || item.icon?.replace("https://media.retroachievements.org", "");
        } else {
          cachedIcon = item.icon;
        }

        updated[item.appId] = {
          appId: item.appId,
          name: item.name,
          totalAch: steamCounts ? steamCounts.total : item.totalAch,
          unlockedAch: steamCounts ? steamCounts.unlocked : item.unlockedAch,
          lastPlayed: Date.now(),
          platform: item.platform,
          raImageIcon: cachedIcon,
        } as GameHistory;
      }
      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
      return updated;
    });

    const missedCount = steamItems.length - achCounts.size;
    toast.success(`Imported ${selected.size} game${selected.size === 1 ? "" : "s"}`);
    if (missedCount > 0) {
      toast(`${missedCount} Steam game${missedCount === 1 ? "" : "s"} had no achievement data (private profile or no stats) and imported as 0/0.`, { icon: "⚠️", duration: 5000 });
    }
    setSelected(new Set());
    onClose();
  };

  const currentTabInfo = TABS.find(t => t.id === activeTab)!;
  const isAvailable = currentTabInfo.available(props);
  const filteredItems = search.trim()
    ? items.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;
  const selectableCount = filteredItems.filter(i => !gameHistory[i.appId]).length;

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="batch-import-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">Batch Import Games</h3>

        <div className="batch-import-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`batch-import-tab${activeTab === tab.id ? " active" : ""}`}
              style={activeTab === tab.id ? { borderColor: tab.color, color: tab.color } : {}}
              onClick={() => switchTab(tab.id)}
            >
              <PlatformIcon platform={tab.id} size={14} /> {tab.label}
            </button>
          ))}
        </div>

        {!isAvailable ? (
          <p className="batch-import-empty">Connect {currentTabInfo.label} in your account settings first.</p>
        ) : (
          <>
            {activeTab === "STEAM" && (
              <div className="batch-import-steamid-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                <input
                  type="text"
                  placeholder="Your SteamID64 (e.g. 7656119...)"
                  value={steamIdInput}
                  onChange={e => { setSteamIdInput(e.target.value); setDetectedSteamId(false); }}
                  className="edit-input"
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
                <p style={{ color: "var(--text-muted)", fontSize: "0.78rem", margin: 0 }}>
                  {detectedSteamId
                    ? "✓ Auto-detected from your running Steam client."
                    : <>Steam's API doesn't let us look this up from your API key alone. Find yours at{" "}
                        <a href="#" onClick={e => { e.preventDefault(); open("https://steamid.io/"); }}>steamid.io</a>{" "}
                        or in Steam under Profile → Edit Profile.</>}
                </p>
              </div>
            )}

            {loadedTab !== activeTab ? (
              <button className="library-play-btn" style={{ alignSelf: "flex-start" }} disabled={loading} onClick={() => fetchTab(activeTab)}>
                {loading ? "Loading…" : `Fetch ${currentTabInfo.label} Games`}
              </button>
            ) : (
              <>
                <div className="batch-import-list-header" style={{ gap: "8px" }}>
                  <input
                    type="text"
                    placeholder={`Search ${currentTabInfo.label} games…`}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="search-input"
                    style={{ flex: 1 }}
                  />
                  {selectableCount > 0 && (
                    <button className="library-filter-chip" onClick={toggleAll} style={{ flexShrink: 0 }}>Select / Deselect All</button>
                  )}
                </div>
                <div className="batch-import-list-header" style={{ marginTop: "-2px" }}>
                  <span>
                    {search.trim()
                      ? `${filteredItems.length} of ${items.length} games match "${search.trim()}"`
                      : `${items.length} games found${selectableCount < items.length ? ` (${items.length - selectableCount} already in library)` : ""}`}
                  </span>
                </div>
                <div className="batch-import-list">
                  {filteredItems.length === 0 && (
                    <p className="batch-import-empty">No games match "{search.trim()}".</p>
                  )}
                  {filteredItems.map(item => {
                    const alreadyImported = !!gameHistory[item.appId];
                    return (
                      <label key={item.appId} className={`batch-import-item${alreadyImported ? " imported" : ""}`}>
                        <input
                          type="checkbox"
                          disabled={alreadyImported}
                          checked={alreadyImported || selected.has(item.appId)}
                          onChange={() => toggle(item.appId)}
                        />
                        {item.icon
                          ? <img src={item.icon} alt="" className="batch-import-item-icon" onError={e => { e.currentTarget.style.display = "none"; }} />
                          : <div className="batch-import-item-icon batch-import-item-icon--placeholder"><PlatformIcon platform={item.platform} size={16} /></div>}
                        <div className="batch-import-item-info">
                          <span className="batch-import-item-name">{item.name}</span>
                          {item.meta && <span className="batch-import-item-meta">{item.meta}</span>}
                        </div>
                        {alreadyImported && <span className="batch-import-item-tag">In Library</span>}
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {error && <p style={{ color: "var(--accent-red)", fontSize: "0.85rem", margin: "8px 0 0" }}>⚠ {error}</p>}

        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose} disabled={!!importProgress}>Close</button>
          <button
            className="confirm-dialog-btn"
            style={{ background: "var(--accent-green)", color: "#000", borderColor: "var(--accent-green)", opacity: (selected.size === 0 || importProgress) ? 0.5 : 1 }}
            disabled={selected.size === 0 || !!importProgress}
            onClick={handleImport}
          >
            {importProgress
              ? `Fetching achievements… (${importProgress.done}/${importProgress.total})`
              : `Import ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}