import Link from "next/link";
import { BellRing, ChevronRight, ListOrdered, UserPlus, Users, type LucideIcon } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { todayJakarta } from "@/lib/time";
import { ButtonLink, DateTile } from "@/components/ui";

// The date tile must show today, not the day the image was built.
export const dynamic = "force-dynamic";

function Soon({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: string }) {
  return (
    <li className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <Icon aria-hidden className="mt-1 size-7 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-ink">{title}</p>
        <p className="text-base text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

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
          <div className="flex flex-col gap-2">
            <ButtonLink block icon={UserPlus} href="/nurse/patients/new">
              {t.newPatientLink}
            </ButtonLink>
            <p className="text-base text-ink-muted">{t.newPatientBody}</p>
          </div>
          <Link
            href="/nurse/patients"
            className="flex min-h-16 items-center gap-3 rounded-control border-2 border-line-strong bg-surface px-4 py-3 transition-colors duration-150 hover:bg-primary-soft"
          >
            <Users aria-hidden className="size-7 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-ink">{t.patientsLink}</span>
              <span className="block text-base text-ink-muted">{t.patientsBody}</span>
            </span>
            <ChevronRight aria-hidden className="size-6 shrink-0 text-ink-muted" />
          </Link>
        </section>

        <section
          aria-labelledby="soon-title"
          className="flex flex-col gap-4 rounded-card border-2 border-dashed border-line-strong p-4 sm:p-5"
        >
          <h2 id="soon-title" className="text-xl font-bold text-ink">
            {t.soonTitle}
          </h2>
          <p className="text-base text-ink">{t.soonBody}</p>
          <ul className="divide-y divide-line">
            <Soon icon={ListOrdered} title={t.soonQueue}>
              {t.soonQueueBody}
            </Soon>
            <Soon icon={BellRing} title={t.soonAlerts}>
              {t.soonAlertsBody}
            </Soon>
          </ul>
          <ButtonLink block variant="secondary" size="md" href="/design#mockup">
            {t.designLink}
          </ButtonLink>
        </section>
      </div>
    </main>
  );
}
