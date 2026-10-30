import { useEffect, useState, type ReactNode } from "react";
import { CompletionRating } from "../types";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const RATING_MAX = 10;

const toRating = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(RATING_MAX, Math.max(1, Math.round(n)));
};

const toHours = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(9999, Math.round(n * 10) / 10);
};

const formatHours = (h: number) => (Number.isInteger(h) ? `${h}` : h.toFixed(1));

export function hasCompletionRating(r?: CompletionRating | null): r is CompletionRating {
  return !!r && (r.difficulty !== undefined || r.length !== undefined || r.hours !== undefined);
}
export function normalizeCompletionRating(raw: unknown): CompletionRating | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: CompletionRating = {};
  const d = toRating(r.difficulty);
  if (d !== undefined) out.difficulty = d;
  const l = toRating(r.length);
  if (l !== undefined) out.length = l;
  const h = toHours(r.hours);
  if (h !== undefined) out.hours = h;
  return hasCompletionRating(out) ? out : undefined;
}
export function parseCompletionRating(communityData: unknown): CompletionRating | undefined {
  if (!communityData || typeof communityData !== "object" || Array.isArray(communityData)) return undefined;
  return normalizeCompletionRating((communityData as Record<string, unknown>).completion);
}

export function DifficultyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="M12 14l4.5-5" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LengthIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9.5 2.5h5" />
    </svg>
  );
}

export function HoursIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12" />
      <path d="M6 21h12" />
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
      <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
    </svg>
  );
}

const RATINGS_CACHE_KEY = "as.dbRatings.v1";
const RATINGS_TTL_MS = 6 * 60 * 60 * 1000;
const RATINGS_REPO = "batureren/achievement-scavenger-database";
const RATINGS_CONCURRENCY = 6;

interface RatingsCache {
  at: number;
  ids: string[];
  checked: Record<string, CompletionRating | null>;
}

let ratingsMemo: RatingsCache | null = null;
let ratingsInflight: Promise<RatingsCache | null> | null = null;

function readRatingsCache(): RatingsCache | null {
  if (ratingsMemo) return ratingsMemo;
  try {
    const raw = localStorage.getItem(RATINGS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.at === "number" && Array.isArray(parsed.ids) && parsed.checked && typeof parsed.checked === "object") {
        ratingsMemo = parsed;
        return ratingsMemo;
      }
    }
  } catch {}
  return null;
}

function writeRatingsCache(cache: RatingsCache) {
  ratingsMemo = cache;
  try { localStorage.setItem(RATINGS_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

function pickRatings(cache: RatingsCache | null): Record<string, CompletionRating> {
  const out: Record<string, CompletionRating> = {};
  if (!cache) return out;
  for (const [id, r] of Object.entries(cache.checked)) if (r) out[id] = r;
  return out;
}

export function storeCommunityRatings(ids: string[], ratings: Record<string, CompletionRating | undefined>) {
  const checked: Record<string, CompletionRating | null> = {};
  for (const id of ids) checked[id] = ratings[id] ?? null;
  writeRatingsCache({ at: Date.now(), ids, checked });
}

async function fetchRatingFile(appId: string): Promise<CompletionRating | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${RATINGS_REPO}/main/games/${appId}.json?t=${Date.now()}`);
    if (!res.ok) return null;
    return parseCompletionRating(await res.json()) ?? null;
  } catch {
    return null;
  }
}

async function loadCommunityRatings(wanted: string[]): Promise<RatingsCache | null> {
  let cache = readRatingsCache();

  if (!cache || Date.now() - cache.at > RATINGS_TTL_MS) {
    try {
      const res = await fetch(`https://api.github.com/repos/${RATINGS_REPO}/contents/games`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          const ids = list
            .filter((f: any) => f.type === "file" && typeof f.name === "string" && f.name.endsWith(".json"))
            .map((f: any) => f.name.slice(0, -5));
          cache = { at: Date.now(), ids, checked: {} };
        }
      }
    } catch {}
    if (!cache) return null;
  }

  const known = new Set(cache.ids);
  const missing = wanted.filter(id => known.has(id) && !(id in cache!.checked));
  if (missing.length === 0) {
    writeRatingsCache(cache);
    return cache;
  }

  const checked = { ...cache.checked };
  for (let i = 0; i < missing.length; i += RATINGS_CONCURRENCY) {
    const batch = missing.slice(i, i + RATINGS_CONCURRENCY);
    const results = await Promise.all(batch.map(fetchRatingFile));
    batch.forEach((id, idx) => { checked[id] = results[idx]; });
  }

  const next = { ...cache, checked };
  writeRatingsCache(next);
  return next;
}

export function useCommunityRatings(appIds: string[]): Record<string, CompletionRating> {
  const key = [...appIds].sort().join("|");
  const [ratings, setRatings] = useState<Record<string, CompletionRating>>(() => pickRatings(readRatingsCache()));

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const wanted = key.split("|");
    const run = async () => {
      while (ratingsInflight) {
        try { await ratingsInflight; } catch {}
      }
      ratingsInflight = loadCommunityRatings(wanted);
      try {
        const cache = await ratingsInflight;
        if (!cancelled && cache) setRatings(pickRatings(cache));
      } finally {
        ratingsInflight = null;
      }
    };
    run();
    return () => { cancelled = true; };
  }, [key]);

  return ratings;
}

export function ratingTier(v?: number): "low" | "mid" | "high" | "extreme" {
  if (!v || v <= 3) return "low";
  if (v <= 6) return "mid";
  if (v <= 8) return "high";
  return "extreme";
}

interface BadgeProps {
  rating?: CompletionRating;
  t: TFn;
  compact?: boolean;
  overlay?: boolean;
}

export function CompletionRatingBadge({ rating, t, compact = false, overlay = false }: BadgeProps) {
  if (!hasCompletionRating(rating)) return null;

  const diffLabel = t("rating.difficulty", { defaultValue: "Difficulty" });
  const lenLabel = t("rating.length", { defaultValue: "Length" });
  const hoursText = rating.hours !== undefined
    ? t("rating.hours_tooltip", { hours: formatHours(rating.hours), defaultValue: "~{hours} hours to 100%" })
    : null;

  const title = [
    t("rating.badge_title", { defaultValue: "100% completion estimate" }),
    rating.difficulty !== undefined ? `${diffLabel}: ${rating.difficulty}/${RATING_MAX}` : null,
    rating.length !== undefined ? `${lenLabel}: ${rating.length}/${RATING_MAX}` : null,
    hoursText,
  ].filter(Boolean).join("\n");

  return (
    <span className={`completion-rating${compact || overlay ? " completion-rating--compact" : ""}${overlay ? " completion-rating--overlay" : ""}`} title={title}>
      {rating.difficulty !== undefined && (
        <span className={`completion-rating-chip completion-tier-${ratingTier(rating.difficulty)}`}>
          <span className="completion-rating-icon"><DifficultyIcon /></span>
          {!compact && !overlay && <span className="completion-rating-label">{diffLabel}</span>}
          <strong>{rating.difficulty}</strong>
          <span className="completion-rating-max">/{RATING_MAX}</span>
        </span>
      )}
      {rating.length !== undefined && (
        <span className={`completion-rating-chip completion-tier-${ratingTier(rating.length)}`}>
          <span className="completion-rating-icon"><LengthIcon /></span>
          {!compact && !overlay && <span className="completion-rating-label">{lenLabel}</span>}
          <strong>{rating.length}</strong>
          <span className="completion-rating-max">/{RATING_MAX}</span>
        </span>
      )}
      {rating.hours !== undefined && (
        <span className="completion-rating-chip completion-rating-chip--hours">
          <span className="completion-rating-icon"><HoursIcon /></span>
          ~{formatHours(rating.hours)}h
        </span>
      )}
    </span>
  );
}

