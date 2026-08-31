import React from "react";
import { open } from "@tauri-apps/plugin-shell";
import { Theme } from "./types";

export function timeAgo(ts: number, t: (key: string) => string, lang: string = "en"): string {
  if (!ts || ts === 0) {
    const tr = "---";
    return tr;
  }
  
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
  
  let html = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const hPfx = '^([ \\t]*(?:\\[color=[^\\]]+\\]|\\|\\||\\*\\*|\\*|__)*)';
  const hSfx = '((?:\\[\\/color\\]|\\|\\||\\*\\*|\\*|__)*)$';
  
  const lPfx = '^([ \\t]*(?:\\[color=[^\\]]+\\]|\\|\\|)*)';
  const lSfx = '((?:\\[\\/color\\]|\\|\\|)*)$';

  html = html.replace(new RegExp(`${hPfx}#####\\s+(.*?)${hSfx}`, 'gim'), '$1<h5>$2</h5>$3');
  html = html.replace(new RegExp(`${hPfx}####\\s+(.*?)${hSfx}`, 'gim'), '$1<h4>$2</h4>$3');
  html = html.replace(new RegExp(`${hPfx}###\\s+(.*?)${hSfx}`, 'gim'), '$1<h3>$2</h3>$3');
  html = html.replace(new RegExp(`${hPfx}##\\s+(.*?)${hSfx}`, 'gim'), '$1<h2>$2</h2>$3');
  html = html.replace(new RegExp(`${hPfx}#\\s+(.*?)${hSfx}`, 'gim'), '$1<h1>$2</h1>$3');

  html = html.replace(new RegExp(`${lPfx}-\\s+(.*?)${lSfx}`, 'gim'), '$1<ul><li>$2</li></ul>$3');
  html = html.replace(/<\/ul>\s*<ul>/gim, ''); 
  
  html = html.replace(new RegExp(`${lPfx}\\d+\\.\\s+(.*?)${lSfx}`, 'gim'), '$1<ol><li>$2</li></ol>$3');
  html = html.replace(/<\/ol>\s*<ol>/gim, ''); 

  html = html.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>');
  html = html.replace(/\|\|([\s\S]*?)\|\|/g, '<span class="markdown-spoiler">$1</span>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.*?)__/g, '<u>$1</u>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent-green);text-decoration:underline;">$1</a>');
  const urlRegex = /(?<!href="|src=")(https?:\/\/[^\s<]+)(?!<\/a>)/g;
  html = html.replace(urlRegex, '<a href="$1" target="_blank" style="color:var(--accent-green);text-decoration:underline;">$1</a>');

  html = html.replace(/\n/g, '<br/>');
  html = html.replace(/(<\/?(h1|h2|h3|h4|h5|ul|ol|li)[^>]*>)\s*<br\/>/g, '$1');
  html = html.replace(/<br\/>\s*(<\/?(h1|h2|h3|h4|h5|ul|ol|li)[^>]*>)/g, '$1');

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