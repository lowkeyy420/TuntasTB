import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Says what is missing, why, and what to do about it. Never a bare "nothing here". */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  /** The way forward, usually one button. */
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line-strong bg-surface px-5 py-8 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-on-primary-soft">
        <Icon aria-hidden className="size-8" />
      </span>
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      {children && <div className="max-w-[40ch] text-base text-ink-muted">{children}</div>}
      {action && <div className="mt-2 w-full max-w-xs">{action}</div>}
    </div>
  );
}
