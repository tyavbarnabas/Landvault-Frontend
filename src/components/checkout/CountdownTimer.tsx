// The plot hold's clock. The hook owns the one timer and calls onExpire once;
// the display is separate so the desktop summary and the phone summary bar
// can both show it without starting a second timer (and expiring twice).
// Screen readers hear it once, at the warning threshold, not every second.

import { useEffect, useRef, useState } from "react";
import { ClockIcon } from "../icons";
import { cx } from "../ui/cx";
import { TONE_SURFACE } from "../ui/tones";

const WARNING_SECONDS = 300;

function remaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

// Seconds left on the hold, or null with no hold. onExpire is read through a
// ref, so it always sees the page's latest state (a purchase recorded after
// the hold started, say).
export function useHoldCountdown(expiresAt: string | null, onExpire: () => void): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => (expiresAt ? remaining(expiresAt) : null));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    let expired = false;
    setSecondsLeft(remaining(expiresAt));
    const interval = setInterval(() => {
      const left = remaining(expiresAt);
      setSecondsLeft(left);
      if (left <= 0 && !expired) {
        expired = true;
        onExpireRef.current();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return secondsLeft;
}

function clock(secondsLeft: number): string {
  return `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
}

// `compact`: one line, for the phone summary bar.
export default function CountdownTimer({ secondsLeft, compact }: { secondsLeft: number; compact?: boolean }) {
  const warning = secondsLeft <= WARNING_SECONDS;
  const tone = warning ? "error" : "warning";
  if (compact) {
    return (
      <div className={cx("border rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-medium", TONE_SURFACE[tone])}>
        <ClockIcon size={14} />
        <span className="flex-1">{warning ? "Almost up — pay now to keep this plot" : "Held for you · pay before the hold ends"}</span>
        <span className="font-mono-data text-sm">{clock(secondsLeft)}</span>
      </div>
    );
  }
  return (
    <div className={cx("border rounded-lg px-3.5 py-3 flex items-center gap-3", TONE_SURFACE[tone])}>
      <ClockIcon size={16} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">Held for you</div>
        <div className="text-xs">{warning ? "Almost up — pay now or you'll need to reserve again." : "Pay before the hold ends. Then it returns to the pool."}</div>
      </div>
      <span className="font-mono-data text-lg">{clock(secondsLeft)}</span>
    </div>
  );
}

// Rendered once per page, beside whichever displays are showing.
export function HoldAnnouncement({ secondsLeft }: { secondsLeft: number | null }) {
  const warning = secondsLeft !== null && secondsLeft > 0 && secondsLeft <= WARNING_SECONDS;
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {warning ? "Warning: less than five minutes left on your plot hold." : ""}
    </span>
  );
}
