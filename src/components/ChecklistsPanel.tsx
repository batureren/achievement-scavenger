// components/ChecklistsPanel.tsx
import { useState, useEffect, useMemo, FormEvent } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { CustomChecklist, ChecklistItem } from "../types";
import { getYouTubeEmbedUrl, renderHintWithLinks } from "../utils";
import { ConfirmDialog } from "./ConfirmDialog";

interface ChecklistsPanelProps {
  checklists: CustomChecklist[];
  onChange: (updated: CustomChecklist[]) => void;
  knownChapters?: string[];
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

export function ChecklistsPanel({ checklists, onChange, knownChapters = [] }: ChecklistsPanelProps) {
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(checklists[0]?.id ?? null);
  const activeChecklist = checklists.find(c => c.id === activeChecklistId) || checklists[0] || null;

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

  const persist = (newList: CustomChecklist[]) => onChange(newList);

  // ---------- Checklist-level actions ----------
  const handleCreateChecklist = (e: FormEvent) => {
    e.preventDefault();
    const title = newChecklistName.trim();
    if (!title) return;
    const newList: CustomChecklist = { id: Date.now().toString(), title, items: [] };
    persist([...checklists, newList]);
    setNewChecklistName("");
    setActiveChecklistId(newList.id);
  };

  const commitRename = (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    persist(checklists.map(c => (c.id === id ? { ...c, title } : c)));
  };

  const commitTitleDraft = () => {
    if (!activeChecklist) return;
    const title = titleDraft.trim();
    if (!title || title === activeChecklist.title) { setTitleDraft(activeChecklist.title); return; }
    persist(checklists.map(c => (c.id === activeChecklist.id ? { ...c, title } : c)));
  };

  const confirmDeleteChecklist = () => {
    if (!pendingDeleteChecklist) return;
    const updated = checklists.filter(c => c.id !== pendingDeleteChecklist.id);
    persist(updated);
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

    persist(checklists.map(c => (c.id === activeChecklist.id ? { ...c, items: updatedItems } : c)));
    closeForm();
  };

  const toggleItemComplete = (itemId: string) => {
    if (!activeChecklist) return;
    persist(checklists.map(c => (c.id === activeChecklist.id
      ? { ...c, items: c.items.map(i => (i.id === itemId ? { ...i, completed: !i.completed } : i)) }
      : c)));
  };

  const confirmDeleteItem = () => {
    if (!activeChecklist || !pendingDeleteItem) return;
    persist(checklists.map(c => (c.id === activeChecklist.id
      ? { ...c, items: c.items.filter(i => i.id !== pendingDeleteItem.id) }
      : c)));
    setPendingDeleteItem(null);
  };

  const markAll = (completed: boolean) => {
    if (!activeChecklist) return;
    persist(checklists.map(c => (c.id === activeChecklist.id
      ? { ...c, items: c.items.map(i => ({ ...i, completed })) }
      : c)));
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

  const totalCount = activeChecklist?.items.length || 0;
  const completedCount = activeChecklist?.items.filter(i => i.completed).length || 0;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleCategory = (key: string) => setCollapsedCategories(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="checklists-layout">
      <div className="checklists-sidebar">
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
                <button className="icon-btn hint-visible" title="Rename checklist" onClick={e => { e.stopPropagation(); setRenamingId(list.id); setRenameValue(list.title); }}>
                  <PencilIcon />
                </button>
                <button className="icon-btn hint-visible" title="Delete checklist" onClick={e => { e.stopPropagation(); setPendingDeleteChecklist(list); }}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })}

        <form onSubmit={handleCreateChecklist} className="add-link-form" style={{ marginTop: "10px" }}>
          <input type="text" placeholder="New checklist topic..." value={newChecklistName} onChange={e => setNewChecklistName(e.target.value)} />
          <button type="submit" className="btn-add-link">+</button>
        </form>
      </div>

