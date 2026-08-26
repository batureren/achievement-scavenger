import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import toast from "react-hot-toast";
import { GameHistory } from "../types";
import { PlatformIcon } from "./Icons";
import { safeParseJSON } from "../utils";

type Platform = "ALL" | "STEAM" | "RA" | "XBOX" | "PSN";

const TABS: { id: Platform; labelKey: string; color: string }[] = [
  { id: "ALL", labelKey: "filter.all", color: "#a1a1aa" },
  { id: "STEAM", labelKey: "platform.steam", color: "#66c0f4" },
  { id: "RA", labelKey: "platform.ra", color: "#f59e0b" },
  { id: "XBOX", labelKey: "platform.xbox", color: "#107c10" },
  { id: "PSN", labelKey: "platform.psn", color: "#00439c" },
];

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
}

export function CommunityDbModal({ isOpen, onClose, gameHistory, setGameHistory, steamApiKey, raCreds, xboxCreds, psnCreds, t }: CommunityDbModalProps) {
  const [activeTab, setActiveTab] = useState<Platform>("ALL");
  const [dbItems, setDbItems] = useState<DbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && dbItems.length === 0) {
      fetchDBs();
    }
  }, [isOpen]);

  const fetchDBs = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://api.github.com/repos/batureren/achievement-scavenger-database/contents/games");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const files = data.filter((f: any) => f.type === "file" && f.name.endsWith(".json"));
          
          const fetchedItems = await Promise.all(
            files.map(async (f: any) => {
              const appId = f.name.replace(".json", "");
              try {
                const rawRes = await fetch(`https://raw.githubusercontent.com/batureren/achievement-scavenger-database/main/games/${f.name}?t=${Date.now()}`);
                if (rawRes.ok) {
                  const rawData = await rawRes.json();
                  return { appId, gameName: rawData.gameName || appId };
                }
              } catch {}
              return { appId, gameName: appId }; 
            })
          );
          
          fetchedItems.sort((a, b) => a.gameName.localeCompare(b.gameName));
          setDbItems(fetchedItems);
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
      // 1. Fetch real names, total achievement counts, and box art on the fly!
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
      lastPlayed: Date.now(),
      raImageIcon: icon
    };

    setGameHistory(prev => {
      const updated = { ...prev, [item.appId]: newGame };
      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
      return updated;
    });

    toast.success(t("db.added_btn"), { id: toastId });
    setProcessingId(null);
  };

  if (!isOpen) return null;

  const filtered = dbItems.filter(item => {
    const id = item.appId;
    if (activeTab === "STEAM" && !/^\d+$/.test(id)) return false;
    if (activeTab === "RA" && !id.startsWith("RA_")) return false;
    if (activeTab === "XBOX" && !id.startsWith("XBOX_")) return false;
    if (activeTab === "PSN" && !id.startsWith("PSN_")) return false;
    
    const term = search.trim().toLowerCase();
    if (term && !id.toLowerCase().includes(term) && !item.gameName.toLowerCase().includes(term)) return false;
    
    return true;
  });

  return (
    <div className="confirm-dialog-overlay" onClick={onClose}>
      <div className="batch-import-modal" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">{t("db.browse_title")}</h3>
        <p className="confirm-dialog-message" style={{ marginBottom: "14px", textAlign: "left" }}>
          {t("db.browse_desc")}
        </p>

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

        <div className="batch-import-list-header" style={{ gap: "8px" }}>
          <input
            type="text"
            placeholder="Search by Name or App ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
            style={{ flex: 1 }}
          />
        </div>

        <div className="batch-import-list">
          {loading ? (
            <p className="batch-import-empty">{t("db.fetching")}</p>
          ) : filtered.length === 0 ? (
            <p className="batch-import-empty">{t("db.no_dbs")}</p>
          ) : (
            filtered.map(item => {
              const platform: GameHistory["platform"] = item.appId.startsWith("RA_") ? "RA" : item.appId.startsWith("XBOX_") ? "XBOX" : item.appId.startsWith("PSN_") ? "PSN" : "STEAM";
              const inLib = !!gameHistory[item.appId];
              const isAddingThis = processingId === item.appId;
              
              return (
                <div key={item.appId} className={`batch-import-item${inLib ? " imported" : ""}`}>
                  <div className="batch-import-item-icon batch-import-item-icon--placeholder">
                    <PlatformIcon platform={platform} size={16} />
                  </div>
                  <div className="batch-import-item-info">
                    <span className="batch-import-item-name">{item.gameName}</span>
                    <span className="batch-import-item-meta">{platform} • ID: {item.appId}</span>
                  </div>
                  {!inLib ? (
                    <button 
                      className="btn-small btn-small-success" 
                      onClick={() => handleAdd(item, platform)}
                      disabled={!!processingId}
                      style={{ opacity: processingId ? 0.5 : 1 }}
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

        <div className="confirm-dialog-actions" style={{ marginTop: "16px" }}>
          <button className="confirm-dialog-btn cancel" onClick={onClose}>{t("batch.close_btn")}</button>
        </div>
      </div>
    </div>
  );
}