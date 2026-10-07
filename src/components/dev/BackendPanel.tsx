// Development only: which services are live and which are mocked, one click
// away. During integration testing this is the question asked most often;
// answering it by reading code wastes the session.

import { useState } from "react";
import { BACKEND_ALLOWED_ORIGINS, BACKEND_CONFIGURED, SERVICES, isLive, originLooksAllowed, type ServiceEntry, type ServiceKey } from "../../lib/backends";

export default function BackendPanel() {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;

  const entries = Object.entries(SERVICES) as [ServiceKey, ServiceEntry][];
  const live = entries.filter(([k]) => isLive(k));
  const mocked = entries.filter(([k]) => !isLive(k));
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const originBad = BACKEND_CONFIGURED && !originLooksAllowed(origin);

  return (
    <div className="fixed bottom-3 right-3 z-[1000] text-xs">
      {open && (
        <div className="mb-2 w-80 max-h-[70vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-3 space-y-3">
          <div>
            <div className="font-semibold text-[var(--foreground)]">Backend</div>
            <div className="text-[var(--muted-foreground)] break-all">
              {BACKEND_CONFIGURED ? String(import.meta.env.VITE_API_BASE_URL) : "Not configured — full mock mode"}
            </div>
            {originBad && (
              <div className="mt-1 text-red-700">
                This origin ({origin}) isn't in the backend's allowed origins ({BACKEND_ALLOWED_ORIGINS.join(", ")}). Requests will fail as "Failed to fetch".
              </div>
            )}
          </div>
          <List title={`Live (${live.length})`} items={live} live />
          <List title={`Mocked (${mocked.length})`} items={mocked} live={false} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded-full border shadow-sm font-medium ${originBad ? "bg-red-50 text-red-800 border-red-200" : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]"}`}
        aria-expanded={open}
      >
        {BACKEND_CONFIGURED ? `API: ${live.length} live · ${mocked.length} mock` : "Mock mode"}
      </button>
    </div>
  );
}

function List({ title, items, live }: { title: string; items: [ServiceKey, ServiceEntry][]; live: boolean }) {
  return (
    <div>
      <div className="font-semibold text-[var(--foreground)] mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map(([key, e]) => (
          <li key={key} className="flex gap-2">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${live ? "bg-emerald-500" : e.status === "misaligned" ? "bg-amber-500" : "bg-[var(--muted-foreground)]/50"}`} aria-hidden="true" />
            <span>
              <span className="text-[var(--foreground)]">{e.label}</span>
              {!live && BACKEND_CONFIGURED && (
                <span className="block text-[var(--muted-foreground)]">{e.status === "misaligned" ? "Not aligned yet. " : "No backend yet. "}{e.reason ?? ""}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
