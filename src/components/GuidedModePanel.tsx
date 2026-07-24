import { useState, useMemo, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { CustomGuide, GuidePlaythrough, GuideBlock, MergedAchievement, CustomChecklist, GuideBlockType } from "../types";
import { getYouTubeEmbedUrl, getMediaKind, renderHintWithLinks } from "../utils";

const PencilIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const GitHubIcon = () => <svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor" style={{marginTop:"-2px"}}><path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>;
const GridIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const ListIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;

let cachedGuidesList: any[] | null = null;
let lastGuidesListFetch = 0;

interface GuidedModePanelProps {
  appId: string;
  guide: CustomGuide | null;
  achievements: MergedAchievement[];
  checklists: CustomChecklist[];
  onChange: (updated: CustomGuide) => void;
  onToggleChecklistItem: (checklistId: string, itemId: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export function GuidedModePanel({ appId, guide, achievements, checklists, onChange, onToggleChecklistItem, t }: GuidedModePanelProps) {
  const [editMode, setEditMode] = useState(false);
  const [isGridView, setIsGridView] = useState(false);
  
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [newModeAuthor, setNewModeAuthor] = useState("");
  const [newModeDesc, setNewModeDesc] = useState("");

  const [isEditingModeMeta, setIsEditingModeMeta] = useState(false);
  const [editModeName, setEditModeName] = useState("");
  const [editModeAuthor, setEditModeAuthor] = useState("");
  const [editModeDesc, setEditModeDesc] = useState("");
  
  const [isAddingIndex, setIsAddingIndex] = useState(false);
  const [newIndexTitle, setNewIndexTitle] = useState("");
  
  const [isIndexMenuOpen, setIsIndexMenuOpen] = useState(true);

  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
  const [communityGuides, setCommunityGuides] = useState<GuidePlaythrough[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(false);
  const [guideSearchQuery, setGuideSearchQuery] = useState("");
  const [availableGuideCount, setAvailableGuideCount] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        if (!cachedGuidesList || Date.now() - lastGuidesListFetch > 5 * 60 * 1000) {
          const res = await fetch("https://api.github.com/repos/batureren/achievement-scavenger-database/contents/guides");
          if (res.ok) {
            cachedGuidesList = await res.json();
            lastGuidesListFetch = Date.now();
          }
        }
        if (isMounted && cachedGuidesList) {
          const prefix = `${appId}_`;
          const exact = `${appId}.json`;
          const count = cachedGuidesList.filter((f: any) => 
            f.type === "file" && (f.name.startsWith(prefix) || f.name === exact)
          ).length;
          setAvailableGuideCount(count);
        }
      } catch (e) {
      }
    };
    fetchCount();
    return () => { isMounted = false; };
  }, [appId]);

  const scrollToIndex = (id: string) => {
    const el = document.getElementById(`guided-index-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("chain-highlight");
      void el.offsetWidth;
      el.classList.add("chain-highlight");
      setTimeout(() => el.classList.remove("chain-highlight"), 1500);
    }
  };

  const safeGuide: CustomGuide = guide || {
    appId,
    playthroughs: [{ id: Date.now().toString(), name: t("guide.default_new_name"), indexes: [] }],
    activePlaythroughId: null,
    currentProgressBlockId: null
  };

  if (!safeGuide.activePlaythroughId && safeGuide.playthroughs.length > 0) {
    safeGuide.activePlaythroughId = safeGuide.playthroughs[0].id;
  }

  const activePlaythrough = safeGuide.playthroughs.find(p => p.id === safeGuide.activePlaythroughId) || safeGuide.playthroughs[0];

  const persist = (updated: CustomGuide) => onChange(updated);
  
  const allChecklistItems = useMemo(() => checklists.flatMap(c => c.items.map(i => ({ ...i, parentListId: c.id, parentListTitle: c.title }))), [checklists]);

  const submitAddPlaythrough = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newModeName.trim();
    const author = newModeAuthor.trim();
    const desc = newModeDesc.trim();
    if (!name || !author || !desc) return;

    const newPt: GuidePlaythrough = { 
      id: Date.now().toString(), 
      name, 
      author,
      description: desc,
      indexes: [] 
    };
    persist({ ...safeGuide, playthroughs: [...safeGuide.playthroughs, newPt], activePlaythroughId: newPt.id });
    setNewModeName("");
    setNewModeAuthor("");
    setNewModeDesc("");
    setIsAddingMode(false);
  };

  const handleOpenEditMeta = () => {
    setEditModeName(activePlaythrough.name);
    setEditModeAuthor(activePlaythrough.author || "");
    setEditModeDesc(activePlaythrough.description || "");
    setIsEditingModeMeta(true);
    setIsAddingMode(false);
  };

  const submitEditModeMeta = (e: React.FormEvent) => {
    e.preventDefault();
    const name = editModeName.trim();
    const author = editModeAuthor.trim();
    const desc = editModeDesc.trim();
    if (!name || !author || !desc) return;

    const updatedPt = {
      ...activePlaythrough,
      name,
      author,
      description: desc
    };
    persist({
      ...safeGuide,
      playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? updatedPt : p)
    });
    setIsEditingModeMeta(false);
  };

  const handleDeletePlaythrough = () => {
    if (safeGuide.playthroughs.length <= 1) {
      toast.error(t("guide.delete_last_error"));
      return;
    }
    if (window.confirm(t("guide.delete_confirm_msg", { name: activePlaythrough.name }))) {
      const remaining = safeGuide.playthroughs.filter(p => p.id !== activePlaythrough.id);
      persist({
        ...safeGuide,
        playthroughs: remaining,
        activePlaythroughId: remaining[0].id
      });
      setIsEditingModeMeta(false);
    }
  };

  const submitAddIndex = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newIndexTitle.trim();
    if (!title) return;
    const updatedPt = { ...activePlaythrough, indexes: [...activePlaythrough.indexes, { id: Date.now().toString(), title, blocks: [] }] };
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === updatedPt.id ? updatedPt : p) });
    setNewIndexTitle("");
    setIsAddingIndex(false);
  };

  const handleAddBlock = (indexId: string, type: GuideBlockType) => {
    const newBlock: GuideBlock = { id: Date.now().toString(), type, content: "" };
    const updatedIndexes = activePlaythrough.indexes.map(idx => 
      idx.id === indexId ? { ...idx, blocks: [...idx.blocks, newBlock] } : idx
    );
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
  };

  const handleUpdateBlock = (indexId: string, blockId: string, content: string) => {
    const updatedIndexes = activePlaythrough.indexes.map(idx => 
      idx.id === indexId ? { ...idx, blocks: idx.blocks.map(b => b.id === blockId ? { ...b, content } : b) } : idx
    );
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
  };

  const handleRemoveBlock = (indexId: string, blockId: string) => {
    const updatedIndexes = activePlaythrough.indexes.map(idx => 
      idx.id === indexId ? { ...idx, blocks: idx.blocks.filter(b => b.id !== blockId) } : idx
    );
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
  };

  const handleRenameIndex = (indexId: string, newTitle: string) => {
    const updatedIndexes = activePlaythrough.indexes.map(idx => 
      idx.id === indexId ? { ...idx, title: newTitle } : idx
    );
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
  };

  const handleRemoveIndex = (indexId: string, title: string) => {
    if (window.confirm(t("guide.delete_confirm_msg", { name: title }))) {
      const updatedIndexes = activePlaythrough.indexes.filter(idx => idx.id !== indexId);
      persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
    }
  };

  const handlePublishGuide = async () => {
    if (!activePlaythrough) return;

    if (!activePlaythrough.author || !activePlaythrough.description) {
      toast.error(t("guide.publish_req_error"));
      return;
    }

    try {
      const sanitizedAuthor = activePlaythrough.author.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filename = `${appId}_${sanitizedAuthor}_${Date.now()}.json`;

      const clipboardText = JSON.stringify(activePlaythrough, null, 2);
      await navigator.clipboard.writeText(clipboardText);

      const url = `https://github.com/batureren/achievement-scavenger-database/new/main/guides?filename=${filename}`;
      await open(url);
      
      toast.success(t("guide.publish_success"), { duration: 6000 });
    } catch (err) {
      toast.error(t("guide.publish_failed"));
    }
  };

  const fetchCommunityGuides = async () => {
    setIsCommunityModalOpen(true);
    setLoadingGuides(true);
    setGuideSearchQuery("");
    try {
      if (!cachedGuidesList || Date.now() - lastGuidesListFetch > 5 * 60 * 1000) {
        const contentsRes = await fetch("https://api.github.com/repos/batureren/achievement-scavenger-database/contents/guides");
        if (!contentsRes.ok) throw new Error();
        cachedGuidesList = await contentsRes.json();
        lastGuidesListFetch = Date.now();
      }
      
      const contents = cachedGuidesList!;
      const prefix = `${appId}_`;
      const exact = `${appId}.json`;
      const matchingFiles = contents.filter((f: any) => 
        f.type === "file" && (f.name.startsWith(prefix) || f.name === exact)
      );

      const fetchedGuides: GuidePlaythrough[] = [];
      for (const file of matchingFiles) {
        const res = await fetch(file.download_url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            fetchedGuides.push(...data);
          } else {
            fetchedGuides.push(data);
          }
        }
      }
      
      setCommunityGuides(fetchedGuides);
    } catch (e) {
      setCommunityGuides([]);
    } finally {
      setLoadingGuides(false);
    }
  };

  const handleDownloadGuide = (guide: GuidePlaythrough) => {
    const imported: GuidePlaythrough = { ...guide, id: Date.now().toString() };
    persist({ ...safeGuide, playthroughs: [...safeGuide.playthroughs, imported], activePlaythroughId: imported.id });
    setIsCommunityModalOpen(false);
    toast.success(t("guide.import_success"));
  };

  const filteredCommunityGuides = useMemo(() => {
    if (!guideSearchQuery.trim()) return communityGuides;
    const q = guideSearchQuery.toLowerCase();
    return communityGuides.filter(g => 
      (g.name && g.name.toLowerCase().includes(q)) ||
      (g.author && g.author.toLowerCase().includes(q)) ||
      (g.description && g.description.toLowerCase().includes(q))
    );
  }, [communityGuides, guideSearchQuery]);

  const renderBlockContent = (block: GuideBlock) => {
    switch (block.type) {
      case "text":
        return <p className="guided-text">{renderHintWithLinks(block.content)}</p>;
      
      case "achievement":
        const ach = achievements.find(a => a.apiname === block.content);
        if (!ach) return <p className="guided-missing">{t("guide.select_achievement")}</p>;
        return (
          <div className={`guided-ach-card ${ach.unlocked ? "unlocked" : ""}`}>
            <img src={ach.unlocked ? ach.icon : ach.icongray} alt="" />
            <div>
              <strong>{ach.display_name} {ach.unlocked ? "✅" : "🔒"}</strong>
              <p>{ach.description}</p>
            </div>
          </div>
        );

      case "checklist":
        const clItem = allChecklistItems.find(i => i.id === block.content);
        if (!clItem) return <p className="guided-missing">{t("guide.select_checklist_item")}</p>;
        return (
          <div className={`guided-cl-card ${clItem.completed ? "completed" : ""}`} onClick={() => onToggleChecklistItem(clItem.parentListId, clItem.id)}>
            <input type="checkbox" checked={clItem.completed} readOnly />
            <div>
              <strong>
                <span className="guided-cl-topic">[{clItem.parentListTitle}]</span> {clItem.name}
              </strong>
              {clItem.location && <span className="guided-cl-loc">📍 {clItem.location}</span>}
            </div>
          </div>
        );

      case "media":
        if (!block.content) return <p className="guided-missing">{t("guide.no_media_url")}</p>;
        if (getYouTubeEmbedUrl(block.content)) {
          return <iframe className="guided-media" src={getYouTubeEmbedUrl(block.content)!} frameBorder="0" allowFullScreen></iframe>;
        } else if (getMediaKind(block.content) === "video") {
          return <video className="guided-media" src={block.content} controls muted loop playsInline />;
        }
        return <img className="guided-media" src={block.content} alt={t("guide.media_alt")} />;
    }
  };

  return (
    <div className="guided-mode-container">
        <div className="guided-header">
            <div className="guided-controls">
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <select 
                    className="control-select" 
                    value={safeGuide.activePlaythroughId || ""}
                    onChange={e => {
                      persist({ ...safeGuide, activePlaythroughId: e.target.value });
                      setIsEditingModeMeta(false);
                      setIsAddingMode(false);
                    }}
                >
                    {safeGuide.playthroughs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                
                {editMode && (
                  <>
                    <button className="icon-btn hint-visible" style={{ width: "28px", height: "28px" }} onClick={handleOpenEditMeta} title={t("guide.edit_info_tooltip")}><PencilIcon /></button>
                    {safeGuide.playthroughs.length > 1 && (
                      <button className="icon-btn hint-visible" style={{ width: "28px", height: "28px", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)" }} onClick={handleDeletePlaythrough} title={t("guide.delete_guide_tooltip")}><TrashIcon /></button>
                    )}
                  </>
                )}
              </div>
              
              <button className="btn-small" onClick={() => { setIsAddingMode(true); setIsEditingModeMeta(false); }}>{t("guide.new_guide")}</button>
              
              <div style={{ display: "flex", gap: "6px", marginLeft: "auto", flexWrap: "wrap" }}>
                <button 
                  className="icon-btn hint-visible" 
                  style={{ width: "28px", height: "28px", padding: 0 }} 
                  onClick={() => setIsGridView(!isGridView)} 
                  title={t("menu.view")}
                >
                  {isGridView ? <ListIcon /> : <GridIcon />}
                </button>
                <button className={`btn-small ${editMode ? "btn-small-danger" : ""}`} onClick={() => { setEditMode(!editMode); setIsEditingModeMeta(false); }}>
                    {editMode ? t("guide.close_editor") : t("guide.edit_guide")}
                </button>
                <button className="btn-small btn-small-success" onClick={handlePublishGuide} title={t("guide.export_pr_tooltip")}>
                    <GitHubIcon /> {t("guide.publish")}
                </button>
                <button className="btn-small" onClick={fetchCommunityGuides}>
                  {t("guide.browse_community")} {availableGuideCount !== null && availableGuideCount > 0 ? `(${availableGuideCount})` : ""}
                </button>
              </div>
            </div> 

            {isAddingMode && (
                <form onSubmit={submitAddPlaythrough} className="guided-inline-form" style={{flexDirection: "column", alignItems: "flex-start", marginTop: "10px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--border-color)"}}>
                  <input autoFocus className="edit-input" placeholder={t("guide.title_placeholder")} value={newModeName} onChange={e => setNewModeName(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <input className="edit-input" placeholder={t("guide.author_placeholder")} value={newModeAuthor} onChange={e => setNewModeAuthor(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <textarea className="edit-input edit-textarea" placeholder={t("guide.desc_placeholder")} value={newModeDesc} onChange={e => setNewModeDesc(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <div style={{display: "flex", gap: "8px", marginTop: "4px"}}>
                      <button type="submit" className="btn-small btn-small-success">{t("guide.create_btn")}</button>
                      <button type="button" className="btn-small" onClick={() => setIsAddingMode(false)}>{t("guide.cancel_btn")}</button>
                  </div>
                </form>
            )}

            {isEditingModeMeta && editMode && (
                <form onSubmit={submitEditModeMeta} className="guided-inline-form" style={{flexDirection: "column", alignItems: "flex-start", marginTop: "10px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--accent-yellow)"}}>
                  <input autoFocus className="edit-input" placeholder={t("guide.title_placeholder")} value={editModeName} onChange={e => setEditModeName(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <input className="edit-input" placeholder={t("guide.author_placeholder")} value={editModeAuthor} onChange={e => setEditModeAuthor(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <textarea className="edit-input edit-textarea" placeholder={t("guide.desc_placeholder")} value={editModeDesc} onChange={e => setEditModeDesc(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                  <div style={{display: "flex", gap: "8px", marginTop: "4px"}}>
                      <button type="submit" className="btn-small btn-small-success">{t("guide.save_info_btn")}</button>
                      <button type="button" className="btn-small" onClick={() => setIsEditingModeMeta(false)}>{t("guide.cancel_btn")}</button>
                  </div>
                </form>
            )}

            {activePlaythrough && (activePlaythrough.author || activePlaythrough.description) && !isAddingMode && !isEditingModeMeta && (
              <div className="guided-meta">
                {activePlaythrough.author && <div style={{ marginBottom: "4px" }}><strong>{t("guide.author_label")}</strong> {activePlaythrough.author}</div>}
                {activePlaythrough.description && <div>{activePlaythrough.description}</div>}
              </div>
            )}
        </div>
     
        <div className="guided-layout">
        
        <div className="guided-main">
          <div className={`guided-timeline ${isGridView ? "is-grid-view" : ""}`}>
            {activePlaythrough?.indexes.map((index, i) => (
              <div key={index.id} id={`guided-index-${index.id}`} className="guided-index">
                {editMode ? (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
                    <span className="guided-index-title" style={{ margin: 0, padding: 0 }}>{i + 1}.</span>
                    <input 
                      className="edit-input" 
                      style={{ flex: 1, fontSize: "1.1rem", fontWeight: "bold", padding: "4px 8px" }}
                      value={index.title}
                      onChange={e => handleRenameIndex(index.id, e.target.value)}
                      placeholder={t("guide.chapter_title_placeholder")}
                    />
                    <button className="btn-remove-link" onClick={() => handleRemoveIndex(index.id, index.title)}>
                      {t("guide.remove_btn")}
                    </button>
                  </div>
                ) : (
                  <h3 className="guided-index-title">{i + 1}. {index.title}</h3>
                )}
                
                <div className="guided-blocks">
                  {index.blocks.map((block) => {
                    const isCurrent = safeGuide.currentProgressBlockId === block.id;
                    return (
                      <div key={block.id} id={`guided-block-${block.id}`} className={`guided-block ${isCurrent ? "is-current" : ""}`}>
                        {!editMode && (
                          <button 
                            className="guided-set-progress-btn" 
                            title={t("guide.mark_progress_tooltip")}
                            onClick={() => persist({ ...safeGuide, currentProgressBlockId: block.id })}
                          >
                            {isCurrent ? t("guide.you_are_here") : t("guide.set_progress")}
                          </button>
                        )}

                        {editMode ? (
                          <div className="guided-block-edit">
                            <div style={{display: "flex", justifyContent: "space-between", marginBottom: "8px"}}>
                              <span className="chain-label">{t("guide.type_label", { type: block.type.toUpperCase() })}</span>
                              <button className="btn-remove-link" onClick={() => handleRemoveBlock(index.id, block.id)}>{t("guide.remove_btn")}</button>
                            </div>
                            {block.type === "text" && <textarea className="edit-input edit-textarea" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)} placeholder={t("guide.text_placeholder")} />}
                            {block.type === "media" && <input type="url" className="edit-input" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)} placeholder={t("guide.media_placeholder")} />}
                            {block.type === "achievement" && (
                              <select className="edit-input control-select" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)}>
                                <option value="">{t("guide.dropdown_select_ach")}</option>
                                {achievements.map(a => <option key={a.apiname} value={a.apiname}>{a.display_name}</option>)}
                              </select>
                            )}
                            {block.type === "checklist" && (
                              <select className="edit-input control-select" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)}>
                                <option value="">{t("guide.dropdown_select_item")}</option>
                                {allChecklistItems.map(item => <option key={item.id} value={item.id}>[{item.parentListTitle}] {item.name}</option>)}
                              </select>
                            )}
                          </div>
                        ) : (
                          renderBlockContent(block)
                        )}
                      </div>
                    );
                  })}

                  {editMode && (
                    <div className="guided-add-block-row">
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "text")}>{t("guide.add_text")}</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "achievement")}>{t("guide.add_achievement")}</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "checklist")}>{t("guide.add_checklist")}</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "media")}>{t("guide.add_media")}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {editMode && (
              isAddingIndex ? (
                <form onSubmit={submitAddIndex} className="guided-inline-form" style={{ marginTop: "10px", paddingLeft: "16px" }}>
                  <input 
                    autoFocus 
                    className="edit-input" 
                    placeholder={t("guide.chapter_title_placeholder")} 
                    value={newIndexTitle} 
                    onChange={e => setNewIndexTitle(e.target.value)} 
                  />
                  <button type="submit" className="btn-small btn-small-success">{t("guide.save_btn")}</button>
                  <button type="button" className="btn-small" onClick={() => setIsAddingIndex(false)}>{t("guide.cancel_btn")}</button>
                </form>
              ) : (
                <button className="btn-add-link" onClick={() => setIsAddingIndex(true)} style={{ marginTop: "10px" }}>{t("guide.add_index")}</button>
              )
            )}
          </div>
        </div>

        <div className="guided-sidebar">
          {activePlaythrough?.indexes.length > 0 && (
            <div className="accordion-section" style={{ margin: 0, border: "1px solid var(--border-color)" }}>
              <div className="accordion-header" onClick={() => setIsIndexMenuOpen(!isIndexMenuOpen)}>
                <span className="accordion-title">{t("guide.toc")}</span>
                <span className={`accordion-chevron ${isIndexMenuOpen ? "open" : ""}`}>▼</span>
              </div>
              {isIndexMenuOpen && (
                <div className="accordion-body">
                  <div className="guided-index-menu">
                    {activePlaythrough.indexes.map((idx, i) => {
                      const hasCurrent = idx.blocks.some(b => b.id === safeGuide.currentProgressBlockId);
                      return (
                        <button 
                          key={idx.id} 
                          className={`guided-index-link ${hasCurrent ? "is-active-index" : ""}`} 
                          onClick={() => scrollToIndex(idx.id)}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {i + 1}. {idx.title}
                            {hasCurrent && <span className="guided-toc-here">{t("guide.toc_here")}</span>}
                          </span>
                          <span className="guided-index-link-count">{idx.blocks.length}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {safeGuide.currentProgressBlockId && !editMode && (
        <div className="library-float-nav">
          <button
            className="library-float-btn"
            style={{ borderColor: "var(--accent-yellow)", color: "var(--accent-yellow)" }}
            onClick={() => {
              const el = document.getElementById(`guided-block-${safeGuide.currentProgressBlockId}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            title={t("guide.jump_to_progress")}
          >
            {t("guide.jump_to_progress")}
          </button>
        </div>
      )}

      {isCommunityModalOpen && (
        <div className="confirm-dialog-overlay" onClick={() => setIsCommunityModalOpen(false)}>
          <div className="confirm-dialog" style={{ width: "min(600px, 92vw)" }} onClick={e => e.stopPropagation()}>
            <h3 className="confirm-dialog-title">{t("guide.community_modal_title")}</h3>
            <p className="confirm-dialog-message" style={{ marginBottom: "10px" }}>
              {t("guide.community_modal_desc")}
            </p>
            
            {communityGuides.length > 0 && !loadingGuides && (
              <input 
                type="text" 
                className="search-input" 
                placeholder={t("guide.search_placeholder")} 
                value={guideSearchQuery}
                onChange={e => setGuideSearchQuery(e.target.value)}
                style={{ width: "100%", marginBottom: "10px" }}
              />
            )}

            <div className="community-guides-list">
              {loadingGuides ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>{t("guide.fetching")}</p>
              ) : filteredCommunityGuides.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                  {communityGuides.length === 0 
                    ? t("guide.no_guides")
                    : t("guide.no_match")}
                </p>
              ) : (
                filteredCommunityGuides.map((g, idx) => (
                  <div key={idx} className="community-guide-card">
                    <h4>{g.name}</h4>
                    {g.description && <p>{g.description}</p>}
                    <div className="community-guide-card-footer">
                      <span>{t("guide.by_author_chapters", { author: g.author || t("guide.unknown_author"), chapters: g.indexes.length })}</span>
                      <button className="btn-small btn-small-success" onClick={() => handleDownloadGuide(g)}>
                        {t("guide.download_btn")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="confirm-dialog-actions" style={{ marginTop: "16px" }}>
              <button className="confirm-dialog-btn cancel" onClick={() => setIsCommunityModalOpen(false)}>{t("guide.close_btn")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );}