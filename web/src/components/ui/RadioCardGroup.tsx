import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";

export interface RadioCardOption<V extends string> {
  value: V;
  label: string;
  icon: LucideIcon;
}

export interface RadioCardGroupProps<V extends string> {
  /** The question. Rendered as the group's legend. */
  legend: ReactNode;
  hint?: ReactNode;
  name: string;
  options: ReadonlyArray<RadioCardOption<V>>;
  /** Controlled value (`null` for none chosen). Leave undefined for an uncontrolled group. */
  value?: V | null;
  defaultValue?: V;
  onChange?: (value: V) => void;
  disabled?: boolean;
}

/**
 * The big one-of-few choice, e.g. "Sudah / Belum / Sebagian". Real radio
 * inputs under large tiles: side by side when the screen allows, stacked on
 * very narrow screens or at high zoom. Selected shows a filled dot and a
 * thicker edge as well as a tint.
 */
export function RadioCardGroup<V extends string>({
  legend,
  hint,
  name,
  options,
  value,
  defaultValue,
  onChange,
  disabled,
}: RadioCardGroupProps<V>) {
  const controlled = value !== undefined;
  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="text-xl font-bold text-ink">{legend}</legend>
      {hint && <p className="text-base text-ink-muted">{hint}</p>}
      <div className="grid grid-cols-1 gap-3 min-[21rem]:grid-cols-3">
        {options.map(({ value: v, label, icon: Icon }) => (
          <label
            key={v}
            className={cx(
              "choice flex min-h-16 items-center gap-3 rounded-control border-2 px-4 py-3 text-lg font-semibold transition-colors duration-150 min-[21rem]:min-h-32 min-[21rem]:flex-col min-[21rem]:justify-center min-[21rem]:gap-2 min-[21rem]:px-1 min-[21rem]:text-center",
              disabled
                ? "cursor-not-allowed border-dashed border-line-strong bg-sunken text-ink-muted"
                : "cursor-pointer border-line-strong bg-surface text-ink hover:bg-primary-soft has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-on-primary-soft has-[:checked]:shadow-[inset_0_0_0_2px_var(--color-primary)]",
            )}
          >
            <input
              type="radio"
              name={name}
              value={v}
              className="peer sr-only"
              {...(controlled
                ? { checked: value === v, readOnly: !onChange }
                : { defaultChecked: defaultValue === v })}
              onChange={onChange ? () => onChange(v) : undefined}
            />
            <Icon aria-hidden className="size-8 shrink-0" />
            <span className="min-w-0">{label}</span>
            <span
              aria-hidden
              className="ml-auto size-6 shrink-0 rounded-full border-2 border-line-strong bg-surface shadow-[inset_0_0_0_3px_var(--color-surface)] peer-checked:border-primary peer-checked:bg-primary min-[21rem]:ml-0"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
