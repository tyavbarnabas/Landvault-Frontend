// Reusable countdown, extracted from the inline mins/secs logic that used to
// live only in the internal Checkout.tsx. Announces to screen readers at the
// warning threshold rather than continuously, per the accessibility
// requirement ("countdown announced to screen readers") without spamming
// live-region updates every second.

import { useEffect, useRef, useState } from "react";

interface CountdownTimerProps {
  expiresAt: string; // ISO
  onExpire: () => void;
  warningThresholdSeconds?: number;
  label?: string;
}

export default function CountdownTimer({ expiresAt, onExpire, warningThresholdSeconds = 300, label = "Plot held" }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const announcedWarning = useRef(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const isWarning = secondsLeft <= warningThresholdSeconds && secondsLeft > 0;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  if (!announcedWarning.current && isWarning) announcedWarning.current = true;

  return (
    <div className={`p-4 rounded-xl flex items-center gap-3 border ${isWarning ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <span className="text-xl" aria-hidden="true">⏱</span>
      <div className="flex-1">
        <div className={`text-sm font-semibold ${isWarning ? "text-red-900" : "text-amber-900"}`}>
          {label} for {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
        <div className={`text-xs ${isWarning ? "text-red-700" : "text-amber-700"}`}>
          {isWarning ? "Almost up — complete payment now or you'll need to reserve again." : "This plot is held for 45 minutes while you check out. It returns to the pool if not purchased."}
        </div>
      </div>
      {/* Announced only once, when the warning threshold is first crossed. */}
      <span role="status" aria-live="polite" className="sr-only">
        {isWarning && announcedWarning.current ? `Warning: only ${mins} minutes ${secs} seconds left on your plot hold.` : ""}
      </span>
    </div>
  );
}
