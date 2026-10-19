// A numbered list of letter conditions to edit — an estate's own conditions,
// or a template's standard ones. The server checks each for amounts and bank
// details and answers with one error per clause (`clauses[2]`,
// `standardClauses[0]`…); each shows under its own clause.

import Button from "../ui/Button";
import { Textarea } from "../ui/Field";

interface ClauseListEditorProps {
  idPrefix: string;
  clauses: string[];
  onChange: (clauses: string[]) => void;
  // Keyed by index: the server's `clauses[i]` / `standardClauses[i]`.
  errors?: Record<number, string>;
  // The letter numbers clauses together; the first one here is this number.
  startNumber?: number;
  max: number;
  maxLength: number;
  min?: number;
  addLabel?: string;
}

export default function ClauseListEditor({ idPrefix, clauses, onChange, errors = {}, startNumber = 1, max, maxLength, min = 0, addLabel = "Add a condition" }: ClauseListEditorProps) {
  const set = (i: number, value: string) => onChange(clauses.map((c, j) => (j === i ? value : c)));
  const remove = (i: number) => onChange(clauses.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {clauses.map((clause, i) => {
          const id = `${idPrefix}-${i}`;
          const error = errors[i];
          const over = clause.length > maxLength;
          return (
            <li key={i} className="flex gap-3">
              <span className="font-mono-data text-sm text-[var(--muted-foreground)] w-6 text-right pt-2 shrink-0" aria-hidden="true">{startNumber + i}.</span>
              <div className="flex-1 min-w-0">
                <label htmlFor={id} className="sr-only">Condition {startNumber + i}</label>
                <Textarea
                  id={id}
                  rows={2}
                  value={clause}
                  onChange={(e) => set(i, e.target.value)}
                  aria-invalid={!!error || over}
                  aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
                  className={error || over ? "border-[var(--error-border)]" : undefined}
                />
                <div className="flex justify-between gap-3 mt-1">
                  <p id={`${id}-error`} className="text-xs text-[var(--error-text)]">{error ?? (over ? `Keep it under ${maxLength} characters.` : "")}</p>
                  <p id={`${id}-count`} className={`text-xs shrink-0 ${over ? "text-[var(--error-text)]" : "text-[var(--muted-foreground)]"}`}>{clause.length}/{maxLength}</p>
                </div>
              </div>
              <Button variant="linkMuted" onClick={() => remove(i)} disabled={clauses.length <= min} aria-label={`Remove condition ${startNumber + i}`} className="self-start pt-2">
                Remove
              </Button>
            </li>
          );
        })}
      </ol>
      {clauses.length < max ? (
        <Button variant="secondary" onClick={() => onChange([...clauses, ""])}>{addLabel}</Button>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">That's the most a letter takes ({max}).</p>
      )}
    </div>
  );
}

/** `{ "clauses[2]": "…" }` → `{ 2: "…" }` for one list's key. */
export function indexedErrors(fieldErrors: Record<string, string>, key: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(fieldErrors)) {
    const m = new RegExp(`^${key}\\[(\\d+)\\]$`).exec(k);
    if (m) out[Number(m[1])] = v;
  }
  return out;
}
