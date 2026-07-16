export const RARITY_TIERS = [
  { label: "Common",     min: 40,  color: "#a1a1aa" },
  { label: "Uncommon",   min: 20,  color: "#60a5fa" },
  { label: "Rare",       min: 10,  color: "#c084fc" },
  { label: "Very Rare",  min: 5,   color: "#f59e0b" },
  { label: "Ultra Rare", min: 0,   color: "#ef4444" },
] as const;

export function getRarityTier(percent: number) {
  if (isNaN(percent)) return null;
  return RARITY_TIERS.find(t => percent >= t.min) ?? RARITY_TIERS[RARITY_TIERS.length - 1];
}