      <div className="checklists-content">
        {!activeChecklist ? (
          <div className="empty-state">Create a checklist to start tracking collectibles.</div>
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
                <div className="btn-group">
                  <button className="btn-small" onClick={() => markAll(true)} disabled={totalCount === 0}>Mark All Found</button>
                  <button className="btn-small" onClick={() => markAll(false)} disabled={totalCount === 0}>Reset</button>
                  <button className="btn-small btn-small-success" onClick={openAddForm}>+ Add Item</button>
                </div>
              </div>

              <div className="checklist-progress-summary">
                <strong>{completedCount}/{totalCount}</strong> collected &middot; {progressPct}%
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>

              {totalCount > 0 && (
                <div className="checklist-toolbar">
                  <input
                    type="text"
                    className="search-input checklist-search-input"
                    placeholder="Search items, locations, categories..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                  <div className="filter-btns" style={{ flex: "unset" }}>
                    {(["ALL", "MISSING", "FOUND"] as const).map(f => (
                      <button key={f} className={`filter-btn ${statusFilter === f ? "active" : ""}`} onClick={() => setStatusFilter(f)}>
                        {f === "ALL" ? "All" : f === "FOUND" ? "Found" : "Missing"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {showItemForm && (
              <form className="cl-form-container" onSubmit={handleSaveItem}>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <input type="text" className="edit-input" style={{ flex: "2 1 200px" }} placeholder="Item Name (e.g. Memory Stick #12)" required
                    value={itemForm.name || ""} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
                  <input type="text" className="edit-input" style={{ flex: "1 1 140px" }} placeholder="Category (e.g. Xion City)" list="checklist-categories"
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
                    <option value="">No Chapter</option>
                    {knownChapters.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <input type="text" className="edit-input" placeholder="Location / how to get it (optional)"
                  value={itemForm.location || ""} onChange={e => setItemForm({ ...itemForm, location: e.target.value })} />
                <textarea className="edit-input edit-textarea" placeholder="Description / notes..."
                  value={itemForm.desc || ""} onChange={e => setItemForm({ ...itemForm, desc: e.target.value })} />
                <div style={{ display: "flex", gap: "10px" }}>
                  <input type="url" className="edit-input" placeholder="Image URL (optional)"
                    value={itemForm.imageUrl || ""} onChange={e => setItemForm({ ...itemForm, imageUrl: e.target.value })} />
                  <input type="url" className="edit-input" placeholder="Video URL (optional)"
                    value={itemForm.videoUrl || ""} onChange={e => setItemForm({ ...itemForm, videoUrl: e.target.value })} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" className="btn-small" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ padding: "7px 16px" }}>
                    {editingItemId ? "Save Changes" : "Add Item"}
                  </button>
                </div>
              </form>
            )}

            {totalCount === 0 && !showItemForm && (
              <div className="empty-state">No items added to this checklist yet.</div>
            )}
            {totalCount > 0 && filteredItems.length === 0 && (
              <div className="empty-state">No items match your search/filter.</div>
            )}

            {groupedItems.map(([category, items]) => (
              <div key={category} className="accordion-section">
                <div className="accordion-header" onClick={() => toggleCategory(category)}>
                  <span className="accordion-title">
                    {hasCategories ? category : "Items"}
                    <span className="checklist-category-count">{items.filter(i => i.completed).length}/{items.length}</span>
                  </span>
                  <span className={`accordion-chevron ${!collapsedCategories[category] ? "open" : ""}`}>▼</span>
                </div>
                {!collapsedCategories[category] && (
                  <div className="accordion-body" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {items.map(item => {
                      const embedUrl = item.videoUrl ? getYouTubeEmbedUrl(item.videoUrl) : null;
                      const isVideoOpen = expandedVideoId === item.id;
                      return (
                        <div key={item.id} className={`cl-item-card ${item.completed ? "completed" : ""}`}>
                          <div className="cl-item-hover-actions">
                            <button className="icon-btn hint-visible" title="Edit item" onClick={() => openEditForm(item)}>
                              <PencilIcon />
                            </button>
                            <button className="icon-btn hint-visible" title="Delete item" onClick={() => setPendingDeleteItem(item)}>
                              <TrashIcon />
                            </button>
                          </div>

                          <span className="cl-item-number">{numberByItemId.get(item.id)}</span>

                          <div className="cl-item-checkbox">
                            <input type="checkbox" checked={item.completed} onChange={() => toggleItemComplete(item.id)} />
                          </div>

                          {item.imageUrl ? (
                            <div className="cl-item-img-wrapper" onClick={() => setLightboxSrc(item.imageUrl)}>
                              <img src={item.imageUrl} alt={item.name} className="cl-item-img" />
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
                            {item.desc && <p className="cl-item-desc">{renderHintWithLinks(item.desc)}</p>}

                            <div className="cl-item-actions">
                              {item.videoUrl && (
                                <button className="btn-small" onClick={() => setExpandedVideoId(isVideoOpen ? null : item.id)}>
                                  {isVideoOpen ? "Hide Video" : "▶ Watch Video"}
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
                                  Couldn't embed this link —{" "}
                                  <a href="#" onClick={e => { e.preventDefault(); open(item.videoUrl); }}>open externally</a>.
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
      </div>

      {lightboxSrc && (
        <div className="cl-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="Preview" />
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDeleteChecklist}
        title="Delete Checklist"
        message={pendingDeleteChecklist ? `Delete "${pendingDeleteChecklist.title}" and all ${pendingDeleteChecklist.items.length} item(s)? This can't be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDeleteChecklist}
        onCancel={() => setPendingDeleteChecklist(null)}
      />
      <ConfirmDialog
        isOpen={!!pendingDeleteItem}
        title="Delete Item"
        message={pendingDeleteItem ? `Remove "${pendingDeleteItem.name}" from this checklist?` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDeleteItem}
        onCancel={() => setPendingDeleteItem(null)}
      />
    </div>
  );
}