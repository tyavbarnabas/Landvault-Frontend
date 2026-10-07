// "Is this real or a fixture?" — answered on the page itself. Shown only when
// a backend IS configured and this page used a mocked service, naming each one
// and why. In full mock mode it never appears: everything is demo data there,
// as it always was. A screenshot from an integration session carries this; a
// console message wouldn't.

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BACKEND_CONFIGURED, SERVICES, mockServedOn, onMockServed, type ServiceEntry, type ServiceKey } from "../../lib/backends";

export default function DemoDataBanner() {
  const { pathname } = useLocation();
  const [served, setServed] = useState<ServiceKey[]>(() => mockServedOn(pathname));

  useEffect(() => {
    setServed(mockServedOn(pathname));
    // Calls that happen after the page has rendered (a tab, a button).
    return onMockServed(() => setServed(mockServedOn(window.location.pathname)));
  }, [pathname]);

  if (!BACKEND_CONFIGURED || served.length === 0) return null;
  return (
    <div className="px-4 py-2 text-xs bg-amber-50 text-amber-900 border-b border-amber-200" role="note" aria-label="Demo data on this page">
      <span className="font-semibold">Demo data on this page</span> — not from the backend:{" "}
      {served.map((key, i) => (
        <ServiceName key={key} entry={SERVICES[key]} first={i === 0} />
      ))}
      .
    </div>
  );
}

function ServiceName({ entry, first }: { entry: ServiceEntry; first: boolean }) {
  return (
    <span title={entry.reason}>
      {first ? "" : ", "}{entry.label}{entry.status === "misaligned" ? " (not aligned yet)" : " (no backend yet)"}
    </span>
  );
}
