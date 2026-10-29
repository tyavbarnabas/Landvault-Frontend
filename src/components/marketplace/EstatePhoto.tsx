// The frame round an estate photo (or its placeholder), from the Figma
// "Photo treatments": unchanged by day; at night the photo is dimmed like
// moonlight and a warm lamp is lit in one corner (index.css, .estate-photo).
// `index` alternates the corner and staggers the lamps when Night comes on.

import { cx } from "../ui/cx";

interface EstatePhotoProps {
  index?: number;
  className?: string;
  children: React.ReactNode;
}

export default function EstatePhoto({ index = 0, className, children }: EstatePhotoProps) {
  return (
    <div
      className={cx("estate-photo", index % 2 === 1 && "lamp-right", className)}
      style={{ "--lamp-i": index % 12 } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
