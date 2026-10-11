"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellRing, House, ListOrdered, LogOut, Palette, Stethoscope, Users, type LucideIcon } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { AppBar, cx } from "@/components/ui";
import { AlertBanner } from "@/components/alerts/AlertBanner";
import { AlertFeedProvider, useAlerts } from "@/components/alerts/AlertFeedProvider";

const tab =
  "relative flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-b-4 px-1 text-sm font-semibold transition-colors duration-150 sm:flex-none sm:flex-row sm:gap-2 sm:px-4 sm:text-base";
const tabIdle = "border-transparent text-ink-muted hover:bg-primary-soft hover:text-on-primary-soft";
const tabCurrent = "border-primary bg-primary-soft font-bold text-on-primary-soft";

const links: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean; alerts?: boolean; wide?: boolean }> = [
  { href: "/nurse", label: copy.nav.home, icon: House, exact: true },
  { href: "/nurse/queue", label: copy.nav.queue, icon: ListOrdered },
  { href: "/nurse/alerts", label: copy.nav.alerts, icon: BellRing, alerts: true },
  { href: "/nurse/patients", label: copy.nav.patients, icon: Users },
  // The design preview is a reviewer's link, so a phone keeps its row for the work.
  { href: "/design", label: copy.nav.design, icon: Palette, wide: true },
];

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openCount } = useAlerts();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={copy.appName} icon={Stethoscope} className="max-w-6xl" />
      <AlertBanner />
      <nav aria-label={copy.nav.label} className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-stretch px-1 sm:px-4">
          {links.map(({ href, label, icon: Icon, exact, alerts, wide }) => {
            const current = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? "page" : undefined}
                className={cx(tab, current ? tabCurrent : tabIdle, wide && "max-sm:hidden")}
              >
                <span className="relative">
                  <Icon aria-hidden className="size-6 shrink-0" />
                  {alerts && openCount > 0 && (
                    <span
                      role="img"
                      aria-label={copy.alerts.open(openCount)}
                      className="absolute -right-3 -top-2 grid min-w-5 place-items-center rounded-full bg-triage-red-strong px-1 text-xs font-bold leading-5 text-on-solid"
                    >
                      {openCount}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void logout()}
            disabled={leaving}
            className={cx(tab, tabIdle, "sm:ml-auto disabled:cursor-not-allowed")}
          >
            <LogOut aria-hidden className="size-6 shrink-0" />
            <span className="max-w-full truncate">
              {leaving ? copy.console.loggingOut : copy.console.logout}
            </span>
          </button>
        </div>
      </nav>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6">{children}</div>
    </div>
  );
}

/**
 * Console frame: product strip, a banner while RED alerts wait, then one row
 * of navigation that is the same on a phone and a laptop. The current page is
 * marked by a thick underline and bold text as well as a tint. One live alert
 * connection serves the banner, the badge and the inbox page.
 */
export function NurseShell({ children }: { children: React.ReactNode }) {
  return (
    <AlertFeedProvider>
      <Frame>{children}</Frame>
    </AlertFeedProvider>
  );
}
