import type { ComponentProps, ReactNode } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export interface ToggleChipProps extends Omit<ComponentProps<"input">, "type" | "className"> {
  /** Every chip has a picture and a word: neither stands alone. */
  icon: LucideIcon;
  label: string;
  /** Forces a state on the design preview page. */
  preview?: "hover" | "focus";
}

/**
 * A symptom chip. It is a real checkbox, so it works with the keyboard, with
 * screen readers and inside a form. Selected shows a tick as well as colour.
 */
export function ToggleChip({ icon: Icon, label, disabled, preview, ...rest }: ToggleChipProps) {
  return (
    <label
      data-preview={preview}
      className={cx(
        "choice inline-flex min-h-12 items-center gap-2 rounded-full border-2 px-4 py-2 text-base font-medium transition-colors duration-150",
        disabled
          ? "cursor-not-allowed border-dashed border-line-strong bg-sunken text-ink-muted"
          : "cursor-pointer border-line-strong bg-surface text-ink hover:bg-primary-soft has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-semibold has-[:checked]:text-on-primary-soft",
      )}
    >
      <input type="checkbox" disabled={disabled} className="peer sr-only" {...rest} />
      <Icon aria-hidden className="size-6 shrink-0 peer-checked:hidden" />
      <Check aria-hidden strokeWidth={3} className="hidden size-6 shrink-0 peer-checked:block" />
      <span>{label}</span>
    </label>
  );
}

/** A set of chips with a question above them. Wraps with 12px between chips. */
export function ChipGroup({
  legend,
  hint,
  children,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="text-lg font-semibold text-ink">{legend}</legend>
      {hint && <p className="text-base text-ink-muted">{hint}</p>}
      <div className="flex flex-wrap gap-3">{children}</div>
    </fieldset>
  );
}

/** A read-only tag with an icon and a word, for example a reported symptom. */
export function Chip({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-base font-medium text-ink">
      {Icon && <Icon aria-hidden className="size-5 shrink-0" />}
      {children}
    </span>
  );
}
