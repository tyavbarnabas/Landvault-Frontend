// The frame every estate setup page sits in, from the Figma "Portal estate
// setup" proposal: the estate's name and status, then its six setup steps
// with where each one stands, then the step's own content and a link to the
// next step. A developer moves through setup without going back to the
// estate overview between steps.
//
// Every status comes from the estate itself (EstateDetailDto.eligibility,
// and its title fields) — nothing is recounted or guessed here. Publishing
// stays on the overview, where its conditions list lives.

import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { DOCUMENTS_VIEW_PERMISSION } from "../../services/authService";
import { estatePlace, type PortalEstate } from "../../services/portalEstatesService";
import StatusBadge, { portalEstateStatusBadge } from "../StatusBadge";
import Page from "../ui/Page";
import { LinkButton } from "../ui/Button";
import TextLink from "../ui/TextLink";
import { cx } from "../ui/cx";
import { CheckIcon, InfoIcon } from "../icons";

export type SetupStep = "details" | "plots" | "photos" | "title" | "fees" | "letter";

type StepState = "done" | "todo" | "waiting" | "optional";

interface StepInfo {
  key: SetupStep;
  label: string;
  path: string;
  state: StepState;
  detail: string;
  // Needed before the estate can be published (the title isn't).
  required: boolean;
}

function stepsFor(estate: PortalEstate, canSeeLetter: boolean): StepInfo[] {
  const e = estate.eligibility;
  const base = `/portal/estates/${estate.id}`;
  const steps: StepInfo[] = [
    { key: "details", label: "Details", path: `${base}/edit`, required: true,
      ...(e?.hasBoundary ?? estate.hasBoundary ? { state: "done", detail: "Boundary added" } : { state: "todo", detail: "No boundary yet" }) },
    { key: "plots", label: "Tiers & plots", path: `${base}/inventory`, required: true,
      ...(e?.hasPlots ?? estate.totalPlots > 0
        ? { state: "done", detail: `${estate.totalPlots.toLocaleString()} ${estate.totalPlots === 1 ? "plot" : "plots"}` }
        : { state: "todo", detail: "No plots yet" }) },
    { key: "photos", label: "Photos", path: `${base}/photos`, required: true,
      ...(e?.hasPhoto ? { state: "done", detail: "Cover set" } : { state: "todo", detail: "None yet" }) },
    { key: "title", label: "Land title", path: `${base}/title`, required: false,
      ...(!estate.titleType ? { state: "optional", detail: "Not recorded" }
        : estate.titleVerified ? { state: "done", detail: "Verified" } : { state: "waiting", detail: "Not verified yet" }) },
    { key: "fees", label: "Fees & terms", path: `${base}/disclosure`, required: true,
      ...(e && e.feesDeclared && e.refundTermsDeclared ? { state: "done", detail: "Declared" }
        : { state: "todo", detail: e?.feesDeclared ? "Refund terms missing" : "Not declared" }) },
  ];
  if (canSeeLetter) {
    steps.push({ key: "letter", label: "Allocation letter", path: `${base}/letter`, required: true,
      ...(e?.letterApproved ? { state: "done", detail: "Approved" } : { state: "todo", detail: "Not approved yet" }) });
  }
  return steps;
}

