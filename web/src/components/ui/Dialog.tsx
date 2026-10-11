"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A modal dialog that rises from the bottom on a phone and centres on a wide
 * screen. Escape closes it; focus moves into it on open and returns to where it
 * was on close; Tab stays inside while it is open.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("textarea, input, select, button");
    first?.focus();
    return () => before?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = [
      ...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea, input, select"),
    ];
    if (focusable.length === 0) return;
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/60 p-0 sm:items-center sm:p-4"
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-dvh w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-card bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-raised sm:rounded-card"
      >
        <h2 id={titleId} className="text-2xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
