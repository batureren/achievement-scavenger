import type { CSSProperties } from "react";
import { SteamAchievementGroup } from "../types";

type TFn = (key: string, opts?: Record<string, any>) => string;

export interface SteamSetStat {
  group: SteamAchievementGroup;
  label: string;
  total: number;
  unlocked: number;
  visible: number;
  notOwned: boolean;
}

interface Props {
  sets: SteamSetStat[];
  activeId: string;
  onSelect: (id: string) => void;
  t: TFn;
}

export function SteamSetsStatCard({ sets, activeId, onSelect, t }: Props) {
  if (sets.length === 0) return null;

  const totalAll = sets.reduce((sum, s) => sum + (s.notOwned ? 0 : s.total), 0);
  const unlockedAll = sets.reduce((sum, s) => sum + (s.notOwned ? 0 : s.unlocked), 0);
  const completedSets = sets.filter(s => !s.notOwned && s.total > 0 && s.unlocked >= s.total).length;
  const ownedSets = sets.filter(s => !s.notOwned).length;

  return (
    <div className="stat-card steam-sets-card">
      <div className="steam-sets-header">
        <span className="stat-label">{t("steamSet.stats_title", { defaultValue: "Achievement Sets" })}</span>
        <span className="steam-sets-summary">
          {completedSets}/{ownedSets} ✓ · {unlockedAll}/{totalAll}
        </span>
      </div>
      <div className="steam-sets-grid">
        {sets.map(({ group, label, total, unlocked, visible, notOwned }) => {
          const id = String(group.id);
          const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
          const done = !notOwned && total > 0 && unlocked >= total;
          const selectable = visible > 0;
          const style = { "--set-color": group.color } as CSSProperties;
          const tags = [
            group.dlcAppId !== undefined ? t("steamSet.dlc", { defaultValue: "DLC" }) : null,
            notOwned ? t("steamSet.not_owned", { defaultValue: "Not owned" }) : null,
            group.archived ? t("steamSet.archived", { defaultValue: "Archived" }) : null,
          ].filter(Boolean).join(" · ");
          const title = [
            `${label} — ${unlocked}/${total} (${pct}%)`,
            tags || null,
            notOwned
              ? t("steamSet.not_owned_hint", { defaultValue: "You don't own this DLC, so its achievements are hidden and don't count toward 100%." })
              : t("steamSet.filter_hint", { defaultValue: "Show only this set" }),
          ].filter(Boolean).join("\n");

          return (
            <button
              key={id}
              type="button"
              style={style}
              className={`steam-set-tile${activeId === id ? " active" : ""}${done ? " done" : ""}${notOwned ? " not-owned" : ""}`}
              onClick={() => selectable && onSelect(id)}
              disabled={!selectable}
              title={title}
            >
              <span className="steam-set-tile-head">
                <span className="steam-set-dot" aria-hidden="true" />
                <span className="steam-set-tile-name">{label}</span>
                <span className="steam-set-tile-count">{done ? "✓" : `${unlocked}/${total}`}</span>
              </span>
              <span className="steam-set-tile-bar" aria-hidden="true">
                <span className="steam-set-tile-fill" style={{ width: `${pct}%` }} />
              </span>
              {tags && <span className="steam-set-tile-tags">{tags}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}