export function CompletionStatCard({ rating, t }: { rating?: CompletionRating; t: TFn }) {
  if (!hasCompletionRating(rating)) return null;

  const renderMeter = (value: number | undefined, label: string, icon: ReactNode) => {
    if (value === undefined) return null;
    const tier = ratingTier(value);
    return (
      <div className={`completion-stat-row completion-tier-${tier}`} title={`${label}: ${value}/${RATING_MAX}`}>
        <span className="completion-stat-name">
          <span className="completion-rating-icon">{icon}</span>
          {label}
        </span>
        <div className="completion-stat-meter" aria-hidden="true">
          {Array.from({ length: RATING_MAX }, (_, i) => (
            <span key={i} className={`completion-stat-seg${i < value ? " filled" : ""}`} />
          ))}
        </div>
        <span className="completion-stat-value">
          <strong>{value}</strong>
          <span className="completion-rating-max">/{RATING_MAX}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="stat-card completion-stat-card">
      <span className="stat-label">{t("rating.badge_title", { defaultValue: "100% completion estimate" })}</span>
      <div className="completion-stat-rows">
        {renderMeter(rating.difficulty, t("rating.difficulty", { defaultValue: "Difficulty" }), <DifficultyIcon size={13} />)}
        {renderMeter(rating.length, t("rating.length", { defaultValue: "Length" }), <LengthIcon size={13} />)}
        {rating.hours !== undefined && (
          <div className="completion-stat-row completion-stat-row--hours">
            <span className="completion-stat-name">
              <span className="completion-rating-icon"><HoursIcon size={13} /></span>
              {t("rating.hours", { defaultValue: "Est. hours" })}
            </span>
            <span className="completion-stat-value completion-stat-value--wide">
              <strong>~{formatHours(rating.hours)}h</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface EditorProps {
  value?: CompletionRating;
  isOverridden: boolean;
  onChange: (next: CompletionRating | null) => void;
  t: TFn;
}

export function CompletionRatingEditor({ value, isOverridden, onChange, t }: EditorProps) {
  const current: CompletionRating = value || {};

  const update = (patch: Partial<CompletionRating>) => {
    const next = normalizeCompletionRating({ ...current, ...patch });
    onChange(next ?? {});
  };

  const renderScale = (field: "difficulty" | "length", label: string) => {
    const selected = current[field];
    const tier = ratingTier(selected);
    return (
      <div className="completion-editor-row">
        <span className="completion-editor-label">{label}</span>
        <div className="completion-pips" role="group" aria-label={label}>
          {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map(n => {
            const filled = selected !== undefined && n <= selected;
            const isSelected = selected === n;
            const nextVal = isSelected ? undefined : n;
            return (
              <button
                key={n}
                type="button"
                className={`completion-pip${filled ? ` filled completion-tier-${tier}` : ""}${isSelected ? " selected" : ""}`}
                aria-pressed={isSelected}
                title={`${n}/${RATING_MAX}`}
                onClick={() => update(field === "difficulty" ? { difficulty: nextVal } : { length: nextVal })}
              >
                {n}
              </button>
            );
          })}
        </div>
        <span className="completion-editor-value">
          {selected !== undefined ? `${selected}/${RATING_MAX}` : t("rating.unset", { defaultValue: "Not set" })}
        </span>
      </div>
    );
  };

  return (
    <div className="completion-editor">
      <div className="completion-editor-header">
        <div className="completion-editor-heading">
          <span className="completion-editor-title">{t("rating.editor_title", { defaultValue: "100% Completion Estimate" })}</span>
          <span className="completion-editor-hint">
            {t("rating.editor_hint", { defaultValue: "Click a number to rate, click it again to clear. Included when you Create PR." })}
          </span>
        </div>
        {isOverridden && (
          <button type="button" className="btn-small" onClick={() => onChange(null)}>
            {t("rating.reset", { defaultValue: "Reset to community" })}
          </button>
        )}
      </div>

      {renderScale("difficulty", t("rating.difficulty", { defaultValue: "Difficulty" }))}
      {renderScale("length", t("rating.length", { defaultValue: "Length" }))}

      <div className="completion-editor-row">
        <span className="completion-editor-label">{t("rating.hours", { defaultValue: "Est. hours" })}</span>
        <input
          type="number"
          min={0}
          step={0.5}
          className="edit-input completion-editor-hours"
          placeholder="—"
          value={current.hours ?? ""}
          onChange={e => update({ hours: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
        <span className="completion-editor-value">{t("rating.hours_suffix", { defaultValue: "hours to 100% (optional)" })}</span>
      </div>
    </div>
  );
}