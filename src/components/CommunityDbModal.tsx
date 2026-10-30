import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { GameHistory, CompletionRating } from "../types";
import { PlatformIcon } from "./Icons";
import { safeParseJSON } from "../utils";
import { CompletionRatingBadge, parseCompletionRating, storeCommunityRatings } from "./CompletionRating";

type Platform = "ALL" | "STEAM" | "RA" | "XBOX" | "PSN";
type SortMode = "NEWEST" | "NAME" | "EASIEST" | "SHORTEST";

const TABS: { id: Platform; labelKey: string; color: string }[] = [
  { id: "ALL", labelKey: "filter.all", color: "#a1a1aa" },
  { id: "STEAM", labelKey: "platform.steam", color: "#66c0f4" },
  { id: "RA", labelKey: "platform.ra", color: "#f59e0b" },
  { id: "XBOX", labelKey: "platform.xbox", color: "#107c10" },
  { id: "PSN", labelKey: "platform.psn", color: "#00439c" },
];

const DB_REPO = "batureren/achievement-scavenger-database";
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVITY_CACHE_KEY = "as.dbActivity.v1";
const ACTIVITY_TTL_MS = 15 * 60 * 1000;
const ACTIVITY_COMMIT_LIMIT = 20;

interface CommunityDbModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameHistory: Record<string, GameHistory>;
  setGameHistory: React.Dispatch<React.SetStateAction<Record<string, GameHistory>>>;
  steamApiKey: string;
  raCreds: { user: string; key: string };
  xboxCreds: { apiKey: string; xuid: string; gamertag: string };
  psnCreds: { accessToken: string; accountId: string };
  t: (key: string, vars?: Record<string, string | number>) => string;
}

interface DbItem {
  appId: string;
  gameName: string;
  completion?: CompletionRating;
  hasGuide: boolean;
  checklistCount: number;
}

interface DbActivity {
  date: number;
  author?: string;
  isNew: boolean;
}

let activityMemo: { at: number; data: Record<string, DbActivity> } | null = null;

function readActivityCache() {
  if (activityMemo) return activityMemo;
  try {
    const raw = localStorage.getItem(ACTIVITY_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.at === "number" && parsed.data && typeof parsed.data === "object") {
        activityMemo = parsed;
        return activityMemo;
      }
    }
  } catch {}
  return null;
}

function writeActivityCache(data: Record<string, DbActivity>) {
  activityMemo = { at: Date.now(), data };
  try { localStorage.setItem(ACTIVITY_CACHE_KEY, JSON.stringify(activityMemo)); } catch {}
}

