// The estate detail page's gallery: the developer's own photos, cover first,
// then in their order. Each caption is the alt text and is shown under the
// photo; without one the estate's name stands in. An estate listed before
// photos were required may have none: it gets the placeholder, never a stock
// photo presented as the estate.

import { useState } from "react";
import type { ListingPhoto } from "../../services/marketplaceService";

export default function EstateGallery({ photos, estateName, children }: {
  photos: ListingPhoto[];
  estateName: string;
  // Laid over the main image's corner (the wishlist button).
  children?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)];
  const many = photos.length > 1;
  const go = (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <figure className="mb-6">
      <div className="relative aspect-[4/3] sm:aspect-[21/9] bg-[var(--muted)] rounded-xl overflow-hidden">
        {current ? (
          <img src={current.url} alt={current.caption ?? estateName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--muted-foreground)]">
            <MapIcon />
            <span className="text-xs">No photos of this estate yet</span>
          </div>
        )}
        {many && (
          <>
            <GalleryButton side="left" label="Previous photo" onClick={() => go(-1)} />
            <GalleryButton side="right" label="Next photo" onClick={() => go(1)} />
            <span className="absolute bottom-3 right-3 text-xs font-mono-data px-2 py-0.5 rounded-full bg-black/55 text-white" aria-live="polite">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
        {children && <div className="absolute top-4 right-4">{children}</div>}
      </div>

      {current?.caption && <figcaption className="text-sm text-[var(--muted-foreground)] mt-2">{current.caption}</figcaption>}

      {many && (
        <ul className="flex gap-2 mt-3 overflow-x-auto pb-1" aria-label="Photos">
          {photos.map((photo, i) => (
            <li key={photo.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}${photo.caption ? `: ${photo.caption}` : ""}`}
                aria-current={i === index ? "true" : undefined}
                className={`block w-20 aspect-[4/3] rounded-md overflow-hidden border-2 ${i === index ? "border-[var(--accent)]" : "border-transparent opacity-75 hover:opacity-100"}`}
              >
                {/* Decorative: the button's label names it. */}
                <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function GalleryButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"} w-9 h-9 flex items-center justify-center rounded-full bg-[var(--card)]/90 text-[var(--foreground)] shadow-sm hover:bg-[var(--card)]`}
    >
      <ChevronIcon direction={side} />
    </button>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true" className="opacity-40">
      <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
      <path d="M9 3v16M15 5v16" />
    </svg>
  );
}
