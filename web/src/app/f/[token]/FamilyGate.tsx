"use client";

import { useCallback, useEffect, useState } from "react";
import { copy } from "@/copy/family.id";

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

const btn = "min-h-14 w-full rounded-lg px-4 text-xl font-medium";

/** Same page for unknown and revoked links: the server cannot tell them apart either. */
export function InvalidLink() {
  return (
    <main className="space-y-4 py-8">
      <h1 className="text-2xl font-semibold">{copy.invalidLink.title}</h1>
      <p className="text-xl">{copy.invalidLink.body}</p>
    </main>
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
    <main className="space-y-5">
      <h1 className="text-2xl font-semibold">{copy.appName}</h1>
      <h2 className="text-xl font-medium">{c.title}</h2>
      <div className="space-y-3 text-xl leading-relaxed">
        <p>{c.collected}</p>
        <p>{c.visibility}</p>
        <p>{c.automated}</p>
        <p>{c.notReplacement}</p>
        <p>{c.withdraw}</p>
      </div>
      {failed && (
        <p role="alert" className="text-lg text-red-700">
          {c.saveFailed}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={onAgree}
          className={`${btn} bg-teal-700 text-white disabled:opacity-60`}
        >
          {saving ? c.saving : c.agree}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDecline}
          className={`${btn} border border-black/30`}
        >
          {c.decline}
        </button>
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
      return <p className="py-8 text-xl">{copy.loading}</p>;
    case "invalid":
      return <InvalidLink />;
    case "error":
      return (
        <main className="space-y-4 py-8">
          <p className="text-xl">{copy.loadFailed}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`${btn} border border-black/30`}
          >
            {copy.retry}
          </button>
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
        <main className="space-y-4 py-8">
          <h1 className="text-2xl font-semibold">{copy.declined.title}</h1>
          <p className="text-xl">{copy.declined.body}</p>
          <p className="text-xl font-medium">
            {copy.declined.contact(view.session.puskesmasName, view.session.puskesmasPhone)}
          </p>
        </main>
      );
    case "home":
      return (
        <main className="space-y-4">
          <header>
            <h1 className="text-2xl font-semibold">{copy.home.title}</h1>
            <p className="text-lg text-black/60">{copy.home.greeting}</p>
          </header>
          <p className="text-xl">{copy.home.todayPrompt}</p>
          <p className="text-base text-black/60">{copy.home.hintNoPersonalData}</p>
        </main>
      );
  }
}
