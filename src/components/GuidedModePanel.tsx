import { useState, useMemo } from "react";
import { CustomGuide, GuidePlaythrough, GuideBlock, MergedAchievement, CustomChecklist, GuideBlockType } from "../types";
import { getYouTubeEmbedUrl, getMediaKind, renderHintWithLinks } from "../utils";

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
  
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [isAddingIndex, setIsAddingIndex] = useState(false);
  const [newIndexTitle, setNewIndexTitle] = useState("");
  
  const [isIndexMenuOpen, setIsIndexMenuOpen] = useState(true);

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
    playthroughs: [{ id: Date.now().toString(), name: "Standard Playthrough", indexes: [] }],
    activePlaythroughId: null,
    currentProgressBlockId: null
  };

  if (!safeGuide.activePlaythroughId && safeGuide.playthroughs.length > 0) {
    safeGuide.activePlaythroughId = safeGuide.playthroughs[0].id;
  }

  const activePlaythrough = safeGuide.playthroughs.find(p => p.id === safeGuide.activePlaythroughId) || safeGuide.playthroughs[0];

  const allBlocks = useMemo(() => activePlaythrough?.indexes.flatMap(idx => idx.blocks) || [], [activePlaythrough]);
  const currentIndex = safeGuide.currentProgressBlockId ? allBlocks.findIndex(b => b.id === safeGuide.currentProgressBlockId) : -1;
  const progressPct = allBlocks.length > 0 ? Math.round(((currentIndex + 1) / allBlocks.length) * 100) : 0;

  const persist = (updated: CustomGuide) => onChange(updated);
  
  const allChecklistItems = useMemo(() => checklists.flatMap(c => c.items.map(i => ({ ...i, parentListId: c.id, parentListTitle: c.title }))), [checklists]);

  const submitAddPlaythrough = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newModeName.trim();
    if (!name) return;
    const newPt: GuidePlaythrough = { id: Date.now().toString(), name, indexes: [] };
    persist({ ...safeGuide, playthroughs: [...safeGuide.playthroughs, newPt], activePlaythroughId: newPt.id });
    setNewModeName("");
    setIsAddingMode(false);
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

  const renderBlockContent = (block: GuideBlock) => {
    switch (block.type) {
      case "text":
        return <p className="guided-text">{renderHintWithLinks(block.content)}</p>;
      
      case "achievement":
        const ach = achievements.find(a => a.apiname === block.content);
        if (!ach) return <p className="guided-missing">Select an achievement...</p>;
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
        if (!clItem) return <p className="guided-missing">Select a checklist item...</p>;
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
        if (!block.content) return <p className="guided-missing">No media URL provided.</p>;
        if (getYouTubeEmbedUrl(block.content)) {
          return <iframe className="guided-media" src={getYouTubeEmbedUrl(block.content)!} frameBorder="0" allowFullScreen></iframe>;
        } else if (getMediaKind(block.content) === "video") {
          return <video className="guided-media" src={block.content} controls muted loop playsInline />;
        }
        return <img className="guided-media" src={block.content} alt="Guide media" />;
    }
  };

  return (
    <div className="guided-mode-container">
        <div className="guided-header">
            <div className="guided-controls">
            <select 
                className="control-select" 
                value={safeGuide.activePlaythroughId || ""}
                onChange={e => persist({ ...safeGuide, activePlaythroughId: e.target.value })}
            >
                {safeGuide.playthroughs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            
            {isAddingMode ? (
                <form onSubmit={submitAddPlaythrough} className="guided-inline-form">
                <input 
                    autoFocus 
                    className="edit-input" 
                    placeholder="Mode name (e.g. New Game+)" 
                    value={newModeName} 
                    onChange={e => setNewModeName(e.target.value)} 
                />
                <button type="submit" className="btn-small btn-small-success">Save</button>
                <button type="button" className="btn-small" onClick={() => setIsAddingMode(false)}>Cancel</button>
                </form>
            ) : (
                <button className="btn-small" onClick={() => setIsAddingMode(true)}>+ Mode</button>
            )}

            <button className={`btn-small ${editMode ? "btn-small-danger" : ""}`} onClick={() => setEditMode(!editMode)}>
                {editMode ? "Close Editor" : "Edit Guide"}
            </button>
            </div> 
        </div>
     
        <div className="guided-layout">
        
        <div className="guided-main">
          <div className="guided-timeline">
            {activePlaythrough?.indexes.map((index, i) => (
              <div key={index.id} id={`guided-index-${index.id}`} className="guided-index">
                <h3 className="guided-index-title">{i + 1}. {index.title}</h3>
                
                <div className="guided-blocks">
                  {index.blocks.map((block) => {
                    const isCurrent = safeGuide.currentProgressBlockId === block.id;
                    return (
                      <div key={block.id} className={`guided-block ${isCurrent ? "is-current" : ""}`}>
                        {!editMode && (
                          <button 
                            className="guided-set-progress-btn" 
                            title="Mark progress up to here"
                            onClick={() => persist({ ...safeGuide, currentProgressBlockId: block.id })}
                          >
                            {isCurrent ? "You are here" : "Set Progress"}
                          </button>
                        )}

                        {editMode ? (
                          <div className="guided-block-edit">
                            <div style={{display: "flex", justifyContent: "space-between", marginBottom: "8px"}}>
                              <span className="chain-label">Type: {block.type.toUpperCase()}</span>
                              <button className="btn-remove-link" onClick={() => handleRemoveBlock(index.id, block.id)}>✕ Remove</button>
                            </div>
                            {block.type === "text" && <textarea className="edit-input edit-textarea" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)} placeholder="Type paragraph here..." />}
                            {block.type === "media" && <input type="url" className="edit-input" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)} placeholder="Image or Video URL..." />}
                            {block.type === "achievement" && (
                              <select className="edit-input control-select" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)}>
                                <option value="">-- Select Achievement --</option>
                                {achievements.map(a => <option key={a.apiname} value={a.apiname}>{a.display_name}</option>)}
                              </select>
                            )}
                            {block.type === "checklist" && (
                              <select className="edit-input control-select" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)}>
                                <option value="">-- Select Item --</option>
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
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "text")}>+ Text</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "achievement")}>+ Achievement</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "checklist")}>+ Checklist</button>
                      <button className="btn-small" onClick={() => handleAddBlock(index.id, "media")}>+ Media</button>
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
                    placeholder="Chapter title..." 
                    value={newIndexTitle} 
                    onChange={e => setNewIndexTitle(e.target.value)} 
                  />
                  <button type="submit" className="btn-small btn-small-success">Save</button>
                  <button type="button" className="btn-small" onClick={() => setIsAddingIndex(false)}>Cancel</button>
                </form>
              ) : (
                <button className="btn-add-link" onClick={() => setIsAddingIndex(true)} style={{ marginTop: "10px" }}>+ Add Index/Chapter</button>
              )
            )}
          </div>
        </div>

        <div className="guided-sidebar">
          {activePlaythrough?.indexes.length > 0 && (
            <div className="accordion-section" style={{ margin: 0, border: "1px solid var(--border-color)" }}>
              <div className="accordion-header" onClick={() => setIsIndexMenuOpen(!isIndexMenuOpen)}>
                <span className="accordion-title">Table of Contents</span>
                <span className={`accordion-chevron ${isIndexMenuOpen ? "open" : ""}`}>▼</span>
              </div>
              {isIndexMenuOpen && (
                <div className="accordion-body">
                  <div className="guided-index-menu">
                    {activePlaythrough.indexes.map((idx, i) => (
                      <button key={idx.id} className="guided-index-link" onClick={() => scrollToIndex(idx.id)}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {i + 1}. {idx.title}
                        </span>
                        <span className="guided-index-link-count">{idx.blocks.length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}