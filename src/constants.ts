import { Theme, OverlayStyle, CompletionStatus } from "./types";

export const GITHUB_DB_BASE_URL = "https://raw.githubusercontent.com/batureren/achievement-scavenger-database/main/games";
export const THEMES_URL = "https://raw.githubusercontent.com/batureren/achievement-scavenger-database/main/themes.json";

export const BUILTIN_THEMES: Theme[] = [
  { id: "default", name: "Dark (Default)", vars: { "--bg-color": "#18181b", "--card-bg": "#27272a", "--text-main": "#f4f4f5", "--text-muted": "#a1a1aa", "--accent-green": "#34d399", "--accent-red": "#ef4444", "--accent-yellow": "#f59e0b", "--border-color": "#3f3f46" } },
  { id: "midnight-blue", name: "Midnight Blue", vars: { "--bg-color": "#0f172a", "--card-bg": "#1e293b", "--text-main": "#e2e8f0", "--text-muted": "#94a3b8", "--accent-green": "#38bdf8", "--accent-red": "#f87171", "--accent-yellow": "#fbbf24", "--border-color": "#334155" } },
];

export const OVERLAY_STYLES: { id: OverlayStyle; name: string; icon: string; desc: string; preview: string }[] = [
  { id: "default",  name: "Default",   icon: "◼", desc: "Solid theme panels",               preview: "tile-preview--default"  },
  { id: "ghost",    name: "Ghost HUD", icon: "◻", desc: "Minimalist, flat left-bar accents",preview: "tile-preview--ghost"    },
  { id: "mmo",      name: "Quest Log", icon: "⚔", desc: "Borderless list with diamond bullets", preview: "tile-preview--mmo"  },
  { id: "neon",     name: "Neon Arc",  icon: "⚡", desc: "Sci-fi chamfered edges & inner glow", preview: "tile-preview--neon" },
  { id: "tactical", name: "Tactical",  icon: "◈", desc: "Terminal scanlines & [brackets]",  preview: "tile-preview--tactical" },
  { id: "frosted",  name: "Frosted",   icon: "❄", desc: "Heavy blur & highly rounded glass", preview: "tile-preview--frosted" },
];

export const OVERLAY_STYLE_KEYS: Record<string, { name: string; desc: string }> = {
  default:  { name: "ov.default_name",  desc: "ov.default_desc" },
  ghost:    { name: "ov.ghost_name",    desc: "ov.ghost_desc" },
  mmo:      { name: "ov.mmo_name",      desc: "ov.mmo_desc" },
  neon:     { name: "ov.neon_name",     desc: "ov.neon_desc" },
  tactical: { name: "ov.tactical_name", desc: "ov.tactical_desc" },
  frosted:  { name: "ov.frosted_name",  desc: "ov.frosted_desc" },
};

export const COMPLETION_CONFIG: Record<CompletionStatus, { label: string; color: string; bg: string }> = {
  complete:    { label: "Complete",    color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  in_progress: { label: "In Progress", color: "#34d399", bg: "rgba(52,211,153,0.12)"  },
  not_started: { label: "Not Started", color: "#a1a1aa", bg: "rgba(161,161,170,0.10)" },
  abandoned:   { label: "Abandoned",   color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

export const COMPLETION_KEYS: Record<string, string> = {
  complete: "lib.complete", in_progress: "lib.in_progress",
  not_started: "lib.not_started", abandoned: "lib.abandoned",
};

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" }, { code: "zh-CN", name: "简体中文 (Simplified Chinese)" },
  { code: "zh-TW", name: "繁體中文 (Traditional Chinese)" }, { code: "ja", name: "日本語 (Japanese)" },
  { code: "ko", name: "한국어 (Korean)" }, { code: "ru", name: "Русский (Russian)" },
  { code: "tr", name: "Türkçe (Turkish)" }, { code: "de", name: "Deutsch (German)" },
  { code: "fr", name: "Français (French)" }, { code: "es", name: "Español (Spanish)" },
  { code: "es-419", name: "Español - Latinoamérica (Spanish - LATAM)" },
  { code: "pt-BR", name: "Português - Brasil (Portuguese - Brazil)" },
  { code: "pt-PT", name: "Português (Portuguese - Portugal)" }, { code: "it", name: "Italiano (Italian)" },
  { code: "pl", name: "Polski (Polish)" }, { code: "uk", name: "Українська (Ukrainian)" },
  { code: "cs", name: "Čeština (Czech)" }, { code: "nl", name: "Nederlands (Dutch)" },
  { code: "th", name: "ไทย (Thai)" }, { code: "vi", name: "Tiếng Việt (Vietnamese)" }
];

export const STEAM_LANG_MAP: Record<string, string> = {
  "en": "english", "zh-CN": "schinese", "zh-TW": "tchinese", "ja": "japanese", "ko": "koreana",
  "ru": "russian", "tr": "turkish", "de": "german", "fr": "french", "es": "spanish",
  "es-419": "latam", "pt-BR": "brazilian", "pt-PT": "portuguese", "it": "italian",
  "pl": "polish", "uk": "ukrainian", "cs": "czech", "nl": "dutch", "th": "thai", "vi": "vietnamese"
};