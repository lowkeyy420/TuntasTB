"use client";

import { MessageCircleQuestion, Phone, RefreshCw, Send } from "lucide-react";
import { copy } from "@/copy/family.id";
import { Alert, BottomActionBar, Button, ButtonLink, Card, TextArea } from "@/components/ui";
import { QUESTION_MAX } from "@/lib/ask/schema";

export interface AskContact {
  name: string;
  phone: string;
}

export interface AskCitation {
  id: string;
  label: string;
}

/** What the screen shows after a question: the server's three kinds, plus the cases with no usable reply. */
export type AskShown =
  | { kind: "answer"; text: string; citations: AskCitation[] }
  | { kind: "abstain" }
  | { kind: "urgent" }
  | { kind: "rate_limited" }
  | { kind: "failed" }
  | { kind: "offline" };

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** The question box. The screen asks for a question when it is empty or too short; nothing is sent then. */
export function AskForm({
  value,
  onChange,
  error,
  submitting,
  offline,
  contact,
  onSubmit,
  checkinHref,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  submitting: boolean;
  offline: boolean;
  contact: AskContact;
  onSubmit: () => void;
  checkinHref: string;
}) {
  const t = copy.ask;
  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="text-lg text-ink">{t.intro}</p>
      </div>

      {offline && (
        <Alert tone="warning" role="status" title={t.offline}>
          <p className="mt-1 font-bold">{copy.contact(contact.name, contact.phone)}</p>
        </Alert>
      )}

      <div className="pb-6">
        <TextArea
          label={t.label}
          hint={copy.checkin.noteHint}
          error={error}
          value={value}
          maxLength={QUESTION_MAX}
          rows={4}
          onChange={(e) => onChange(e.target.value)}
          after={<p className="text-base text-ink-muted">{copy.checkin.noteRemaining(QUESTION_MAX - value.length)}</p>}
        />
      </div>

      <BottomActionBar>
        <Button block icon={Send} loading={submitting} disabled={offline} onClick={onSubmit}>
          {submitting ? t.sending : t.submit}
        </Button>
        <ButtonLink block variant="quiet" size="md" href={checkinHref}>
          {t.backToCheckin}
        </ButtonLink>
      </BottomActionBar>
    </main>
  );
}

/**
 * The response to a question. Whatever the kind, the last line of the response
 * is the Puskesmas name and number.
 */
export function AskResult({
  question,
  shown,
  contact,
  onAgain,
  checkinHref,
}: {
  question: string;
  shown: AskShown;
  contact: AskContact;
  onAgain: () => void;
  checkinHref: string;
}) {
  const t = copy.ask;
  const contactLine = copy.contact(contact.name, contact.phone);
  const call = (
    <ButtonLink block icon={Phone} variant={shown.kind === "urgent" ? "primary" : "secondary"} href={telHref(contact.phone)}>
      {copy.call}
    </ButtonLink>
  );

  let body;
  switch (shown.kind) {
    case "answer":
      body = (
        <article className="flex flex-col gap-4 pb-6">
          <Card className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ink-muted">{t.answerTitle}</h2>
            <p className="text-lg text-ink">{shown.text}</p>
          </Card>
          <ul className="flex flex-col gap-1">
            {shown.citations.map((c) => (
              <li key={c.id} className="text-base text-ink-muted">
                {copy.reply.source(c.label)}
              </li>
            ))}
          </ul>
          <p className="text-lg font-bold text-ink">{contactLine}</p>
        </article>
      );
      break;
    case "urgent":
      body = (
        <div className="pb-6">
          <Alert tone="danger" role="alert" title={t.urgentTitle}>
            <p className="mt-1 text-lg">{t.urgent}</p>
            <p className="mt-2 font-bold">{contactLine}</p>
          </Alert>
        </div>
      );
      break;
    default: {
      const text =
        shown.kind === "abstain"
          ? t.abstain
          : shown.kind === "rate_limited"
            ? t.rateLimited
            : shown.kind === "offline"
              ? t.offline
              : t.failed;
      body = (
        <div className="pb-6">
          <Alert tone={shown.kind === "abstain" ? "info" : "warning"} role="status" title={text}>
            <p className="mt-1 font-bold">{contactLine}</p>
          </Alert>
        </div>
      );
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pt-6">
      <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      {question && <p className="rounded-control bg-sunken p-4 text-lg font-semibold text-ink">{question}</p>}
      {body}
      <BottomActionBar>
        {shown.kind === "urgent" ? (
          <>
            {call}
            <ButtonLink block variant="secondary" icon={Send} href={checkinHref}>
              {t.sendCheckin}
            </ButtonLink>
          </>
        ) : shown.kind === "answer" ? (
          <Button block icon={RefreshCw} onClick={onAgain}>
            {t.again}
          </Button>
        ) : (
          <>
            {call}
            <Button block variant="secondary" icon={shown.kind === "abstain" ? RefreshCw : MessageCircleQuestion} onClick={onAgain}>
              {t.again}
            </Button>
          </>
        )}
      </BottomActionBar>
    </main>
  );
}
