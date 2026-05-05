import type { CompatTier } from "../../types/gamedb";

export const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; solidBg: string; description: string }> = {
  native_arm:      { label: "Platinum",  color: "text-[#99ffff]", bg: "bg-[#99ffff]/10", border: "border-[#99ffff]/30", solidBg: "bg-[#99ffff]", description: "Runs natively on Apple Silicon" },
  rosetta2:        { label: "Platinum",  color: "text-[#99ffff]", bg: "bg-[#99ffff]/10", border: "border-[#99ffff]/30", solidBg: "bg-[#99ffff]", description: "Runs flawlessly via Rosetta 2" },
  crossover_wine:  { label: "Gold",      color: "text-[#ffcc00]", bg: "bg-[#ffcc00]/10", border: "border-[#ffcc00]/30", solidBg: "bg-[#ffcc00]", description: "Runs smoothly via translation" },
  gptk:            { label: "Gold",      color: "text-[#ffcc00]", bg: "bg-[#ffcc00]/10", border: "border-[#ffcc00]/30", solidBg: "bg-[#ffcc00]", description: "Runs smoothly via translation" },
  playable:        { label: "Gold",      color: "text-[#ffcc00]", bg: "bg-[#ffcc00]/10", border: "border-[#ffcc00]/30", solidBg: "bg-[#ffcc00]", description: "Playable with acceptable performance" },
  working:         { label: "Gold",      color: "text-[#ffcc00]", bg: "bg-[#ffcc00]/10", border: "border-[#ffcc00]/30", solidBg: "bg-[#ffcc00]", description: "Working" },
  partial:         { label: "Silver",    color: "text-[#b3b3b3]", bg: "bg-[#b3b3b3]/10", border: "border-[#b3b3b3]/30", solidBg: "bg-[#b3b3b3]", description: "Runs with minor issues" },
  "needs-workaround": { label: "Silver", color: "text-[#b3b3b3]", bg: "bg-[#b3b3b3]/10", border: "border-[#b3b3b3]/30", solidBg: "bg-[#b3b3b3]", description: "Needs workaround" },
  issues:          { label: "Bronze",    color: "text-[#cc6600]", bg: "bg-[#cc6600]/10", border: "border-[#cc6600]/30", solidBg: "bg-[#cc6600]", description: "Runs with notable issues" },
  broken:          { label: "Unplayable", color: "text-[#ff3333]", bg: "bg-[#ff3333]/10", border: "border-[#ff3333]/30", solidBg: "bg-[#ff3333]", description: "Unplayable" },
  unsupported:     { label: "Unplayable", color: "text-[#ff3333]", bg: "bg-[#ff3333]/10", border: "border-[#ff3333]/30", solidBg: "bg-[#ff3333]", description: "Does not run" },
};

export function getTierConfig(tier: string) {
  return TIER_CONFIG[tier] || TIER_CONFIG.unsupported;
}

export const NEW_TIERS: CompatTier[] = ["native_arm", "playable", "partial", "issues", "unsupported"];
