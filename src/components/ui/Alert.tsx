// A tinted, bordered message. Without a title it's a compact inline note
// ("The account name doesn't match the buyer."); with one it's a status panel
// ("Payment received — the developer is verifying it" + explanation).

import { cx } from "./cx";
import { TONE_SURFACE, type Tone } from "./tones";

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  tone?: Tone;
  title?: React.ReactNode;
  as?: "div" | "section";
}

export default function Alert({ tone = "warning", title, as: Tag = "div", className, children, ...rest }: AlertProps) {
  return (
    <Tag className={cx("border text-sm", title ? "rounded-xl p-4" : "rounded-lg p-3", TONE_SURFACE[tone], className)} {...rest}>
      {title && <div className="font-semibold mb-1">{title}</div>}
      {children}
    </Tag>
  );
}
