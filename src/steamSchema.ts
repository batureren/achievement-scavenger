import { invoke } from "@tauri-apps/api/core";
import { safeParseJSON } from "./utils";
import { MergedAchievement, SteamAchievementGroup } from "./types";

const ICON_BASE = "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps";

export interface SteamSchemaResult {
  schema: any[];
  percentages: Map<string, number>;
  groups: SteamAchievementGroup[];
  gameName?: string;
  source: "game_achievements" | "legacy";
}

const SET_PALETTE = [
  "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171",
  "#a3e635", "#e879f9", "#2dd4bf", "#facc15", "#818cf8", "#fb7185", "#4ade80", "#38bdf8",
];

export function steamSetColor(index: number): string {
  if (index < SET_PALETTE.length) return SET_PALETTE[index];
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 70%, 64%)`;
}

const toIconUrl = (appId: string, file: unknown): string => {
  if (typeof file !== "string" || !file) return "";
  return /^https?:\/\//i.test(file) ? file : `${ICON_BASE}/${appId}/${file}`;
};

function normalizeGroups(rawGroups: unknown, schema: any[]): SteamAchievementGroup[] {
  if (!Array.isArray(rawGroups)) return [];

  const counts = new Map<number, number>();
  for (const a of schema) {
    if (a.appIdMarker) continue;
    const id = typeof a.groupid === "number" ? a.groupid : 0;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const groups: SteamAchievementGroup[] = rawGroups
    .filter((g: any) => g && typeof g.groupid === "number" && !g.developeronly && g.ispublic !== false)
    .map((g: any) => ({
      id: g.groupid,
      name: typeof g.localized_name === "string" ? g.localized_name.trim() : "",
      dlcAppId: typeof g.dlcappid === "number" && g.dlcappid > 0 ? g.dlcappid : undefined,
      archived: !!g.archived,
      order: typeof g.order === "number" ? g.order : 0,
      total: counts.get(g.groupid) || 0,
      color: "",
    }))
    .filter(g => g.total > 0)
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map((g, i) => ({ ...g, color: steamSetColor(i) }));

  return groups.length > 1 ? groups : [];
}

async function loadFromGameAchievements(appId: string, apiKey: string, lang: string): Promise<SteamSchemaResult | null> {
  const raw = await invoke<string>("get_game_achievements", { appId, apiKey, lang });
  const parsed = safeParseJSON(raw, {});
  const achs = parsed?.response?.achievements;
  if (!Array.isArray(achs) || achs.length === 0) return null;

  const percentages = new Map<string, number>();
  const entries = achs
    .filter((a: any) => typeof a?.internal_name === "string" && a.internal_name)
    .map((a: any) => {
      const pct = parseFloat(a.player_percent_unlocked);
      if (Number.isFinite(pct)) percentages.set(a.internal_name, pct);
      return {
        name: a.internal_name,
        displayName: a.localized_name || a.internal_name,
        description: a.localized_desc || "",
        icon: toIconUrl(appId, a.icon),
        icongray: toIconUrl(appId, a.icon_gray || a.icon),
        hidden: a.hidden ? 1 : 0,
        groupid: typeof a.groupid === "number" ? a.groupid : 0,
        archived: !!a.archived,
      };
    });

  const schema = [{ appIdMarker: appId }, ...entries];
  return {
    schema,
    percentages,
    groups: normalizeGroups(parsed.response.groups, schema),
    source: "game_achievements",
  };
}

async function loadLegacy(appId: string, apiKey: string, lang: string): Promise<SteamSchemaResult> {
  const [schemaRes, pctRes] = await Promise.all([
    invoke<string>("get_game_schema", { appId, apiKey, lang }),
    invoke<string>("get_global_achievement_percentages", { appId }),
  ]);

  const parsedSchema = safeParseJSON(schemaRes);
  const achs = parsedSchema.game?.availableGameStats?.achievements || [];
  const schema = [{ appIdMarker: appId }, ...achs];

  const parsedPct = safeParseJSON(pctRes);
  const percentages = new Map<string, number>();
  for (const a of parsedPct.achievementpercentages?.achievements || []) {
    percentages.set(a.name, Number(a.percent));
  }

  return {
    schema,
    percentages,
    groups: [],
    gameName: parsedSchema.game?.gameName,
    source: "legacy",
  };
}

async function applyOwnership(groups: SteamAchievementGroup[], appId: string, apiKey: string, steamId?: string): Promise<SteamAchievementGroup[]> {
  if (!steamId || !groups.some(g => g.dlcAppId !== undefined)) return groups;
  try {
    const raw = await invoke<string>("get_user_achievements", { steamId, appId, apiKey });
    const parsed = safeParseJSON(raw, {});
    const userGroups = parsed?.response?.groups;
    if (!Array.isArray(userGroups)) return groups;
    const achievable = new Map<number, boolean>();
    for (const g of userGroups) {
      if (typeof g?.groupid === "number" && typeof g.is_achievable === "boolean") achievable.set(g.groupid, g.is_achievable);
    }
    return groups.map(g => achievable.has(g.id) ? { ...g, achievable: achievable.get(g.id) } : g);
  } catch {
    return groups;
  }
}

export async function loadSteamSchema(appId: string, apiKey: string, lang: string, steamId?: string): Promise<SteamSchemaResult> {
  try {
    const result = await loadFromGameAchievements(appId, apiKey, lang);
    if (result) {
      result.groups = await applyOwnership(result.groups, appId, apiKey, steamId);
      return result;
    }
  } catch {}
  return loadLegacy(appId, apiKey, lang);
}

export function hideUnearnableSteamAchievements<T extends MergedAchievement>(list: T[], groups?: SteamAchievementGroup[]): T[] {
  const blocked = new Set((groups || []).filter(g => g.archived || g.achievable === false).map(g => g.id));
  return list.filter(a => a.unlocked || (!a.archived && !blocked.has(a.steam_group ?? 0)));
}

export function steamGroupLabel(group: SteamAchievementGroup, t: (key: string, opts?: Record<string, any>) => string): string {
  if (group.name) return group.name;
  return t("steamSet.base", { defaultValue: "Base Game" });
}