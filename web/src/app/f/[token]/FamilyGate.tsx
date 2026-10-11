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
import { todayJakarta } from "@/lib/time";
import {
  Alert,
  BottomActionBar,
  Button,
  ButtonLink,
  Card,
  DateTile,
  StepIndicator,
} from "@/components/ui";

interface Session {
  consented: boolean;
  treatmentDay: number;
  puskesmasName: string;
  puskesmasPhone: string;
}

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error" }
  | { kind: "consent"; session: Session; saving: boolean; failed: boolean }
  | { kind: "declined"; session: Session }
  | { kind: "home"; session: Session };

const page = "flex flex-1 flex-col gap-6 py-6";
const h1 = "text-3xl font-bold text-ink";
const h2 = "text-2xl font-bold text-ink";
const body = "text-lg text-ink";

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

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

/**
 * Shown after consent until the daily check-in exists (S02). It must never be
 * a dead end: it says what is coming, that nothing is due today, and gives
 * one thing to do now.
 */
export function FamilyHome({ session, today }: { session: Session; today: string }) {
  const t = copy.home;
  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <header className="flex items-center gap-4">
        <DateTile date={today} />
        <div className="min-w-0">
          <h1 className={h1}>{t.greeting}</h1>
          <p className="text-lg font-semibold text-ink-muted">{t.dayLabel(session.treatmentDay)}</p>
        </div>
      </header>

      <section aria-labelledby="home-today" className="flex flex-col gap-3">
        <h2 id="home-today" className={h2}>
          {t.todayPrompt}
        </h2>
        <Alert tone="info" title={t.notReadyTitle}>
          {t.notReadyBody}
        </Alert>
      </section>

      <section aria-labelledby="home-next" className="flex flex-col gap-3">
        <h2 id="home-next" className={h2}>
          {t.nextTitle}
        </h2>
        <ol className="flex flex-col gap-3">
          {t.nextSteps.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-on-solid"
              >
                {i + 1}
              </span>
              <p className={`${body} min-w-0 pt-0.5`}>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="home-help" className="flex flex-col gap-2 pb-6">
        <h2 id="home-help" className={h2}>
          {t.helpTitle}
        </h2>
        <p className={body}>{t.helpBody}</p>
        <p className="text-lg font-bold text-ink">
          {copy.contact(session.puskesmasName, session.puskesmasPhone)}
        </p>
      </section>

      <BottomActionBar>
        <ButtonLink block icon={Phone} href={telHref(session.puskesmasPhone)}>
          {copy.call}
        </ButtonLink>
      </BottomActionBar>
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
      setView(
        session.consented
          ? { kind: "home", session }
          : { kind: "consent", session, saving: false, failed: false },
      );
    } catch {
      setView({ kind: "error" });
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
      return <FamilyHome session={view.session} today={todayJakarta()} />;
  }
}
