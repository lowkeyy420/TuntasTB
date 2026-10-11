import { Check, Phone } from "lucide-react";
import { copy } from "@/copy/family.id";
import {
  Alert,
  BottomActionBar,
  Button,
  ButtonLink,
  Card,
  TriageBadge,
  type TriageLevel,
} from "@/components/ui";

export interface ReplyViewProps {
  level: TriageLevel;
  /** Generated and filtered, or the level's static text. */
  explanation: string;
  /** Exactly one action, fixed by the level. */
  action: string;
  /** "Sumber: ..." label; omitted when there is none (the offline RED text). */
  sourceLabel?: string | null;
  /** Always the last line of the reply. */
  contactLine: string;
  /** Standing warning, shown when no generated explanation backs the reply. */
  warning?: string | null;
  /** `tel:` link for the call button; without it the button does nothing (design mockups). */
  phoneHref?: string;
  /** Whether the server has the report. Omitted in the design mockups. */
  delivery?: "sent" | "queued" | "checking";
  onDone?: () => void;
}

/**
 * What the family sees after sending a check-in: the level as icon and word,
 * a short explanation, exactly one action, the source, and the Puskesmas
 * contact as the last line. RED shouts (solid badge) and its main button
 * becomes the phone call.
 */
export function ReplyView({
  level,
  explanation,
  action,
  sourceLabel,
  contactLine,
  warning,
  phoneHref,
  delivery,
  onDone,
}: ReplyViewProps) {
  const t = copy.reply;
  const red = level === "RED";
  const call = phoneHref ? (
    <ButtonLink block icon={Phone} href={phoneHref}>
      {copy.call}
    </ButtonLink>
  ) : (
    <Button block icon={Phone}>
      {copy.call}
    </Button>
  );

  return (
    <main className="flex flex-1 flex-col gap-5 pt-6">
      <h1 className="text-2xl font-bold text-ink">{t.title}</h1>
      <TriageBadge level={level} size="banner" solid={red} />
      {delivery === "queued" && (
        <Alert tone="warning" role="status" title={copy.checkin.queued}>
          {t.offline.bannerBody}
        </Alert>
      )}
      {delivery === "checking" && (
        <Alert tone="warning" role="status">
          {copy.checkin.checkingRed}
        </Alert>
      )}
      {delivery === "sent" && (
        <Alert tone="success" role="status">
          {copy.checkin.statusSent}
        </Alert>
      )}
      <article className="flex flex-col gap-4 pb-6">
        <p className="text-lg text-ink">{explanation}</p>
        <Card className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ink-muted">{t.actionTitle}</h2>
          <p className="text-xl font-bold text-ink">{action}</p>
        </Card>
        {warning && <Alert tone="warning">{warning}</Alert>}
        {sourceLabel && <p className="text-base text-ink-muted">{t.source(sourceLabel)}</p>}
        <p className="text-lg font-bold text-ink">{contactLine}</p>
      </article>
      <BottomActionBar>
        {red ? (
          <>
            {call}
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
