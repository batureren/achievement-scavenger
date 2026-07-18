import React from "react";
import { MergedAchievement, LocalEdit } from "../types";
import { getRarityTier } from "./RarityBadge";
import { renderHintWithLinks, getYouTubeEmbedUrl } from "../utils";

interface AchievementCardProps {
  ach: MergedAchievement;
  isTracked: boolean;
  isHintHidden: boolean;
  editMode: boolean;
  localOrOfficialEditData: Partial<LocalEdit>;
  allKnownChaptersForDropdown: string[];
  achievements: MergedAchievement[];
  handleToggleTrack: (apiname: string) => void;
  handleToggleHint: (apiname: string) => void;
  handleEdit: (apiname: string, field: keyof LocalEdit, value: any) => void;
  t: (key: string) => string;
}

function AchievementCardBase({ 
  ach, 
  achievements, 
  isTracked, 
  isHintHidden, 
  editMode, 
  localOrOfficialEditData, 
  allKnownChaptersForDropdown, 
  handleToggleTrack, 
  handleToggleHint, 
  handleEdit, 
  t 
}: AchievementCardProps) {

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

  return (
    <div id={`ach-${ach.apiname}`} className={`achievement-card ${ach.unlocked ? "unlocked" : ""} ${isTracked ? "is-tracked-card" : ""}`}>
      <div className="achievement-card-bg" style={{ width: `${ach.globalPercent || 0}%` }} />
      
      {ach.is_missable && (
        <span className="missable-badge">MISSABLE</span>
      )}
      {isTracked && (
        <span className="hunt-tracked-badge">Active</span>
      )}
      
      <div className="card-top" style={{ alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <img src={ach.unlocked ? ach.icon : ach.icongray} alt="icon" className="ach-icon" />
          {!ach.unlocked && <div className="lock-overlay">🔒</div>}
        </div>

        <div className="card-header-content">
          <div className="title-row">
            <h3 className={`ach-title ${ach.unlocked ? "unlocked" : ""}`} style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              {ach.display_name}
              
              {ach.ra_points !== undefined && (
                <span className="ra-points-display" style={{ fontSize: "0.85em", marginLeft: "8px", display: "inline-flex", gap: "8px", alignItems: "center", fontWeight: "normal" }}>
                    <span style={{ color: "#fcd34d", display: "inline-flex", alignItems: "center", gap: "3px" }} title="Standard Points (Casual)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {ach.ra_points}
                    </span>
                    <span style={{ color: "#e2e8f0", display: "inline-flex", alignItems: "center", gap: "3px" }} title="True Ratio (Hardcore)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        {ach.ra_trueratio}
                    </span>
                </span>
              )}
            </h3>
            {ach.chapter && !editMode && <span className="chapter-tag">{ach.chapter}</span>}
            
            <div className="card-actions">
              {ach.hint && !editMode && (
                <button className={`icon-btn ${isHintHidden ? "hint-hidden" : "hint-visible"}`} onClick={() => handleToggleHint(ach.apiname)} title="Toggle Hint Visibility">
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
              
              {!editMode && ach.globalPercent !== undefined && <div className="ach-global-percent" style={{ color: pColor }}>{ach.globalPercent.toFixed(1)} %</div>}
            </div>
          </div>
          <p className="ach-desc" style={ach.is_spoiler ? { filter: "blur(5px)", cursor: "pointer" } : {}} onMouseOver={e => e.currentTarget.style.filter = "none"} onMouseOut={e => { if (ach.is_spoiler) e.currentTarget.style.filter = "blur(5px)" }}>{ach.description}</p>
        </div>
      </div>

      {editMode ? (
        <div className="edit-panel">
          <select value={localOrOfficialEditData.chapter ?? ach.chapter ?? ""} onChange={e => handleEdit(ach.apiname, "chapter", e.target.value)} className="edit-input control-select" style={{ maxWidth: "100%", width: "100%" }}>
            <option value="">{t("chap.none")}</option>
            {allKnownChaptersForDropdown.map(c => (<option key={c} value={c}>{c}</option>))}
          </select>
          
          <textarea placeholder="Hint..." value={localOrOfficialEditData.hint ?? ach.hint ?? ""} onChange={e => handleEdit(ach.apiname, "hint", e.target.value)} className="edit-input edit-textarea" />
          
          <input type="text" placeholder="Video URL..." value={localOrOfficialEditData.video_url ?? ach.video_url ?? ""} onChange={e => handleEdit(ach.apiname, "video_url", e.target.value)} className="edit-input" />
          <textarea placeholder="Private notes..." value={localOrOfficialEditData.notes ?? ach.notes ?? ""} onChange={e => handleEdit(ach.apiname, "notes", e.target.value)} className="edit-input edit-textarea" style={{ borderLeft: "3px solid var(--accent-green)" }} />
          <div className="edit-checks">
            <label className="edit-check-label" style={{ opacity: ach.is_official_missable ? 0.6 : 1, cursor: ach.is_official_missable ? "not-allowed" : "pointer" }}>
              <input type="checkbox" checked={ach.is_missable || false} disabled={ach.is_official_missable} onChange={e => handleEdit(ach.apiname, "is_missable", e.target.checked)} /> 
              Is Missable {ach.is_official_missable && <span style={{ color: "var(--accent-yellow)", marginLeft: "4px" }}>(Official)</span>}
            </label>
            <label className="edit-check-label"><input type="checkbox" checked={ach.is_spoiler || false} onChange={e => handleEdit(ach.apiname, "is_spoiler", e.target.checked)} /> Is Spoiler</label>
          </div>

          <div className="edit-requires">
            <label className="edit-input-label">Requires (prerequisite achievements)</label>
            <div className="edit-requires-list">
              {achievements.filter(a => a.apiname !== ach.apiname).map(other => {
                const currentRequires: string[] = localOrOfficialEditData.requires ?? ach.requires ?? [];
                const isChecked = currentRequires.includes(other.apiname);
                return (
                  <label key={other.apiname} className="edit-requires-item">
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
                    {other.display_name}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          {ach.requires && ach.requires.length > 0 && (
            <div className="chain-row">
              <span className="chain-label">Requires:</span>
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
                <span className="chain-label">Unlocks:</span>
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
              <span className="notes-label">Notes: </span>{ach.notes}
            </div>
          )}
          
          {ach.hint && !isHintHidden && (
            <div className="hint-box">
              <p style={ach.is_spoiler ? { filter: "blur(5px)", cursor: "pointer" } : {}} onMouseOver={e => e.currentTarget.style.filter = "none"} onMouseOut={e => { if (ach.is_spoiler) e.currentTarget.style.filter = "blur(5px)" }}>
                <span className="hint-label">Hint: </span>{renderHintWithLinks(ach.hint)}
              </p>
              {ach.video_url && getYouTubeEmbedUrl(ach.video_url) && (
                <div className="video-wrapper"><iframe src={getYouTubeEmbedUrl(ach.video_url)!} title="YouTube video" frameBorder="0" allowFullScreen></iframe></div>
              )}
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
    prevProps.achievements === nextProps.achievements
  );
});