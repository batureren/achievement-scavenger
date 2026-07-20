export interface MergedAchievement {
  apiname: string; display_name: string; description: string;
  icon: string; icongray: string; unlocked: boolean;
  is_missable?: boolean; is_official_missable?: boolean;
  chapter?: string; hint?: string; video_url?: string;
  is_spoiler?: boolean; globalPercent?: number; notes?: string;
  ra_points?: number; ra_trueratio?: number; requires?: string[];
  xbox_gamerscore?: number; ra_type?: string;
  _appId?: string; _setName?: string;
}

export interface UserLink { id: string; appId: string; title: string; url: string; }
export interface CommunityLink { title: string; url: string; }
export interface PsnCredentials {
  accessToken: string;
  accountId: string;
  npsso: string;
  refreshToken?: string;
  expiresAt?: number;
}
export interface LocalEdit {
  chapter?: string; hint?: string; video_url?: string;
  is_missable?: boolean; is_spoiler?: boolean; notes?: string; requires?: string[];
}
export interface Theme { id: string; name: string; vars: Record<string, string>; }
export type OverlayStyle = "default" | "ghost" | "mmo" | "neon" | "tactical" | "frosted";

export type SortOrder = "DEFAULT" | "A_Z" | "Z_A" | "RARITY_ASC" | "RARITY_DESC" | "CHAPTER";
export type LibrarySortOrder = "LAST_PLAYED" | "COMPLETION_ASC" | "COMPLETION_DESC" | "NAME_AZ";
export type LibraryFilter = "ALL" | "complete" | "in_progress" | "not_started" | "abandoned";
export type FilterType = "ALL" | "UNLOCKED" | "LOCKED" | "TRACKED" | "MISSABLE" | "SPOILER";
export type CompletionStatus = "complete" | "in_progress" | "not_started" | "abandoned";

export interface AppSettings {
  alwaysOnTop: boolean; themeId: string; hiddenHints: Record<string, string[]>;
  soundEnabled: boolean; opacity: number; gameSortOrders: Record<string, SortOrder>;
  lastSelectedTab: string; windowWidth: number; windowHeight: number;
  windowMode?: "WINDOWED" | "BORDERLESS" | "FULLSCREEN"; uiScale?: number;
  isMiniMode?: boolean; language: string; overlayStyle?: OverlayStyle;
  enableTransparency?: boolean; runOnStartup?: boolean; discordRPCEnabled?: boolean;
  minimizeToTray?: boolean;
}

export interface GameHistory {
  appId: string; name: string; totalAch: number; unlockedAch: number;
  lastPlayed: number; platform: "STEAM" | "RA" | "XBOX" | "PSN"; pinned?: boolean;
  completionStatus?: CompletionStatus;
  rarestUnlocked?: { name: string; percent: number; color: string } | null;
  raImageIcon?: string;
  easiestNext?: { apiname: string; name: string; percent: number; icon: string; color: string } | null;
}

export interface ChecklistItem {
  id: string;
  name: string;
  desc: string;
  imageUrl: string;
  videoUrl: string;
  completed: boolean;
  category?: string;
  location?: string;
  chapter?: string;
}

export interface CustomChecklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface GameLink {
  id: string;
  appIds: string[];
  name?: string;
}