import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import toast, { Toaster } from "react-hot-toast";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./css/style.css";

// Components
import { useUnlockSound } from "./components/UseUnlockSound";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { MenuBar } from "./components/MenuBar";
import { SetupScreen } from "./components/SetupScreen";
import { LibraryDashboard } from "./components/LibraryDashboard";
import { AchievementCard } from "./components/AchievementCard";
import { PlatformIcon, GitHubIcon } from "./components/Icons";

import { 
  AppSettings, MergedAchievement, UserLink, CommunityLink, 
  LocalEdit, OverlayStyle, GameHistory, Theme,
  SortOrder, LibrarySortOrder, LibraryFilter, FilterType 
} from "./types";
import { 
  BUILTIN_THEMES, TRANSLATIONS, STEAM_LANG_MAP, THEMES_URL, GITHUB_DB_BASE_URL 
} from "./constants";
import { 
  safeParseJSON, safeParseTracked, applyTheme, unwrapXboxData
} from "./utils";


function App() {
  const [appState, setAppState] = useState<"LOADING" | "SETUP" | "WAITING" | "PLAYING">("LOADING");
  
  const [settings, setSettings] = useState<AppSettings>({ 
    alwaysOnTop: false, themeId: "default", hiddenHints: {}, soundEnabled: true, 
    opacity: 1.0, gameSortOrders: {}, lastSelectedTab: "", windowWidth: 1200, 
    windowHeight: 800, language: "en", enableTransparency: true, runOnStartup: false 
  });

  const t = (key: string) => {
    const langDict = TRANSLATIONS[settings.language] || TRANSLATIONS["en"];
    return langDict[key] || TRANSLATIONS["en"][key] || key;
  };

  const [apiKey, setApiKey] = useState<string>("");
  const [raCreds, setRaCreds] = useState<{ user: string; key: string }>({ user: "", key: "" });
  const [xboxCreds, setXboxCreds] = useState<{ apiKey: string; xuid: string; gamertag: string }>({ apiKey: "", xuid: "", gamertag: "" });

  const [gameName, setGameName] = useState("Loading...");
  const [achievements, setAchievements] = useState<MergedAchievement[]>([]);
  const [isProfilePrivate, setIsProfilePrivate] = useState(false);
  
  // View States
  const [filter, setFilter] = useState<FilterType>("ALL");
  const [selectedChapter, setSelectedChapter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("DEFAULT");

  useEffect(() => {
    const appId = selectedAppIdRef.current;
    if (!appId || appState === "LOADING" || appState === "SETUP") return;
    const updated = {
      ...settingsRef.current,
      gameSortOrders: { ...settingsRef.current.gameSortOrders, [appId]: sortOrder },
    };
    saveSettings(updated);
  }, [sortOrder]);

  const [guidedMode, setGuidedMode] = useState(false);
  const [isMiniMode, setIsMiniMode] = useState(false);
  const [sessionUnlocks, setSessionUnlocks] = useState<{ time: string; ach: MergedAchievement }[]>([]);
  const [librarySort, setLibrarySort] = useState<LibrarySortOrder>("LAST_PLAYED");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("ALL");
  const [librarySearch, setLibrarySearch] = useState("");
  const [missableAlertDismissed, setMissableAlertDismissed] = useState(false);

  // Multi-game tracking state
  const [runningAppIds, setRunningAppIds] = useState<string[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>(""); 
  const isSelectedGameRA = selectedAppId.startsWith("RA_");
  const isSelectedGameXbox = selectedAppId.startsWith("XBOX_");

  const [userLinks, setUserLinks] = useState<UserLink[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  
  const [newChapterInput, setNewChapterInput] = useState(""); 
  const [allLocalChapters, setAllLocalChapters] = useState<Record<string, string[]>>({}); 

  const [trackedData, setTrackedData] = useState<Record<string, string[]>>({});
  const [editMode, setEditMode] = useState(false);
  const [communityLinks, setCommunityLinks] = useState<CommunityLink[]>([]);
  const [hasCommunityDb, setHasCommunityDb] = useState<boolean | null>(null);
  const [allLocalEdits, setAllLocalEdits] = useState<Record<string, Record<string, LocalEdit>>>({});
  const [themes, setThemes] = useState<Theme[]>(BUILTIN_THEMES);
  const [gameHistory, setGameHistory] = useState<Record<string, GameHistory>>({});
  const [pendingRemoveGame, setPendingRemoveGame] = useState<GameHistory | null>(null);

  // Refs
  const allLocalEditsRef = useRef<Record<string, Record<string, LocalEdit>>>({});
  const settingsRef = useRef<AppSettings>({ alwaysOnTop: false, themeId: "default", hiddenHints: {}, soundEnabled: true, opacity: 1.0, gameSortOrders: {}, lastSelectedTab: "", windowWidth: 1200, windowHeight: 800, isMiniMode: false, language: "en" });
  const apiKeyRef = useRef<string>("");
  const raCredsRef = useRef<{ user: string; key: string }>({ user: "", key: "" });
  const xboxCredsRef = useRef<{ apiKey: string; xuid: string; gamertag: string }>({ apiKey: "", xuid: "", gamertag: "" });
  const selectedAppIdRef = useRef<string>("");
  const prevRunningAppIdsRef = useRef<string[]>([]);
  const gameNameRef = useRef<string>("Unknown Game");
  
  const achievementsCacheRef = useRef<Record<string, MergedAchievement[]>>({});
  const schemaCacheRef = useRef<Record<string, any[]>>({});
  const percentagesCacheRef = useRef<Record<string, Map<string, number>>>({});
  const communityDbCacheRef = useRef<Record<string, { db: any[], links: CommunityLink[], chapters: string[] }>>({});

  const lastNetworkFetchRef = useRef<number>(0);
  const prevUnlockedRef = useRef<Record<string, Set<string>>>({});
  
  // Polling Refs
  const lastRaPollTimeRef = useRef<number>(0);
  const lastSteamStatusPollRef = useRef<number>(0);
  const tickInFlightRef = useRef<boolean>(false);
  const pendingTickRef = useRef<boolean>(false);
  const tickRef = useRef<(options?: { forceTabSwitch?: boolean }) => Promise<void>>(async () => {});
  const cachedRunningAppIdsRef = useRef<string[]>([]);
  const cachedSteamIdRef = useRef<string>("");
  const activeRaIdRef = useRef<string | null>(null); 
  const lastXboxPollTimeRef = useRef<number>(0);
  const lastXboxNetworkFetchRef = useRef<number>(0); 
  const activeXboxIdRef = useRef<string | null>(null);

  // Tabs bar scroll arrows
  const tabsBarRef = useRef<HTMLDivElement>(null);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

  const updateTabsScrollState = () => {
    const el = tabsBarRef.current;
    if (!el) return;
    setTabsCanScrollLeft(el.scrollLeft > 4);
    setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  const scrollTabsBy = (dir: -1 | 1) => {
    const el = tabsBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  useEffect(() => {
    const el = tabsBarRef.current;
    if (!el) return;
    updateTabsScrollState();
    const ro = new ResizeObserver(updateTabsScrollState);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gameHistory, isMiniMode]);

  useEffect(() => {
    const el = tabsBarRef.current;
    if (!el || !selectedAppId) return;
    const activeTab = el.querySelector(".game-tab-wrapper.active") as HTMLElement | null;
    activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [selectedAppId]);

  const [statsOpen, setStatsOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(false);

  const handleSetWindowMode = async (mode: "WINDOWED" | "BORDERLESS" | "FULLSCREEN") => {
    try {
      await invoke("set_window_mode", { mode });
      saveSettings({ ...settingsRef.current, windowMode: mode });
    } catch (e) {
      console.error("Failed to set window mode", e);
    }
  };

  const handleOpenScreenshots = () => { invoke("open_screenshots_folder").catch(console.error); };

  const playUnlockSound = useUnlockSound(settings.soundEnabled);

  const handleChangeUiScale = (scale: number) => { 
    setSettings(prev => ({ ...prev, uiScale: scale })); 
    settingsRef.current.uiScale = scale; 
    document.documentElement.style.setProperty("--ui-scale", scale.toString()); 
  };
  const handleSaveUiScale = () => { saveSettings({ ...settingsRef.current, uiScale: settings.uiScale }); };

  useEffect(() => {
    if (appState === "LOADING" || appState === "SETUP") return;
    let debounceTimer: number | undefined;
    const handleResize = () => {
      if (settingsRef.current.isMiniMode) return; 

      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        try {
          const size = await getCurrentWebviewWindow().innerSize();
          const scale = await getCurrentWebviewWindow().scaleFactor();
          const w = Math.round(size.width / scale);
          const h = Math.round(size.height / scale);
          
          if (w > 100 && h > 100) { 
            const updated = { ...settingsRef.current, windowWidth: w, windowHeight: h };
            saveSettings(updated);
          }
        } catch {}
      }, 400);
    };
    window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); if (debounceTimer) window.clearTimeout(debounceTimer); };
  }, [appState]);

  // 1. Mount Phase
  useEffect(() => {
    async function init() {
      try { const res = await fetch(THEMES_URL); if (res.ok) { const remote = await res.json(); if (Array.isArray(remote) && remote.length > 0) setThemes(remote); } } catch { }

      try {
        const settingsStr = await invoke<string>("load_settings");
        const savedSettings: AppSettings = { ...settingsRef.current, ...safeParseJSON(settingsStr, {}) };
        if (savedSettings.uiScale === undefined) savedSettings.uiScale = 1.0;

        settingsRef.current = savedSettings; 
        setSettings(savedSettings);
        applyTheme(BUILTIN_THEMES.find(t => t.id === savedSettings.themeId) || BUILTIN_THEMES[0]);
        document.documentElement.style.setProperty("--ui-scale", savedSettings.uiScale.toString());
        document.documentElement.lang = savedSettings.language || "en";
        
        setIsMiniMode(savedSettings.isMiniMode || false);

        if (savedSettings.isMiniMode) {
          await invoke("set_custom_window_size", { width: 380.0, height: 500.0 }).catch(() => {});
        } else if (savedSettings.windowWidth && savedSettings.windowHeight) {
          await invoke("set_custom_window_size", { width: savedSettings.windowWidth, height: savedSettings.windowHeight }).catch(() => {});
        }

        if (savedSettings.alwaysOnTop) await invoke("set_always_on_top", { value: true }).catch(() => {}); 
        if (savedSettings.opacity !== undefined && savedSettings.opacity !== 1.0) await invoke("set_window_opacity", { opacity: savedSettings.opacity }).catch(() => {});

        const savedKey = await invoke<string>("load_api_key");
        const savedRa = await invoke<string>("load_ra_credentials");
        const savedXbox = await invoke<string>("load_xbox_credentials");
        
        const rawRa = safeParseJSON(savedRa, {});
        const parsedRa = { user: rawRa.user || "", key: rawRa.key || "" };

        const rawXbox = safeParseJSON(savedXbox, {});
        const parsedXbox = { apiKey: rawXbox.apiKey || "", xuid: rawXbox.xuid || "", gamertag: rawXbox.gamertag || "" };
        
        setApiKey(savedKey); 
        apiKeyRef.current = savedKey; 
        setRaCreds(parsedRa);
        raCredsRef.current = parsedRa;
        setXboxCreds(parsedXbox);
        xboxCredsRef.current = parsedXbox;

        if ((savedKey && savedKey.length > 0) || (parsedRa.user && parsedRa.key) || (parsedXbox.apiKey && parsedXbox.xuid)) { 
          setAppState("WAITING"); 
        } else { 
          setAppState("SETUP"); 
          return; 
        }

        try {
          const isAutostart = await invoke<boolean>("plugin:autostart|is_enabled");
          savedSettings.runOnStartup = isAutostart;
        } catch(e) { console.error("Autostart error", e); }

        const historyStr = await invoke<string>("load_history"); setGameHistory(safeParseJSON(historyStr, {}));
        const linksStr = await invoke<string>("load_user_links"); setUserLinks(Array.isArray(safeParseJSON(linksStr, [])) ? safeParseJSON(linksStr, []) : []);
        const trackedStr = await invoke<string>("load_tracked"); setTrackedData(safeParseTracked(trackedStr));
        const chaptersStr = await invoke<string>("load_chapters"); setAllLocalChapters(safeParseJSON(chaptersStr, {}));
        const editsStr = await invoke<string>("load_local_edits"); 
        const editsData = safeParseJSON(editsStr, {});
        setAllLocalEdits(editsData); 
        allLocalEditsRef.current = editsData;
        if (savedSettings.lastSelectedTab) {
          setSelectedAppId(savedSettings.lastSelectedTab);
          selectedAppIdRef.current = savedSettings.lastSelectedTab;
          if (savedSettings.lastSelectedTab !== "") setAppState("PLAYING");
        }

        if (savedSettings.windowMode && savedSettings.windowMode !== "WINDOWED") {
          await invoke("set_window_mode", { mode: savedSettings.windowMode }).catch(() => {});
        }

        if (savedSettings.lastSelectedTab && savedSettings.gameSortOrders?.[savedSettings.lastSelectedTab]) {
          setSortOrder(savedSettings.gameSortOrders[savedSettings.lastSelectedTab]);
        }
      } catch (e) { 
        setAppState("SETUP"); 
      }
    }
    init();
  }, []);

  const saveSettings = async (updated: AppSettings) => { settingsRef.current = updated; setSettings(updated); await invoke("save_settings", { data: JSON.stringify(updated) }).catch(console.error); };
  const handleToggleAlwaysOnTop = async () => { const newVal = !settingsRef.current.alwaysOnTop; await invoke("set_always_on_top", { value: newVal }).catch(console.error); saveSettings({ ...settingsRef.current, alwaysOnTop: newVal }); };
  
  const handleToggleMiniMode = async () => {
    const newVal = !isMiniMode;
    try {
      if (newVal) {
        await invoke("set_custom_window_size", { width: 380.0, height: 500.0 });
      } else {
        const w = settingsRef.current.windowWidth || 1200.0;
        const h = settingsRef.current.windowHeight || 800.0;
        await invoke("set_custom_window_size", { width: w, height: h });
      }
      setIsMiniMode(newVal);
      saveSettings({ ...settingsRef.current, isMiniMode: newVal });
    } catch (e) { console.error(e); }
  };

  const handleChangeLanguage = (lang: string) => {
    saveSettings({ ...settingsRef.current, language: lang });
    document.documentElement.lang = lang;
    
    communityDbCacheRef.current = {};
    achievementsCacheRef.current = {};
    schemaCacheRef.current = {}; 
    percentagesCacheRef.current = {};
    
    lastNetworkFetchRef.current = 0;
    lastXboxNetworkFetchRef.current = 0;
    
    setGameName("Loading...");
    gameNameRef.current = "Loading...";
    setAchievements([]);
    
    tickRef.current({ forceTabSwitch: true });
  };

  const handleChangeTheme = (themeId: string) => { applyTheme(themes.find(t => t.id === themeId) || BUILTIN_THEMES[0]); saveSettings({ ...settingsRef.current, themeId }); };

const applyOverlayStyle = (style: OverlayStyle, isTransparent: boolean) => {
    const html = document.documentElement;
    const OVERLAY_CLASS_PREFIX = "overlay-";
    const TRANSPARENT_STYLES: OverlayStyle[] = ["ghost", "mmo", "neon", "tactical", "frosted"];

    const classesToRemove = Array.from(html.classList).filter(cls => 
      cls.startsWith(OVERLAY_CLASS_PREFIX) || cls === "overlay-opaque"
    );
    classesToRemove.forEach(cls => html.classList.remove(cls));
    
    const isLinux = navigator.userAgent.toLowerCase().includes("linux");
    const safeIsTransparent = isLinux ? false : isTransparent;
    
    if (style !== "default") {
      html.classList.add(`${OVERLAY_CLASS_PREFIX}${style}`);
      if (!safeIsTransparent) html.classList.add("overlay-opaque");
    }

    const needsTransparent = TRANSPARENT_STYLES.includes(style) && safeIsTransparent;
    invoke("set_window_transparent", { transparent: needsTransparent }).catch(() => {
      invoke("set_background_color", { r: 0, g: 0, b: 0, a: needsTransparent ? 0 : 255 }).catch(() => {});
    });
  };

  const handleChangeOverlayStyle = (style: OverlayStyle) => {
    saveSettings({ ...settingsRef.current, overlayStyle: style });
  };

  const handleToggleTransparency = () => {
    saveSettings({ ...settingsRef.current, enableTransparency: !(settingsRef.current.enableTransparency !== false) });
  };

  useEffect(() => {
    const style = settings.overlayStyle || "default";
    const isTrans = settings.enableTransparency !== false;
    applyOverlayStyle(style, isTrans);
  }, [settings.overlayStyle, settings.enableTransparency]);

  const handleToggleHint = (apiname: string) => { const appId = selectedAppIdRef.current; if (!appId) return; const current = settingsRef.current.hiddenHints[appId] || []; const isHidden = current.includes(apiname); saveSettings({ ...settingsRef.current, hiddenHints: { ...settingsRef.current.hiddenHints, [appId]: isHidden ? current.filter(n => n !== apiname) : [...current, apiname] } }); };
  const handleChangeOpacity = async (opacity: number) => { setSettings(prev => ({ ...prev, opacity })); settingsRef.current.opacity = opacity; await invoke("set_window_opacity", { opacity }).catch(console.error); };
  const handleSaveOpacity = () => { saveSettings({ ...settingsRef.current, opacity: settings.opacity }); };

  // 2. Polling loop
  useEffect(() => {
    if (appState === "LOADING" || appState === "SETUP") return;
    const tick = async (options: { forceTabSwitch?: boolean } = {}) => {
      if (tickInFlightRef.current) {
        if (options.forceTabSwitch) pendingTickRef.current = true;
        return;
      }
      tickInFlightRef.current = true;
      try {
        const key = apiKeyRef.current; 
        const ra = raCredsRef.current;
        const xbox = xboxCredsRef.current;
        const now = Date.now();

        if (!key && !(ra.user && ra.key) && !(xbox.apiKey && xbox.xuid)) return;

        if (!options.forceTabSwitch) {
          if (ra.user && ra.key && now - lastRaPollTimeRef.current > 15000) {
            lastRaPollTimeRef.current = now;
            try {
              const recentStr = await invoke<string>("get_ra_recent_game", { user: ra.user, apiKey: ra.key });
              const recentArr = safeParseJSON(recentStr, []);
              if (Array.isArray(recentArr) && recentArr.length > 0) {
                const recentGame = recentArr[0];
                const gameIdStr = `RA_${recentGame.GameID}`;
                const lastPlayedUTC = new Date(recentGame.LastPlayed + "Z").getTime();
                const isLive = (Date.now() - lastPlayedUTC) < 4 * 60 * 1000;
                
                if (isLive) activeRaIdRef.current = gameIdStr; else activeRaIdRef.current = null;
                
                setGameHistory(prev => {
                  const existing = prev[gameIdStr];
                  const timeToSave = isLive ? Date.now() : lastPlayedUTC;
                  if (existing && Math.abs(existing.lastPlayed - timeToSave) < 60000 && existing.name === recentGame.Title) return prev;
                  const updated = { ...prev, [gameIdStr]: { appId: gameIdStr, name: recentGame.Title, totalAch: existing?.totalAch || 0, unlockedAch: existing?.unlockedAch || 0, lastPlayed: timeToSave, platform: "RA" as const, pinned: existing?.pinned, completionStatus: existing?.completionStatus, rarestUnlocked: existing?.rarestUnlocked, raImageIcon: recentGame.ImageBoxArt || recentGame.ImageTitle || recentGame.ImageIcon || existing?.raImageIcon } };
                  invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
                  return updated;
                });
              }
            } catch (e) { console.error("RA Poll error", e); }
          }

          if (xbox.apiKey && xbox.xuid && now - lastXboxPollTimeRef.current > 60000) {
            lastXboxPollTimeRef.current = now;
            try {
              const recentStr = await invoke<string>("get_xbox_recent_games", { apiKey: xbox.apiKey, xuid: xbox.xuid });
              const recentData = unwrapXboxData(safeParseJSON(recentStr, {}));
              const titles = Array.isArray(recentData.titles) ? recentData.titles : [];

              if (titles.length > 0) {
                const recentGame = titles[0];
                const gameIdStr = `XBOX_${recentGame.titleId}`;
                const lastPlayedRaw = recentGame.lastPlayed || recentGame.lastModified || recentGame.titleHistory?.lastTimePlayed;
                const lastPlayedUTC = lastPlayedRaw ? new Date(lastPlayedRaw).getTime() : Date.now();
                const isLive = (Date.now() - lastPlayedUTC) < 4 * 60 * 60 * 1000;

                if (isLive) activeXboxIdRef.current = gameIdStr; else activeXboxIdRef.current = null;

                const boxArt = recentGame.displayImage || recentGame.image || (Array.isArray(recentGame.images) ? recentGame.images[0]?.url : undefined);

                setGameHistory(prev => {
                  const existing = prev[gameIdStr];
                  const timeToSave = isLive ? Date.now() : lastPlayedUTC;
                  if (existing && Math.abs(existing.lastPlayed - timeToSave) < 60000 && existing.name === (recentGame.name || recentGame.titleName)) return prev;

                  const updated = { ...prev, [gameIdStr]: { appId: gameIdStr, name: recentGame.name || recentGame.titleName || `Title ${recentGame.titleId}`, totalAch: existing?.totalAch || 0, unlockedAch: existing?.unlockedAch || 0, lastPlayed: timeToSave, platform: "XBOX" as const, pinned: existing?.pinned, completionStatus: existing?.completionStatus, rarestUnlocked: existing?.rarestUnlocked, raImageIcon: boxArt || existing?.raImageIcon } };
                  invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
                  return updated;
                });
              }
            } catch (e) { console.error("Xbox Poll error", e); }
          }

          if (key && now - lastSteamStatusPollRef.current > 15000) {
            lastSteamStatusPollRef.current = now;
            try {
              const statusRes = await invoke<string>("get_local_steam_status");
              if (statusRes !== "NOT_LOGGED_IN") {
                const parts = statusRes.split("|||");
                cachedRunningAppIdsRef.current = parts[0] ? parts[0].split(",").filter(id => id && id !== "0") : [];
                cachedSteamIdRef.current = parts[1];
              } else {
                cachedRunningAppIdsRef.current = [];
                cachedSteamIdRef.current = "";
              }
            } catch (e) { console.error("Steam Poll error", e); }
          }
        }

        let actualRunningAppIds = cachedRunningAppIdsRef.current;
        let steamId = cachedSteamIdRef.current;

        if (activeRaIdRef.current && !actualRunningAppIds.includes(activeRaIdRef.current)) actualRunningAppIds = [...actualRunningAppIds, activeRaIdRef.current];
        if (activeXboxIdRef.current && !actualRunningAppIds.includes(activeXboxIdRef.current)) actualRunningAppIds = [...actualRunningAppIds, activeXboxIdRef.current];

        setRunningAppIds(actualRunningAppIds);

        const prevSet = new Set(prevRunningAppIdsRef.current);
        const newlyLaunched = actualRunningAppIds.filter(id => !prevSet.has(id));

        if (newlyLaunched.length > 0) {
          const newestId = newlyLaunched[newlyLaunched.length - 1];
          setSelectedAppId(newestId);
          selectedAppIdRef.current = newestId;
          setSessionUnlocks([]);
          setGameName("Loading...");
          gameNameRef.current = "Loading...";

          const steamOrXboxLaunched = newlyLaunched.filter(id => !id.startsWith("RA_"));
          if (steamOrXboxLaunched.length > 0) {
            setGameHistory(prev => {
              let updated = { ...prev };
              for (const id of steamOrXboxLaunched) {
                const platform: GameHistory["platform"] = id.startsWith("XBOX_") ? "XBOX" : "STEAM";
                updated[id] = { ...updated[id], lastPlayed: Date.now(), platform };
              }
              invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
              return updated;
            });
          }
        }

        prevRunningAppIdsRef.current = actualRunningAppIds;

        const targetAppId = selectedAppIdRef.current;
        if (!targetAppId) { if (appState !== "WAITING") setAppState("WAITING"); return; }
        if (appState !== "PLAYING") setAppState("PLAYING");

        let currentTickGameName = gameNameRef.current;
        if (currentTickGameName === "Library Dashboard" || currentTickGameName === "Loading...") {
            currentTickGameName = `App ${targetAppId}`;
        }
        
        const isTargetRA = targetAppId.startsWith("RA_");
        const isTargetXbox = targetAppId.startsWith("XBOX_");
        const currentLang = settingsRef.current.language || "en";
        const steamLang = STEAM_LANG_MAP[currentLang] || "english";

        let schemaJustLoaded = false;
        if (!schemaCacheRef.current[targetAppId]) {
          schemaJustLoaded = true;
          try {
              if (isTargetRA) {
                  const pureId = targetAppId.replace("RA_", "");
                  const raGameStr = await invoke<string>("get_ra_achievements", { user: ra.user, apiKey: ra.key, gameId: pureId });
                  const raGame = safeParseJSON(raGameStr, {});
                  const resolvedName = raGame.Title || `RA Game: ${pureId}`;
                  setGameName(resolvedName); gameNameRef.current = resolvedName; currentTickGameName = resolvedName;

                  const boxArt = raGame.ImageBoxArt || raGame.ImageTitle || raGame.ImageIcon;
                  if (boxArt) {
                    setGameHistory(prev => {
                      const existing = prev[targetAppId];
                      if (existing?.raImageIcon === boxArt) return prev;
                      const updated = { ...prev, [targetAppId]: { ...existing, appId: targetAppId, raImageIcon: boxArt } };
                      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
                      return updated;
                    });
                  }
                  schemaCacheRef.current[targetAppId] = [{ appIdMarker: targetAppId }]; 
              } else if (isTargetXbox) {
                  const pureId = targetAppId.replace("XBOX_", "");
                  const xboxGameStr = await invoke<string>("get_xbox_achievements", { apiKey: xbox.apiKey, xuid: xbox.xuid, titleId: pureId });
                  const xboxData = unwrapXboxData(safeParseJSON(xboxGameStr, {}));
                  const xboxAchList = Array.isArray(xboxData.achievements) ? xboxData.achievements : [];
                  
                  const resolvedName = xboxAchList[0]?.titleAssociations?.[0]?.name || `Xbox Title: ${pureId}`;
                  setGameName(resolvedName); gameNameRef.current = resolvedName; currentTickGameName = resolvedName;

                  const boxArt = xboxAchList[0]?.mediaAssets?.find((m: any) => m.type === "Icon" || m.type === "BoxArt")?.url;
                  if (boxArt) {
                    setGameHistory(prev => {
                      const existing = prev[targetAppId];
                      if (existing?.raImageIcon === boxArt) return prev;
                      const updated = { ...prev, [targetAppId]: { ...existing, appId: targetAppId, raImageIcon: boxArt } };
                      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
                      return updated;
                    });
                  }
                  schemaCacheRef.current[targetAppId] = [{ appIdMarker: targetAppId }];
              } else {
                  const [schemaRes, pctRes] = await Promise.all([
                    invoke<string>("get_game_schema", { appId: targetAppId, apiKey: key, lang: steamLang }),
                    invoke<string>("get_global_achievement_percentages", { appId: targetAppId })
                  ]);
                  
                  const parsedSchema = safeParseJSON(schemaRes);
                  let newSchema = [{ appIdMarker: targetAppId }];
                  if (parsedSchema.game) {
                      const achs = parsedSchema.game?.availableGameStats?.achievements || [];
                      newSchema = [{ appIdMarker: targetAppId }, ...achs];
                  }
                  schemaCacheRef.current[targetAppId] = newSchema;
        
                  const parsedPct = safeParseJSON(pctRes);
                  const pctMap = new Map<string, number>();
                  if (parsedPct.achievementpercentages?.achievements) {
                    for (const a of parsedPct.achievementpercentages.achievements) { pctMap.set(a.name, Number(a.percent)); }
                  }
                  percentagesCacheRef.current[targetAppId] = pctMap;
        
                  let resolvedName = parsedSchema.game?.gameName || `AppID: ${targetAppId}`;
                  try { const storeName = await invoke<string>("get_app_name", { appId: targetAppId, lang: steamLang }); if (storeName) resolvedName = storeName; } catch { }
                  setGameName(resolvedName); gameNameRef.current = resolvedName; currentTickGameName = resolvedName;
              }

              prevUnlockedRef.current[targetAppId] = new Set();
              if (!actualRunningAppIds.includes(targetAppId)) setSessionUnlocks([]);

              try {
                const dbUrl = `${GITHUB_DB_BASE_URL}/${targetAppId}.json?t=${Date.now()}`;
                const dbRes = await fetch(dbUrl);

                if (dbRes && dbRes.ok) {
                  const communityData = await dbRes.json();
                  let cDb = [], cLinks = [], cChapters = [];
                  if (Array.isArray(communityData)) { 
                    cDb = communityData;
                  } else { 
                    cDb = Array.isArray(communityData.achievements) ? communityData.achievements : []; 
                    cLinks = Array.isArray(communityData.links) ? communityData.links : []; 
                    cChapters = Array.isArray(communityData.chapters) ? communityData.chapters : []; 
                  }
                  communityDbCacheRef.current[targetAppId] = { db: cDb, links: cLinks, chapters: cChapters };
                  setHasCommunityDb(cDb.length > 0);
                } else { 
                  communityDbCacheRef.current[targetAppId] = { db: [], links: [], chapters: [] };
                  setHasCommunityDb(false);
                }
              } catch (e) { 
                communityDbCacheRef.current[targetAppId] = { db: [], links: [], chapters: [] };
                setHasCommunityDb(false);
              }
              
              setCommunityLinks(communityDbCacheRef.current[targetAppId].links);
              setSelectedChapter("ALL"); setSearchQuery(""); setSortOrder("DEFAULT"); setGuidedMode(false); setMissableAlertDismissed(false);
              setIsProfilePrivate(false);

          } catch(e) { console.error("Error setting up game data", e) }
        } else {
          setGameHistory(prev => {
              if (prev[targetAppId]) {
                  currentTickGameName = prev[targetAppId].name;
                  if (gameNameRef.current === "Loading..." || gameNameRef.current === "Library Dashboard") {
                      setGameName(currentTickGameName); gameNameRef.current = currentTickGameName;
                  }
              }
              return prev;
          });

          const cData = communityDbCacheRef.current[targetAppId];
          if (cData) { setCommunityLinks(cData.links); setHasCommunityDb(cData.db.length > 0); }
        }

        if (!schemaJustLoaded && !options.forceTabSwitch) {
          if (isTargetXbox) { if (now - lastXboxNetworkFetchRef.current < 60000) return; } 
          else { if (now - lastNetworkFetchRef.current < 15000) return; }
        }

        if (isTargetXbox) lastXboxNetworkFetchRef.current = now; else lastNetworkFetchRef.current = now;

        try {
            const gameEdits = allLocalEditsRef.current[targetAppId] || {};
            let merged: MergedAchievement[] = [];
            const cData = communityDbCacheRef.current[targetAppId] || { db: [], links: [], chapters: [] };

            if (isTargetRA) {
                const pureId = targetAppId.replace("RA_", "");
                const raGameStr = await invoke<string>("get_ra_achievements", { user: ra.user, apiKey: ra.key, gameId: pureId });
                const raData = safeParseJSON(raGameStr, {});
                const raAch = Object.values(raData.Achievements || {}) as any[];
                
                const totalPlayers = Math.max(Number(raData.NumDistinctPlayersCasual || raData.NumDistinctPlayers || raData.NumPlayers || 1), 1);
                
                merged = raAch.map(a => {
                    const apiname = a.ID.toString();
                    const communityAch = cData.db.find((m: any) => m.apiname === apiname) || {};
                    const localEdit = gameEdits[apiname] || {};
                    
                    const rawType = a.type || a.Type || "";
                    const isOfficialMissable = typeof rawType === "string" && rawType.toLowerCase() === "missable";
                    const calcPercent = (Number(a.NumAwarded || 0) / totalPlayers) * 100;

                    return {
                        apiname, display_name: communityAch.display_name || a.Title, description: communityAch.description || a.Description,
                        icon: `https://media.retroachievements.org/Badge/${a.BadgeName}.png`, icongray: `https://media.retroachievements.org/Badge/${a.BadgeName}_lock.png`,
                        unlocked: !!a.DateEarned, is_official_missable: isOfficialMissable,
                        is_missable: isOfficialMissable ? true : (localEdit.is_missable ?? communityAch.is_missable ?? false), 
                        is_spoiler: localEdit.is_spoiler ?? communityAch.is_spoiler ?? false, chapter: localEdit.chapter ?? communityAch.chapter ?? "",
                        hint: localEdit.hint ?? communityAch.hint ?? "", video_url: localEdit.video_url ?? communityAch.video_url ?? "",
                        notes: localEdit.notes || "", globalPercent: Math.min(calcPercent, 100), 
                        ra_points: a.Points != null ? Number(a.Points) : undefined, ra_trueratio: a.TrueRatio != null ? Number(a.TrueRatio) : undefined,
                        requires: localEdit.requires ?? communityAch.requires ?? [],
                    };
                });
            } else if (isTargetXbox) {
                const pureId = targetAppId.replace("XBOX_", "");
                const xboxGameStr = await invoke<string>("get_xbox_achievements", { apiKey: xbox.apiKey, xuid: xbox.xuid, titleId: pureId });
                const xboxData = unwrapXboxData(safeParseJSON(xboxGameStr, {}));
                const xboxAch = Array.isArray(xboxData.achievements) ? xboxData.achievements : [];

                merged = xboxAch.map((a: any) => {
                    const apiname = (a.id ?? a.achievementId ?? "").toString();
                    const communityAch = cData.db.find((m: any) => m.apiname === apiname) || {};
                    const localEdit = gameEdits[apiname] || {};

                    const isUnlocked = a.progressState === "Achieved" || a.unlocked === true;
                    const icon = Array.isArray(a.mediaAssets) ? a.mediaAssets.find((m: any) => m.type === "Icon")?.url : undefined;
                    const rarityPct = a.rarity?.currentPercentage ?? a.progression?.requirements?.[0]?.rarity?.currentPercentage;
                    const baseDesc = isUnlocked ? a.description : (a.lockedDescription || a.description);

                    return {
                        apiname, display_name: communityAch.display_name || a.name, description: communityAch.description || baseDesc,
                        icon: icon || "", icongray: icon || "", unlocked: isUnlocked,
                        is_missable: localEdit.is_missable ?? communityAch.is_missable ?? false, is_spoiler: localEdit.is_spoiler ?? communityAch.is_spoiler ?? false,
                        chapter: localEdit.chapter ?? communityAch.chapter ?? "", hint: localEdit.hint ?? communityAch.hint ?? "",
                        video_url: localEdit.video_url ?? communityAch.video_url ?? "", notes: localEdit.notes || "",
                        globalPercent: typeof rarityPct === "number" ? rarityPct : undefined,
                        xbox_gamerscore: a.rewards?.find((r: any) => r.type === "Gamerscore")?.value != null ? Number(a.rewards.find((r: any) => r.type === "Gamerscore").value) : undefined,
                        requires: localEdit.requires ?? communityAch.requires ?? [],
                    };
                }).filter((a: MergedAchievement) => a.apiname);

            } else {
                const achRes = await invoke<string>("get_achievements", { steamId, appId: targetAppId, apiKey: key, lang: steamLang });
                const liveData = safeParseJSON(achRes);
                
                const currentSchema = schemaCacheRef.current[targetAppId] || [];
                const currentPcts = percentagesCacheRef.current[targetAppId] || new Map();
                
                const hasNoAchievements = currentSchema.filter(a => !a.appIdMarker).length === 0;
                setIsProfilePrivate(!hasNoAchievements && liveData.error === "PRIVATE_PROFILE");
                const playerAchievements = liveData.playerstats?.achievements || [];

                merged = currentSchema.map((schemaAch) => {
                  if (schemaAch.appIdMarker) return schemaAch; 
                  const liveAch = playerAchievements.find((a: any) => a.apiname === schemaAch.name);
                  const communityAch = cData.db.find((m: any) => m.apiname === schemaAch.name) || {};
                  const localEdit = gameEdits[schemaAch.name] || {};
                      
                  return {
                    apiname: schemaAch.name, display_name: schemaAch.displayName || communityAch.display_name, description: schemaAch.description || communityAch.description,
                    icon: schemaAch.icon, icongray: schemaAch.icongray, unlocked: liveAch ? liveAch.achieved === 1 : false,
                    is_missable: localEdit.is_missable ?? communityAch.is_missable ?? false, is_spoiler: localEdit.is_spoiler ?? communityAch.is_spoiler ?? false,
                    chapter: localEdit.chapter ?? communityAch.chapter ?? "", hint: localEdit.hint ?? communityAch.hint ?? "", 
                    video_url: localEdit.video_url ?? communityAch.video_url ?? "", notes: localEdit.notes || "", 
                    globalPercent: currentPcts.get(schemaAch.name), requires: localEdit.requires ?? communityAch.requires ?? [],
                  };
                }).filter(a => a.apiname);
            }

            if (selectedAppIdRef.current !== targetAppId) {
                achievementsCacheRef.current[targetAppId] = merged;
                updateHistorySafely(targetAppId, currentTickGameName, merged, isTargetRA);
                return;
            }

            const currentlyUnlocked = new Set(merged.filter(a => a.unlocked).map(a => a.apiname));
            const prevUnlocked = prevUnlockedRef.current[targetAppId];

            if (prevUnlocked && prevUnlocked.size > 0 && actualRunningAppIds.includes(targetAppId)) {
              const newSessionUnlocks: typeof sessionUnlocks = [];
              for (const apiname of currentlyUnlocked) {
                if (!prevUnlocked.has(apiname)) {
                  const achFull = merged.find(m => m.apiname === apiname);
                  if (achFull) {
                    newSessionUnlocks.push({ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), ach: achFull });
                    toast.success(`Unlocked: ${achFull.display_name}`, { icon: isTargetRA ? '🎮' : isTargetXbox ? '🟩' : '🏆', style: { background: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--accent-green)' } });
                    
                    if (!isTargetRA && !isTargetXbox) {
                        invoke("take_unlock_screenshot", { gameName: currentTickGameName, achTitle: achFull.display_name, achIconUrl: achFull.icon }).catch(console.error);
                    }
                  }
                }
              }
              if (newSessionUnlocks.length > 0) { playUnlockSound(); setSessionUnlocks(prev => [...newSessionUnlocks, ...prev]); }
            }
            prevUnlockedRef.current[targetAppId] = currentlyUnlocked;

            setAchievements(prev => {
              if (prev.length === 0 || prev.length !== merged.length) {
                updateHistorySafely(targetAppId, currentTickGameName, merged, isTargetRA);
                achievementsCacheRef.current[targetAppId] = merged; return merged;
              }
              let changed = false;
              const next = prev.map((old, i) => {
                const m = merged[i];
                if (
                  old.unlocked !== m.unlocked || old.chapter !== m.chapter || old.hint !== m.hint || old.video_url !== m.video_url || 
                  old.is_missable !== m.is_missable || old.is_spoiler !== m.is_spoiler || old.notes !== m.notes || old.globalPercent !== m.globalPercent ||
                  old.ra_points !== m.ra_points || old.ra_trueratio !== m.ra_trueratio || old.is_official_missable !== m.is_official_missable ||
                  old.display_name !== m.display_name || old.description !== m.description
                ) { changed = true; return m; }
                return old;
              });
              if (changed) {
                  updateHistorySafely(targetAppId, currentTickGameName, next, isTargetRA);
                  achievementsCacheRef.current[targetAppId] = next;
              }
              return changed ? next : prev;
            });

        } catch (error) { console.error("Error fetching live data:", error); }
      } finally {
        tickInFlightRef.current = false;
        if (pendingTickRef.current) { pendingTickRef.current = false; setTimeout(() => tickRef.current({ forceTabSwitch: true }), 0); }
      }
    };
    tickRef.current = tick;
    tick();
    const interval = window.setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [appState]);

  const resolvePlatform = (appId: string): GameHistory["platform"] => {
    if (appId.startsWith("RA_")) return "RA";
    if (appId.startsWith("XBOX_")) return "XBOX";
    return "STEAM";
  };

  const handleToggleStartup = async () => {
    const newVal = !settingsRef.current.runOnStartup;
    try {
      if (newVal) await invoke("plugin:autostart|enable"); else await invoke("plugin:autostart|disable");
      saveSettings({ ...settingsRef.current, runOnStartup: newVal });
    } catch(e) { console.error(e); }
  };

  const updateHistorySafely = (appId: string, name: string, achs: MergedAchievement[], _isRA: boolean) => {
    setGameHistory(prev => {
      const existing = prev[appId];
      let safeName = name;
      if (!safeName || safeName === "Library Dashboard" || safeName === "Loading...") safeName = existing?.name || appId;

      if (selectedAppIdRef.current === appId && (gameNameRef.current === "Loading..." || gameNameRef.current === "Library Dashboard")) {
          setGameName(safeName); gameNameRef.current = safeName;
      }

      const unlockedWithPercent = achs.filter(a => a.unlocked && typeof a.globalPercent === "number" && a.globalPercent >= 0);
      let rarestUnlocked: GameHistory["rarestUnlocked"] = existing?.rarestUnlocked ?? null;
      if (unlockedWithPercent.length > 0) {
        const rarest = unlockedWithPercent.reduce((min, a) => (a.globalPercent! < min.globalPercent! ? a : min));
        const p = rarest.globalPercent!;
        const color = p >= 40 ? "#a1a1aa" : p >= 20 ? "#60a5fa" : p >= 10 ? "#c084fc" : p >= 5 ? "#f59e0b" : "#ef4444";
        rarestUnlocked = { name: rarest.display_name, percent: p, color };
      }
      const updated = { ...prev, [appId]: { appId, name: safeName, totalAch: achs.length, unlockedAch: achs.filter(a => a.unlocked).length, lastPlayed: existing?.lastPlayed || Date.now(), platform: resolvePlatform(appId), pinned: existing?.pinned, completionStatus: existing?.completionStatus, rarestUnlocked, raImageIcon: existing?.raImageIcon } };
      invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error);
      return updated;
    });
  };

  const handleRemoveGame = (game: GameHistory) => { setPendingRemoveGame(game); };
  const confirmRemoveGame = () => { if (!pendingRemoveGame) return; const appId = pendingRemoveGame.appId; setGameHistory(prev => { const updated = { ...prev }; delete updated[appId]; invoke("save_history", { data: JSON.stringify(updated) }).catch(console.error); return updated; }); if (selectedAppId === appId) { handleSelectTab(""); } setPendingRemoveGame(null); };

  const handleSelectTab = (id: string) => {
    setSelectedAppId(id); selectedAppIdRef.current = id;
    if (id === "") {
      setAppState("WAITING"); setAchievements([]); setHasCommunityDb(null); setGameName("Library Dashboard"); gameNameRef.current = "Library Dashboard";
      saveSettings({ ...settingsRef.current, lastSelectedTab: id }); return; 
    }

    setAppState("PLAYING");

    if (gameHistory[id]) { setGameName(gameHistory[id].name); gameNameRef.current = gameHistory[id].name; } 
    else { setGameName("Loading..."); gameNameRef.current = "Loading..."; }
    
    if (achievementsCacheRef.current[id]) {
      setAchievements(achievementsCacheRef.current[id]);
      const cData = communityDbCacheRef.current[id];
      if (cData) { setCommunityLinks(cData.links); setHasCommunityDb(cData.db.length > 0); } else { setHasCommunityDb(null); }
    } else { setAchievements([]); setHasCommunityDb(null); }

    const savedSort = settingsRef.current.gameSortOrders?.[id];
    setSortOrder(savedSort ?? "DEFAULT");
    saveSettings({ ...settingsRef.current, lastSelectedTab: id });
    
    lastNetworkFetchRef.current = 0; lastXboxNetworkFetchRef.current = 0;
    tickRef.current({ forceTabSwitch: true });
  };
  
  const handleToggleTrack = async (apiname: string) => { 
    const appId = selectedAppIdRef.current; if (!appId) return; 
    setTrackedData(prev => { 
      const safePrev = (prev && typeof prev === "object" && !Array.isArray(prev)) ? prev : {}; 
      const gameTracked: string[] = Array.isArray(safePrev[appId]) ? safePrev[appId] : []; 
      const isCurrentlyTracked = gameTracked.includes(apiname); 
      const updatedGameTracked = isCurrentlyTracked ? gameTracked.filter(id => id !== apiname) : [...gameTracked, apiname]; 
      const newState = { ...safePrev, [appId]: updatedGameTracked }; 
      invoke("save_tracked", { data: JSON.stringify(newState) }).catch(console.error); 
      return newState; 
    }); 
  };
  
  const handleEdit = (apiname: string, field: keyof LocalEdit, value: any) => { 
    const appId = selectedAppIdRef.current; if (!appId) return; 
    const gameEdits = allLocalEditsRef.current[appId] || {}; 
    const updatedGameEdits = { ...gameEdits, [apiname]: { ...(gameEdits[apiname] || {}), [field]: value } }; 
    const newAllEdits = { ...allLocalEditsRef.current, [appId]: updatedGameEdits }; 
    setAllLocalEdits(newAllEdits); allLocalEditsRef.current = newAllEdits; 
    invoke("save_local_edits", { data: JSON.stringify(newAllEdits) }).catch(console.error); 
    setAchievements(prev => prev.map(a => a.apiname === apiname ? { ...a, [field]: value } : a)); 
  };

  const currentGameChapters = useMemo(() => {
    const local = allLocalChapters[selectedAppId];
    if (Array.isArray(local) && local.length > 0) return local;
    return communityDbCacheRef.current[selectedAppId]?.chapters ?? [];
  }, [allLocalChapters, selectedAppId, hasCommunityDb]);

  const saveGameChapters = async (newChapters: string[]) => {
    if (!selectedAppId) return;
    const updated = { ...allLocalChapters, [selectedAppId]: newChapters };
    setAllLocalChapters(updated);
    await invoke("save_chapters", { data: JSON.stringify(updated) }).catch(console.error);
  };

  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault(); if (!newChapterInput.trim()) return;
    const trimmed = newChapterInput.trim();
    if (!currentGameChapters.includes(trimmed)) saveGameChapters([...currentGameChapters, trimmed]);
    setNewChapterInput("");
  };

  const handleRemoveChapter = (index: number) => { const newChapters = [...currentGameChapters]; newChapters.splice(index, 1); saveGameChapters(newChapters); };
  const handleMoveChapter = (index: number, direction: number) => {
    if (index + direction < 0 || index + direction >= currentGameChapters.length) return;
    const newChapters = [...currentGameChapters];
    const temp = newChapters[index]; newChapters[index] = newChapters[index + direction]; newChapters[index + direction] = temp;
    saveGameChapters(newChapters);
  };

  const generateUnifiedExportJSON = () => {
    const cData = communityDbCacheRef.current[selectedAppIdRef.current]?.db || [];
    const gameEdits = allLocalEdits[selectedAppIdRef.current] || {};

    const unifiedAchievements = achievements.map(ach => {
      const orig = cData.find((m: any) => m.apiname === ach.apiname) || {};
      const edits = gameEdits[ach.apiname] || {};
      return {
        apiname: ach.apiname, display_name: orig.display_name || ach.display_name, description: orig.description || ach.description,
        chapter: edits.chapter ?? orig.chapter ?? "", hint: edits.hint ?? orig.hint ?? "", is_missable: edits.is_missable ?? orig.is_missable ?? false,
        is_spoiler: edits.is_spoiler ?? orig.is_spoiler ?? false, video_url: edits.video_url ?? orig.video_url ?? "", requires: edits.requires ?? orig.requires ?? []
      };
    });

    return JSON.stringify({ chapters: currentGameChapters, links: currentGameLinks.map(l => ({ title: l.title, url: l.url })), achievements: unifiedAchievements }, null, 2);
  };

  const handleExportJSON = async () => { 
    try { await invoke<string>("save_file_dialog", { filename: `${selectedAppIdRef.current}.json`, content: generateUnifiedExportJSON() }); toast.success("JSON saved successfully!"); } 
    catch (e) { if (e !== "Cancelled by user") toast.error(`Failed to save: ${e}`); } 
  };
  
  const handleExportHTML = async () => { 
    try { 
      const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${gameName} - Achievement Checklist</title><style>body { font-family: system-ui, sans-serif; background: #18181b; color: #f4f4f5; max-width: 800px; margin: 0 auto; padding: 2rem; } h1 { color: #34d399; } .ach { display: flex; gap: 1rem; background: #27272a; padding: 1rem; margin-bottom: 1rem; border-radius: 8px; border: 1px solid #3f3f46;} .ach.unlocked { opacity: 0.6; } img { width: 64px; height: 64px; border-radius: 4px; } h3 { margin: 0 0 0.5rem 0; } p { margin: 0; color: #a1a1aa; font-size: 0.9rem;} .missable { color: #ef4444; font-weight: bold; font-size: 0.8rem; border: 1px solid currentColor; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 5px;}</style></head><body><h1>${gameName} - Checklist</h1>${achievements.map(a => `<div class="ach ${a.unlocked ? 'unlocked' : ''}"><img src="${a.unlocked ? a.icon : a.icongray}" /><div>${a.is_missable ? '<div class="missable">MISSABLE</div>' : ''}<h3>${a.display_name} ${a.unlocked ? '✅' : '⬜'}</h3><p>${a.description}</p>${a.hint ? `<p style="margin-top: 5px; color: #f59e0b;">💡 ${a.hint}</p>` : ''}</div></div>`).join('')}</body></html>`; 
      await invoke<string>("save_file_dialog", { filename: `${gameName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_checklist.html`, content: htmlTemplate }); toast.success("HTML Checklist saved successfully!"); 
    } catch (e) { if (e !== "Cancelled by user") toast.error(`Failed to save: ${e}`); } 
  };
  
  const handleCreatePR = async () => { 
    try { 
      await navigator.clipboard.writeText(generateUnifiedExportJSON()); 
      const fileExists = (communityDbCacheRef.current[selectedAppIdRef.current]?.db?.length || 0) > 0;
      await open(fileExists ? `https://github.com/batureren/achievement-scavenger-database/edit/main/games/${selectedAppIdRef.current}.json` : `https://github.com/batureren/achievement-scavenger-database/new/main/games?filename=${selectedAppIdRef.current}.json`); 
      toast.success("Data copied to clipboard! Paste it on GitHub.", { duration: 5000 }); 
    } catch (err) { toast.error(`Failed to copy to clipboard: ${err}`); } 
  };

  const currentGameTracked = useMemo(() => Array.isArray(trackedData[selectedAppId]) ? trackedData[selectedAppId] : [], [trackedData, selectedAppId]);
  
  const chapterCounts = useMemo(() => { const counts: Record<string, number> = {}; achievements.forEach(a => { const c = a.chapter?.trim() || "No Chapter"; counts[c] = (counts[c] || 0) + 1; }); return counts; }, [achievements]);

  const allKnownChaptersForDropdown = useMemo(() => {
    const list = [...currentGameChapters];
    Object.keys(chapterCounts).forEach(c => { if (c !== "No Chapter" && !list.includes(c)) list.push(c); });
    return list;
  }, [currentGameChapters, chapterCounts]);
  
  const totalAch = achievements.length; const unlockedAch = achievements.filter(a => a.unlocked).length; const lockedAch = totalAch - unlockedAch; 
  const trackedAchCount = achievements.filter(a => currentGameTracked.includes(a.apiname)).length;
  const missableAchCount = achievements.filter(a => a.is_missable && !a.unlocked).length;
  const spoilerAchCount = achievements.filter(a => a.is_spoiler).length;

  const missableAlertAchs = useMemo(() => {
    if (!runningAppIds.includes(selectedAppId)) return [];
    if (selectedChapter === "ALL") return [];
    return achievements.filter(a => a.is_missable && !a.unlocked && (a.chapter?.trim() || "No Chapter") === selectedChapter);
  }, [achievements, runningAppIds, selectedAppId, selectedChapter]);
  
  const filteredAchievements = useMemo(() => {
    let result = achievements.filter(ach => {
      const isTracked = currentGameTracked.includes(ach.apiname);
      if (guidedMode) { const isCurrentChapter = selectedChapter !== "ALL" && ach.chapter === selectedChapter; if (!ach.is_missable && !ach.unlocked && !isTracked && !isCurrentChapter) return false; }
      if (filter === "UNLOCKED" && !ach.unlocked) return false; 
      if (filter === "LOCKED" && ach.unlocked) return false; 
      if (filter === "TRACKED" && !isTracked) return false;
      if (filter === "MISSABLE" && !ach.is_missable) return false;
      if (filter === "SPOILER" && !ach.is_spoiler) return false;
      if (!guidedMode) { const achChapter = ach.chapter?.trim() || "No Chapter"; if (selectedChapter !== "ALL" && achChapter !== selectedChapter) return false; }
      if (searchQuery.trim() !== "") { const q = searchQuery.toLowerCase(); if (!(ach.display_name?.toLowerCase().includes(q) || ach.description?.toLowerCase().includes(q))) return false; }
      return true;
    });
    
    if (sortOrder === "DEFAULT") { }
    else if (sortOrder === "A_Z") result.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
    else if (sortOrder === "Z_A") result.sort((a, b) => (b.display_name || "").localeCompare(a.display_name || ""));
    else if (sortOrder === "RARITY_ASC") result.sort((a, b) => (a.globalPercent || 0) - (b.globalPercent || 0));
    else if (sortOrder === "RARITY_DESC") result.sort((a, b) => (b.globalPercent || 0) - (a.globalPercent || 0));
    else if (sortOrder === "CHAPTER") {
      result.sort((a, b) => {
        const chapA = a.chapter?.trim() || ""; const chapB = b.chapter?.trim() || "";
        if (chapA !== chapB) {
          const idxA = currentGameChapters.indexOf(chapA); const idxB = currentGameChapters.indexOf(chapB);
          const finalIdxA = idxA === -1 ? 9999 : idxA; const finalIdxB = idxB === -1 ? 9999 : idxB;
          if (finalIdxA !== finalIdxB) return finalIdxA - finalIdxB;
        }
        return (typeof b.globalPercent === "number" ? b.globalPercent : 0) - (typeof a.globalPercent === "number" ? a.globalPercent : 0);
      });
    }
    return result;
  }, [achievements, currentGameTracked, filter, selectedChapter, searchQuery, sortOrder, guidedMode, currentGameChapters]);

  const currentGameLinks = userLinks.filter(l => l.appId === selectedAppId);
  const hiddenHintsForGame = settings.hiddenHints[selectedAppId] || [];

  const { averagePercent, rarityBreakdown, totalPoints, earnedPoints, totalTruePoints, earnedTruePoints, totalGamerscore, earnedGamerscore } = useMemo(() => {
    let sum = 0, valid = 0; const rCount = { C: 0, U: 0, R: 0, VR: 0, UR: 0 };
    let totalPts = 0, earnedPts = 0, totalTruePts = 0, earnedTruePts = 0; let totalGs = 0, earnedGs = 0;
    achievements.forEach(a => { 
      if (a.globalPercent !== undefined && a.globalPercent >= 0) { sum += a.globalPercent; valid++; } 
      const p = a.globalPercent || 0; 
      if (p >= 40) rCount.C++; else if (p >= 20) rCount.U++; else if (p >= 10) rCount.R++; else if (p >= 5) rCount.VR++; else rCount.UR++;
      if (a.ra_points !== undefined) { totalPts += a.ra_points; totalTruePts += a.ra_trueratio ?? a.ra_points; if (a.unlocked) { earnedPts += a.ra_points; earnedTruePts += a.ra_trueratio ?? a.ra_points; } }
      if (a.xbox_gamerscore !== undefined) { totalGs += a.xbox_gamerscore; if (a.unlocked) earnedGs += a.xbox_gamerscore; }
    });
    return { averagePercent: valid > 0 ? (sum / valid).toFixed(1) : "0.0", rarityBreakdown: rCount, totalPoints: totalPts, earnedPoints: earnedPts, totalTruePoints: totalTruePts, earnedTruePoints: earnedTruePts, totalGamerscore: totalGs, earnedGamerscore: earnedGs };
  }, [achievements]);

  const isSelectedGameLive = runningAppIds.includes(selectedAppId);

  useEffect(() => {
    if (appState !== "PLAYING" || !selectedAppId || gameName === "Loading..." || gameName === "Library Dashboard") { invoke("clear_discord_rpc").catch(() => {}); return; }
    const firstTrackedLocked = achievements.find((a) => currentGameTracked.includes(a.apiname) && !a.unlocked);
    invoke("update_discord_rpc", { gameName: gameName, unlocked: unlockedAch, total: totalAch, hunting: firstTrackedLocked ? firstTrackedLocked.display_name : "" }).catch(console.error);
  }, [appState, selectedAppId, gameName, unlockedAch, totalAch, currentGameTracked, achievements]);

  // --- Render ---
  if (appState === "LOADING") return <div id="app-container"><div className="setup-screen"><h1 className="app-title">Achievement Scavenger</h1><p className="status-text">Loading...</p></div></div>;
  if (appState === "SETUP") return <div id="app-container"><SetupScreen onKeySaved={(key, ra, xbox) => { setApiKey(key); apiKeyRef.current = key; setRaCreds(ra); raCredsRef.current = ra; setXboxCreds(xbox); xboxCredsRef.current = xbox; setAppState("WAITING"); }} currentKey={apiKey} currentRa={raCreds} currentXbox={xboxCreds} /></div>;

  return (
    <div id="app-container" className={isMiniMode ? "mini-mode-active" : ""}>
      <Toaster position="bottom-right" toastOptions={{ style: { background: 'var(--card-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)' } }} />

      <MenuBar 
        settings={settings} themes={themes} isMiniMode={isMiniMode} t={t}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop} onChangeTheme={handleChangeTheme} onChangeApiKey={() => setAppState("SETUP")} 
        onToggleSound={() => saveSettings({ ...settingsRef.current, soundEnabled: !settingsRef.current.soundEnabled })} 
        onToggleMiniMode={handleToggleMiniMode} 
        onChangeOpacity={handleChangeOpacity} onSaveOpacity={handleSaveOpacity}
        onSetWindowMode={handleSetWindowMode} onChangeUiScale={handleChangeUiScale} onSaveUiScale={handleSaveUiScale}
        onChangeLanguage={handleChangeLanguage}
        onChangeOverlayStyle={handleChangeOverlayStyle}
        onToggleTransparency={handleToggleTransparency}
        onToggleStartup={handleToggleStartup}
        onOpenScreenshots={handleOpenScreenshots}
      />

      {!isMiniMode && (
        <div className="game-tabs-bar-outer">
          {tabsCanScrollLeft && (
            <button className="tabs-scroll-btn tabs-scroll-btn--left" onClick={() => scrollTabsBy(-1)} aria-label="Scroll tabs left">‹</button>
          )}
          <div className="game-tabs-bar" ref={tabsBarRef} onScroll={updateTabsScrollState}>
            <button className={`game-tab ${!selectedAppId ? "active" : ""}`} onClick={() => handleSelectTab("")}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:"5px",flexShrink:0}}><rect x="2" y="3" width="7" height="18"/><rect x="9" y="3" width="7" height="18"/><rect x="16" y="3" width="6" height="18"/></svg>
              {t("lib.title")}
            </button>
            {Object.values(gameHistory).sort((a, b) => b.lastPlayed - a.lastPlayed).map(game => (
              <div key={game.appId} className={`game-tab-wrapper ${selectedAppId === game.appId ? "active" : ""}`}>
                <button className={`game-tab ${selectedAppId === game.appId ? "active" : ""}`} onClick={() => handleSelectTab(game.appId)}>
                  {runningAppIds.includes(game.appId) && <span className="live-dot" title="Game is currently running"></span>}
                  <PlatformIcon platform={game.platform} size={16}/>
                  {game.name}
                </button>
                <button className="game-tab-remove" title={runningAppIds.includes(game.appId) ? "Can't remove a game that's currently running" : `Remove "${game.name}" from history`} disabled={runningAppIds.includes(game.appId)} onClick={(e) => { e.stopPropagation(); handleRemoveGame(game); }}>×</button>
              </div>
            ))}
          </div>
          {tabsCanScrollRight && (
            <button className="tabs-scroll-btn tabs-scroll-btn--right" onClick={() => scrollTabsBy(1)} aria-label="Scroll tabs right">›</button>
          )}
        </div>
      )}

      {appState === "WAITING" && !selectedAppId ? (
        <div className="tracking-screen">
          <LibraryDashboard
            gameHistory={gameHistory}
            runningAppIds={runningAppIds}
            libraryFilter={libraryFilter}
            setLibraryFilter={setLibraryFilter}
            librarySort={librarySort}
            setLibrarySort={setLibrarySort}
            librarySearch={librarySearch}
            setLibrarySearch={setLibrarySearch}
            handleSelectTab={handleSelectTab}
            handleRemoveGame={handleRemoveGame}
            setGameHistory={setGameHistory}
            t={t}
          />
        </div>
      ) : isMiniMode ? (
        <div className="mini-mode-screen">
          <div className="tracking-header mini-header">
             <h2 className="game-title" style={{ fontSize: "1rem" }}>{gameName}</h2>
             <div className="progress-text" style={{ fontSize: "0.8rem" }}>{unlockedAch}/{totalAch}</div>
          </div>
          <div className="progress-bar-track mini-track"><div className="progress-bar-fill" style={{ width: totalAch > 0 ? `${(unlockedAch / totalAch) * 100}%` : "0%" }} /></div>
          <div className="mini-ach-list">
             {filteredAchievements.filter(a => currentGameTracked.includes(a.apiname)).map(ach => {
               const isHintHidden = hiddenHintsForGame.includes(ach.apiname);
               return (
                 <div key={ach.apiname} className={`achievement-card mini-card ${ach.unlocked ? "unlocked" : ""}`}>
                    <img src={ach.unlocked ? ach.icon : ach.icongray} alt="icon" className="ach-icon mini-icon" style={{ alignSelf: "flex-start" }} />
                    <div className="card-header-content" style={{ paddingRight: "20px" }}>
                      <h3 className={`ach-title ${ach.unlocked ? "unlocked" : ""}`} style={{ fontSize: "0.85rem", marginBottom: "4px" }}>
                        {ach.display_name}
                      </h3>
                      <p className="ach-desc" style={{ fontSize: "0.75rem", lineHeight: "1.3" }}>
                        {ach.description}
                      </p>
                      {ach.hint && !isHintHidden && (
                        <div className="hint-box" style={{ padding: "6px", fontSize: "0.75rem", marginTop: "6px", marginBottom: "2px" }}>
                          <span className="hint-label">💡 </span>
                          <span style={ach.is_spoiler ? { filter: "blur(3px)", cursor: "pointer" } : {}} onMouseOver={e => e.currentTarget.style.filter = "none"} onMouseOut={e => { if (ach.is_spoiler) e.currentTarget.style.filter = "blur(3px)" }}>
                            {ach.hint}
                          </span>
                        </div>
                      )}
                      <button className={`track-btn ${currentGameTracked.includes(ach.apiname) ? "tracked" : ""}`} onClick={() => handleToggleTrack(ach.apiname)} style={{ position: "absolute", top: 4, right: 4, padding: 2 }}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg></button>
                    </div>
                 </div>
               );
             })}
             {trackedAchCount === 0 && <p className="empty-state" style={{ fontSize: "0.8rem" }}>No achievements tracked.</p>}
          </div>
        </div>
      ) : (
        <div className="tracking-screen">
          <div className="tracking-header">
            <div>
              <p className="game-label" style={{ borderColor: isSelectedGameRA ? "#f59e0b" : isSelectedGameXbox ? "#107c10" : "var(--border-color)", color: isSelectedGameRA ? "#f59e0b" : isSelectedGameXbox ? "#107c10" : "var(--text-muted)" }}>
                {isSelectedGameRA ? "RetroAchievements" : isSelectedGameXbox ? "Xbox Live" : (isSelectedGameLive ? t("status.live") : t("status.offline"))}
              </p>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
                <h1 className="game-title" style={{ marginTop: 4 }}>{gameName}</h1>
                {!isSelectedGameRA && !isSelectedGameXbox && hasCommunityDb !== null && (
                  hasCommunityDb ? (
                    <span className="community-db-badge community-db-badge--available" title="Hints, chapters, and community guides are available for this game.">
                      {t("db.available")}
                    </span>
                  ) : (
                    <span className="community-db-badge community-db-badge--missing" title="No community database found for this game yet. You can help by submitting one!">
                      {t("db.missing")}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="header-right">
              {isSelectedGameLive ? (
                <div className="status-indicator"><div className="status-dot unlocked"></div> {t("status.live")}</div>
              ) : (
                <div className="status-indicator" style={{ color: "var(--text-muted)" }}><div className="status-dot"></div> {t("status.offline")}</div>
              )}
              <div className="progress-text">{unlockedAch} / {totalAch} {t("status.unlocked")}</div>
            </div>
          </div>

          <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: totalAch > 0 ? `${(unlockedAch / totalAch) * 100}%` : "0%" }} /></div>

          {totalAch > 0 && (
            <div className="accordion-section">
              <div className="accordion-header" onClick={() => setStatsOpen(o => !o)}>
                <span className="accordion-title">{t("accordion.stats")}</span>
                <span className={`accordion-chevron ${statsOpen ? "open" : ""}`}>▼</span>
              </div>
              {statsOpen && (
                <div className="accordion-body" style={{ paddingTop: 0 }}>
                  <div className="stats-dashboard">
                    <div className="stat-card"><span className="stat-label">{t("stat.avgCompletion")}</span><span className="stat-value">{averagePercent}%</span></div>
                    {isSelectedGameRA && totalPoints > 0 && (
                      <div className="stat-card">
                        <span className="stat-label">⭐ Points</span>
                        <span className="stat-value" style={{ fontSize: "1rem" }}>
                          <span style={{ color: "var(--accent-yellow)" }}>{earnedPoints}</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> / {totalPoints}</span>
                        </span>
                        <span className="stat-label" style={{ marginTop: "4px", fontSize: "0.72rem" }}>
                          True: <span style={{ color: "var(--accent-yellow)" }}>{earnedTruePoints}</span>
                          <span style={{ color: "var(--text-muted)" }}> / {totalTruePoints}</span>
                        </span>
                      </div>
                    )}
                    {isSelectedGameXbox && totalGamerscore > 0 && (
                      <div className="stat-card">
                        <span className="stat-label">🟩 Gamerscore</span>
                        <span className="stat-value" style={{ fontSize: "1rem" }}>
                          <span style={{ color: "#107c10" }}>{earnedGamerscore}</span>
                          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> / {totalGamerscore}</span>
                        </span>
                      </div>
                    )}
                    <div className="stat-card rarity-distribution">
                      <span className="stat-label">{t("stat.rarityDist")}</span>
                      <div className="rarity-bars">
                        <div title={`Common (40%+)`} style={{ flex: rarityBreakdown.C, background: "#a1a1aa" }}></div>
                        <div title={`Uncommon (20%+)`} style={{ flex: rarityBreakdown.U, background: "#60a5fa" }}></div>
                        <div title={`Rare (10%+)`} style={{ flex: rarityBreakdown.R, background: "#c084fc" }}></div>
                        <div title={`Very Rare (5%+)`} style={{ flex: rarityBreakdown.VR, background: "#f59e0b" }}></div>
                        <div title={`Ultra Rare (<5%)`} style={{ flex: rarityBreakdown.UR, background: "#ef4444" }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isProfilePrivate && <div className="privacy-warning">⚠️ Cannot check unlocks: Your Steam "Game Details" are private.</div>}

          <div className="accordion-section">
            <div className="accordion-header" onClick={() => setLinksOpen(o => !o)}>
              <span className="accordion-title">{t("accordion.shortcuts")}</span>
              <span className={`accordion-chevron ${linksOpen ? "open" : ""}`}>▼</span>
            </div>
            {linksOpen && (
              <div className="accordion-body">
                    <div className="links-row">
                      <div className="user-links-section">
                        <div className="links-header">
                          <h3>{t("sec.shortcuts")}</h3>
                          <div className="btn-group">
                            <button onClick={() => setEditMode(!editMode)} className={`btn-small ${editMode ? "btn-small-danger" : ""}`}>{editMode ? <>{t("btn.close_edit")}</> : <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:"4px"}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>{t("btn.edit_db")}</>}</button>
                            <button onClick={handleExportJSON} className="btn-small btn-small-success">{t("btn.json")}</button>
                            <button onClick={handleExportHTML} className="btn-small btn-small-success">{t("btn.html")}</button>
                            <button onClick={handleCreatePR} className="btn-small btn-small-success"><GitHubIcon size={12}/> {t("btn.pr")}</button>
                          </div>
                        </div>
                        <div className="links-list">
                          {currentGameLinks.map(link => (
                            <div key={link.id} className="user-link-item">
                              <a href="#" onClick={(e) => { e.preventDefault(); open(link.url); }} className="user-link">🔗 {link.title}</a>
                              <button onClick={async () => { const updatedLinks = userLinks.filter(l => l.id !== link.id); setUserLinks(updatedLinks); await invoke("save_user_links", { data: JSON.stringify(updatedLinks) }); }} className="btn-remove-link">✕</button>
                            </div>
                          ))}
                        </div>
                        <form onSubmit={async (e) => { e.preventDefault(); if (!linkTitle || !linkUrl) return; const newLink: UserLink = { id: Date.now().toString(), appId: selectedAppId, title: linkTitle, url: linkUrl }; const updatedLinks = [...userLinks, newLink]; setUserLinks(updatedLinks); setLinkTitle(""); setLinkUrl(""); await invoke("save_user_links", { data: JSON.stringify(updatedLinks) }); }} className="add-link-form">
                          <input type="text" placeholder={t("input.title")} value={linkTitle} onChange={e => setLinkTitle(e.target.value)} />
                          <input type="url" placeholder={t("input.url")} value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
                          <button type="submit" className="btn-add-link">{t("btn.add")}</button>
                        </form>
                      </div>
                      
                      {editMode && (
                        <div className="user-links-section chapter-manager-section">
                          <div className="links-header"><h3>{t("sec.chapters")}</h3></div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px", maxHeight: "150px", overflowY: "auto", paddingRight: "4px" }}>
                            {currentGameChapters.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontStyle: "italic" }}>{t("sec.no_chapters")}</span>}
                            {currentGameChapters.map((chap, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                                <span style={{ color: "var(--accent-green)", fontWeight: "bold", fontSize: "0.8rem", width: "20px" }}>{i + 1}.</span>
                                <span style={{ flex: 1, fontSize: "0.85rem" }}>{chap}</span>
                                <button className="btn-remove-link" onClick={() => handleMoveChapter(i, -1)} disabled={i === 0}>↑</button>
                                <button className="btn-remove-link" onClick={() => handleMoveChapter(i, 1)} disabled={i === currentGameChapters.length - 1}>↓</button>
                                <button className="btn-remove-link" onClick={() => handleRemoveChapter(i)} style={{ marginLeft: "4px" }}>✕</button>
                              </div>
                            ))}
                          </div>
                          <form onSubmit={handleAddChapter} className="add-link-form">
                            <input type="text" placeholder={t("input.new_chapter")} value={newChapterInput} onChange={e => setNewChapterInput(e.target.value)} />
                            <button type="submit" className="btn-add-link">{t("btn.add_chapter")}</button>
                          </form>
                        </div>
                      )}

                      {sessionUnlocks.length > 0 && isSelectedGameLive && (
                        <div className="user-links-section session-log">
                          <div className="links-header"><h3>{t("sec.session")} ({sessionUnlocks.length})</h3></div>
                          <div className="session-list">
                            {sessionUnlocks.map((u, i) => (
                              <div key={i} className="session-item"><img src={u.ach.icon} alt="icon" /><div><span className="time">{u.time}</span><p>{u.ach.display_name}</p></div></div>
                            ))}
                          </div>
                        </div>
                      )}

                      {communityLinks.length > 0 && (
                        <div className="user-links-section community-links-section">
                          <div className="links-header"><h3>{t("sec.guides")}</h3></div>
                          <div className="links-list">
                            {communityLinks.map((link, i) => (
                              <div key={i} className="user-link-item"><a href="#" onClick={(e) => { e.preventDefault(); open(link.url); }} className="user-link">🔗 {link.title}</a></div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
            )}
          </div>

          <div className="controls-container">
            <div className="filter-bar">
              <div className="filter-btns">
                <button className={`filter-btn ${filter === "ALL" ? "active" : ""}`} onClick={() => setFilter("ALL")}>{t("filter.all")} ({totalAch})</button>
                <button className={`filter-btn ${filter === "LOCKED" ? "active" : ""}`} onClick={() => setFilter("LOCKED")}>{t("filter.locked")} ({lockedAch})</button>
                <button className={`filter-btn ${filter === "UNLOCKED" ? "active" : ""}`} onClick={() => setFilter("UNLOCKED")}>{t("filter.unlocked")} ({unlockedAch})</button>
                <button className={`filter-btn ${filter === "TRACKED" ? "active" : ""}`} onClick={() => setFilter("TRACKED")}>{t("filter.tracked")} ({trackedAchCount})</button>
                <button className={`filter-btn filter-btn-missable ${filter === "MISSABLE" ? "active" : ""} ${missableAchCount > 0 ? "has-items" : ""}`} onClick={() => setFilter("MISSABLE")}>{t("filter.missable")} {missableAchCount > 0 && <span className="filter-badge">{missableAchCount}</span>}</button>
                <button className={`filter-btn filter-btn-spoiler ${filter === "SPOILER" ? "active" : ""} ${spoilerAchCount > 0 ? "has-items" : ""}`} onClick={() => setFilter("SPOILER")}>{t("filter.spoilers")} {spoilerAchCount > 0 && <span className="filter-badge filter-badge-spoiler">{spoilerAchCount}</span>}</button>
                <button className={`filter-btn guided-toggle ${guidedMode ? "active" : ""}`} onClick={() => setGuidedMode(!guidedMode)}>{guidedMode ? t("filter.guidedOn") : t("filter.guided")}</button>
              </div>
              <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} className="control-select">
                <option value="ALL">{t("chap.all")}</option>
                {allKnownChaptersForDropdown.map((chap) => { 
                  const count = chapterCounts[chap] || 0; 
                  if (count === 0 && !editMode) return null; 
                  const displayName = chap === "No Chapter" ? t("chap.fallback") : chap;
                  return <option key={chap} value={chap}>{displayName} ({count})</option>; 
                })}
              </select>
            </div>

            <div className="search-sort-bar">
              <input type="text" placeholder={t("search.achievements")} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="control-input search-input" />
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value as SortOrder)} className="control-select">
                <option value="DEFAULT">{t("sort.api")}</option>
                <option value="A_Z">{t("sort.az")}</option>
                <option value="Z_A">{t("sort.za")}</option>
                <option value="RARITY_ASC">{t("sort.rarest")}</option>
                <option value="RARITY_DESC">{t("sort.common")}</option>
                <option value="CHAPTER">{t("sort.chapter")}</option>
              </select>
            </div>
          </div>

          {missableAlertAchs.length > 0 && !missableAlertDismissed && (
            <div className="missable-alert">
              <div className="missable-alert-left">
                <span className="missable-alert-icon">⚠️</span>
                <div>
                  <strong className="missable-alert-title">{missableAlertAchs.length === 1 ? "1 missable achievement" : `${missableAlertAchs.length} missable achievements`} in {selectedChapter}!</strong>
                  <p className="missable-alert-sub">{missableAlertAchs.map(a => a.display_name).join(", ")} — don't progress before unlocking!</p>
                </div>
              </div>
              <div className="missable-alert-actions">
                <button className="missable-alert-btn" onClick={() => { setFilter("MISSABLE"); setMissableAlertDismissed(true); }}>Show them</button>
                <button className="missable-alert-dismiss" onClick={() => setMissableAlertDismissed(true)} title="Dismiss">✕</button>
              </div>
            </div>
          )}

          <div className="achievement-list">
            {filteredAchievements.map((ach) => (
              <AchievementCard 
                key={ach.apiname}
                ach={ach}
                achievements={achievements}
                isTracked={currentGameTracked.includes(ach.apiname)}
                isHintHidden={hiddenHintsForGame.includes(ach.apiname)}
                editMode={editMode}
                localOrOfficialEditData={allLocalEdits[selectedAppId]?.[ach.apiname] || {}}
                allKnownChaptersForDropdown={allKnownChaptersForDropdown}
                handleToggleTrack={handleToggleTrack}
                handleToggleHint={handleToggleHint}
                handleEdit={handleEdit}
                t={t}
              />
            ))}
          </div>

          {achievements.length === 0 && !isProfilePrivate && (
            (schemaCacheRef.current[selectedAppId] && schemaCacheRef.current[selectedAppId].filter(a => !a.appIdMarker).length === 0 && selectedAppId && !isSelectedGameRA && !isSelectedGameXbox)
              ? <div className="empty-state" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "40px 0" }}>
                  <span>This game has no achievements.</span>
                </div>
              : <p className="empty-state">Loading Achievements...</p>
          )}
          {achievements.length > 0 && filteredAchievements.length === 0 && <p className="empty-state">No achievements match your filters.</p>}
        </div>
      )}

      <ConfirmDialog isOpen={!!pendingRemoveGame} title="Remove Game" message={pendingRemoveGame ? `Remove "${pendingRemoveGame.name}" from your history?` : ""} confirmLabel="Remove" onConfirm={confirmRemoveGame} onCancel={() => setPendingRemoveGame(null)} />
    </div>
  );
}

export default App;