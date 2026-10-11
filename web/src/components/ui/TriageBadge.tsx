import { CircleCheck, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { copy } from "@/copy/family.id";
import { cx } from "./cx";

export type TriageLevel = "GREEN" | "YELLOW" | "RED";

// Three different outlines (circle, triangle, octagon): readable without colour.
const levels: Record<TriageLevel, { icon: LucideIcon; tint: string; solid: string }> = {
  GREEN: {
    icon: CircleCheck,
    tint: "border-triage-green-solid bg-triage-green-bg text-triage-green-ink",
    solid: "border-triage-green-solid bg-triage-green-solid text-on-solid",
  },
  YELLOW: {
    icon: TriangleAlert,
    tint: "border-triage-yellow-solid bg-triage-yellow-bg text-triage-yellow-ink",
    solid: "border-triage-yellow-solid bg-triage-yellow-solid text-on-solid",
  },
  RED: {
    icon: OctagonAlert,
    tint: "border-triage-red-solid bg-triage-red-bg text-triage-red-ink",
    solid: "border-triage-red-solid bg-triage-red-solid text-on-solid",
  },
};

export interface TriageBadgeProps {
  level: TriageLevel;
  /** Defaults to the family wording for the level. The nurse console passes its own short word. */
  label?: string;
  /** `banner` is the full-width heading of a family reply. */
  size?: "md" | "banner";
  /** White text on the level's solid colour, for the one place it must shout. */
  solid?: boolean;
}

/** A triage level as an icon and a word. Never colour alone. */
export function TriageBadge({ level, label, size = "md", solid = false }: TriageBadgeProps) {
  const { icon: Icon, tint, solid: solidCls } = levels[level];
  const banner = size === "banner";
  return (
    <span
      data-level={level}
      className={cx(
        "items-center border-2 font-bold",
        banner
          ? "flex w-full gap-3 rounded-control px-4 py-4 text-2xl"
          : "inline-flex min-h-10 gap-2 rounded-full px-3 py-1 text-base",
        solid ? solidCls : tint,
      )}
    >
      <Icon aria-hidden strokeWidth={2.5} className={cx("shrink-0", banner ? "size-10" : "size-6")} />
      <span>{label ?? copy.triage[level].label}</span>
    </span>
  );
}
