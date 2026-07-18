import React from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Theme } from "./types";

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  const date = new Date(ts);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString(undefined, includeYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

export function unwrapXboxData(data: any) {
  if (data && data.content) return data.content;
  return data || {};
}

export function safeParseJSON(raw: string, fallback: any = {}) {
  try { const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" ? parsed : fallback; } catch { return fallback; }
}

export function safeParseTracked(raw: string): Record<string, string[]> {
  const parsed = safeParseJSON(raw);
  const sanitized: Record<string, string[]> = {};
  for (const key of Object.keys(parsed)) {
    sanitized[key] = Array.isArray(parsed[key]) ? parsed[key].filter((v: unknown) => typeof v === "string") : [];
  }
  return sanitized;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, val]) => root.style.setProperty(key, val));
}

export function renderHintWithLinks(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href="#" onClick={(e) => { e.preventDefault(); open(part); }} style={{ color: "var(--accent-green)", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

export function getYouTubeEmbedUrl(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
}