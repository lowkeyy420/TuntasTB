import type { ReactNode } from "react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: LucideIcon }> = {
  info: { box: "border-info-ink bg-info-bg text-info-ink", icon: Info },
  success: {
    box: "border-triage-green-solid bg-triage-green-bg text-triage-green-ink",
    icon: CircleCheck,
  },
  warning: {
    box: "border-triage-yellow-solid bg-triage-yellow-bg text-triage-yellow-ink",
    icon: TriangleAlert,
  },
  danger: {
    box: "border-triage-red-solid bg-triage-red-bg text-triage-red-ink",
    icon: OctagonAlert,
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** `alert` interrupts a screen reader (errors); `status` waits its turn. Omit for static content. */
  role?: "alert" | "status";
  className?: string;
}

/** A message with an icon. The icon shape differs per tone, so tone never rests on colour. */
export function Alert({ tone = "info", title, children, role, className }: AlertProps) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={role} className={cx("flex items-start gap-3 rounded-control border p-4", box, className)}>
      <Icon aria-hidden className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 text-base">
        {title && <p className="text-lg font-bold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
