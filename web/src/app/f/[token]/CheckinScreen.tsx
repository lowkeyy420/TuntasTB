"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { copy } from "@/copy/family.id";
import { Alert } from "@/components/ui";
import { CheckinForm, useCheckinDraft, type SymptomOption } from "@/components/checkin/CheckinForm";
import { ReplyView } from "@/components/checkin/ReplyView";
import { symptomIcon } from "@/components/checkin/symptomIcons";
import { useDictation } from "@/lib/voice/useDictation";
import { loadRulesForScreen } from "@/lib/offline/rules";
import { countQueued, getEntry } from "@/lib/offline/outbox";
import { displayFromServer, type DisplayReply } from "@/lib/offline/provisional";
import { onOutboxChange, submit } from "@/lib/offline/sync";
import { useOutboxFlush } from "@/lib/offline/useOutboxFlush";
import type { Rules } from "@/lib/triage/types";

export interface CheckinSession {
  treatmentDay: number;
  puskesmasName: string;
  puskesmasPhone: string;
}

type Screen =
  | { kind: "form" }
  /** `clientId` is set while the report is still on the device, so the screen can follow it. */
  | { kind: "reply"; reply: DisplayReply; delivery: "sent" | "queued"; clientId: string | null };

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Tracks the browser's connection state for the offline notice. */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * The real daily check-in: the shared form (chips come from the triage table),
 * the shared reply view, voice dictation into the note, and the offline queue.
 * A check-in is written to the device first and sent second, so it is never
 * lost; while unsent, the family sees a provisional reply computed on the
 * device from the same rule files, replaced by the server's reply after sync.
 */
export function CheckinScreen({
  token,
  session,
  today,
  pickup,
}: {
  token: string;
  session: CheckinSession;
  /** Today's date in Jakarta, `YYYY-MM-DD`. */
  today: string;
  /** The next-pickup card, shown above the dose question. */
  pickup?: ReactNode;
}) {
  const t = copy.checkin;
  const draft = useCheckinDraft();
  const dictation = useDictation(draft.note, draft.setNote);
  const online = useOnline();
  const [rules, setRules] = useState<Rules | null>(null);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "form" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);

  useOutboxFlush();

  useEffect(() => {
    let cancelled = false;
    void loadRulesForScreen(token).then((loaded) => {
      if (cancelled) return;
      setRules(loaded);
      setRulesLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // How many reports are still on the device, and, while the reply on screen is
  // provisional, the moment the server's reply is available.
  const clientId = screen.kind === "reply" ? screen.clientId : null;
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const count = await countQueued().catch(() => 0);
      if (!cancelled) setQueued(count);
      if (!clientId) return;
      const entry = await getEntry(clientId).catch(() => undefined);
      if (!cancelled && entry?.status === "sent" && entry.reply) {
        setScreen({ kind: "reply", reply: displayFromServer(entry.reply), delivery: "sent", clientId: null });
      }
    };
    void refresh();
    const off = onOutboxChange(() => void refresh());
    return () => {
      cancelled = true;
      off();
    };
  }, [clientId]);

  const symptoms: SymptomOption[] = useMemo(
    () =>
      (rules?.table.symptoms ?? []).map((s) => ({
        code: s.code,
        label: s.label_id,
        icon: symptomIcon(s.code),
      })),
    [rules],
  );

  async function send() {
    if (!draft.dose || !rules) return;
    setSubmitting(true);
    setError(null);
    const outcome = await submit({
      token,
      doseStatus: draft.dose,
      chips: [...draft.chosen],
      text: draft.note.trim(),
      rules,
      contact: { name: session.puskesmasName, phone: session.puskesmasPhone },
    });
    setSubmitting(false);
    switch (outcome.kind) {
      case "sent":
        setScreen({ kind: "reply", reply: displayFromServer(outcome.reply), delivery: "sent", clientId: null });
        break;
      case "queued":
        setScreen({ kind: "reply", reply: outcome.provisional, delivery: "queued", clientId: outcome.clientId });
        break;
      case "rejected":
        setError(outcome.reason === "too_many" ? t.tooMany : t.sendFailed);
        break;
      case "failed":
        setError(t.sendFailed);
        break;
    }
  }

  function done() {
    draft.reset();
    setError(null);
    setScreen({ kind: "form" });
  }

  if (screen.kind === "reply") {
    return (
      <ReplyView
        level={screen.reply.level}
        explanation={screen.reply.explanation}
        action={screen.reply.action}
        sourceLabel={screen.reply.sourceLabel}
        contactLine={screen.reply.contactLine}
        warning={screen.reply.warning}
        phoneHref={telHref(session.puskesmasPhone)}
        delivery={screen.delivery}
        onDone={done}
      />
    );
  }

  const notice =
    !online || queued > 0 ? (
      <Alert tone="warning" role="status">
        {!online && <span className="block">{t.offlineNotice}</span>}
        {queued > 0 && <span className="block">{t.queuedCount(queued)}</span>}
      </Alert>
    ) : undefined;

  const symptomsStatus = !rulesLoaded ? (
    <p role="status" className="text-base text-ink-muted">
      {t.loadingSymptoms}
    </p>
  ) : rules ? undefined : (
    <Alert tone="warning" role="alert">
      {t.noRules}
    </Alert>
  );

  return (
    <CheckinForm
      today={today}
      treatmentDay={session.treatmentDay}
      symptoms={symptoms}
      draft={draft}
      dictation={dictation}
      onSubmit={() => void send()}
      submitting={submitting}
      error={error}
      notice={notice}
      symptomsStatus={symptomsStatus}
      pickup={pickup}
      blocked={!rules}
    />
  );
}
