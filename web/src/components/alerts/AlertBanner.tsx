"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, ChevronRight } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { useAlerts } from "./AlertFeedProvider";

/**
 * Stays at the top of every nurse console page while at least one RED alert is
 * unacknowledged, with the count, until someone takes it. Hidden on the inbox
 * itself, which shows the same count in its own header.
 */
export function AlertBanner() {
  const { openCount } = useAlerts();
  const pathname = usePathname();
  if (openCount === 0 || pathname.startsWith("/nurse/alerts")) return null;
  const t = copy.alerts.banner;

  return (
    <div role="alert" className="border-b border-triage-red-solid bg-triage-red-strong text-on-solid">
      <Link
        href="/nurse/alerts"
        className="mx-auto flex min-h-14 max-w-6xl items-center gap-3 px-4 py-2 text-lg font-bold"
      >
        <BellRing aria-hidden className="size-7 shrink-0" />
        <span className="min-w-0 flex-1">{t.count(openCount)}</span>
        <span className="flex shrink-0 items-center gap-1 underline decoration-2 underline-offset-4">
          {t.open}
          <ChevronRight aria-hidden className="size-6" />
        </span>
      </Link>
    </div>
  );
}
