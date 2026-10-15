import React, { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { MergedAchievement, LocalEdit } from "../types";
import { getRarityTier } from "./RarityBadge";
import { renderHintWithLinks, renderMarkdown, getYouTubeEmbedUrl } from "../utils";
import { CollapsibleBox } from "./CollapsibleBox";
import { ProgressiveImage } from "./ProgressiveImage";

interface AchievementCardProps {
  ach: MergedAchievement;
  achievements: MergedAchievement[];
  isTracked: boolean;
  isHintHidden: boolean;
  editMode: boolean;
  localOrOfficialEditData: Partial<LocalEdit>;
  allKnownChaptersForDropdown: string[];
  gameName?: string;
  geminiApiKey?: string;
  handleToggleTrack: (apiname: string) => void;
  handleToggleHint: (apiname: string) => void;
  handleEdit: (apiname: string, field: keyof LocalEdit, value: any) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  if (!url || !url.startsWith("http")) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || "image/png";
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(",")[1];
        if (base64Data) resolve({ mimeType, data: base64Data });
        else resolve(null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function requestAiGuide(
  apiKey: string,
  gameName: string,
  ach: MergedAchievement
): Promise<string> {
  const rawAppId = ach._appId || "";
  const isRA = rawAppId.startsWith("RA_") || (ach.ra_points !== undefined && !rawAppId.startsWith("XBOX_") && !rawAppId.startsWith("PSN_"));
  const isXbox = rawAppId.startsWith("XBOX_");
  const isPSN = rawAppId.startsWith("PSN_");

  let platformContext = "Platform: Steam / PC";
  if (isRA) {
    const pureRaId = rawAppId.replace("RA_", "");
    platformContext = `Platform: RetroAchievements (Game ID: ${pureRaId}, Badge ID: ${ach.apiname}). Check RetroAchievements game forums and unlock rules.`;
  } else if (isXbox) {
    platformContext = "Platform: Xbox Live / Xbox Series / Xbox One";
  } else if (isPSN) {
    platformContext = "Platform: PlayStation Network (Trophy)";
  } else {
    platformContext = "Platform: Steam / PC";
  }

  const verifiedMissable = ach.is_missable 
    ? "YES (CRITICAL: This achievement is strictly missable. Identify the exact point of no return)" 
    : "No known lockout reported";
  const verifiedChapter = ach.chapter ? `Chapter / Region: "${ach.chapter}"` : "";
  const verifiedHint = ach.hint ? `Database Hint: "${ach.hint}"` : "";

  const promptText = `You are a video game achievement verification specialist. Search live internet walkthroughs, wikis, and achievement databases to construct an accurate guide.

Game: "${gameName}"
${platformContext}
Achievement Title: "${ach.display_name}"
Achievement Description: "${ach.description}"
${verifiedChapter}
Verified Status: Missable = ${verifiedMissable}
${verifiedHint}

ACCURACY AND MATCHING INSTRUCTIONS:
1. PLATFORM AWARENESS: Search for guides corresponding to ${platformContext}. Do not reference other platforms unless cross-platform mechanics are identical.
2. VISUAL IDENTIFICATION: Inspect the achievement badge icon carefully to identify the exact target, collectible, or encounter.
3. CHRONOLOGY & SCOPE: Identify the first/earliest occurrence where this specific image and description match. Stop explaining the exact moment the unlock condition is satisfied.
4. HARD STOP ON UNLOCK: Never describe subsequent story events, endings, or future chapters.
5. NO EMOJIS anywhere in the output.

Format your guide using these exact markdown headers:

### Objective
A concise statement of the exact unlock condition and what type of achievement this is.

### How to Unlock
Numbered, chronological steps leading directly to the unlock. Stop as soon as the criteria is satisfied.

### Missable or Lockout Notes
${ach.is_missable ? "State the exact point of no return or cutoff that makes this missable." : "Note if any chapter selection, mode settings, difficulty constraints, or bugs affect this unlock."}

### Recommended Strategy and Tips
Provide practical shortcuts, optimal routes, gear/settings recommendations, or common mistakes to avoid.`;

  const iconUrl = ach.icon || ach.icongray;
  const imagePart = await fetchImageAsBase64(iconUrl);

  const parts: any[] = [{ text: promptText }];
  if (imagePart) {
    parts.unshift({
      inlineData: {
        mimeType: imagePart.mimeType,
        data: imagePart.data,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1400,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Request failed with status ${res.status}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  let text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    return "No guide could be generated.";
  }

  if (candidate.finishReason === "MAX_TOKENS") {
    text += "\n\n> **Notice:** The generation hit the maximum token limit. Click **Regenerate** to request a more concise response.";
  }

  return text;
}

function AchievementCardBase({ 
  ach, 
  achievements, 
  isTracked, 
  isHintHidden, 
  editMode, 
  localOrOfficialEditData, 
  allKnownChaptersForDropdown, 
  gameName = "Game",
  geminiApiKey = "",
  handleToggleTrack, 
  handleToggleHint, 
  handleEdit, 
  t 
}: AchievementCardProps) {

  const [showRequires, setShowRequires] = useState(false);
  const [reqSearch, setReqSearch] = useState("");

  const storageKey = `scavenger_ai_${ach._appId || "default"}_${ach.apiname}`;

  const [aiLoading, setAiLoading] = useState(false);
  const [aiGuide, setAiGuide] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [showAiGuide, setShowAiGuide] = useState(false);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(storageKey);
      setAiGuide(cached);
    } catch {
      setAiGuide(null);
    }
  }, [storageKey]);

  const tier = ach.globalPercent != null ? getRarityTier(ach.globalPercent) : null;
  const pColor = tier ? tier.color : "var(--text-muted)";

  const triggerHighlight = (id: string) => {
    const el = document.getElementById(`ach-${id}`);
    if (el) { 
      el.scrollIntoView({ behavior: "smooth", block: "center" }); 
      el.classList.remove("chain-highlight");
      void el.offsetWidth;
      el.classList.add("chain-highlight"); 
      setTimeout(() => el.classList.remove("chain-highlight"), 1500); 
    }
  };

  const executeFetchAi = async () => {
    if (!geminiApiKey) {
      const query = encodeURIComponent(`${gameName} "${ach.display_name}" achievement guide`);
      open(`https://www.youtube.com/results?search_query=${query}`);
      toast("Opened YouTube walkthrough search (configure Gemini API key for inline guides).");
      return;
    }

    setAiLoading(true);
    try {
      const result = await requestAiGuide(geminiApiKey, gameName, ach);
      setAiGuide(result);
      setShowAiGuide(true);
      try {
        localStorage.setItem(storageKey, result);
      } catch {}
      toast.success("AI guide generated and saved locally.");
    } catch (err: any) {
      toast.error(`AI Error: ${err.message || err}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleAiGuide = () => {
    if (showAiGuide) {
      setShowAiGuide(false);
      return;
    }

    if (aiGuide) {
      setShowAiGuide(true);
      return;
    }

    executeFetchAi();
  };

  const handleRedoAi = (e: React.MouseEvent) => {
    e.stopPropagation();
    executeFetchAi();
  };

  return (
    <div id={`ach-${ach.apiname}`} className={`achievement-card ${ach.unlocked ? "unlocked" : ""} ${isTracked ? "is-tracked-card" : ""} ${ach.is_spoiler ? 'spoiler-wrap' : ''}`}>
      <div className="achievement-card-bg" style={{ width: `${ach.globalPercent || 0}%` }} />
      
      {ach.is_missable && (
        <span className="missable-badge">MISSABLE</span>
      )}
      {isTracked && (
        <span className="hunt-tracked-badge">Active</span>
      )}
      {ach._setName && (
        <span className="chapter-tag" style={{ position: "absolute", top: "0px", right: ach.is_missable || isTracked ? "140px" : "8px", opacity: 0.85 }} title={t("ach.linked_set_tooltip")}>
          {ach._setName}
        </span>
      )}
      
      <div className="card-top" style={{ alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <ProgressiveImage 
            src={ach.unlocked ? ach.icon : (ach.icongray || ach.icon)} 
            fallbackSrc={ach.icon}
            alt={ach.display_name} 
            className={`ach-icon ${!ach.unlocked && (!ach.icongray || ach.icongray === ach.icon) ? "is-gray-fallback" : ""}`} 
          />
          {!ach.unlocked && <div className="lock-overlay">🔒</div>}
        </div>

        <div className="card-header-content">
          <div className="title-row">
            <h3 className={`ach-title ${ach.unlocked ? "unlocked" : ""} ${ach.is_spoiler ? 'spoiler-blur' : ''}`} style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              {ach.display_name}
              
              {ach.ra_points !== undefined && (
                <span className="ra-points-display" style={{ fontSize: "0.85em", marginLeft: "8px", display: "inline-flex", gap: "8px", alignItems: "center", fontWeight: "normal" }}>
                    <span style={{ color: "#fcd34d", display: "inline-flex", alignItems: "center", gap: "3px" }} title={t("ach.points_tooltip")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {ach.ra_points}
                    </span>
                    <span style={{ color: "#e2e8f0", display: "inline-flex", alignItems: "center", gap: "3px" }} title={t("ach.trueratio_tooltip")}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {ach.ra_trueratio}
                    </span>
                </span>
              )}
            </h3>
            {ach.chapter && !editMode && <span className="chapter-tag">{ach.chapter}</span>}
            <div className="card-actions">
              {ach.ra_type === "progression" && (
                <span
                  className="ra-type-badge ra-type-badge--progression"
                  title={t("ach.progression_tooltip")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                </span>
              )}
              {ach.ra_type === "win_condition" && (
                <span
                  className="ra-type-badge ra-type-badge--win-condition"
                  title={t("ach.win_condition_tooltip")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                </span>
              )}

              {!editMode && (
                <button 
                  className={`icon-btn icon-btn--ai ${aiGuide ? "has-cached-guide" : ""} ${showAiGuide ? "active-guide-open" : ""} ${!geminiApiKey && !aiGuide ? "is-yt-fallback" : ""}`}
                  onClick={handleToggleAiGuide}
                  disabled={aiLoading}
                  title={
                    aiGuide
                      ? (showAiGuide ? "Hide saved AI guide" : "View saved AI guide (available offline)")
                      : geminiApiKey
                        ? "Search online & generate AI guide"
                        : "Search YouTube walkthrough"
                  }
                >
                  {aiLoading ? (
                    <span className="spin-icon" style={{ fontSize: "0.75rem", lineHeight: 1 }}>↻</span>
                  ) : (geminiApiKey || aiGuide) ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill={aiGuide ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      <line x1="8" y1="10" x2="8.01" y2="10" strokeWidth="3" />
                      <line x1="12" y1="10" x2="12.01" y2="10" strokeWidth="3" />
                      <line x1="16" y1="10" x2="16.01" y2="10" strokeWidth="3" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                  )}
                </button>
              )}

              {ach.hint && !editMode && (
                <button className={`icon-btn ${isHintHidden ? "hint-hidden" : "hint-visible"}`} onClick={() => handleToggleHint(ach.apiname)} title={t("ach.toggle_hint_tooltip")}>
                  {isHintHidden ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              )}
              <button className={`track-btn ${isTracked ? "tracked" : ""}`} onClick={() => handleToggleTrack(ach.apiname)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={isTracked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" /></svg>
              </button>

              {ach.ra_points !== undefined && !editMode && (
                <button
                  className="icon-btn icon-btn--ra-link"
                  onClick={() => open(`https://retroachievements.org/achievement/${ach.apiname}`)}
                  title={t("ach.open_ra_tooltip")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
              )}
              
              {!editMode && ach.globalPercent !== undefined && <div className="ach-global-percent" style={{ color: pColor }}>{ach.globalPercent.toFixed(1)} %</div>}
            </div>
          </div>
          <CollapsibleBox maxHeight={60}>
            <p className={`ach-desc ${ach.is_spoiler ? 'spoiler-blur' : ''}`}>{ach.description}</p>
          </CollapsibleBox>
        </div>
      </div>

      {showAiGuide && aiGuide && !editMode && (
        <div className={`ai-guide-box ${aiLoading ? "is-regenerating" : ""}`}>
          {aiLoading && <div className="ai-guide-sweep" />}

          <div className="ai-guide-header">
            <div className="ai-guide-title">
              <span>AI Guide (Online Grounded)</span>
            </div>
            <div className="ai-guide-actions">
              <button 
                className="ai-guide-btn" 
                onClick={handleRedoAi} 
                disabled={aiLoading} 
                title="Search internet again and regenerate"
              >
                <svg 
                  className={aiLoading ? "spin-icon" : ""} 
                  width="13" 
                  height="13" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>{aiLoading ? "Regenerating..." : "Regenerate"}</span>
              </button>
              <button 
                className="btn-remove-link" 
                onClick={() => setShowAiGuide(false)} 
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="ai-guide-content">
            {renderMarkdown(aiGuide)}
          </div>

          <div className="ai-guide-footer">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                open(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${gameName} ${ach.display_name} achievement guide`)}`);
              }}
            >
              Search Video Walkthrough on YouTube
            </a>
          </div>
        </div>
      )}

      {editMode ? (
        <div className="edit-panel">
          <select value={localOrOfficialEditData.chapter ?? ach.chapter ?? ""} onChange={e => handleEdit(ach.apiname, "chapter", e.target.value)} className="edit-input control-select" style={{ maxWidth: "100%", width: "100%" }}>
            <option value="">{t("chap.none")}</option>
            {allKnownChaptersForDropdown.map(c => (<option key={c} value={c}>{c}</option>))}
          </select>
          
          <textarea placeholder={t("ach.hint_placeholder")} value={localOrOfficialEditData.hint ?? ach.hint ?? ""} onChange={e => handleEdit(ach.apiname, "hint", e.target.value)} className="edit-input edit-textarea" />
          
          <input type="text" placeholder={t("ach.video_url_placeholder")} value={localOrOfficialEditData.video_url ?? ach.video_url ?? ""} onChange={e => handleEdit(ach.apiname, "video_url", e.target.value)} className="edit-input" />
          <textarea placeholder={t("ach.notes_placeholder")} value={localOrOfficialEditData.notes ?? ach.notes ?? ""} onChange={e => handleEdit(ach.apiname, "notes", e.target.value)} className="edit-input edit-textarea" style={{ borderLeft: "3px solid var(--accent-green)" }} />
          <div className="edit-checks">
            <label className="edit-check-label" style={{ opacity: ach.is_official_missable ? 0.6 : 1, cursor: ach.is_official_missable ? "not-allowed" : "pointer" }}>
              <input type="checkbox" checked={ach.is_missable || false} disabled={ach.is_official_missable} onChange={e => handleEdit(ach.apiname, "is_missable", e.target.checked)} /> 
              {t("ach.is_missable_label")} {ach.is_official_missable && <span style={{ color: "var(--accent-yellow)", marginLeft: "4px" }}>{t("ach.official_label")}</span>}
            </label>
            <label className="edit-check-label"><input type="checkbox" checked={ach.is_spoiler || false} onChange={e => handleEdit(ach.apiname, "is_spoiler", e.target.checked)} /> {t("ach.is_spoiler_label")}</label>
          </div>

          <div className="edit-requires">
            <button 
              className="btn-small" 
              onClick={() => setShowRequires(!showRequires)}
              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}
            >
              <span>{t("ach.requires_prereq_label")} ({(localOrOfficialEditData.requires ?? ach.requires ?? []).length})</span>
              <span>{showRequires ? "▲" : "▼"}</span>
            </button>
            
            {showRequires && (
              <div style={{ marginTop: "8px", border: "1px solid var(--border-color)", borderRadius: "6px", background: "var(--bg-color)", padding: "8px" }}>
                <input 
                  type="text" 
                  placeholder={t("search.achievements")}
                  value={reqSearch}
                  onChange={e => setReqSearch(e.target.value)}
                  className="edit-input"
                  style={{ width: "100%", marginBottom: "8px", boxSizing: "border-box" }}
                />
                <div className="edit-requires-list" style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {achievements
                    .filter(a => a.apiname !== ach.apiname && (!reqSearch.trim() || a.display_name.toLowerCase().includes(reqSearch.trim().toLowerCase())))
                    .map(other => {
                      const currentRequires: string[] = localOrOfficialEditData.requires ?? ach.requires ?? [];
                      const isChecked = currentRequires.includes(other.apiname);
                      return (
                        <label key={other.apiname} className="edit-requires-item" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...currentRequires, other.apiname]
                                : currentRequires.filter(id => id !== other.apiname);
                              handleEdit(ach.apiname, "requires", next);
                            }}
                          />
                          <span style={{ fontSize: "0.85rem" }}>{other.display_name}</span>
                        </label>
                      );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {ach.requires && ach.requires.length > 0 && (
            <div className="chain-row">
              <span className="chain-label">{t("ach.requires_label")}</span>
              {ach.requires.map(reqId => {
                const reqAch = achievements.find(a => a.apiname === reqId);
                if (!reqAch) return null;
                return (
                  <button key={reqId} className={`chain-badge chain-badge--requires${reqAch.unlocked ? " chain-badge--done" : ""}`}
                    onClick={() => triggerHighlight(reqId)}>
                    {reqAch.unlocked ? "✅" : "🔒"} {reqAch.display_name}
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const unlocks = achievements.filter(a => a.requires?.includes(ach.apiname));
            if (!unlocks.length) return null;
            return (
              <div className="chain-row">
                <span className="chain-label">{t("ach.unlocks_label")}</span>
                {unlocks.map(u => (
                  <button key={u.apiname} className={`chain-badge chain-badge--unlocks${u.unlocked ? " chain-badge--done" : ""}`}
                    onClick={() => triggerHighlight(u.apiname)}>
                    {u.unlocked ? "✅" : "⬜"} {u.display_name}
                  </button>
                ))}
              </div>
            );
          })()}
          
          {ach.notes && (
            <div className="notes-box">
              <CollapsibleBox maxHeight={80}>
                <span className="notes-label">{t("ach.notes_label")}</span>{renderHintWithLinks(ach.notes)}
              </CollapsibleBox>
            </div>
          )}
          
          {ach.hint && !isHintHidden && (
            <div className={`hint-box ${ach.is_spoiler ? 'spoiler-blur' : ''}`}>
              <CollapsibleBox maxHeight={150}>
                <p>
                  <span className="hint-label">{t("ach.hint_label")}</span>{renderHintWithLinks(ach.hint)}
                </p>
                {ach.video_url && getYouTubeEmbedUrl(ach.video_url) && (
                  <div className="video-wrapper"><iframe src={getYouTubeEmbedUrl(ach.video_url)!} title={t("ach.youtube_video_title")} frameBorder="0" allowFullScreen></iframe></div>
                )}
              </CollapsibleBox>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const AchievementCard = React.memo(AchievementCardBase, (prevProps, nextProps) => {
  return (
    prevProps.ach === nextProps.ach &&
    prevProps.isTracked === nextProps.isTracked &&
    prevProps.isHintHidden === nextProps.isHintHidden &&
    prevProps.editMode === nextProps.editMode &&
    prevProps.localOrOfficialEditData === nextProps.localOrOfficialEditData &&
    prevProps.achievements === nextProps.achievements &&
    prevProps.gameName === nextProps.gameName &&
    prevProps.geminiApiKey === nextProps.geminiApiKey
  );
});