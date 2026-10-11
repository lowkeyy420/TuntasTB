"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  ClipboardList,
  Eye,
  HandHeart,
  LoaderCircle,
  LogOut,
  Phone,
  RefreshCw,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { copy } from "@/copy/family.id";
import { daysBetween, todayJakarta, toJakartaDate } from "@/lib/time";
import { loadSession, saveSession, type CachedSession } from "@/lib/offline/cache";
import { Alert, Button, ButtonLink, Card, StepIndicator } from "@/components/ui";
import { CheckinScreen, telHref } from "./CheckinScreen";
import { FamilyPickup } from "./FamilyPickup";

type Session = CachedSession;

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "consent"; session: Session; saving: boolean; failed: boolean }
  | { kind: "declined"; session: Session }
  | { kind: "home"; session: Session };

const page = "flex flex-1 flex-col gap-6 py-6";
const h1 = "text-3xl font-bold text-ink";
const body = "text-lg text-ink";

/** Same page for unknown and revoked links: the server cannot tell them apart either. */
export function InvalidLink() {
  return (
    <main className={page}>
      <span className="grid size-16 place-items-center rounded-full bg-triage-yellow-bg text-triage-yellow-ink">
        <Unlink aria-hidden className="size-8" />
      </span>
      <h1 className={h1}>{copy.invalidLink.title}</h1>
      <p className={body}>{copy.invalidLink.body}</p>
      <p className={body}>{copy.invalidLink.next}</p>
    </main>
  );
}

function Statement({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-on-primary-soft">
        <Icon aria-hidden className="size-6" />
      </span>
      <p className={`${body} min-w-0`}>{children}</p>
    </li>
  );
}

export function ConsentScreen({
  saving,
  failed,
  onAgree,
  onDecline,
}: {
  saving: boolean;
  failed: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  const c = copy.consent;
  return (
    <main className={page}>
      <StepIndicator label={c.stepLabel} steps={c.steps} current={0} />
      <div className="flex flex-col gap-2">
        <h1 className={h1}>{c.title}</h1>
        <p className={body}>{c.intro}</p>
      </div>
      <Card>
        <ul className="divide-y divide-line">
          <Statement icon={ClipboardList}>{c.collected}</Statement>
          <Statement icon={Eye}>{c.visibility}</Statement>
          <Statement icon={Bot}>{c.automated}</Statement>
          <Statement icon={HandHeart}>{c.notReplacement}</Statement>
          <Statement icon={LogOut}>{c.withdraw}</Statement>
        </ul>
      </Card>
      {failed && (
        <Alert tone="danger" role="alert">
          {c.saveFailed}
        </Alert>
      )}
      <div className="flex flex-col gap-3">
        <Button block loading={saving} onClick={onAgree}>
          {saving ? c.saving : c.agree}
        </Button>
        <Button block variant="secondary" disabled={saving} onClick={onDecline}>
          {c.decline}
        </Button>
      </div>
    </main>
  );
}

export function FamilyGate({ token }: { token: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const auth = { authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const res = await fetch("/api/family/session", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 404) return setView({ kind: "invalid" });
      if (!res.ok) return setView({ kind: "error" });
      const session = (await res.json()) as Session;
      // Keep the last session on the device so the screen opens without signal.
      void saveSession(token, session).catch(() => undefined);
      setView(
        session.consented
          ? { kind: "home", session }
          : { kind: "consent", session, saving: false, failed: false },
      );
    } catch {
      // No connection: a link that was opened and agreed to before still works.
      const cached = await loadSession(token, (savedAt) =>
        daysBetween(toJakartaDate(new Date(savedAt)), todayJakarta()),
      ).catch(() => null);
      setView(cached?.consented ? { kind: "home", session: cached } : { kind: "error" });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function agree(session: Session) {
    setView({ kind: "consent", session, saving: true, failed: false });
    try {
      const res = await fetch("/api/family/consent", { method: "POST", headers: auth });
      if (res.status === 404) return setView({ kind: "invalid" });
      if (!res.ok) throw new Error("consent");
      void saveSession(token, { ...session, consented: true }).catch(() => undefined);
      setView({ kind: "home", session });
    } catch {
      setView({ kind: "consent", session, saving: false, failed: true });
    }
  }

  // Declining makes no request at all: nothing is recorded about the patient.
  function decline(session: Session) {
    setView({ kind: "declined", session });
  }

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
    case "error":
      return (
        <main className={page}>
          <h1 className={h1}>{copy.loadFailedTitle}</h1>
          <Alert tone="warning" role="alert">
            {copy.loadFailed}
          </Alert>
          <p className={body}>{copy.loadFailedHint}</p>
          <Button block icon={RefreshCw} onClick={() => void load()}>
            {copy.retry}
          </Button>
        </main>
      );
    case "consent":
      return (
        <ConsentScreen
          saving={view.saving}
          failed={view.failed}
          onAgree={() => void agree(view.session)}
          onDecline={() => decline(view.session)}
        />
      );
    case "declined":
      return (
        <main className={page}>
          <h1 className={h1}>{copy.declined.title}</h1>
          <p className={body}>{copy.declined.body}</p>
          <p className="text-lg font-bold text-ink">
            {copy.declined.contact(view.session.puskesmasName, view.session.puskesmasPhone)}
          </p>
          <div className="flex flex-col gap-3">
            <ButtonLink block icon={Phone} href={telHref(view.session.puskesmasPhone)}>
              {copy.call}
            </ButtonLink>
            <Button
              block
              variant="secondary"
              onClick={() =>
                setView({ kind: "consent", session: view.session, saving: false, failed: false })
              }
            >
              {copy.declined.reopen}
            </Button>
          </div>
        </main>
      );
    case "home":
      return (
        <CheckinScreen
          token={token}
          session={view.session}
          today={todayJakarta()}
          pickup={
            <FamilyPickup
              token={token}
              puskesmasName={view.session.puskesmasName}
              puskesmasPhone={view.session.puskesmasPhone}
              today={todayJakarta()}
            />
          }
        />
      );
  }
}
