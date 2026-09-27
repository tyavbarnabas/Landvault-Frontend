// Small form primitives shared by the disclosure forms. Same classes as the
// inventory forms (PortalEstateInventory.tsx) — no new tokens.

export const inputClass = "w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-700 mt-1" role="alert">{message}</p>;
}

export function Field({ id, label, hint, error, children }: {
  id: string; label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

// A required choice with NO default: `value` starts null and stays null until
// the developer picks. Rendered as radios so an unanswered question looks
// unanswered, rather than a checkbox whose unticked state reads as "no".
export function Choice<T extends string | boolean>({ name, legend, options, value, onChange, error, hint }: {
  name: string;
  legend: React.ReactNode;
  options: { value: T; label: string; description?: string }[];
  value: T | null | "";
  onChange: (value: T) => void;
  error?: string;
  hint?: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{legend}</legend>
      {hint && <div className="text-xs text-[var(--muted-foreground)] mb-2">{hint}</div>}
      <div className="flex flex-col sm:flex-row gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={String(option.value)}
              className={`flex-1 flex items-start gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer ${
                selected ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="text-[var(--foreground)]">{option.label}</span>
                {option.description && <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}

export const YES_NO: { value: boolean; label: string }[] = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

export function SubmitButton({ saving, children }: { saving: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
      {saving ? "Declaring…" : children}
    </button>
  );
}

// A new version is declared; the previous one stays on record. Said on every
// form so nobody reads "declare again" as "edit".
export function VersionNote({ nextVersion }: { nextVersion: number }) {
  return (
    <p className="text-xs text-[var(--muted-foreground)]">
      {nextVersion === 1
        ? "This records version 1."
        : `This records version ${nextVersion}. Version ${nextVersion - 1} is kept on record unchanged, so a buyer's acknowledgement can always name exactly what they were shown.`}
    </p>
  );
}

export function serverMessage(err: unknown, fallback: string): string {
  const body = (err as { body?: { message?: string; fieldErrors?: Record<string, string> } } | undefined)?.body;
  if (body?.fieldErrors) return Object.values(body.fieldErrors).join(" ");
  if (body?.message) return body.message;
  return err instanceof Error ? err.message : fallback;
}
