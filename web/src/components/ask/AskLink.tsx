import { MessageCircleQuestion } from "lucide-react";
import { copy } from "@/copy/family.id";
import { ButtonLink, Card } from "@/components/ui";

/** The card on the check-in screen that opens the "Ada pertanyaan?" screen of the same link. */
export function AskLink({ token }: { token: string }) {
  const t = copy.ask;
  return (
    <section aria-labelledby="ask-link-heading">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ask-link-heading" className="text-lg font-semibold text-ink">
            {t.linkTitle}
          </h2>
          <p className="text-base text-ink-muted">{t.linkBody}</p>
        </div>
        <ButtonLink block variant="secondary" icon={MessageCircleQuestion} href={`/f/${token}/tanya`}>
          {t.title}
        </ButtonLink>
      </Card>
    </section>
  );
}
