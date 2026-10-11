"use client";

import { useEffect, useRef, useState } from "react";
import { copy } from "@/copy/nurse.id";

/**
 * One-time family link dialog. The link lives only in the parent's memory
 * for as long as this dialog is open; it is never fetched again.
 */
export function LinkModal({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
  const t = copy.patients.linkModal;
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Older Android WebViews: fall back to selecting the text.
      inputRef.current?.focus();
      inputRef.current?.select();
      try {
        setCopied(document.execCommand("copy"));
      } catch {
        setCopied(false);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
        className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 text-black sm:rounded-2xl"
      >
        <h2 id="link-modal-title" className="text-xl font-semibold">
          {t.title}
        </h2>
        <p role="alert" className="rounded bg-amber-100 p-3 text-base font-medium text-amber-900">
          {t.warning}
        </p>
        <p className="text-base">{t.instruction}</p>
        <input
          ref={inputRef}
          readOnly
          aria-label={t.title}
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded border border-black/30 px-3 py-3 text-base"
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onCopy}
            className="min-h-12 flex-1 rounded bg-teal-700 px-4 text-lg font-medium text-white"
          >
            {copied ? t.copied : t.copy}
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="min-h-12 flex-1 rounded border border-black/30 px-4 text-lg"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
