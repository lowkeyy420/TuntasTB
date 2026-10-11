import { Check, Phone } from "lucide-react";
import { copy } from "@/copy/family.id";
import { BottomActionBar, Button, Card, TriageBadge, type TriageLevel } from "@/components/ui";
import { mockPuskesmas } from "./data";

/**
 * What the family sees after sending a check-in: the level as icon and word,
 * a short explanation, exactly one action, the source, and the Puskesmas
 * contact as the last line. RED shouts (solid badge) and its main button
 * becomes the phone call.
 */
export function ReplyView({ level, onDone }: { level: TriageLevel; onDone?: () => void }) {
  const t = copy.reply;
  const red = level === "RED";
  return (
    <main className="flex flex-1 flex-col gap-5 pt-6">
      <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      <TriageBadge level={level} size="banner" solid={red} />
      <article className="flex flex-col gap-4 pb-6">
        <p className="text-lg text-ink">{t[level].explanation}</p>
        <Card className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ink-muted">{t.actionTitle}</h2>
          <p className="text-xl font-bold text-ink">{t[level].action}</p>
        </Card>
        <p className="text-base text-ink-muted">{t.source(t.sampleSource)}</p>
        <p className="text-lg font-bold text-ink">
          {copy.contact(mockPuskesmas.name, mockPuskesmas.phone)}
        </p>
      </article>
      <BottomActionBar>
        {red ? (
          <>
            <Button block icon={Phone}>
              {copy.call}
            </Button>
            <Button block variant="secondary" onClick={onDone}>
              {t.done}
            </Button>
          </>
        ) : (
          <Button block icon={Check} onClick={onDone}>
            {t.done}
          </Button>
        )}
      </BottomActionBar>
    </main>
  );
}
