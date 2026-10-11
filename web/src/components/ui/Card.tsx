import type { ReactNode } from "react";
import { cx } from "./cx";

/** A white sheet on the page. Do not nest one inside another. */
export function Card({
  as: Tag = "div",
  id,
  className,
  children,
}: {
  as?: "div" | "section" | "article" | "li";
  /** Anchor for a link that scrolls to this card. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={cx("rounded-card border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      {children}
    </Tag>
  );
}
