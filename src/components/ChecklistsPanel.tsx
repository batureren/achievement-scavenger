// components/ChecklistsPanel.tsx
import { useState, useEffect, useMemo, FormEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";
import toast from "react-hot-toast";
import { CustomChecklist, ChecklistItem, SharedChecklistCollection, GameChecklists, ChecklistCollection } from "../types";
import { getYouTubeEmbedUrl, getMediaKind, renderHintWithLinks } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";
import { CollapsibleBox } from "./CollapsibleBox";

interface ChecklistsPanelProps {
  appId: string;
  gameChecklists: GameChecklists;
  onChange: (updated: GameChecklists) => void;
  knownChapters?: string[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}

type ItemFormState = Partial<ChecklistItem>;
type StatusFilter = "ALL" | "FOUND" | "MISSING";

const EMPTY_FORM: ItemFormState = { name: "", desc: "", category: "", location: "", chapter: "", imageUrl: "", videoUrl: "" };

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const PinIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);

const ImagePlaceholderIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 98 96" fill="currentColor" style={{marginTop:"-2px", marginRight: "4px"}}><path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>
);

const ChevronUpIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>;
const ChevronDownIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>;

let cachedChecklistsList: any[] | null = null;
let lastChecklistsListFetch = 0;

function ChecklistThumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (getMediaKind(src) === "video") {
    return <video src={src} className={className} muted loop autoPlay playsInline />;
  }
  return <img src={src} alt={alt} className={className} />;
}