async function fetchDbActivity(): Promise<Record<string, DbActivity>> {
  const cached = readActivityCache();
  if (cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.data;

  try {
    const listRes = await fetch(`https://api.github.com/repos/${DB_REPO}/commits?path=games&per_page=40`);
    if (!listRes.ok) return cached?.data ?? {};
    const commits = await listRes.json();
    if (!Array.isArray(commits)) return cached?.data ?? {};
    const candidates = commits
      .filter((c: any) => !Array.isArray(c.parents) || c.parents.length <= 1)
      .slice(0, ACTIVITY_COMMIT_LIMIT);

    const details = await Promise.all(
      candidates.map(async (c: any) => {
        try {
          const r = await fetch(`https://api.github.com/repos/${DB_REPO}/commits/${c.sha}`);
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      })
    );

    const map: Record<string, DbActivity> = {};
    for (const d of details) {
      if (!d || !Array.isArray(d.files)) continue;
      const date = Date.parse(d.commit?.committer?.date || d.commit?.author?.date || "");
      if (!Number.isFinite(date)) continue;
      const author: string | undefined = d.author?.login || d.commit?.author?.name || undefined;

      for (const f of d.files) {
        const match = typeof f.filename === "string" ? /^games\/(.+)\.json$/.exec(f.filename) : null;
        if (!match || f.status === "removed") continue;
        const appId = match[1];
        const created = f.status === "added" || f.status === "renamed";
        const existing = map[appId];
        if (!existing) {
          map[appId] = { date, author, isNew: created };
        } else {
          if (date > existing.date) { existing.date = date; existing.author = author; }
          if (created) existing.isNew = true;
        }
      }
    }
    if (Object.keys(map).length === 0 && cached) return cached.data;

    writeActivityCache(map);
    return map;
  } catch {
    return cached?.data ?? {};
  }
}

function formatRelative(ts: number): string {
  const lang = document.documentElement.lang || "en";
  let rtf: Intl.RelativeTimeFormat;
  try { rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" }); }
  catch { rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" }); }

  const diffSec = Math.round((ts - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 365 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), "month");
  return rtf.format(Math.round(diffSec / (365 * 86400)), "year");
}

const platformOf = (appId: string): GameHistory["platform"] =>
  appId.startsWith("RA_") ? "RA" : appId.startsWith("XBOX_") ? "XBOX" : appId.startsWith("PSN_") ? "PSN" : "STEAM";

export function CommunityDbModal({ isOpen, onClose, gameHistory, setGameHistory, steamApiKey, raCreds, xboxCreds, psnCreds, t }: CommunityDbModalProps) {
  const [activeTab, setActiveTab] = useState<Platform>("ALL");
  const [dbItems, setDbItems] = useState<DbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("NEWEST");
  const [activity, setActivity] = useState<Record<string, DbActivity>>(() => readActivityCache()?.data ?? {});

  useEffect(() => {
    if (!isOpen) return;
    if (dbItems.length === 0) fetchDBs();
    let cancelled = false;
    fetchDbActivity().then(data => { if (!cancelled) setActivity(data); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const fetchDBs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${DB_REPO}/contents/games`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const files = data.filter((f: any) => f.type === "file" && f.name.endsWith(".json"));
          
          const fetchedItems: DbItem[] = await Promise.all(
            files.map(async (f: any) => {
              const appId = f.name.replace(".json", "");
              try {
                const rawRes = await fetch(`https://raw.githubusercontent.com/${DB_REPO}/main/games/${f.name}?t=${Date.now()}`);
                if (rawRes.ok) {
                  const rawData = await rawRes.json();
                  const isObj = rawData && typeof rawData === "object" && !Array.isArray(rawData);
                  return {
                    appId,
                    gameName: (isObj && typeof rawData.gameName === "string" && rawData.gameName.trim()) || appId,
                    completion: parseCompletionRating(rawData),
                    hasGuide: !!(isObj && rawData.guide && Array.isArray(rawData.guide.indexes) && rawData.guide.indexes.length > 0),
                    checklistCount: isObj && Array.isArray(rawData.checklists) ? rawData.checklists.length : 0,
                  };
                }
              } catch {}
              return { appId, gameName: appId, hasGuide: false, checklistCount: 0 };
            })
          );
          
          fetchedItems.sort((a, b) => a.gameName.localeCompare(b.gameName));
          setDbItems(fetchedItems);
          storeCommunityRatings(
            fetchedItems.map(i => i.appId),
            Object.fromEntries(fetchedItems.map(i => [i.appId, i.completion]))
          );
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (item: DbItem, platform: GameHistory["platform"]) => {
    if (gameHistory[item.appId] || processingId) return;

    setProcessingId(item.appId);
    const toastId = toast.loading(`Importing ${item.gameName !== item.appId ? item.gameName : item.appId}...`);

    let realName = item.gameName;
    let totalAch = 0;
    let icon: string | undefined = undefined;

    try {
      if (platform === "STEAM") {
        if (realName === item.appId) {
          const fetchedName = await invoke<string>("get_app_name", { appId: item.appId, lang: "english" });
          if (fetchedName) realName = fetchedName;
        }
        if (steamApiKey) {
          const schemaStr = await invoke<string>("get_game_schema", { appId: item.appId, apiKey: steamApiKey, lang: "english" });
          const schema = safeParseJSON(schemaStr, {});
          if (schema.game?.availableGameStats?.achievements) {
            totalAch = schema.game.availableGameStats.achievements.length;
          }
        }
      } else if (platform === "RA" && raCreds.user && raCreds.key) {
        const pureId = item.appId.replace("RA_", "");
        const raStr = await invoke<string>("get_ra_achievements", { user: raCreds.user, apiKey: raCreds.key, gameId: pureId });
        const raData = safeParseJSON(raStr, {});
        if (raData.Title) realName = raData.Title;
        if (raData.ImageIcon) icon = raData.ImageIcon;
        if (raData.Achievements) totalAch = Object.keys(raData.Achievements).length;
      } else if (platform === "XBOX" && xboxCreds.apiKey && xboxCreds.xuid) {
        const pureId = item.appId.replace("XBOX_", "");
        const xboxStr = await invoke<string>("get_xbox_achievements", { apiKey: xboxCreds.apiKey, xuid: xboxCreds.xuid, titleId: pureId });
        const xboxData = safeParseJSON(xboxStr, {});
        const achs = xboxData.achievements || [];
        if (achs.length > 0) {
          realName = achs[0]?.titleAssociations?.[0]?.name || realName;
          totalAch = achs.length;
          icon = achs[0]?.mediaAssets?.find((m: any) => m.type === "Icon" || m.type === "BoxArt")?.url;
        }
      } else if (platform === "PSN" && psnCreds.accessToken) {
        const pureId = item.appId.replace("PSN_", "");
        const psnStr = await invoke<string>("get_psn_trophies", { accessToken: psnCreds.accessToken, accountId: psnCreds.accountId, npCommunicationId: pureId });
        const psnData = safeParseJSON(psnStr, {});
        const achs = psnData.schema?.trophies || [];
        if (achs.length > 0) {
          totalAch = achs.length;
          icon = achs[0]?.trophyIconUrl;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch rich info on add", e);
    }

    const newGame: GameHistory = {
      appId: item.appId,
      name: realName !== item.appId ? realName : "Unknown Game",
      platform,
      totalAch,
      unlockedAch: 0,
      lastPlayed: 0,
      raImageIcon: icon
    };

    let historySnapshot: Record<string, GameHistory> | null = null;
    setGameHistory(prev => {
      const updated = { ...prev, [item.appId]: newGame };
      historySnapshot = updated;
      return updated;
    });

    if (historySnapshot) {
      try {
        await invoke("save_history", { data: JSON.stringify(historySnapshot) });
      } catch (e) {
        console.error(e);
        toast.error("Failed to save. Please try again.", { id: toastId });
        setProcessingId(null);
        return;
      }
    }

    toast.success(t("db.added_btn"), { id: toastId });
    setProcessingId(null);
  };

  const recentStats = useMemo(() => {
    const now = Date.now();
    let recent = 0, added = 0;
    for (const item of dbItems) {
      const act = activity[item.appId];
      if (act && now - act.date < RECENT_WINDOW_MS) {
        recent++;
        if (act.isNew) added++;
      }
    }
    return { recent, added };
  }, [dbItems, activity]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = dbItems.filter(item => {
      const id = item.appId;
      if (activeTab === "STEAM" && !/^\d+$/.test(id)) return false;
      if (activeTab === "RA" && !id.startsWith("RA_")) return false;
      if (activeTab === "XBOX" && !id.startsWith("XBOX_")) return false;
      if (activeTab === "PSN" && !id.startsWith("PSN_")) return false;
      if (term && !id.toLowerCase().includes(term) && !item.gameName.toLowerCase().includes(term)) return false;
      return true;
    });

    const byName = (a: DbItem, b: DbItem) => a.gameName.localeCompare(b.gameName);

    return filtered.sort((a, b) => {
      if (sortMode === "NEWEST") {
        const da = activity[a.appId]?.date ?? 0;
        const db = activity[b.appId]?.date ?? 0;
        if (da !== db) return db - da;
      } else if (sortMode === "EASIEST") {
        const ra = a.completion?.difficulty ?? Infinity;
        const rb = b.completion?.difficulty ?? Infinity;
        if (ra !== rb) return ra - rb;
      } else if (sortMode === "SHORTEST") {
        const la = a.completion?.length ?? Infinity;
        const lb = b.completion?.length ?? Infinity;
        if (la !== lb) return la - lb;
        const ha = a.completion?.hours ?? Infinity;
        const hb = b.completion?.hours ?? Infinity;
        if (ha !== hb) return ha - hb;
      }
      return byName(a, b);
    });
  }, [dbItems, activeTab, search, sortMode, activity]);

  if (!isOpen) return null;

  const now = Date.now();

  const activityText = (act: DbActivity) => {
    const when = formatRelative(act.date);
    if (act.isNew) {
      return act.author
        ? t("db.activity_added_by", { when, author: act.author, defaultValue: "added {when} by {author}" })
        : t("db.activity_added", { when, defaultValue: "added {when}" });
    }
    return act.author
      ? t("db.activity_updated_by", { when, author: act.author, defaultValue: "updated {when} by {author}" })
      : t("db.activity_updated", { when, defaultValue: "updated {when}" });
  };

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="batch-import-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">{t("db.browse_title")}</h3>
        <p className="confirm-dialog-message db-browse-desc">{t("db.browse_desc")}</p>

        {recentStats.recent > 0 && (
          <div className="db-activity-summary">
            <span className="db-activity-summary-icon" aria-hidden="true">🔥</span>
            <span className="db-activity-summary-text">
              {t("db.activity_summary", { count: recentStats.recent, defaultValue: "{count} databases added or updated in the last 30 days" })}
              {recentStats.added > 0 && (
                <span className="db-activity-summary-new">
                  {" · "}{t("db.activity_summary_new", { count: recentStats.added, defaultValue: "{count} brand new" })}
                </span>
              )}
            </span>
            {sortMode !== "NEWEST" && (
              <button className="btn-small btn-small-success" onClick={() => setSortMode("NEWEST")}>
                {t("db.show_newest", { defaultValue: "Show newest" })}
              </button>
            )}
          </div>
        )}

        <div className="batch-import-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`batch-import-tab${activeTab === tab.id ? " active" : ""}`}
              style={activeTab === tab.id ? { borderColor: tab.color, color: tab.color } : {}}
              onClick={() => { setActiveTab(tab.id); setSearch(""); }}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="batch-import-list-header db-browse-toolbar">
          <input
            type="text"
            placeholder="Search by Name or App ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input db-browse-search"
          />
          <select
            className="control-select db-browse-sort"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            title={t("db.sort_title", { defaultValue: "Sort databases" })}
          >
            <option value="NEWEST">{t("db.sort_newest", { defaultValue: "Newest activity" })}</option>
            <option value="NAME">{t("db.sort_name", { defaultValue: "Name (A–Z)" })}</option>
            <option value="EASIEST">{t("db.sort_easiest", { defaultValue: "Easiest 100%" })}</option>
            <option value="SHORTEST">{t("db.sort_shortest", { defaultValue: "Shortest 100%" })}</option>
          </select>
        </div>

        <div className="batch-import-list">
          {loading ? (
            <p className="batch-import-empty">{t("db.fetching")}</p>
          ) : visibleItems.length === 0 ? (
            <p className="batch-import-empty">{t("db.no_dbs")}</p>
          ) : (
            visibleItems.map(item => {
              const platform = platformOf(item.appId);
              const inLib = !!gameHistory[item.appId];
              const isAddingThis = processingId === item.appId;
              const act = activity[item.appId];
              const isRecent = !!act && now - act.date < RECENT_WINDOW_MS;
              const hasExtras = !!item.completion || item.hasGuide || item.checklistCount > 0;

              return (
                <div key={item.appId} className={`batch-import-item db-browse-item${inLib ? " imported" : ""}`}>
                  <div className="batch-import-item-icon batch-import-item-icon--placeholder">
                    <PlatformIcon platform={platform} size={16} />
                  </div>
                  <div className="batch-import-item-info">
                    <div className="db-item-title-row">
                      <span className="batch-import-item-name">{item.gameName}</span>
                      {isRecent && (
                        <span className={`db-activity-badge ${act!.isNew ? "db-activity-badge--new" : "db-activity-badge--updated"}`}>
                          {act!.isNew ? t("db.badge_new", { defaultValue: "NEW" }) : t("db.badge_updated", { defaultValue: "UPDATED" })}
                        </span>
                      )}
                    </div>
                    <span className="batch-import-item-meta">
                      {platform} • ID: {item.appId}
                      {act && <span className="db-activity-meta"> • {activityText(act)}</span>}
                    </span>
                    {hasExtras && (
                      <div className="db-item-extras">
                        <CompletionRatingBadge rating={item.completion} t={t} compact />
                        {item.hasGuide && (
                          <span className="db-item-tag db-item-tag--guide">📖 {t("db.tag_guide", { defaultValue: "Guide" })}</span>
                        )}
                        {item.checklistCount > 0 && (
                          <span className="db-item-tag db-item-tag--checklist">
                            📋 {t("db.tag_checklists", { count: item.checklistCount, defaultValue: "{count} checklists" })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!inLib ? (
                    <button 
                      className="btn-small btn-small-success db-browse-add-btn" 
                      onClick={() => handleAdd(item, platform)}
                      disabled={!!processingId}
                    >
                      {isAddingThis ? "..." : t("db.add_btn")}
                    </button>
                  ) : (
                    <span className="batch-import-item-tag">{t("db.added_btn")}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="confirm-dialog-actions db-browse-actions">
          <button className="confirm-dialog-btn cancel" onClick={onClose}>{t("batch.close_btn")}</button>
        </div>
      </div>
    </div>
  );
}