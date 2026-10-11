"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createBeeper } from "@/lib/alerts/beep";
import { useAlertFeed, type AlertFeed } from "@/lib/alerts/useAlertFeed";

const FeedContext = createContext<AlertFeed | null>(null);

/**
 * One live alert connection for the whole nurse console. The banner, the nav
 * badge and the inbox page all read it, so a console never opens more than one
 * stream. A new RED alert also plays a short beep.
 */
export function AlertFeedProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const beeper = useMemo(() => createBeeper(), []);
  useEffect(() => beeper.arm(), [beeper]);

  const feed = useAlertFeed({
    onCreated: () => beeper.beep(),
    onUnauthorized: () => router.push("/login"),
  });
  return <FeedContext.Provider value={feed}>{children}</FeedContext.Provider>;
}

/** The console's alert feed; throws outside `AlertFeedProvider`. */
export function useAlerts(): AlertFeed {
  const feed = useContext(FeedContext);
  if (!feed) throw new Error("useAlerts must be used inside AlertFeedProvider");
  return feed;
}
