import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Palette } from "lucide-react";
import { copy } from "@/copy/design.id";
import { contrastRatio } from "@/design/contrast";
import { colors, pairs, thresholds, typeScale, type ColorToken } from "@/design/tokens";
import { AppBar, StatusPill } from "@/components/ui";
import { ComponentStates } from "./ComponentStates";
import { screens } from "./screens";

// Staff-side review page with made-up data only. Not linked from any family screen.
export const metadata: Metadata = {
  title: copy.title,
  robots: { index: false, follow: false },
};

const sections = [
  { id: "warna", label: copy.toc.colors },
  { id: "huruf", label: copy.toc.type },
  { id: "komponen", label: copy.toc.components },
  { id: "mockup", label: copy.toc.mockups },
] as const;

const link =
  "inline-flex min-h-12 items-center gap-1 rounded-control px-3 text-base font-semibold text-primary underline decoration-2 underline-offset-4 hover:bg-primary-soft";

function SectionTitle({ id, title, intro }: { id: string; title: string; intro: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 id={id} className="scroll-mt-4 text-2xl font-bold text-ink sm:text-3xl">
        {title}
      </h2>
      <p className="max-w-[65ch] text-lg text-ink">{intro}</p>
    </div>
  );
}

function PairRow({ fg, bg, role, use }: (typeof pairs)[number]) {
  const ratio = contrastRatio(colors[fg], colors[bg]);
  const min = thresholds[role];
  const pass = ratio >= min;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div
        className="flex min-h-16 items-center rounded-control border border-line px-4 py-3 text-lg font-semibold"
        style={{ background: colors[bg], color: colors[fg] }}
      >
        {role === "ui" ? (
          <span className="h-8 w-full rounded-control border-[3px]" style={{ borderColor: colors[fg] }} />
        ) : (
          copy.colors.sample
        )}
      </div>
      <div className="min-w-0">
        <p className="text-base font-semibold text-ink">{use}</p>
        <p className="text-sm text-ink-muted">
          {copy.colors.on(fg, bg)} · {copy.colors.roles[role]}
        </p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xl font-bold tabular-nums text-ink">{copy.colors.ratio(ratio.toFixed(2))}</span>
        <span className="text-sm text-ink-muted">{copy.colors.min(min)}</span>
        <StatusPill tone={pass ? "ok" : "danger"}>{pass ? copy.colors.pass : copy.colors.fail}</StatusPill>
      </div>
    </li>
  );
}

export default function DesignPreviewPage() {
  const m = copy.mockups;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar title={copy.title} icon={Palette} className="max-w-6xl" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-6">
        <header className="flex flex-col gap-4">
          <Link href="/nurse" className={`${link} -ml-3 self-start`}>
            <ChevronLeft aria-hidden className="size-6 shrink-0" />
            {copy.back}
          </Link>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">{copy.title}</h1>
          <p className="max-w-[65ch] text-lg text-ink">{copy.intro}</p>
          <nav aria-label={copy.toc.label} className="-ml-3 flex flex-wrap gap-x-2 gap-y-1">
            {sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={link}>
                {s.label}
              </a>
            ))}
          </nav>
        </header>

        <section aria-labelledby="warna" className="flex flex-col gap-6">
          <SectionTitle id="warna" title={copy.colors.title} intro={copy.colors.intro} />
          <h3 className="text-xl font-bold text-ink">{copy.colors.pairsTitle}</h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pairs.map((p) => (
              <PairRow key={`${p.fg}-${p.bg}-${p.role}`} {...p} />
            ))}
          </ul>
          <h3 className="text-xl font-bold text-ink">{copy.colors.swatchesTitle}</h3>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(colors) as ColorToken[]).map((name) => (
              <li key={name} className="flex min-w-0 flex-col gap-2">
                <span
                  className="block h-16 rounded-control border border-line-strong"
                  style={{ background: colors[name] }}
                />
                <span className="text-sm font-semibold text-ink">{name}</span>
                <span className="text-sm tabular-nums text-ink-muted">{colors[name]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="huruf" className="flex flex-col gap-6">
          <SectionTitle id="huruf" title={copy.type.title} intro={copy.type.intro} />
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {typeScale.map((step) => (
              <li key={step.token} className="flex flex-col gap-1 py-4 md:flex-row md:items-baseline md:gap-6">
                <p className="shrink-0 text-sm text-ink-muted md:w-64">
                  <span className="font-semibold text-ink">{step.token}</span> · {copy.type.px(step.rem * 16)} ·{" "}
                  {step.use}
                </p>
                <p className={`${step.token} min-w-0 font-bold text-ink`}>{copy.type.sample}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1">
            <p className="text-4xl font-medium text-ink">{copy.type.lookalikes}</p>
            <p className="text-base text-ink-muted">{copy.type.lookalikesNote}</p>
          </div>
        </section>

        <section aria-labelledby="komponen" className="flex flex-col gap-6">
          <SectionTitle id="komponen" title={copy.components.title} intro={copy.components.intro} />
          <ComponentStates />
        </section>

        <section aria-labelledby="mockup" className="flex flex-col gap-8">
          <SectionTitle id="mockup" title={m.title} intro={m.intro} />
          <ul className="grid gap-x-8 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
            {screens.map((screen) => (
              <li key={screen.slug} className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-bold text-ink">{screen.title}</h3>
                    <StatusPill tone={screen.area === "family" ? "info" : "off"}>{m.area[screen.area]}</StatusPill>
                  </div>
                  <p className="text-base text-ink-muted">{screen.note}</p>
                </div>
                <div className="w-full max-w-[376px] overflow-hidden rounded-[2rem] border-8 border-ink bg-canvas shadow-raised">
                  <iframe
                    src={`/design/screens/${screen.slug}`}
                    title={m.frameTitle(screen.title)}
                    loading="lazy"
                    className="block h-[640px] w-full"
                  />
                </div>
                <a href={`/design/screens/${screen.slug}`} className={`${link} -ml-3 self-start`}>
                  <ExternalLink aria-hidden className="size-5 shrink-0" />
                  {m.openFull}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
