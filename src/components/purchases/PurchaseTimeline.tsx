// A purchase's progress as a vertical timeline — paid, verified, allocated —
// from purchaseTimeline(). Shared by the purchase page and the page Paystack
// returns the buyer to, so both tell the same story in the same words.

import { formatDayTime } from "../../lib/formatDate";
import type { StepState, TimelineStep } from "../../lib/purchaseStatus";
import { CheckIcon, XIcon } from "../icons";

export default function PurchaseTimeline({ steps }: { steps: TimelineStep[] }) {
  return <ol>{steps.map((step, i) => <TimelineRow key={step.key} step={step} last={i === steps.length - 1} />)}</ol>;
}

const DOT: Record<StepState, string> = {
  done: "bg-[var(--primary)] text-[var(--primary-foreground)]",
  current: "border-2 border-[var(--primary)] bg-[var(--card)]",
  failed: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  upcoming: "border border-[var(--border)] bg-[var(--card)]",
};

function TimelineRow({ step, last }: { step: TimelineStep; last: boolean }) {
  return (
    <li className="flex gap-3.5" aria-current={step.state === "current" ? "step" : undefined}>
      <div className="flex flex-col items-center">
        <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${DOT[step.state]}`}>
          {step.state === "done" && <CheckIcon size={12} />}
          {step.state === "failed" && <XIcon size={12} />}
          {step.state === "current" && <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />}
        </span>
        {!last && <span className={`w-0.5 flex-1 min-h-6 ${step.state === "done" ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />}
      </div>
      <div className={last ? "pb-0" : "pb-4"}>
        <div className={`text-sm font-semibold ${step.state === "upcoming" ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>{step.label}</div>
        {(step.at || step.note) && (
          <div className="text-sm text-[var(--muted-foreground)]">{[step.at ? formatDayTime(step.at) : null, step.note].filter(Boolean).join(" · ")}</div>
        )}
        {step.state === "upcoming" && !step.note && <span className="sr-only">Not yet</span>}
      </div>
    </li>
  );
}
