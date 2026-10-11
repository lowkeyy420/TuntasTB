import { LogIn } from "lucide-react";
import { copy } from "@/copy/family.id";
import { AppBar, ButtonLink, Card } from "@/components/ui";

/**
 * Neutral public landing: no mention of the illness. A family member who
 * lands here without a link is told how to find it; staff get one way in.
 */
export default function Home() {
  const t = copy.landing;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={copy.appName} className="max-w-md" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-ink">{t.title}</h1>
          <p className="text-lg text-ink">{t.body}</p>
        </div>

        <Card as="section" className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-ink">{t.howTitle}</h2>
          <ol className="flex flex-col gap-3">
            {t.howSteps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-on-solid"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 pt-0.5 text-lg text-ink">{step}</p>
              </li>
            ))}
          </ol>
          <p className="text-base text-ink-muted">{t.lostLink}</p>
        </Card>

        <section className="mt-auto flex flex-col gap-3 border-t border-line pt-5">
          <h2 className="text-lg font-semibold text-ink">{t.nurseTitle}</h2>
          <ButtonLink block variant="secondary" icon={LogIn} href="/login">
            {t.nurseLogin}
          </ButtonLink>
        </section>
      </main>
    </div>
  );
}
