// Status pill. Domain mappers (status → label + variant) stay in
// components/StatusBadge.tsx; this is only the look.

import { TONE_BADGE, type Tone } from "./tones";

export type BadgeVariant = Tone;

export default function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${TONE_BADGE[variant]}`}>
      {label}
    </span>
  );
}