export function ChecklistsPanel({ appId, gameChecklists, onChange, knownChapters = [], t }: ChecklistsPanelProps) {
  const safeData = useMemo(() => {
    if (gameChecklists.collections && gameChecklists.collections.length > 0) return gameChecklists;
    return {
      appId,
      activeCollectionId: "default",
      collections: [{ id: "default", name: "My Checklists", author: "", description: "", checklists: [] }]
    };
  }, [gameChecklists, appId]);

  const activeCollectionId = safeData.activeCollectionId || safeData.collections[0].id;
  const activeCollection = safeData.collections.find(c => c.id === activeCollectionId) || safeData.collections[0];
  const checklists = activeCollection.checklists;

  const persist = (updatedData: GameChecklists) => onChange(updatedData);
  const persistChecklists = (updatedChecklists: CustomChecklist[]) => {
    persist({
      ...safeData,
      collections: safeData.collections.map(c => c.id === activeCollectionId ? { ...c, checklists: updatedChecklists } : c)
    });
  };

  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(checklists[0]?.id ?? null);
  const activeChecklist = checklists.find(c => c.id === activeChecklistId) || checklists[0] || null;

  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColAuthor, setNewColAuthor] = useState("");
  const [newColDesc, setNewColDesc] = useState("");

  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [editColName, setEditColName] = useState("");
  const [editColAuthor, setEditColAuthor] = useState("");
  const [editColDesc, setEditColDesc] = useState("");
  const [pendingDeleteCollection, setPendingDeleteCollection] = useState<ChecklistCollection | null>(null);

  const [finderChapter, setFinderChapter] = useState("");
  const [finderLocation, setFinderLocation] = useState("");
  const isFinderActive = !!finderChapter || !!finderLocation;

  const [newChecklistName, setNewChecklistName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteChecklist, setPendingDeleteChecklist] = useState<CustomChecklist | null>(null);

  const [titleDraft, setTitleDraft] = useState(activeChecklist?.title || "");
  useEffect(() => { setTitleDraft(activeChecklist?.title || ""); }, [activeChecklist?.id]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_FORM);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<ChecklistItem | null>(null);

  const [availableCollectionCount, setAvailableCollectionCount] = useState<number | null>(null);
  const [isCommunityModalOpen, setIsCommunityModalOpen] = useState(false);
  const [communityCollections, setCommunityCollections] = useState<SharedChecklistCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      try {
        if (!cachedChecklistsList || Date.now() - lastChecklistsListFetch > 5 * 60 * 1000) {
          const res = await fetch("https://api.github.com/repos/batureren/achievement-scavenger-database/contents/checklists");
          if (res.ok) {
            cachedChecklistsList = await res.json();
            lastChecklistsListFetch = Date.now();
          }
        }
        if (isMounted && cachedChecklistsList) {
          const prefix = `${appId}_`;
          const exact = `${appId}.json`;
          const count = cachedChecklistsList.filter((f: any) =>
            f.type === "file" && (f.name.startsWith(prefix) || f.name === exact)
          ).length;
          setAvailableCollectionCount(count);
        }
      } catch (e) {}
    };
    fetchCount();
    return () => { isMounted = false; };
  }, [appId]);

  const handleCreateCollection = (e: FormEvent) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;
    const newCol: ChecklistCollection = {
      id: Date.now().toString(),
      name,
      author: newColAuthor.trim(),
      description: newColDesc.trim(),
      checklists: []
    };
    persist({
      ...safeData,
      activeCollectionId: newCol.id,
      collections: [...safeData.collections, newCol]
    });
    setIsAddingCollection(false);
    setNewColName("");
    setNewColAuthor("");
    setNewColDesc("");
  };

  const handleOpenEditCollection = () => {
    setEditColName(activeCollection.name);
    setEditColAuthor(activeCollection.author || "");
    setEditColDesc(activeCollection.description || "");
    setIsEditingCollection(true);
    setIsAddingCollection(false);
  };

  const submitEditCollectionMeta = (e: FormEvent) => {
    e.preventDefault();
    const name = editColName.trim();
    if (!name) return;
    persist({
      ...safeData,
      collections: safeData.collections.map(c => c.id === activeCollectionId ? {
        ...c, name, author: editColAuthor.trim(), description: editColDesc.trim()
      } : c)
    });
    setIsEditingCollection(false);
  };

  const confirmDeleteCollection = () => {
    if (!pendingDeleteCollection) return;
    const remaining = safeData.collections.filter(c => c.id !== pendingDeleteCollection.id);
    persist({
      ...safeData,
      collections: remaining,
      activeCollectionId: remaining[0].id
    });
    setPendingDeleteCollection(null);
  };

  const moveCategory = (category: string, direction: "up" | "down") => {
    if (!activeChecklist) return;
    const currentGroups = Array.from(
      activeChecklist.items.reduce((map, item) => {
        const key = item.category?.trim() || "General";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
        return map;
      }, new Map<string, ChecklistItem[]>()).entries()
    );

    const catIndex = currentGroups.findIndex(g => g[0] === category);
    if (catIndex === -1) return;
    if (direction === "up" && catIndex === 0) return;
    if (direction === "down" && catIndex === currentGroups.length - 1) return;

    const targetIndex = direction === "up" ? catIndex - 1 : catIndex + 1;
    
    const newGroups = [...currentGroups];
    [newGroups[catIndex], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[catIndex]];

    const newItems = newGroups.flatMap(g => g[1]);
    persistChecklists(checklists.map(c => c.id === activeChecklist.id ? { ...c, items: newItems } : c));
  };

  const moveItem = (itemId: string, direction: "up" | "down") => {
    if (!activeChecklist) return;
    const itemIndex = activeChecklist.items.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;
    
    const item = activeChecklist.items[itemIndex];
    const cat = item.category?.trim() || "General";
    
    const catItems = activeChecklist.items.filter(i => (i.category?.trim() || "General") === cat);
    const idxInCat = catItems.findIndex(i => i.id === itemId);
    if (idxInCat === -1) return;
    if (direction === "up" && idxInCat === 0) return;
    if (direction === "down" && idxInCat === catItems.length - 1) return;

    const targetIdxInCat = direction === "up" ? idxInCat - 1 : idxInCat + 1;
    const targetItemId = catItems[targetIdxInCat].id;
    
    const targetItemIndex = activeChecklist.items.findIndex(i => i.id === targetItemId);
    
    const newItems = [...activeChecklist.items];
    [newItems[itemIndex], newItems[targetItemIndex]] = [newItems[targetItemIndex], newItems[itemIndex]];
    
    persistChecklists(checklists.map(c => c.id === activeChecklist.id ? { ...c, items: newItems } : c));
  };

  // ---------- Checklist-level actions ----------
  const handleCreateChecklist = (e: FormEvent) => {
    e.preventDefault();
    const title = newChecklistName.trim();
    if (!title) return;
    const newList: CustomChecklist = { id: Date.now().toString(), title, items: [] };
    persistChecklists([...checklists, newList]);
    setNewChecklistName("");
    setActiveChecklistId(newList.id);
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    persistChecklists(checklists.map(c => (c.id === id ? { ...c, title } : c)));
  };

  const commitTitleDraft = () => {
    if (!activeChecklist) return;
    const title = titleDraft.trim();
    if (!title || title === activeChecklist.title) { setTitleDraft(activeChecklist.title); return; }
    persistChecklists(checklists.map(c => (c.id === activeChecklist.id ? { ...c, title } : c)));
  };

  const confirmDeleteChecklist = () => {
    if (!pendingDeleteChecklist) return;
    const updated = checklists.filter(c => c.id !== pendingDeleteChecklist.id);
    persistChecklists(updated);
    if (activeChecklistId === pendingDeleteChecklist.id) setActiveChecklistId(updated[0]?.id ?? null);
    setPendingDeleteChecklist(null);
  };

  // ---------- Item-level actions ----------
  const openAddForm = () => { setItemForm(EMPTY_FORM); setEditingItemId(null); setShowItemForm(true); };
  const openEditForm = (item: ChecklistItem) => { setItemForm(item); setEditingItemId(item.id); setShowItemForm(true); };
  const closeForm = () => { setShowItemForm(false); setEditingItemId(null); setItemForm(EMPTY_FORM); };

  const handleSaveItem = (e: FormEvent) => {
    e.preventDefault();
    if (!activeChecklist || !itemForm.name?.trim()) return;

    const base = {
      name: itemForm.name.trim(),
      desc: itemForm.desc || "",
      category: itemForm.category?.trim() || "",
      location: itemForm.location?.trim() || "",
      chapter: itemForm.chapter?.trim() || "",
      imageUrl: itemForm.imageUrl || "",
      videoUrl: itemForm.videoUrl || "",
    };

    const updatedItems = editingItemId
      ? activeChecklist.items.map(i => (i.id === editingItemId ? { ...i, ...base } : i))
      : [...activeChecklist.items, { id: Date.now().toString(), completed: false, ...base }];

    persistChecklists(checklists.map(c => (c.id === activeChecklist.id ? { ...c, items: updatedItems } : c)));
    closeForm();
  };

  const toggleItemInList = (checklistId: string, itemId: string) => {
    persistChecklists(checklists.map(c => (c.id === checklistId
      ? { ...c, items: c.items.map(i => (i.id === itemId ? { ...i, completed: !i.completed } : i)) }
      : c)));
  };

  const toggleItemComplete = (itemId: string) => {
    if (!activeChecklist) return;
    toggleItemInList(activeChecklist.id, itemId);
  };

  const confirmDeleteItem = () => {
    if (!activeChecklist || !pendingDeleteItem) return;
    persistChecklists(checklists.map(c => (c.id === activeChecklist.id
      ? { ...c, items: c.items.filter(i => i.id !== pendingDeleteItem.id) }
      : c)));
    setPendingDeleteItem(null);
  };

  const markAll = (completed: boolean) => {
    if (!activeChecklist) return;
    persistChecklists(checklists.map(c => (c.id === activeChecklist.id
      ? { ...c, items: c.items.map(i => ({ ...i, completed })) }
      : c)));
  };

  // ---------- Community Actions ----------
  const fetchCommunityChecklists = async () => {
    setIsCommunityModalOpen(true);
    setLoadingCollections(true);
    setCollectionSearchQuery("");
    try {
      if (!cachedChecklistsList || Date.now() - lastChecklistsListFetch > 5 * 60 * 1000) {
        const res = await fetch("https://api.github.com/repos/batureren/achievement-scavenger-database/contents/checklists");
        if (!res.ok) throw new Error();
        cachedChecklistsList = await res.json();
        lastChecklistsListFetch = Date.now();
      }
      const prefix = `${appId}_`;
      const exact = `${appId}.json`;
      const matchingFiles = cachedChecklistsList!.filter((f: any) =>
        f.type === "file" && (f.name.startsWith(prefix) || f.name === exact)
      );

      const fetched: SharedChecklistCollection[] = [];
      for (const file of matchingFiles) {
        const res = await fetch(file.download_url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            fetched.push({ appId, author: "Community", description: "", checklists: data });
          } else if (data.checklists) {
            fetched.push(data);
          }
        }
      }
      setCommunityCollections(fetched);
    } catch (e) {
      setCommunityCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  };

  const handleDownloadCollection = (collection: SharedChecklistCollection) => {
    const newId = Date.now().toString();
    const importedCollection: ChecklistCollection = {
      id: newId,
      name: `${collection.author}'s Checklists`,
      author: collection.author,
      description: collection.description,
      checklists: collection.checklists.map(c => ({
        ...c,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 6)
      }))
    };
    persist({
      ...safeData,
      activeCollectionId: newId,
      collections: [...safeData.collections, importedCollection]
    });
    setIsCommunityModalOpen(false);
    toast.success("Collection downloaded successfully!");
  };

  const handlePublishChecklists = async () => {
    const author = activeCollection.author?.trim();
    if (!author || checklists.length === 0) {
      toast.error("Please ensure your collection has an author name and at least one checklist.");
      return;
    }

    try {
      const sanitizedAuthor = author.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const filename = `${appId}_${sanitizedAuthor}_${Date.now()}.json`;

      const cleanChecklists = checklists.map(c => ({
        ...c,
        items: c.items.map(i => ({ ...i, completed: false }))
      }));

      const payload: SharedChecklistCollection = {
        appId,
        author: author,
        description: activeCollection.description || "",
        checklists: cleanChecklists
      };

      const clipboardText = JSON.stringify(payload, null, 2) + "\n";
      await navigator.clipboard.writeText(clipboardText);

      await new Promise(resolve => setTimeout(resolve, 200));

      const url = `https://github.com/batureren/achievement-scavenger-database/new/main/checklists?filename=${filename}`;
      await open(url);

      toast.success("Copied to clipboard. Ready to submit!", { duration: 5000 });
    } catch (e: any) {
      toast.error(`Publish failed: ${e.message || e}`);
    }
  };

  // ---------- Derived data ----------
  const filteredItems = useMemo(() => {
    if (!activeChecklist) return [];
    const q = searchQuery.trim().toLowerCase();
    return activeChecklist.items.filter(i => {
      if (statusFilter === "FOUND" && !i.completed) return false;
      if (statusFilter === "MISSING" && i.completed) return false;
      if (q) {
        const haystack = `${i.name} ${i.desc || ""} ${i.category || ""} ${i.location || ""} ${i.chapter || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [activeChecklist, searchQuery, statusFilter]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ChecklistItem[]>();
    filteredItems.forEach(item => {
      const key = item.category?.trim() || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [filteredItems]);

  const hasCategories = groupedItems.length > 1 || (groupedItems.length === 1 && groupedItems[0][0] !== "General");

  const numberByItemId = useMemo(() => {
    const map = new Map<string, number>();
    activeChecklist?.items.forEach((item, idx) => map.set(item.id, idx + 1));
    return map;
  }, [activeChecklist]);

  const existingCategories = useMemo(
    () => Array.from(new Set((activeChecklist?.items || []).map(i => i.category).filter(Boolean))) as string[],
    [activeChecklist]
  );

  const finderChapterOptions = useMemo(() => {
    const set = new Set<string>(knownChapters);
    checklists.forEach(c => c.items.forEach(i => { if (i.chapter?.trim()) set.add(i.chapter.trim()); }));
    return Array.from(set).sort();
  }, [checklists, knownChapters]);

  const finderLocationOptions = useMemo(() => {
    const set = new Set<string>();
    checklists.forEach(c => c.items.forEach(i => { if (i.location?.trim()) set.add(i.location.trim()); }));
    return Array.from(set).sort();
  }, [checklists]);

  const finderResults = useMemo(() => {
    if (!isFinderActive) return [];
    return checklists
      .map(c => ({
        checklist: c,
        items: c.items.filter(i => {
          if (finderChapter && i.chapter !== finderChapter) return false;
          if (finderLocation && i.location !== finderLocation) return false;
          return true;
        }),
      }))
      .filter(group => group.items.length > 0);
  }, [checklists, isFinderActive, finderChapter, finderLocation]);

  const filteredCollections = useMemo(() => {
    if (!collectionSearchQuery.trim()) return communityCollections;
    const q = collectionSearchQuery.toLowerCase();
    return communityCollections.filter(c =>
      (c.author && c.author.toLowerCase().includes(q)) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }, [communityCollections, collectionSearchQuery]);

  const totalCount = activeChecklist?.items.length || 0;
  const completedCount = activeChecklist?.items.filter(i => i.completed).length || 0;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleCategory = (key: string) => setCollapsedCategories(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="checklists-layout">
      <div className="checklists-sidebar" style={{ backgroundColor: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
        
        <div className="guided-header" style={{ marginBottom: "12px", background: "var(--card-bg)" }}>
          <div className="guided-controls" style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <select 
                  className="control-select" 
                  value={activeCollectionId}
                  onChange={e => {
                    persist({ ...safeData, activeCollectionId: e.target.value });
                    setIsEditingCollection(false);
                    setIsAddingCollection(false);
                  }}
              >
                  {safeData.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="icon-btn hint-visible" style={{ width: "28px", height: "28px" }} onClick={handleOpenEditCollection} title="Edit Collection Info"><PencilIcon /></button>
              {safeData.collections.length > 1 && (
                <button className="icon-btn hint-visible" style={{ width: "28px", height: "28px", color: "var(--accent-red)", borderColor: "rgba(239, 68, 68, 0.3)" }} onClick={() => setPendingDeleteCollection(activeCollection)} title="Delete Collection"><TrashIcon /></button>
              )}
            </div>
            
            <button className="btn-small" onClick={() => { setIsAddingCollection(true); setIsEditingCollection(false); }}>New Collection</button>
          </div>

          {isAddingCollection && (
              <form onSubmit={handleCreateCollection} className="guided-inline-form" style={{flexDirection: "column", alignItems: "flex-start", marginTop: "10px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--border-color)"}}>
                <input autoFocus className="edit-input" placeholder="Collection Title" value={newColName} onChange={e => setNewColName(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                <input className="edit-input" placeholder="Author Name" value={newColAuthor} onChange={e => setNewColAuthor(e.target.value)} style={{ width: "100%", maxWidth: "400px" }} />
                <textarea className="edit-input edit-textarea" placeholder="Description" value={newColDesc} onChange={e => setNewColDesc(e.target.value)} style={{ width: "100%", maxWidth: "400px" }} />
                <div style={{display: "flex", gap: "8px", marginTop: "4px"}}>
                    <button type="submit" className="btn-small btn-small-success">Create</button>
                    <button type="button" className="btn-small" onClick={() => setIsAddingCollection(false)}>Cancel</button>
                </div>
              </form>
          )}

          {isEditingCollection && (
              <form onSubmit={submitEditCollectionMeta} className="guided-inline-form" style={{flexDirection: "column", alignItems: "flex-start", marginTop: "10px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px dashed var(--accent-yellow)"}}>
                <input autoFocus className="edit-input" placeholder="Collection Title" value={editColName} onChange={e => setEditColName(e.target.value)} required style={{ width: "100%", maxWidth: "400px" }} />
                <input className="edit-input" placeholder="Author Name" value={editColAuthor} onChange={e => setEditColAuthor(e.target.value)} style={{ width: "100%", maxWidth: "400px" }} />
                <textarea className="edit-input edit-textarea" placeholder="Description" value={editColDesc} onChange={e => setEditColDesc(e.target.value)} style={{ width: "100%", maxWidth: "400px" }} />
                <div style={{display: "flex", gap: "8px", marginTop: "4px"}}>
                    <button type="submit" className="btn-small btn-small-success">Save Info</button>
                    <button type="button" className="btn-small" onClick={() => setIsEditingCollection(false)}>Cancel</button>
                </div>
              </form>
          )}

          {activeCollection && (activeCollection.author || activeCollection.description) && !isAddingCollection && !isEditingCollection && (
            <div className="guided-meta">
              {activeCollection.author && <div style={{ marginBottom: "4px" }}><strong>Author:</strong> {activeCollection.author}</div>}
              {activeCollection.description && (
                <CollapsibleBox maxHeight={80}>
                  <div>{activeCollection.description}</div>
                </CollapsibleBox>
              )}
            </div>
          )}
        </div>
        
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "10px", boxShadow: "var(--shadow-card)" }}>
          {checklists.map(list => {
            const done = list.items.filter(i => i.completed).length;
            const pct = list.items.length ? Math.round((done / list.items.length) * 100) : 0;
            const isActive = activeChecklist?.id === list.id;
            return (
              <div key={list.id} className="checklist-sidebar-item">
                <button className={`checklist-tab-btn ${isActive ? "active" : ""}`} onClick={() => setActiveChecklistId(list.id)}>
                  <div className="checklist-tab-btn-row">
                    {renamingId === list.id ? (
                      <input
                        autoFocus
                        className="edit-input"
                        style={{ padding: "3px 6px", fontSize: "0.82rem" }}
                        value={renameValue}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(list.id)}
                        onKeyDown={e => { if (e.key === "Enter") commitRename(list.id); if (e.key === "Escape") setRenamingId(null); }}
                      />
                    ) : (
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.title}</span>
                    )}
                    <span className="checklist-tab-count">{done}/{list.items.length}</span>
                  </div>
                  <div className="checklist-tab-progress-track">
                    <div className="checklist-tab-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </button>
                <div className="checklist-tab-actions">
                  <button className="icon-btn hint-visible" title={t("cl.rename_tooltip", { defaultValue: "Rename" })} onClick={e => { e.stopPropagation(); setRenamingId(list.id); setRenameValue(list.title); }}>
                    <PencilIcon />
                  </button>
                  <button className="icon-btn hint-visible" title={t("cl.delete_checklist_tooltip", { defaultValue: "Delete Checklist" })} onClick={e => { e.stopPropagation(); setPendingDeleteChecklist(list); }}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}

          <form onSubmit={handleCreateChecklist} className="add-link-form" style={{ marginTop: "10px" }}>
            <input type="text" placeholder={t("cl.new_checklist_placeholder", { defaultValue: "New Checklist..." })} value={newChecklistName} onChange={e => setNewChecklistName(e.target.value)} />
            <button type="submit" className="btn-add-link">+</button>
          </form>
        </div>
      </div>

      <div className="checklists-content">
        {!activeChecklist ? (
          <div className="empty-state">{t("cl.select_checklist_empty", { defaultValue: "Select or create a checklist." })}</div>
        ) : (
          <>
            <div className="checklist-header">
              <div className="checklist-header-top">
                <input
                  className="checklist-title-input"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitleDraft}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
                
                <div className="btn-group" style={{ alignSelf: "flex-start" }}>
                  <button className="btn-small" onClick={() => markAll(true)} disabled={totalCount === 0}>{t("cl.mark_all_found", { defaultValue: "Mark All Found" })}</button>
                  <button className="btn-small" onClick={() => markAll(false)} disabled={totalCount === 0}>{t("cl.reset", { defaultValue: "Reset" })}</button>
                  <button className="btn-small btn-small-success" onClick={openAddForm}>{t("cl.add_item_btn", { defaultValue: "Add Item" })}</button>
                  
                  <button className="btn-small btn-small-success" onClick={handlePublishChecklists} title="Publish Checklists" disabled={checklists.length === 0}>
                      <GitHubIcon /> Publish
                  </button>
                  <button className="btn-small" onClick={fetchCommunityChecklists}>
                      Community Lists {availableCollectionCount !== null && availableCollectionCount > 0 ? `(${availableCollectionCount})` : ""}
                  </button>
                </div>
              </div>

              <div className="checklist-progress-summary">
                <strong>{completedCount}/{totalCount}</strong> {t("cl.collected_label", { defaultValue: "collected" })} &middot; {progressPct}%
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>

              {totalCount > 0 && (
                <div className="checklist-toolbar">
                  <input
                    type="text"
                    className="search-input checklist-search-input"
                    placeholder={t("cl.search_items_placeholder", { defaultValue: "Search items..." })}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <div className="filter-btns" style={{ flex: "unset" }}>
                    {(["ALL", "MISSING", "FOUND"] as const).map(f => (
                      <button key={f} className={`filter-btn ${statusFilter === f ? "active" : ""}`} onClick={() => setStatusFilter(f)}>
                        {f === "ALL" ? t("cl.filter_all", { defaultValue: "All" }) : f === "FOUND" ? t("cl.filter_found", { defaultValue: "Found" }) : t("cl.filter_missing", { defaultValue: "Missing" })}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(finderChapterOptions.length > 0 || finderLocationOptions.length > 0) && (
                <div className="checklist-toolbar" style={{ marginTop: "8px" }}>
                  <select className="edit-input control-select" style={{ maxWidth: "220px" }} value={finderChapter} onChange={e => setFinderChapter(e.target.value)}>
                    <option value="">{t("cl.find_by_chapter", { defaultValue: "Find by chapter..." })}</option>
                    {finderChapterOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="edit-input control-select" style={{ maxWidth: "220px" }} value={finderLocation} onChange={e => setFinderLocation(e.target.value)}>
                    <option value="">{t("cl.find_by_location", { defaultValue: "Find by location..." })}</option>
                    {finderLocationOptions.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {isFinderActive && (
                    <button className="btn-small" onClick={() => { setFinderChapter(""); setFinderLocation(""); }}>{t("cl.clear", { defaultValue: "Clear" })}</button>
                  )}
                </div>
              )}
            </div>

            {showItemForm && (
              <form className="cl-form-container" onSubmit={handleSaveItem}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <input type="text" className="edit-input" style={{ flex: "2 1 200px" }} placeholder={t("cl.item_name_placeholder", { defaultValue: "Item Name *" })} required
                    value={itemForm.name || ""} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
                  <input type="text" className="edit-input" style={{ flex: "1 1 140px" }} placeholder={t("cl.item_category_placeholder", { defaultValue: "Category (optional)" })} list="checklist-categories"
                    value={itemForm.category || ""} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} />
                  <datalist id="checklist-categories">
                    {existingCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                {knownChapters.length > 0 && (
                  <select
                    className="edit-input control-select"
                    style={{ maxWidth: "100%", width: "100%" }}
                    value={itemForm.chapter || ""}
                    onChange={e => setItemForm({ ...itemForm, chapter: e.target.value })}
                  >
                    <option value="">{t("cl.no_chapter_option", { defaultValue: "No Chapter" })}</option>
                    {knownChapters.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="text" className="edit-input" placeholder={t("cl.item_location_placeholder", { defaultValue: "Location (optional)" })}
                  value={itemForm.location || ""} onChange={e => setItemForm({ ...itemForm, location: e.target.value })} />
                <textarea className="edit-input edit-textarea" placeholder={t("cl.item_desc_placeholder", { defaultValue: "Description (optional)" })}
                  value={itemForm.desc || ""} onChange={e => setItemForm({ ...itemForm, desc: e.target.value })} />
                <div style={{ display: "flex", gap: "10px" }}>
                  <input type="url" className="edit-input" placeholder={t("cl.item_image_placeholder", { defaultValue: "Image URL (optional)" })}
                    value={itemForm.imageUrl || ""} onChange={e => setItemForm({ ...itemForm, imageUrl: e.target.value })} />
                  <input type="url" className="edit-input" placeholder={t("cl.item_video_placeholder", { defaultValue: "Video URL (optional)" })}
                    value={itemForm.videoUrl || ""} onChange={e => setItemForm({ ...itemForm, videoUrl: e.target.value })} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" className="btn-small" onClick={closeForm}>{t("cl.cancel", { defaultValue: "Cancel" })}</button>
                  <button type="submit" className="btn-primary" style={{ padding: "7px 16px" }}>
                    {editingItemId ? t("cl.save_changes", { defaultValue: "Save Changes" }) : t("cl.add_item_submit", { defaultValue: "Add Item" })}
                  </button>
                </div>
              </form>
            )}

            {isFinderActive ? (
              <>
                {finderResults.length === 0 && (
                  <div className="empty-state">{t("cl.no_finder_match", { defaultValue: "No items found in this location/chapter." })}</div>
                )}
                {finderResults.map(group => (
                  <div key={group.checklist.id} className="accordion-section">
                    <div className="accordion-header" onClick={() => toggleCategory(group.checklist.id)}>
                      <span className="accordion-title">
                        {group.checklist.title}
                        <span className="checklist-category-count">{group.items.filter(i => i.completed).length}/{group.items.length}</span>
                      </span>
                      <span className={`accordion-chevron ${!collapsedCategories[group.checklist.id] ? "open" : ""}`}>▼</span>
                    </div>
                    {!collapsedCategories[group.checklist.id] && (
                      <div className="accordion-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {group.items.map(item => (
                          <div key={item.id} className={`cl-item-card ${item.completed ? "completed" : ""}`}>
                            <div className="cl-item-hover-actions">
                              <button className="icon-btn hint-visible" title={t("cl.edit_item_tooltip", { defaultValue: "Edit Item" })} onClick={() => { setActiveChecklistId(group.checklist.id); setFinderChapter(""); setFinderLocation(""); openEditForm(item); }}>
                                <PencilIcon />
                              </button>
                            </div>

                            <div className="cl-item-checkbox">
                              <input type="checkbox" checked={item.completed} onChange={() => toggleItemInList(group.checklist.id, item.id)} />
                            </div>

                            {item.imageUrl ? (
                              <div className="cl-item-img-wrapper" onClick={() => setLightboxSrc(item.imageUrl)}>
                                <ChecklistThumb src={item.imageUrl} alt={item.name} className="cl-item-img" />
                              </div>
                            ) : (
                              <div className="cl-item-img cl-item-img--placeholder">
                                <ImagePlaceholderIcon />
                              </div>
                            )}

                            <div className="cl-item-info">
                              <div className="cl-item-header">
                                <h3 className="cl-item-title">{item.name}</h3>
                                {item.chapter && <span className="chapter-tag">{item.chapter}</span>}
                              </div>
                              {item.location && (
                                <span className="cl-item-location"><PinIcon /> {item.location}</span>
                              )}
                              {item.desc && (
                                <CollapsibleBox maxHeight={60}>
                                  <p className="cl-item-desc">{renderHintWithLinks(item.desc)}</p>
                                </CollapsibleBox>
                              )}                            
                              </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <>
                {totalCount === 0 && !showItemForm && (
                  <div className="empty-state">{t("cl.no_items_yet", { defaultValue: "No items yet. Add one to get started!" })}</div>
                )}
                {totalCount > 0 && filteredItems.length === 0 && (
                  <div className="empty-state">{t("cl.no_search_match", { defaultValue: "No items match your search or filter." })}</div>
                )}

                {groupedItems.map(([category, items], catIndex) => (
                  <div key={category} className="accordion-section">
                    <div className="accordion-header" onClick={() => toggleCategory(category)}>
                      <span className="accordion-title">
                        {hasCategories ? category : t("cl.items_fallback", { defaultValue: "Items" })}
                        <span className="checklist-category-count">{items.filter(i => i.completed).length}/{items.length}</span>
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {hasCategories && (
                          <div style={{ display: "flex", gap: "2px", marginRight: "8px" }} onClick={e => e.stopPropagation()}>
                            <button className="icon-btn" style={{ width: "22px", height: "22px" }} disabled={catIndex === 0} onClick={() => moveCategory(category, "up")}><ChevronUpIcon /></button>
                            <button className="icon-btn" style={{ width: "22px", height: "22px" }} disabled={catIndex === groupedItems.length - 1} onClick={() => moveCategory(category, "down")}><ChevronDownIcon /></button>
                          </div>
                        )}
                        <span className={`accordion-chevron ${!collapsedCategories[category] ? "open" : ""}`}>▼</span>
                      </div>
                    </div>
                {!collapsedCategories[category] && (
                      <div className="accordion-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {items.map((item, itemIndex) => {
                          const embedUrl = item.videoUrl ? getYouTubeEmbedUrl(item.videoUrl) : null;
                          const isVideoOpen = expandedVideoId === item.id;
                          return (
                            <div key={item.id} className={`cl-item-card ${item.completed ? "completed" : ""}`}>
                              <span className="cl-item-number">{numberByItemId.get(item.id)}</span>

                              <div className="cl-item-checkbox">
                                <input type="checkbox" checked={item.completed} onChange={() => toggleItemComplete(item.id)} />
                              </div>

                              {item.imageUrl ? (
                                <div className="cl-item-img-wrapper" onClick={() => setLightboxSrc(item.imageUrl)}>
                                  <ChecklistThumb src={item.imageUrl} alt={item.name} className="cl-item-img" />
                                </div>
                              ) : (
                                <div className="cl-item-img cl-item-img--placeholder">
                                  <ImagePlaceholderIcon />
                                </div>
                              )}

                              <div className="cl-item-info">
                                <div className="cl-item-header">
                                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <h3 className="cl-item-title">{item.name}</h3>
                                    {item.chapter && <span className="chapter-tag">{item.chapter}</span>}
                                  </span>
                                  <div className="cl-item-header-actions">
                                    <button className="icon-btn hint-visible" title="Move Up" disabled={itemIndex === 0} onClick={() => moveItem(item.id, "up")}>
                                      <ChevronUpIcon />
                                    </button>
                                    <button className="icon-btn hint-visible" title="Move Down" disabled={itemIndex === items.length - 1} onClick={() => moveItem(item.id, "down")}>
                                      <ChevronDownIcon />
                                    </button>
                                    <button className="icon-btn hint-visible" title={t("cl.edit_item_tooltip", { defaultValue: "Edit Item" })} onClick={() => openEditForm(item)}>
                                      <PencilIcon />
                                    </button>
                                    <button className="icon-btn hint-visible" title={t("cl.delete_item_tooltip", { defaultValue: "Delete Item" })} onClick={() => setPendingDeleteItem(item)}>
                                      <TrashIcon />
                                    </button>
                                  </div>
                                </div>
                                {item.location && (
                                  <span className="cl-item-location"><PinIcon /> {item.location}</span>
                                )}
                                {item.desc && (
                                        <CollapsibleBox maxHeight={120}>
                                          <p className="cl-item-desc">{renderHintWithLinks(item.desc)}</p>
                                        </CollapsibleBox>
                                      )}
                                <div className="cl-item-actions">
                                  {item.videoUrl && (
                                    <button className="btn-small" onClick={() => setExpandedVideoId(isVideoOpen ? null : item.id)}>
                                      {isVideoOpen ? t("cl.hide_video", { defaultValue: "Hide Video" }) : t("cl.watch_video", { defaultValue: "Watch Video" })}
                                    </button>
                                  )}
                                </div>

                                {item.videoUrl && isVideoOpen && (
                                  embedUrl ? (
                                    <div className="video-wrapper" style={{ marginTop: "10px" }}>
                                      <iframe src={embedUrl} title="Item video" frameBorder="0" allowFullScreen></iframe>
                                    </div>
                                  ) : (
                                    <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "6px" }}>
                                      {t("cl.cant_embed", { defaultValue: "Cannot embed this video." })}{" "}
                                      <a href="#" onClick={e => { e.preventDefault(); if (item.videoUrl) open(item.videoUrl); }}>{t("cl.open_externally", { defaultValue: "Open Externally" })}</a>.
                                    </p>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="cl-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          {getMediaKind(lightboxSrc) === "video" ? (
            <video src={lightboxSrc} controls autoPlay loop onClick={e => e.stopPropagation()} />
          ) : (
            <img src={lightboxSrc} alt="Preview" />
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDeleteCollection}
        title="Delete Collection"
        message={`Are you sure you want to delete the collection "${pendingDeleteCollection?.name}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteCollection}
        onCancel={() => setPendingDeleteCollection(null)}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteChecklist}
        title={t("cl.delete_checklist_title", { defaultValue: "Delete Checklist" })}
        message={pendingDeleteChecklist ? t("cl.delete_checklist_message", { title: pendingDeleteChecklist.title, count: pendingDeleteChecklist.items.length, defaultValue: `Are you sure you want to delete ${pendingDeleteChecklist.title}?` }) : ""}
        confirmLabel={t("cl.delete_confirm", { defaultValue: "Delete" })}
        onConfirm={confirmDeleteChecklist}
        onCancel={() => setPendingDeleteChecklist(null)}
      />

      <ConfirmDialog
        isOpen={!!pendingDeleteItem}
        title={t("cl.delete_item_title", { defaultValue: "Delete Item" })}
        message={pendingDeleteItem ? t("cl.delete_item_message", { name: pendingDeleteItem.name, defaultValue: `Are you sure you want to delete ${pendingDeleteItem.name}?` }) : ""}
        confirmLabel={t("cl.delete_confirm", { defaultValue: "Delete" })}
        onConfirm={confirmDeleteItem}
        onCancel={() => setPendingDeleteItem(null)}
      />

      {isCommunityModalOpen && (
        <div className="confirm-dialog-overlay" onClick={() => setIsCommunityModalOpen(false)}>
          <div className="confirm-dialog" style={{ width: "min(600px, 92vw)" }} onClick={e => e.stopPropagation()}>
            <h3 className="confirm-dialog-title">Community Checklists</h3>
            <p className="confirm-dialog-message" style={{ marginBottom: "10px" }}>
              Browse and download checklist collections created by the community.
            </p>

            {communityCollections.length > 0 && !loadingCollections && (
              <input
                type="text"
                className="search-input"
                placeholder="Search by author or description..."
                value={collectionSearchQuery}
                onChange={e => setCollectionSearchQuery(e.target.value)}
                style={{ width: "100%", marginBottom: "10px" }}
              />
            )}

            <div className="community-guides-list">
              {loadingCollections ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>Fetching checklists...</p>
              ) : filteredCollections.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                  {communityCollections.length === 0
                    ? "No community checklists found for this game yet."
                    : "No checklists match your search."}
                </p>
              ) : (
                filteredCollections.map((c, idx) => (
                  <div key={idx} className="community-guide-card">
                    <h4>{c.name || `${c.author}'s Checklists`}</h4>
                    {c.description && <p>{c.description}</p>}
                    <div className="community-guide-card-footer">
                      <span>{c.author} • {c.checklists.length} lists</span>
                      <button className="btn-small btn-small-success" onClick={() => handleDownloadCollection(c)}>
                        Download
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="confirm-dialog-actions" style={{ marginTop: "16px" }}>
              <button className="confirm-dialog-btn cancel" onClick={() => setIsCommunityModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}