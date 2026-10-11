"use client";

import { useEffect, useState } from "react";
import { copy } from "@/copy/family.id";
import { AskForm, AskResult, type AskContact, type AskShown } from "@/components/ask/AskView";
import { QUESTION_MIN } from "@/lib/ask/schema";

interface AskResponseBody {
  kind: "answer" | "abstain" | "urgent";
  text: string;
  citations: { id: string; label: string }[];
}

/** Tracks the browser's connection state. */
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

type Screen = { step: "form" } | { step: "result"; question: string; shown: AskShown };

/**
 * "Ada pertanyaan?": one question at a time, answered on the same screen.
 * Nothing is kept: the question lives in this component's state until
 * "Tanya lagi" and is never written to the device.
 *
 * A question of fewer than 3 characters is not sent. With no signal nothing
 * is sent either; the screen shows the Puskesmas number from the session that
 * was cached the last time the link was opened online.
 */
export function AskScreen({ token, contact }: { token: string; contact: AskContact }) {
  const online = useOnline();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [screen, setScreen] = useState<Screen>({ step: "form" });
  const checkinHref = `/f/${token}`;

  async function send() {
    const text = question.trim();
    if (text.length < QUESTION_MIN) return setError(copy.ask.empty);
    setError(undefined);
    if (!navigator.onLine) return setScreen({ step: "result", question: text, shown: { kind: "offline" } });
    setSubmitting(true);
    let shown: AskShown;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
        cache: "no-store",
      });
      if (res.status === 429) shown = { kind: "rate_limited" };
      else if (!res.ok) shown = { kind: "failed" };
      else {
        const body = (await res.json()) as AskResponseBody;
        shown =
          body.kind === "answer"
            ? { kind: "answer", text: body.text, citations: body.citations }
            : { kind: body.kind === "urgent" ? "urgent" : "abstain" };
      }
    } catch {
      shown = { kind: "offline" };
    }
    setSubmitting(false);
    setScreen({ step: "result", question: text, shown });
  }

  function again() {
    setQuestion("");
    setError(undefined);
    setScreen({ step: "form" });
  }

  if (screen.step === "result") {
    return (
      <AskResult
        question={screen.question}
        shown={screen.shown}
        contact={contact}
        onAgain={again}
        checkinHref={checkinHref}
      />
    );
  }
  return (
    <AskForm
      value={question}
      onChange={(v) => {
        setQuestion(v);
        setError(undefined);
      }}
      error={error}
      submitting={submitting}
      offline={!online}
      contact={contact}
      onSubmit={() => void send()}
      checkinHref={checkinHref}
    />
  );
}
