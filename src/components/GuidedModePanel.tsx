import { useState, useEffect, useMemo, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { CustomGuide, GuidePlaythrough, GuideBlock, GuideIndex, MergedAchievement, CustomChecklist, GuideBlockType } from "../types";
import { getYouTubeEmbedUrl, getMediaKind, renderHintWithLinks, renderMarkdown } from "../utils";import { CollapsibleBox } from "./CollapsibleBox";
import { ConfirmDialog } from "./ConfirmDialog";

const XIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const PencilIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
const GitHubIcon = () => <svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor" style={{marginTop:"-2px"}}><path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>;
const GridIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
const ListIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const ChevronUpIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>;
const ChevronDownIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;

let cachedGuidesList: any[] | null = null;
let lastGuidesListFetch = 0;

function RichTextEditor({ value, onChange, placeholder }: { value: string, onChange: (v: string) => void, placeholder: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const applyFormat = (prefix: string, suffix: string = "") => {
     const el = textareaRef.current;
     if(!el) return;
     const start = el.selectionStart;
     const end = el.selectionEnd;
     const before = value.substring(0, start);
     const selected = value.substring(start, end);
     const after = value.substring(end);
     
     onChange(`${before}${prefix}${selected || (suffix ? "text" : "")}${suffix}${after}`);
     
     setTimeout(() => {
       el.focus();
       el.setSelectionRange(start + prefix.length, end + prefix.length + (selected ? 0 : (suffix ? 4 : 0)));
     }, 0);
  };

  return (
    <div className="rich-text-container">
      <div className="rich-text-toolbar">
        <button type="button" onClick={() => applyFormat("# ", "")}>H1</button>
        <button type="button" onClick={() => applyFormat("## ", "")}>H2</button>
        <button type="button" onClick={() => applyFormat("### ", "")}>H3</button>
        <span className="rich-text-divider"></span>
        <button type="button" onClick={() => applyFormat("**", "**")}><b>B</b></button>
        <button type="button" onClick={() => applyFormat("*", "*")}><i>I</i></button>
        <button type="button" onClick={() => applyFormat("__", "__")}><u>U</u></button>
        <span className="rich-text-divider"></span>
        <button type="button" onClick={() => applyFormat("- ", "")}>• List</button>
        <button type="button" onClick={() => applyFormat("1. ", "")}>1. List</button>
      </div>
      <textarea 
        ref={textareaRef} 
        className="edit-input edit-textarea rich-text-area" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder={placeholder} 
      />
    </div>
  );
}

interface GuidedModePanelProps {
  appId: string;
  guide: CustomGuide | null;
  achievements: MergedAchievement[];
  checklists: CustomChecklist[];
  onChange: (updated: CustomGuide) => void;
  onToggleChecklistItem: (checklistId: string, itemId: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function AchievementSearchSelect({ value, onChange, achievements, t }: { value: string, onChange: (v: string) => void, achievements: MergedAchievement[], t: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = achievements.find(a => a.apiname === value);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "500px" }}>
      <button type="button" className="edit-input control-select" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", cursor: "pointer", padding: "6px 12px", minHeight: "36px" }} onClick={() => setIsOpen(!isOpen)}>
        {selected ? (
          <span style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            <img src={selected.icon} style={{ width: 18, height: 18, borderRadius: "2px" }} alt="" />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.display_name}</span>
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>{t("guide.dropdown_select_ach")}</span>
        )}
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>
      
      {isOpen && (
        <div style={{ position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0, marginTop: "4px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          <input autoFocus type="text" placeholder={t("search.achievements")} value={search} onChange={e => setSearch(e.target.value)} className="edit-input" style={{ width: "100%", marginBottom: "8px", boxSizing: "border-box" }} />
          <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
            <button type="button" onClick={() => { onChange(""); setIsOpen(false); setSearch(""); }} style={{ padding: "6px", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", textAlign: "left", width: "100%" }}>{t("guide.dropdown_select_ach")}</button>
            {achievements
              .filter(a => !search.trim() || a.display_name.toLowerCase().includes(search.trim().toLowerCase()))
              .map(a => (
                <button key={a.apiname} type="button" onClick={() => { onChange(a.apiname); setIsOpen(false); setSearch(""); }} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px", background: "transparent", border: "none", color: "var(--text-main)", cursor: "pointer", borderRadius: "4px", textAlign: "left", width: "100%" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <img src={a.icon} style={{ width: 20, height: 20, borderRadius: "4px", flexShrink: 0 }} alt="" />
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.display_name}</span>
                </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistItemSearchSelect({ value, onChange, items, t }: { value: string, onChange: (v: string) => void, items: any[], t: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = items.find(i => i.id === value);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "500px" }}>
      <button type="button" className="edit-input control-select" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", cursor: "pointer", padding: "6px 12px", minHeight: "36px" }} onClick={() => setIsOpen(!isOpen)}>
        {selected ? (
          <span style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            {selected.imageUrl ? (
              <img src={selected.imageUrl} style={{ width: 18, height: 18, borderRadius: "2px", objectFit: "cover", flexShrink: 0 }} alt="" />
            ) : (
              <div style={{ width: 18, height: 18, borderRadius: "2px", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
            )}
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ color: "var(--accent-green)", marginRight: "4px" }}>[{selected.parentListTitle}]</span>
              {selected.name}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>{t("guide.dropdown_select_item")}</span>
        )}
        <span>{isOpen ? "▲" : "▼"}</span>
      </button>
      
      {isOpen && (
        <div style={{ position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0, marginTop: "4px", background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          <input autoFocus type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="edit-input" style={{ width: "100%", marginBottom: "8px", boxSizing: "border-box" }} />
          <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
            <button type="button" onClick={() => { onChange(""); setIsOpen(false); setSearch(""); }} style={{ padding: "6px", background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", textAlign: "left", width: "100%" }}>{t("guide.dropdown_select_item")}</button>
            {items
              .filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase()) || i.parentListTitle.toLowerCase().includes(search.trim().toLowerCase()))
              .map(item => (
                <button key={item.id} type="button" onClick={() => { onChange(item.id); setIsOpen(false); setSearch(""); }} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px", background: "transparent", border: "none", color: "var(--text-main)", cursor: "pointer", borderRadius: "4px", textAlign: "left", width: "100%" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} style={{ width: 20, height: 20, borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} alt="" />
                  ) : (
                    <div style={{ width: 20, height: 20, borderRadius: "4px", background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "var(--accent-green)", marginRight: "4px" }}>[{item.parentListTitle}]</span> 
                    {item.name}
                  </span>
                </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

  // States for Image Zoom Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);

  const [pendingDelete, setPendingDelete] = useState<
    | { type: "playthrough" }
    | { type: "index"; id: string; title: string }
    | { type: "block"; indexId: string; blockId: string }
    | null
  >(null);

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

  // --- Core Form Functions ---
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
    setPendingDelete({ type: "playthrough" });
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
    setPendingDelete({ type: "block", indexId, blockId });
  };

  const handleMoveBlock = (indexId: string, blockId: string, direction: "up" | "down") => {
    const cIdx = activePlaythrough.indexes.findIndex(idx => idx.id === indexId);
    if (cIdx === -1) return;
    const bIdx = activePlaythrough.indexes[cIdx].blocks.findIndex(b => b.id === blockId);
    if (bIdx === -1) return;

    const newIndexes = JSON.parse(JSON.stringify(activePlaythrough.indexes)) as GuideIndex[];

    if (direction === "up") {
      if (bIdx > 0) {
        const temp = newIndexes[cIdx].blocks[bIdx];
        newIndexes[cIdx].blocks[bIdx] = newIndexes[cIdx].blocks[bIdx - 1];
        newIndexes[cIdx].blocks[bIdx - 1] = temp;
      } else if (cIdx > 0) {
        const [block] = newIndexes[cIdx].blocks.splice(bIdx, 1);
        newIndexes[cIdx - 1].blocks.push(block);
      }
    } else {
      if (bIdx < newIndexes[cIdx].blocks.length - 1) {
        const temp = newIndexes[cIdx].blocks[bIdx];
        newIndexes[cIdx].blocks[bIdx] = newIndexes[cIdx].blocks[bIdx + 1];
        newIndexes[cIdx].blocks[bIdx + 1] = temp;
      } else if (cIdx < newIndexes.length - 1) {
        const [block] = newIndexes[cIdx].blocks.splice(bIdx, 1);
        newIndexes[cIdx + 1].blocks.unshift(block);
      }
    }

    persist({ 
      ...safeGuide, 
      playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: newIndexes } : p) 
    });
  };

  const handleMoveIndex = (indexId: string, direction: "up" | "down") => {
    const cIdx = activePlaythrough.indexes.findIndex(idx => idx.id === indexId);
    if (cIdx === -1) return;

    const newIndexes = [...activePlaythrough.indexes];
    if (direction === "up" && cIdx > 0) {
      const temp = newIndexes[cIdx];
      newIndexes[cIdx] = newIndexes[cIdx - 1];
      newIndexes[cIdx - 1] = temp;
    } else if (direction === "down" && cIdx < newIndexes.length - 1) {
      const temp = newIndexes[cIdx];
      newIndexes[cIdx] = newIndexes[cIdx + 1];
      newIndexes[cIdx + 1] = temp;
    } else {
      return; 
    }

    persist({ 
      ...safeGuide, 
      playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: newIndexes } : p) 
    });
  };

  const handleRenameIndex = (indexId: string, newTitle: string) => {
    const updatedIndexes = activePlaythrough.indexes.map(idx => 
      idx.id === indexId ? { ...idx, title: newTitle } : idx
    );
    persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
  };

  const handleRemoveIndex = (indexId: string, title: string) => {
    setPendingDelete({ type: "index", id: indexId, title });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;

    if (pendingDelete.type === "playthrough") {
      const remaining = safeGuide.playthroughs.filter(p => p.id !== activePlaythrough.id);
      persist({
        ...safeGuide,
        playthroughs: remaining,
        activePlaythroughId: remaining[0].id
      });
      setIsEditingModeMeta(false);
    } else if (pendingDelete.type === "index") {
      const updatedIndexes = activePlaythrough.indexes.filter(idx => idx.id !== pendingDelete.id);
      persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
    } else if (pendingDelete.type === "block") {
      const { indexId, blockId } = pendingDelete;
      const updatedIndexes = activePlaythrough.indexes.map(idx => 
        idx.id === indexId ? { ...idx, blocks: idx.blocks.filter(b => b.id !== blockId) } : idx
      );
      persist({ ...safeGuide, playthroughs: safeGuide.playthroughs.map(p => p.id === activePlaythrough.id ? { ...p, indexes: updatedIndexes } : p) });
    }
    
    setPendingDelete(null);
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

      const clipboardText = JSON.stringify(activePlaythrough, null, 2) + "\n";
      await navigator.clipboard.writeText(clipboardText);

      await new Promise(resolve => setTimeout(resolve, 200));

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
        return (
          <CollapsibleBox maxHeight={150}>
            <div className="guided-text">{renderMarkdown(block.content)}</div>
          </CollapsibleBox>
        );
      
      case "achievement":
        const ach = achievements.find(a => a.apiname === block.content);
        if (!ach) return <p className="guided-missing">{t("guide.select_achievement")}</p>;
        return (
          <div className={`guided-ach-card ${ach.unlocked ? "unlocked" : ""}`}>
            <img src={ach.unlocked ? ach.icon : ach.icongray} alt="" />
            <div>
              <strong>{ach.display_name} {ach.unlocked ? "✅" : "🔒"}</strong>
              <CollapsibleBox maxHeight={60}>
                <p>{ach.description}</p>
              </CollapsibleBox>
            </div>
          </div>
        );

      case "checklist":
        const clItem = allChecklistItems.find(i => i.id === block.content);
        if (!clItem) return <p className="guided-missing">{t("guide.select_checklist_item")}</p>;
        return (
          <div className={`guided-cl-card ${clItem.completed ? "completed" : ""}`} onClick={() => onToggleChecklistItem(clItem.parentListId, clItem.id)}>
            <input type="checkbox" checked={clItem.completed} readOnly style={{ flexShrink: 0 }} />
            
            {clItem.imageUrl && (
              <img 
                src={clItem.imageUrl} 
                alt="" 
                style={{ width: 32, height: 32, borderRadius: "4px", objectFit: "cover", flexShrink: 0 }} 
              />
            )}
            
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
        return (
          <img 
            className="guided-media guided-media-zoomable" 
            src={block.content} 
            alt={t("guide.media_alt")} 
            onClick={() => { setLightboxSrc(block.content); setLightboxZoom(1); }} 
          />
        );
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
                {activePlaythrough.description && (
                  <CollapsibleBox maxHeight={80}>
                    <div>{activePlaythrough.description}</div>
                  </CollapsibleBox>
                )}
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
<button 
  className="icon-btn" 
  style={{ width: "24px", height: "24px", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)", marginLeft: "4px" }} 
  onClick={() => handleRemoveIndex(index.id, index.title)}
  title={t("guide.remove_btn")}
>
  <XIcon />
</button>
                  </div>
                ) : (
                  <h3 className="guided-index-title">{i + 1}. {index.title}</h3>
                )}
                
                <div className="guided-blocks">
                  {index.blocks.map((block, bIdx) => {
                    const isCurrent = safeGuide.currentProgressBlockId === block.id;
                    const isFirstGlobal = i === 0 && bIdx === 0;
                    const isLastGlobal = i === activePlaythrough.indexes.length - 1 && bIdx === index.blocks.length - 1;

                    return (
                      <div 
                        key={block.id} 
                        id={`guided-block-${block.id}`} 
                        className={`guided-block ${isCurrent ? "is-current" : ""}`}
                      >
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
                            <div style={{display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center"}}>
                              <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button 
                                    type="button"
                                    className="icon-btn" 
                                    style={{ width: "24px", height: "24px" }} 
                                    onClick={() => handleMoveBlock(index.id, block.id, "up")} 
                                    disabled={isFirstGlobal}
                                    title="Move Up"
                                  >
                                    <ChevronUpIcon />
                                  </button>
                                  <button 
                                    type="button"
                                    className="icon-btn" 
                                    style={{ width: "24px", height: "24px" }} 
                                    onClick={() => handleMoveBlock(index.id, block.id, "down")} 
                                    disabled={isLastGlobal}
                                    title="Move Down"
                                  >
                                    <ChevronDownIcon />
                                  </button>
                                </div>
                                <span className="chain-label" style={{ marginLeft: "4px" }}>
                                  {t("guide.type_label", { type: block.type.toUpperCase() })}
                                </span>
                              </div>
<button 
  className="icon-btn" 
  style={{ width: "24px", height: "24px", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)" }} 
  onClick={() => handleRemoveBlock(index.id, block.id)}
  title={t("guide.remove_btn")}
>
  <XIcon />
</button>
                            </div>
                            {block.type === "text" && <RichTextEditor value={block.content} onChange={val => handleUpdateBlock(index.id, block.id, val)} placeholder={t("guide.text_placeholder")} />}
                            
                            {block.type === "media" && <input type="url" className="edit-input" value={block.content} onChange={e => handleUpdateBlock(index.id, block.id, e.target.value)} placeholder={t("guide.media_placeholder")} />}
                            {block.type === "achievement" && (
                              <AchievementSearchSelect 
                                value={block.content} 
                                onChange={val => handleUpdateBlock(index.id, block.id, val)} 
                                achievements={achievements} 
                                t={t} 
                              />
                            )}
                            {block.type === "checklist" && (
                              <ChecklistItemSearchSelect 
                                value={block.content} 
                                onChange={val => handleUpdateBlock(index.id, block.id, val)} 
                                items={allChecklistItems} 
                                t={t} 
                              />
                            )}
                          </div>
                        ) : (
                          renderBlockContent(block)
                        )}
                      </div>
                    );
                  })}

                  {editMode && (
                    <div className="guided-add-block-row" style={isGridView ? { flexDirection: "column" } : {flexDirection: "row"}}>
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
                        <div 
                          key={idx.id} 
                          className={`guided-index-link ${hasCurrent ? "is-active-index" : ""}`} 
                          onClick={() => scrollToIndex(idx.id)}
                          style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px" }}>
                            {i + 1}. {idx.title}
                            {hasCurrent && <span className="guided-toc-here">{t("guide.toc_here")}</span>}
                          </span>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {editMode && (
                              <div style={{ display: "flex", gap: "2px" }} onClick={e => e.stopPropagation()}>
                                <button 
                                  className="icon-btn" 
                                  style={{ width: "22px", height: "22px" }} 
                                  onClick={(e) => { e.stopPropagation(); handleMoveIndex(idx.id, "up"); }} 
                                  disabled={i === 0}
                                  title="Move Chapter Up"
                                >
                                  <ChevronUpIcon />
                                </button>
                                <button 
                                  className="icon-btn" 
                                  style={{ width: "22px", height: "22px" }} 
                                  onClick={(e) => { e.stopPropagation(); handleMoveIndex(idx.id, "down"); }} 
                                  disabled={i === activePlaythrough.indexes.length - 1}
                                  title="Move Chapter Down"
                                >
                                  <ChevronDownIcon />
                                </button>
                              </div>
                            )}
                            <span className="guided-index-link-count">{idx.blocks.length}</span>
                          </div>
                        </div>
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

      {lightboxSrc && (
        <div className="cl-lightbox-overlay" onClick={() => { setLightboxSrc(null); setLightboxZoom(1); }}>
          {getMediaKind(lightboxSrc) === "video" ? (
            <video src={lightboxSrc} controls autoPlay loop onClick={e => e.stopPropagation()} />
          ) : (
            <div className="lightbox-zoom-container">
              <div className="lightbox-zoom-controls" onClick={e => e.stopPropagation()}>
                <button className="btn-small" onClick={() => setLightboxZoom(z => Math.max(0.5, z - 0.25))}>-</button>
                <button className="btn-small" onClick={() => setLightboxZoom(1)}>{Math.round(lightboxZoom * 100)}%</button>
                <button className="btn-small" onClick={() => setLightboxZoom(z => Math.min(5, z + 0.25))}>+</button>
                <button className="btn-small btn-small-danger" onClick={() => { setLightboxSrc(null); setLightboxZoom(1); }}>✕</button>
              </div>
              <div className="lightbox-zoom-scroll-area">
                <img 
                  src={lightboxSrc} 
                  alt="Preview" 
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: `${100 * lightboxZoom}%`,
                    height: "auto",
                    transition: "width 0.15s ease-out"
                  }} 
                />
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Remove"
        message={
          pendingDelete?.type === "playthrough" ? t("guide.delete_confirm_msg", { name: activePlaythrough.name }) :
          pendingDelete?.type === "index" ? t("guide.delete_confirm_msg", { name: pendingDelete.title }) :
          pendingDelete?.type === "block" ? t("guide.delete_confirm_msg", { name: "this block" }) : ""
        }
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

    </div>
  );
}