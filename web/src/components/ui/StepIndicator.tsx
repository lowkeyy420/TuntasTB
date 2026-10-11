import { cx } from "./cx";

/**
 * Where the user is in a short sequence. Done and current steps are filled,
 * later steps are hollow, and the label says it in words ("Langkah 1 dari 2").
 */
export function StepIndicator({
  label,
  steps,
  current,
}: {
  /** The spoken and visible summary, from a copy file. */
  label: string;
  steps: ReadonlyArray<string>;
  /** Zero-based index of the current step. */
  current: number;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-2">
      <p className="text-base font-semibold text-ink-muted">{label}</p>
      <ol className="flex gap-2">
        {steps.map((step, i) => (
          <li key={step} aria-current={i === current ? "step" : undefined} className="min-w-0 flex-1">
            <span
              aria-hidden
              className={cx(
                "block h-2.5 rounded-full border-2",
                i <= current ? "border-primary bg-primary" : "border-line-strong bg-surface",
              )}
            />
            <span
              className={cx("mt-1 block text-base", i === current ? "font-bold text-ink" : "text-ink-muted")}
            >
              {i + 1}. {step}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
