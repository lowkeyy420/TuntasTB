import type { ReactNode } from "react";
import { cx } from "./cx";

/** A white sheet on the page. Do not nest one inside another. */
export function Card({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "section" | "article" | "li";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cx("rounded-card border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      {children}
    </Tag>
  );
}
