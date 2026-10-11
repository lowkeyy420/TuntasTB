"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, Button, controlClasses } from "@/components/ui";

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/60 p-0 sm:items-center sm:p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-modal-title"
        className="flex max-h-dvh w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-card bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-raised sm:rounded-card"
      >
        <h2 id="link-modal-title" className="text-2xl font-bold">
          {t.title}
        </h2>
        <Alert tone="warning" role="alert" title={t.warning} />
        <p className="text-base">{t.instruction}</p>
        <input
          ref={inputRef}
          readOnly
          aria-label={t.title}
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className={controlClasses}
        />
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button block icon={copied ? Check : Copy} onClick={onCopy}>
            {copied ? t.copied : t.copy}
          </Button>
          <Button ref={closeRef} block variant="secondary" onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
