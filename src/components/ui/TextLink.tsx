// An in-app link styled as text: the gold accent link used for "View your
// purchase →", "Back to the marketplace" and the like.

import { Link, type LinkProps } from "react-router-dom";
import { cx } from "./cx";

export default function TextLink({ muted, className, ...rest }: LinkProps & { muted?: boolean }) {
  return (
    <Link
      className={cx(muted ? "text-[var(--muted-foreground)] hover:text-[var(--foreground)]" : "text-[var(--accent)] hover:underline", className)}
      {...rest}
    />
  );
}
