import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Holds a screen's main action at the bottom edge, inside thumb reach. It
 * sticks while the page scrolls and clears the phone's gesture area. The
 * parent must be a full-height flex column with 1rem side padding.
 */
export function BottomActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "sticky bottom-0 z-10 -mx-4 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-bar",
        className,
      )}
    >
      {children}
    </div>
  );
}
