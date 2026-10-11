import { useId, type ComponentProps, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "./cx";

interface FieldText {
  label: ReactNode;
  /** Shown above the control so it is read before typing and not hidden by the keyboard. */
  hint?: ReactNode;
  /** Shown with an icon and announced. Also marks the control invalid. */
  error?: ReactNode;
}

/** The shared look of every text control. Exported for the rare bare input (a read-only link box). */
export const controlClasses =
  "min-h-14 w-full rounded-control border-2 border-line-strong bg-surface px-4 py-3 text-lg text-ink placeholder:text-ink-muted aria-invalid:border-triage-red-solid aria-invalid:bg-triage-red-bg disabled:cursor-not-allowed disabled:border-dashed disabled:bg-sunken disabled:text-ink-muted read-only:bg-sunken";

function useFieldIds(id: string | undefined) {
  const auto = useId();
  const base = id ?? auto;
  return { id: base, hintId: `${base}-hint`, errorId: `${base}-error` };
}

function describedBy(
  ids: ReturnType<typeof useFieldIds>,
  hint: ReactNode,
  error: ReactNode,
  extra?: string,
) {
  return cx(extra, hint ? ids.hintId : null, error ? ids.errorId : null) || undefined;
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-2 text-base font-semibold text-triage-red-ink"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-6 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Label, hint, control and error stacked. Use directly only for a custom control. */
export function Field({
  htmlFor,
  hintId,
  errorId,
  label,
  hint,
  error,
  children,
}: FieldText & { htmlFor: string; hintId?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-lg font-semibold text-ink">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-base text-ink-muted">
          {hint}
        </p>
      )}
      {children}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export type TextInputProps = FieldText & Omit<ComponentProps<"input">, "className">;

export function TextInput({ label, hint, error, id, ...rest }: TextInputProps) {
  const ids = useFieldIds(id);
  return (
    <Field htmlFor={ids.id} hintId={ids.hintId} errorId={ids.errorId} label={label} hint={hint} error={error}>
      <input
        {...rest}
        id={ids.id}
        aria-describedby={describedBy(ids, hint, error, rest["aria-describedby"])}
        aria-invalid={error ? true : rest["aria-invalid"]}
        className={controlClasses}
      />
    </Field>
  );
}

export type TextAreaProps = FieldText &
  Omit<ComponentProps<"textarea">, "className"> & {
    /** Row under the box: a character count, a microphone button. */
    after?: ReactNode;
  };

export function TextArea({ label, hint, error, id, after, rows = 3, ...rest }: TextAreaProps) {
  const ids = useFieldIds(id);
  return (
    <Field htmlFor={ids.id} hintId={ids.hintId} errorId={ids.errorId} label={label} hint={hint} error={error}>
      <textarea
        {...rest}
        rows={rows}
        id={ids.id}
        aria-describedby={describedBy(ids, hint, error, rest["aria-describedby"])}
        aria-invalid={error ? true : rest["aria-invalid"]}
        className={cx(controlClasses, "resize-y")}
      />
      {after}
    </Field>
  );
}

export type SelectProps = FieldText & Omit<ComponentProps<"select">, "className">;

export function Select({ label, hint, error, id, children, ...rest }: SelectProps) {
  const ids = useFieldIds(id);
  return (
    <Field htmlFor={ids.id} hintId={ids.hintId} errorId={ids.errorId} label={label} hint={hint} error={error}>
      <select
        {...rest}
        id={ids.id}
        aria-describedby={describedBy(ids, hint, error, rest["aria-describedby"])}
        aria-invalid={error ? true : rest["aria-invalid"]}
        className={controlClasses}
      >
        {children}
      </select>
    </Field>
  );
}
