// Dates as people read them: "16 Oct 2026". A date-only value ("2026-10-16",
// the backend's LocalDate) is a calendar day — shown as that day wherever the
// reader is, never shifted by their time zone. An instant is shown in the
// reader's own time zone.

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const LOCAL_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatDay(value: string): string {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return DAY.format(new Date(Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3])));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : LOCAL_DAY.format(d);
}
