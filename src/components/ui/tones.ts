// The five feedback tones, in one place. Every tinted surface (alerts, badges,
// status dots, info boxes) takes its colours from here, and here only from
// the status tokens in src/index.css (--success, --warning-surface, …), so a
// palette or dark-mode change is a token change.

export type Tone = "neutral" | "info" | "warning" | "success" | "error";

// Bordered surfaces: alerts and status panels.
export const TONE_SURFACE: Record<Tone, string> = {
  neutral: "bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]",
  info: "bg-[var(--info-surface)] border-[var(--info-border)] text-[var(--info-text)]",
  warning: "bg-[var(--warning-surface)] border-[var(--warning-border)] text-[var(--warning-text)]",
  success: "bg-[var(--success-surface)] border-[var(--success-border)] text-[var(--success-text)]",
  error: "bg-[var(--error-surface)] border-[var(--error-border)] text-[var(--error-text)]",
};

// Pills: same set as surfaces, muted text for neutral.
export const TONE_BADGE: Record<Tone, string> = {
  ...TONE_SURFACE,
  neutral: "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]",
};

// Borderless tinted boxes inside a card.
export const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-[var(--muted)]",
  info: "bg-[var(--info-surface)]",
  warning: "bg-[var(--warning-surface)]",
  success: "bg-[var(--success-surface)]",
  error: "bg-[var(--error-surface)]",
};

// Small status dots.
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-[var(--muted-foreground)]",
  info: "bg-[var(--info)]",
  warning: "bg-[var(--warning)]",
  success: "bg-[var(--success)]",
  error: "bg-[var(--error)]",
};
