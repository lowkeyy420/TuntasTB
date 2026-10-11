import { Check, ChevronDown, Gauge, House, PackageCheck, Phone, type LucideIcon } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Button, Card, DateTile, StatusPill, TriageBadge, type StatusTone } from "@/components/ui";
import { mockQueue, mockToday, type QueueAction, type RiskBand } from "./data";

const bandTone: Record<RiskBand, StatusTone> = { high: "warn", medium: "info", low: "off" };

const actionIcon: Record<Exclude<QueueAction, "none">, LucideIcon> = {
  call: Phone,
  visit: House,
  earlyPickup: PackageCheck,
};

/**
 * Nurse morning queue: who to contact first and why. Each entry carries the
 * same fixed slots in the same order: rank, code and day, score and level,
 * one-line reason, one suggested action, and the points behind the score.
 */
export function QueueMock() {
  const t = copy.queue;
  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <DateTile date={mockToday} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t.title}</h1>
          <p className="mt-1 text-base text-ink-muted">{t.count(mockQueue.length)}</p>
        </div>
      </header>

      <ol className="grid gap-4 lg:grid-cols-2">
        {mockQueue.map((p, i) => (
          <Card as="li" key={p.code} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-lg font-bold text-on-solid"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-2xl font-bold tabular-nums text-ink">{p.code}</span>
              <span className="shrink-0 text-base font-semibold text-ink-muted">{t.day(p.day)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={bandTone[p.band]} icon={Gauge}>
                {t.score(p.score)} · {t.band[p.band]}
              </StatusPill>
              <TriageBadge level={p.level} label={copy.triageShort[p.level]} />
            </div>

            <p className="text-base text-ink">
              <span className="font-bold">{t.reasonLabel}: </span>
              {p.reason}
            </p>
            <p className="text-sm text-ink-muted">{t.lastCheckin(p.lastCheckin)}</p>

            <div className="mt-auto flex flex-col gap-2">
              <p className="text-sm font-semibold text-ink-muted">{t.suggestedLabel}</p>
              {p.action === "none" ? (
                <p className="flex min-h-12 items-center gap-2 text-base font-semibold text-ink">
                  <Check aria-hidden className="size-6 shrink-0" />
                  {t.actions.none}
                </p>
              ) : (
                <Button block size="md" variant="secondary" icon={actionIcon[p.action]}>
                  {t.actions[p.action]}
                </Button>
              )}
            </div>

            {p.factors.length > 0 && (
              <details className="group border-t border-line pt-1">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-control text-base font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  {t.factorsToggle}
                  <ChevronDown aria-hidden className="size-6 shrink-0 transition-transform duration-150 group-open:rotate-180" />
                </summary>
                <ul className="flex flex-col gap-2 pb-2">
                  {p.factors.map((f) => (
                    <li key={f.text} className="flex items-start justify-between gap-3 text-base text-ink">
                      <span className="min-w-0">{f.text}</span>
                      <span className="shrink-0 font-bold tabular-nums">{t.points(f.points)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </ol>
    </main>
  );
}
