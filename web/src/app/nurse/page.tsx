import Link from "next/link";
import { BellRing, ChevronRight, ListOrdered, UserPlus, Users } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { todayJakarta } from "@/lib/time";
import { ButtonLink, DateTile } from "@/components/ui";

// The date tile must show today, not the day the image was built.
export const dynamic = "force-dynamic";

const row =
  "flex min-h-16 items-center gap-3 rounded-control border-2 border-line-strong bg-surface px-4 py-3 transition-colors duration-150 hover:bg-primary-soft";

export default function NurseConsolePage() {
  const t = copy.console;
  return (
    <main className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <DateTile date={todayJakarta()} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.title}</h1>
          <p className="mt-1 text-base text-ink-muted">{t.subtitle}</p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <section className="flex flex-col gap-4">
          <Link href="/nurse/queue" className={row}>
            <ListOrdered aria-hidden className="size-7 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">{t.queueLink}</span>
              <span className="block text-base text-ink-muted">{t.queueBody}</span>
            </span>
            <ChevronRight aria-hidden className="size-6 shrink-0 text-ink-muted" />
          </Link>
          <Link href="/nurse/alerts" className={row}>
            <BellRing aria-hidden className="size-7 shrink-0 text-triage-red-ink" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">{t.alertsLink}</span>
              <span className="block text-base text-ink-muted">{t.alertsBody}</span>
            </span>
            <ChevronRight aria-hidden className="size-6 shrink-0 text-ink-muted" />
          </Link>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <ButtonLink block icon={UserPlus} href="/nurse/patients/new">
              {t.newPatientLink}
            </ButtonLink>
            <p className="text-base text-ink-muted">{t.newPatientBody}</p>
          </div>
          <Link href="/nurse/patients" className={row}>
            <Users aria-hidden className="size-7 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">{t.patientsLink}</span>
              <span className="block text-base text-ink-muted">{t.patientsBody}</span>
            </span>
            <ChevronRight aria-hidden className="size-6 shrink-0 text-ink-muted" />
          </Link>
          <ButtonLink block variant="secondary" size="md" href="/design#mockup">
            {t.designLink}
          </ButtonLink>
        </section>
      </div>
    </main>
  );
}
