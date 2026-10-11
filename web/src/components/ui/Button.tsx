import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";
export type ButtonSize = "lg" | "md";

interface Look {
  /** `primary` is the one main action of a screen: use it at most once. */
  variant?: ButtonVariant;
  /** `lg` is 56px high (family screens), `md` is 48px. Never smaller. */
  size?: ButtonSize;
  /** Full width. The default on a phone. */
  block?: boolean;
  /** Leading icon. Decorative: the label carries the meaning. */
  icon?: LucideIcon;
}

const base =
  "inline-flex min-w-12 items-center justify-center gap-2 rounded-control text-center font-semibold transition-colors duration-150";

const sizes: Record<ButtonSize, string> = {
  lg: "min-h-14 px-5 py-3 text-lg",
  md: "min-h-12 px-4 py-2 text-base",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-solid hover:bg-primary-strong active:bg-primary-strong",
  secondary:
    "border-2 border-primary bg-surface text-primary hover:bg-primary-soft active:bg-primary-soft",
  danger:
    "border-2 border-triage-red-solid bg-surface text-triage-red-ink hover:bg-triage-red-bg active:bg-triage-red-bg",
  quiet:
    "text-primary underline decoration-2 underline-offset-4 hover:bg-primary-soft active:bg-primary-soft",
};

// Not opacity: a faded button is unreadable in sunlight. Disabled keeps 7:1 text.
const disabledLook =
  "cursor-not-allowed border-2 border-dashed border-line-strong bg-sunken text-ink-muted";

export function buttonClasses({
  variant = "primary",
  size = "lg",
  block = false,
  disabled = false,
}: Look & { disabled?: boolean }): string {
  return cx(
    base,
    sizes[size],
    block && "w-full",
    disabled ? disabledLook : cx("cursor-pointer", variants[variant]),
  );
}

function Content({
  icon: Icon,
  loading,
  children,
}: {
  icon?: LucideIcon;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {loading ? (
        <LoaderCircle aria-hidden className="size-6 shrink-0 animate-spin" />
      ) : (
        Icon && <Icon aria-hidden className="size-6 shrink-0" />
      )}
      <span>{children}</span>
    </>
  );
}

export interface ButtonProps extends Look, Omit<ComponentProps<"button">, "className"> {
  /** Shows a spinner and blocks repeat presses. Pass the "saving" label as children. */
  loading?: boolean;
  className?: string;
}

export function Button({
  variant,
  size,
  block,
  icon,
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const off = disabled || loading;
  return (
    <button
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      className={cx(buttonClasses({ variant, size, block, disabled: off }), className)}
      {...rest}
    >
      <Content icon={icon} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

export interface ButtonLinkProps extends Look, Omit<ComponentProps<"a">, "className" | "href"> {
  href: string;
  className?: string;
}

/** A link that looks like a button. In-app paths use the router; `tel:` and others a plain anchor. */
export function ButtonLink({
  variant,
  size,
  block,
  icon,
  href,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const cls = cx(buttonClasses({ variant, size, block }), className);
  const content = <Content icon={icon}>{children}</Content>;
  return href.startsWith("/") ? (
    <Link href={href} className={cls} {...rest}>
      {content}
    </Link>
  ) : (
    <a href={href} className={cls} {...rest}>
      {content}
    </a>
  );
}
