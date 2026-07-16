import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { AppSettings, Theme, OverlayStyle } from "../types";
import { OVERLAY_STYLES, SUPPORTED_LANGUAGES } from "../constants";

interface MenuBarProps {
  settings: AppSettings; themes: Theme[]; isMiniMode: boolean; t: (key: string) => string;
  onToggleAlwaysOnTop: () => void; onChangeTheme: (id: string) => void;
  onChangeApiKey: () => void; onToggleSound: () => void; onToggleMiniMode: () => void;
  onChangeOpacity: (op: number) => void; onSaveOpacity: () => void;
  onSetWindowMode: (mode: "WINDOWED" | "BORDERLESS" | "FULLSCREEN") => void;
  onChangeUiScale: (scale: number) => void; onSaveUiScale: () => void;
  onChangeLanguage: (lang: string) => void;
  onChangeOverlayStyle: (style: OverlayStyle) => void;
  onToggleTransparency: () => void;
  onToggleStartup: () => void;
  onOpenScreenshots: () => void;
  onToggleDiscordRPC: () => void;
  onToggleMinimizeToTray: () => void;
}

export function MenuBar({
  settings, themes, isMiniMode, t,
  onToggleAlwaysOnTop, onChangeTheme, onChangeApiKey, onToggleSound, onToggleMiniMode,
  onChangeOpacity, onSaveOpacity, onSetWindowMode, onChangeUiScale, onSaveUiScale, onChangeLanguage,
  onChangeOverlayStyle, onToggleTransparency, onToggleStartup, onOpenScreenshots, onToggleDiscordRPC, onToggleMinimizeToTray
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toggle = (name: string) => setOpenMenu(prev => prev === name ? null : name);
  
  useEffect(() => { 
    const handler = () => setOpenMenu(null); 
    document.addEventListener("click", handler); 
    return () => document.removeEventListener("click", handler); 
  }, []);

  return (
    <div className="menu-bar" onClick={e => e.stopPropagation()}>
      <div className="menu-item">
        <button className="menu-trigger" onClick={() => toggle("view")}>{t("menu.view")}</button>
        {openMenu === "view" && (
          <div className="menu-dropdown" onClick={e => e.stopPropagation()}>
            
            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input type="checkbox" checked={!!settings.alwaysOnTop} onChange={() => { onToggleAlwaysOnTop(); setOpenMenu(null); }} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
              {t("menu.alwaysOnTop")}
            </label>

            <div className="menu-option" style={{ cursor: "default", fontSize: "0.75rem", color: "var(--text-muted)", paddingTop: 0, paddingLeft: "38px" }}>
              {t("menu.overlayWarning")}
            </div>

            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input type="checkbox" checked={!!isMiniMode} onChange={() => { onToggleMiniMode(); setOpenMenu(null); }} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
              {t("menu.miniMode")}
            </label>
            
            <div className="menu-divider"></div>
            
            <div className="menu-option" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.85rem" }}>
                <span>{t("menu.windowMode")}</span>
              </div>
              <select 
                value={settings.windowMode || "WINDOWED"} 
                onChange={e => onSetWindowMode(e.target.value as any)} 
                style={{ width: "100%", padding: "4px 8px", background: "var(--bg-color)", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer" }}
              >
                <option value="WINDOWED">Windowed</option>
                <option value="BORDERLESS">Borderless Window</option>
                <option value="FULLSCREEN">Exclusive Fullscreen</option>
              </select>
            </div>

            <div className="menu-divider"></div>
            
            <div className="menu-option" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.85rem" }}>
                <span>{t("menu.language")}</span>
              </div>
              <select 
                value={settings.language || "en"} 
                onChange={e => onChangeLanguage(e.target.value)} 
                style={{ width: "100%", padding: "4px 8px", background: "var(--bg-color)", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "4px", fontSize: "0.8rem", cursor: "pointer" }}
              >
                {SUPPORTED_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="menu-divider"></div>

            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input type="checkbox" checked={!!settings.soundEnabled} onChange={() => { onToggleSound(); setOpenMenu(null); }} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
              {t("menu.sound")}
            </label>

            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input type="checkbox" checked={!!settings.runOnStartup} onChange={() => { onToggleStartup(); setOpenMenu(null); }} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
              {t("menu.startup")}
            </label>

            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input type="checkbox" checked={!!settings.minimizeToTray} onChange={onToggleMinimizeToTray} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
              {t("menu.minimizeToTray")}
            </label>
            
            <div className="menu-divider"></div>

            <button className="menu-option" onClick={() => { onOpenScreenshots(); setOpenMenu(null); }} style={{ padding: "8px 14px", gap: "8px" }}>
              <span style={{ width: "13px" }}></span>
              {t("menu.screenshots")}
            </button>
            
            <div className="menu-divider"></div>
            
            <div className="menu-option" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", cursor: "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.85rem" }}>
                <span>{t("menu.opacity")}</span>
                <span style={{ color: "var(--accent-green)" }}>{Math.round(settings.opacity * 100)}%</span>
              </div>
              <input type="range" min="0.1" max="1.0" step="0.05" value={settings.opacity} onChange={e => onChangeOpacity(parseFloat(e.target.value))} onMouseUp={onSaveOpacity} onTouchEnd={onSaveOpacity} style={{ width: "100%", accentColor: "var(--accent-green)", cursor: "pointer" }} />
            </div>

            <div className="menu-option" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px", cursor: "default", paddingBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: "0.85rem" }}>
                <span>{t("menu.uiScale")}</span>
                <span style={{ color: "var(--accent-green)" }}>{Math.round((settings.uiScale || 1.0) * 100)}%</span>
              </div>
              <input type="range" min="0.6" max="1.8" step="0.05" value={settings.uiScale || 1.0} onChange={e => onChangeUiScale(parseFloat(e.target.value))} onMouseUp={onSaveUiScale} onTouchEnd={onSaveUiScale} style={{ width: "100%", accentColor: "var(--accent-green)", cursor: "pointer" }} />
            </div>

          </div>
        )}
      </div>
      
      <div className="menu-item">
        <button className="menu-trigger" onClick={() => toggle("themes")}>{t("menu.themes")}</button>
        {openMenu === "themes" && (
          <div className="menu-dropdown">
            {themes.map(tObj => (
              <label key={tObj.id} className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
                <input type="radio" name="theme-selection" checked={settings.themeId === tObj.id} onChange={() => { onChangeTheme(tObj.id); setOpenMenu(null); }} style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} />
                {tObj.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="menu-item">
        <button
          className={`menu-trigger${openMenu === "overlay" ? " open" : ""}`}
          onClick={() => toggle("overlay")}
          data-active={(settings.overlayStyle && settings.overlayStyle !== "default") ? "true" : undefined}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Overlay
        </button>
        {openMenu === "overlay" && (
          <div className="menu-dropdown overlay-dropdown" onClick={e => e.stopPropagation()}>
            <div className="overlay-dropdown-header">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              HUD / Overlay Style
            </div>
            <label className="menu-option" style={{ padding: "8px 14px", borderBottom: "1px solid var(--border-color)", cursor: "pointer", gap: "8px" }}>
              <input 
                type="checkbox" 
                checked={settings.enableTransparency !== false} 
                onChange={onToggleTransparency} 
                style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} 
              />
              Transparent Background
            </label>
            <div className="overlay-style-grid">
              {OVERLAY_STYLES.map(style => (
                <button
                  key={style.id}
                  className={`overlay-style-tile${(settings.overlayStyle || "default") === style.id ? " selected" : ""}`}
                  onClick={() => { onChangeOverlayStyle(style.id); setOpenMenu(null); }}
                >
                  {(settings.overlayStyle || "default") === style.id && (
                    <span className="selected-check">✓</span>
                  )}
                  <div className={`tile-preview ${style.preview}`} />
                  <div className="tile-name">{style.icon} {style.name}</div>
                  <div className="tile-desc">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="menu-item">
        <button className="menu-trigger" onClick={() => toggle("account")}>{t("menu.accounts")}</button>
        {openMenu === "account" && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={() => { onChangeApiKey(); setOpenMenu(null); }} style={{ padding: "8px 14px", gap: "8px" }}>
               <span style={{ width: "13px" }}></span>
              {t("menu.keys")}
            </button>
            <label className="menu-option" style={{ padding: "8px 14px", cursor: "pointer", gap: "8px" }}>
              <input 
                type="checkbox" 
                checked={settings.discordRPCEnabled !== false} 
                onChange={onToggleDiscordRPC} 
                style={{ cursor: "pointer", accentColor: "var(--accent-green)" }} 
              />
              {t("menu.discordRPC")}
            </label>
          </div>
        )}
      </div>

      <div className="menu-item">
        <button className="menu-trigger" onClick={() => toggle("links")}>{t("menu.links")}</button>
        {openMenu === "links" && (
          <div className="menu-dropdown">
            <button className="menu-option" onClick={() => { open("https://store.steampowered.com/curator/45972821"); setOpenMenu(null); }} style={{ padding: "8px 14px" }}> 
              sawworm Games
            </button>
            <button className="menu-option" onClick={() => { open("https://discord.gg/UYJUhscHSE"); setOpenMenu(null); }} style={{ padding: "8px 14px" }}> 
              Discord
            </button>
          </div>
        )}
      </div>

    </div>
  );
}