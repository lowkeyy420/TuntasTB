import type { ReactNode } from "react";
import { CalendarCheck, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

/** The teal strip across the top of every screen: the calendar's binding. */
export function AppBar({
  title,
  icon: Icon = CalendarCheck,
  children,
  className,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  /** Right-hand side: sign out, for example. */
  children?: ReactNode;
  /** Width of the inner row, to line up with the page below. */
  className?: string;
}) {
  return (
    <header className="bg-primary text-on-solid">
      <div className={cx("mx-auto flex min-h-14 items-center gap-3 px-4", className)}>
        <Icon aria-hidden className="size-7 shrink-0" />
        <p className="min-w-0 flex-1 text-lg font-bold">{title}</p>
        {children}
      </div>
    </header>
  );
}
