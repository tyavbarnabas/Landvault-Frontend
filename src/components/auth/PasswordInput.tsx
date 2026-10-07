// A password field with a show/hide toggle. Seeing what you typed catches
// typos better than typing it twice — which is why sign-up has no confirm field.

import { useState } from "react";
import { MAX_PASSWORD_LENGTH } from "../../lib/passwordPolicy";

export default function PasswordInput({ id, value, onChange, autoComplete, placeholder = "••••••••", invalid, describedBy }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={autoComplete === "new-password" ? MAX_PASSWORD_LENGTH : undefined}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        // Never offer a typed password to spellcheck/autocorrect services.
        spellCheck={false}
        autoCapitalize="none"
        className={`w-full pl-3 pr-11 py-2.5 bg-[var(--card)] border rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${invalid ? "border-red-400" : "border-[var(--border)]"}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0 right-0 w-10 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] rounded-r-md"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.5 5-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
