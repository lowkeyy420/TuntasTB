import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/** Page title with an optional way back and an optional action beside it. */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
  as: Heading = "h1",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  action?: ReactNode;
  /** The page title is the h1. Only a specimen inside another page lowers it. */
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="-ml-2 inline-flex min-h-12 items-center gap-1 self-start rounded-control px-2 text-base font-semibold text-primary underline decoration-2 underline-offset-4 hover:bg-primary-soft"
        >
          <ChevronLeft aria-hidden className="size-6 shrink-0" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Heading className="text-2xl font-bold text-ink sm:text-3xl">{title}</Heading>
          {subtitle && <p className="mt-1 text-base text-ink-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
