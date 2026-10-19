// The one button. Replaces the primary / outline / red / text-link class
// strings that were copy-pasted across pages, each with its own disabled
// opacity and padding.

import { Link, type LinkProps } from "react-router-dom";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "danger" | "link" | "linkMuted" | "linkDanger";
export type ButtonSize = "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90",
  secondary: "border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--muted)]",
  danger: "bg-[var(--error)] text-[var(--error-foreground)] font-semibold hover:opacity-90",
  link: "text-[var(--accent)] hover:underline",
  linkMuted: "text-[var(--muted-foreground)] hover:underline",
  linkDanger: "text-[var(--error-text)] font-semibold hover:underline",
};

const SIZE: Record<ButtonSize, string> = { md: "px-4 py-2", lg: "px-4 py-2.5" };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  // Ignored by the link variants, which have no box.
  size?: ButtonSize;
  fullWidth?: boolean;
}

function buttonClass(variant: ButtonVariant, size: ButtonSize, fullWidth: boolean | undefined, className?: string): string {
  const boxed = !variant.startsWith("link");
  return cx(
    "text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed",
    boxed && "inline-flex items-center justify-center rounded-md",
    boxed && SIZE[size],
    VARIANT[variant],
    fullWidth && "w-full",
    className,
  );
}

export default function Button({ variant = "primary", size = "md", fullWidth, type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, fullWidth, className)} {...rest} />;
}

// A router link that looks like a button: for a call to action that goes
// somewhere ("Pay now" on the dashboard) rather than doing something here.
export function LinkButton({ variant = "primary", size = "md", fullWidth, className, ...rest }: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  return <Link className={buttonClass(variant, size, fullWidth, className)} {...rest} />;
}
