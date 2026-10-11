"use client";

import { useState } from "react";
import { MessageCircleQuestion, Phone, RefreshCw } from "lucide-react";
import { copy } from "@/copy/family.id";
import { Alert, BottomActionBar, Button, Card, TextArea } from "@/components/ui";
import { mockPuskesmas } from "./data";

type Result = "answered" | "abstain";

const QUESTION_MAX = 300;

/**
 * "Tanya": a question in the user's own words gets either an answer with its
 * source or an honest "ask the nurse". Both end with the Puskesmas contact.
 * Mockup only: the first example is answered, anything else abstains.
 */
export function AskMock() {
  const t = copy.ask;
  const [question, setQuestion] = useState("");
  const [error, setError] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const contact = copy.contact(mockPuskesmas.name, mockPuskesmas.phone);

  function submit() {
    if (question.trim().length < 3) return setError(true);
    setError(false);
    setResult(/kencing/i.test(question) ? "answered" : "abstain");
  }

  function again() {
    setQuestion("");
    setResult(null);
  }

  if (result) {
    return (
      <main className="flex flex-1 flex-col gap-5 pt-6">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="rounded-control bg-sunken p-4 text-lg font-semibold text-ink">{question}</p>
        {result === "answered" ? (
          <article className="flex flex-col gap-4 pb-6">
            <Card className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-ink-muted">{t.answerTitle}</h2>
              <p className="text-lg text-ink">{t.sampleAnswer}</p>
            </Card>
            <p className="text-base text-ink-muted">{copy.reply.source(copy.reply.sampleSource)}</p>
            <p className="text-lg font-bold text-ink">{contact}</p>
          </article>
        ) : (
          <div className="pb-6">
            <Alert tone="info" role="status" title={t.abstain}>
              <p className="mt-1 font-bold">{contact}</p>
            </Alert>
          </div>
        )}
        <BottomActionBar>
          {result === "abstain" ? (
            <>
              <Button block icon={Phone}>
                {copy.call}
              </Button>
              <Button block variant="secondary" icon={RefreshCw} onClick={again}>
                {t.again}
              </Button>
            </>
          ) : (
            <Button block icon={RefreshCw} onClick={again}>
              {t.again}
            </Button>
          )}
        </BottomActionBar>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
        <p className="text-lg text-ink">{t.intro}</p>
      </div>

      <TextArea
        label={t.label}
        hint={copy.checkin.noteHint}
        error={error ? t.empty : undefined}
        value={question}
        maxLength={QUESTION_MAX}
        onChange={(e) => {
          setQuestion(e.target.value);
          setError(false);
        }}
      />

      <section aria-labelledby="ask-examples" className="flex flex-col gap-3 pb-6">
        <h2 id="ask-examples" className="text-lg font-semibold text-ink">
          {t.examplesTitle}
        </h2>
        {[t.exampleAnswered, t.exampleAbstain].map((example) => (
          <Button
            key={example}
            block
            variant="secondary"
            size="md"
            onClick={() => {
              setQuestion(example);
              setError(false);
            }}
          >
            {example}
          </Button>
        ))}
      </section>

      <BottomActionBar>
        <Button block icon={MessageCircleQuestion} onClick={submit}>
          {t.submit}
        </Button>
      </BottomActionBar>
    </main>
  );
}
