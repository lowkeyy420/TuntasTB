"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { copy } from "@/copy/family.id";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { daysBetween, todayJakarta, toJakartaDate } from "@/lib/time";
import { loadSession, saveSession, type CachedSession } from "@/lib/offline/cache";
import { InvalidLink } from "../FamilyGate";
import { AskScreen } from "./AskScreen";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "no_consent" }
  | { kind: "ready"; session: CachedSession };

const page = "flex flex-1 flex-col gap-6 py-6";

/**
 * Opens the Q&A screen for a family link. It reads the session the same way
 * the home screen does: online from the server (and kept on the device),
 * offline from the copy kept at the last online visit, so the Puskesmas
 * number is on the screen even without signal.
 */
export function AskGate({ token }: { token: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const res = await fetch("/api/family/session", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 404) return setView({ kind: "invalid" });
      if (!res.ok) return setView({ kind: "error" });
      const session = (await res.json()) as CachedSession;
      void saveSession(token, session).catch(() => undefined);
      setView(session.consented ? { kind: "ready", session } : { kind: "no_consent" });
    } catch {
      const cached = await loadSession(token, (savedAt) =>
        daysBetween(toJakartaDate(new Date(savedAt)), todayJakarta()),
      ).catch(() => null);
      setView(cached?.consented ? { kind: "ready", session: cached } : { kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  switch (view.kind) {
    case "loading":
      return (
        <main className={page}>
          <p role="status" className="flex items-center gap-3 text-xl font-semibold text-ink">
            <LoaderCircle aria-hidden className="size-8 shrink-0 animate-spin text-primary" />
            {copy.loading}
          </p>
        </main>
      );
    case "invalid":
      return <InvalidLink />;
    case "no_consent":
      // The consent screen is on the home page of the same link.
      return (
        <main className={page}>
          <h1 className="text-3xl font-bold text-ink">{copy.consent.title}</h1>
          <p className="text-lg text-ink">{copy.consent.intro}</p>
          <ButtonLink block href={`/f/${token}`}>
            {copy.consent.title}
          </ButtonLink>
        </main>
      );
    case "error":
      return (
        <main className={page}>
          <h1 className="text-3xl font-bold text-ink">{copy.loadFailedTitle}</h1>
          <Alert tone="warning" role="alert">
            {copy.loadFailed}
          </Alert>
          <p className="text-lg text-ink">{copy.loadFailedHint}</p>
          <Button block icon={RefreshCw} onClick={() => void load()}>
            {copy.retry}
          </Button>
        </main>
      );
    case "ready":
      return (
        <AskScreen
          token={token}
          contact={{ name: view.session.puskesmasName, phone: view.session.puskesmasPhone }}
        />
      );
  }
}
