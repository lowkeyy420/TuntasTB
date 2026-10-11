import type { ReactNode } from "react";
import { Ban, Check, Clock, Info, Minus, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type StatusTone = "ok" | "warn" | "off" | "danger" | "info";

const tones: Record<StatusTone, { cls: string; icon: LucideIcon }> = {
  ok: { cls: "border-triage-green-solid bg-triage-green-bg text-triage-green-ink", icon: Check },
  warn: { cls: "border-triage-yellow-solid bg-triage-yellow-bg text-triage-yellow-ink", icon: Clock },
  off: { cls: "border-line-strong bg-sunken text-ink", icon: Minus },
  danger: { cls: "border-triage-red-solid bg-triage-red-bg text-triage-red-ink", icon: Ban },
  info: { cls: "border-info-ink bg-info-bg text-info-ink", icon: Info },
};

/** A small state label: an icon and a word on a tint. */
export function StatusPill({
  tone,
  icon,
  children,
}: {
  tone: StatusTone;
  /** Overrides the tone's default icon. */
  icon?: LucideIcon;
  children: ReactNode;
}) {
  const { cls, icon: Default } = tones[tone];
  const Icon = icon ?? Default;
  return (
    <span
      className={cx(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-semibold",
        cls,
      )}
    >
      <Icon aria-hidden strokeWidth={2.5} className="size-5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
