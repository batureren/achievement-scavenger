import React from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Theme } from "./types";

export function timeAgo(ts: number, t: (key: string) => string, lang: string = "en"): string {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  <  1) return t("time.just_now");
  if (mins  < 60) return t("time.minutes_ago").replace("{n}", String(mins));
  if (hours < 24) return t("time.hours_ago").replace("{n}", String(hours));
  if (days  <  7) return t("time.days_ago").replace("{n}", String(days));
  const date = new Date(ts);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  
  return date.toLocaleDateString(lang, includeYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

export function renderMarkdown(text: string) {
  if (!text) return null;
  
  let html = text
    .replace(/</g, '&lt;').replace(/>/g, '&gt;') // Sanitize
    .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent-green);text-decoration:underline;">$1</a>');

  html = html.replace(/^\s*-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\n?<ul>/gim, '');
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
  html = html.replace(/<\/ol>\n?<ol>/gim, '');

  const urlRegex = /(?<!href=")(https?:\/\/[^\s<]+)(?!<\/a>)/g;
  html = html.replace(urlRegex, '<a href="$1" target="_blank" style="color:var(--accent-green);text-decoration:underline;">$1</a>');

  html = html.replace(/\n/g, '<br/>');
  html = html.replace(/(<\/?(h1|h2|h3|h4|h5|ul|ol|li)>)<br\/>/g, '$1');
  html = html.replace(/<br\/>(<\/?(h1|h2|h3|h4|h5|ul|ol|li)>)/g, '$1');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
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
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    part.match(/^https?:\/\//)
      ? <a key={i} href="#" onClick={(e) => { e.preventDefault(); if (part) open(part); }} style={{ color: "var(--accent-green)", textDecoration: "underline", wordBreak: "break-all" }}>{part}</a>
      : <React.Fragment key={i}>
          {part.split('\n').map((line, j, arr) => (
            <React.Fragment key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </React.Fragment>
  );
}

export function getMediaKind(url: string): "video" | "image" {
  if (!url || typeof url !== "string") return "image";
  const clean = url.split(/[?#]/)[0].toLowerCase();
  return /\.(webm|mp4|mov|m4v)$/.test(clean) ? "video" : "image";
}

export function getYouTubeEmbedUrl(url: string) {
  if (!url || typeof url !== "string") return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
}