export default function EstateSetupPage({ estate, step, title, description, actions, children }: {
  estate: PortalEstate;
  step: SetupStep;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useApp();
  const steps = stepsFor(estate, user?.permissions.includes(DOCUMENTS_VIEW_PERMISSION) ?? false);
  const index = Math.max(0, steps.findIndex((s) => s.key === step));
  const current = steps[index];
  const prev = steps[index - 1];
  const next = steps[index + 1];
  const left = steps.filter((s) => s.required && s.state !== "done");
  const badge = portalEstateStatusBadge(estate.status);
  const facts = [estatePlace(estate), estate.areaSqm ? `${(estate.areaSqm / 10_000).toFixed(2)} ha` : null].filter(Boolean).join(" · ");

  return (
    <Page width="xl" back={{ to: "/portal/estates", label: "Estates" }}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{estate.name}<span className="font-[family-name:var(--font-body)] inline-flex"><StatusBadge label={estate.status === "published" ? "Live on the marketplace" : badge.label} variant={badge.variant} /></span></span>}
      description={facts}
      actions={<LinkButton to={`/portal/estates/${estate.id}`} variant="secondary">Estate overview</LinkButton>}>
      <nav aria-label="Estate setup" className="mb-3">
        {/* Desktop: every step in one bar. */}
        <ol className="hidden lg:flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden divide-x divide-[var(--border)]">
          {steps.map((s, i) => (
            <li key={s.key} className="flex-1 min-w-0">
              <Link to={s.path} aria-current={s.key === step ? "step" : undefined}
                className={cx("flex items-center gap-2.5 px-3.5 py-3 h-full hover:bg-[var(--muted)]", s.key === step && "bg-[var(--secondary)] hover:bg-[var(--secondary)]")}>
                <StepDot state={s.key === step ? "current" : s.state} n={i + 1} />
                <span className="min-w-0">
                  <span className={cx("block text-sm leading-tight text-[var(--foreground)]", s.key === step ? "font-semibold" : "font-medium")}>{s.label}</span>
                  <span className={cx("block text-xs truncate", s.state === "todo" ? "text-[var(--warning-text)]" : "text-[var(--muted-foreground)]")}>{s.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {/* Phone: where you are, and the list on tap. */}
        <details className="lg:hidden bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 group">
          <summary className="block cursor-pointer list-none">
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-mono-data text-xs text-[var(--muted-foreground)]">Step {index + 1} of {steps.length}</span>
                <span className="block font-semibold text-[var(--foreground)]">{current.label}</span>
              </span>
              <span className="text-sm font-medium text-[var(--accent)]">All steps</span>
            </span>
            <span className="flex gap-1 mt-3" aria-hidden="true">
              {steps.map((s) => (
                <span key={s.key} className={cx("h-1 flex-1 rounded-full",
                  s.key === step ? "bg-[var(--primary)]" : s.state === "done" ? "bg-[var(--success)]" : s.state === "todo" ? "bg-[var(--warning)]" : "bg-[var(--border)]")} />
              ))}
            </span>
          </summary>

          <ol className="mt-3 space-y-1">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link to={s.path} className="flex items-center gap-2.5 py-1.5" aria-current={s.key === step ? "step" : undefined}>
                  <StepDot state={s.key === step ? "current" : s.state} n={i + 1} />
                  <span className="text-sm font-medium text-[var(--foreground)]">{s.label}</span>
                  <span className={cx("text-xs ml-auto", s.state === "todo" ? "text-[var(--warning-text)]" : "text-[var(--muted-foreground)]")}>{s.detail}</span>
                </Link>
              </li>
            ))}
          </ol>
        </details>
      </nav>

      <p className="flex items-start gap-2 text-sm text-[var(--muted-foreground)] mb-7">
        <span className="mt-0.5 shrink-0"><InfoIcon size={14} /></span>
        <span>
        {estate.status === "published" ? "Live on the marketplace. Changes here show there straight away."
          : left.length === 0 ? "Every setup step is done."
            : `${left.length} ${left.length === 1 ? "step" : "steps"} left before you can publish: ${left.map((s) => s.label.toLowerCase()).join(", ")}.`}
        {estate.status !== "published" && <> <TextLink to={`/portal/estates/${estate.id}`} className="font-medium">Publish from the estate overview →</TextLink></>}
        </span>
      </p>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
          {description && <p className="text-sm text-[var(--muted-foreground)] mt-1 max-w-3xl">{description}</p>}
        </div>
        {actions}
      </div>

      {children}

      <div className="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-[var(--border)]">
        {prev ? <TextLink to={prev.path} muted className="text-sm font-medium">← {prev.label}</TextLink> : <span />}
        {next && <LinkButton to={next.path} variant="secondary">Next: {next.label} →</LinkButton>}
      </div>
    </Page>
  );
}

function StepDot({ state, n }: { state: StepState | "current"; n: number }) {
  return (
    <span aria-hidden="true" className={cx("w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold",
      state === "current" ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
        : state === "done" ? "bg-[var(--success-surface)] text-[var(--success-text)]"
          : state === "todo" ? "bg-[var(--warning-surface)] text-[var(--warning-text)]"
            : "bg-[var(--muted)] text-[var(--muted-foreground)]")}>
      {state === "done" ? <CheckIcon size={14} /> : state === "todo" ? "!" : n}
    </span>
  );
}
