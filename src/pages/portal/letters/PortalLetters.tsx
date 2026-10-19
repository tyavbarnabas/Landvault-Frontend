// /portal/letters — the company's allocation-letter setup: letterheads and
// wording. Each estate's own conditions, and approving its letter, are on the
// estate (/portal/estates/:id/letter). Anyone with portal.documents.view reads
// this; only the Executive Director, working company-wide, changes it.

import { useSearchParams } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { DOCUMENTS_MANAGE_PERMISSION } from "../../../services/authService";
import Page from "../../../components/ui/Page";
import Alert from "../../../components/ui/Alert";
import TabBar from "../../../components/ui/Tabs";
import { usePortalScope } from "../usePortalScope";
import LetterheadsPanel from "./LetterheadsPanel";
import TemplatesPanel from "./TemplatesPanel";
import { listMissing } from "./LetterheadsPanel";
import { useFetch } from "../../../lib/useFetch";
import { formatDay } from "../../../lib/formatDate";
import { fetchLetterheads, fetchLetterTemplates } from "../../../services/lettersService";
import type { PortalScope } from "../../../services/portalEstatesService";
import { AlertIcon, CheckIcon } from "../../../components/icons";

type Tab = "letterheads" | "wording";
const TABS: { id: Tab; label: string }[] = [
  { id: "letterheads", label: "Letterheads" },
  { id: "wording", label: "Wording" },
];

export default function PortalLetters() {
  const scope = usePortalScope();
  const { user } = useApp();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "wording" ? "wording" : "letterheads";
  const holdsManage = !!user?.permissions?.includes(DOCUMENTS_MANAGE_PERMISSION);
  // The backend refuses changes from a view narrowed to one branch.
  const canManage = holdsManage && !scope?.branchId;

  if (!scope) return <Page title="Letters">{null}</Page>;
  return (
    <Page
      title="Letters"
      description="HomeTrue issues each buyer's allocation letter the moment finance verifies the sale, under your letterhead and in your words. Set them up here; each estate's conditions and approval are on the estate."
    >
      {holdsManage && !canManage && (
        <Alert className="mb-4" role="status">You're working inside one branch. Letters can only be changed with a company-wide view.</Alert>
      )}
      {!holdsManage && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">Only the Executive Director can change letters. You can see how they're set up.</p>
      )}
      <LetterStatus scope={scope} />
      <TabBar tabs={TABS} active={tab} onActivate={(t) => setParams(t === "letterheads" ? {} : { tab: t }, { replace: true })} ariaLabel="Letter setup" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "letterheads" ? <LetterheadsPanel scope={scope} canManage={canManage} /> : <TemplatesPanel scope={scope} canManage={canManage} />}
      </div>
    </Page>
  );
}

// Whether letters can be issued at all, and where the wording stands — said
// once at the top, from the same two lists the tabs read.
function LetterStatus({ scope }: { scope: PortalScope }) {
  const loaded = useFetch(async () => {
    const [heads, templates] = await Promise.all([fetchLetterheads(scope), fetchLetterTemplates(scope)]);
    return { heads, templates };
  }, [scope.tenantId, scope.branchId]);
  if (!loaded.data) return null;
  const { heads, templates } = loaded.data;
  const all = [heads.company, ...heads.branches];
  const notReady = all.filter((h) => h.missing.length > 0);
  const company = templates.company;
  const ownWording = templates.branches.filter((t) => t.inUse === "branch").map((t) => t.branchName);
  const wording = company.approved
    ? `Wording: the company's, approved${company.approved.reviewedAt ? ` ${formatDay(company.approved.reviewedAt)}` : ""}${ownWording.length ? `; ${ownWording.join(", ")} ${ownWording.length === 1 ? "has its" : "have their"} own, approved` : ""}.`
    : "Wording: HomeTrue's standard wording until the company's is approved.";
  const ready = notReady.length === 0;
  return (
    <div role="status" className={`mb-5 flex items-start gap-3 rounded-xl px-4 py-3.5 ${ready ? "bg-[var(--success-surface)] text-[var(--success-text)]" : "bg-[var(--warning-surface)] text-[var(--warning-text)]"}`}>
      <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--card)] flex items-center justify-center">{ready ? <CheckIcon size={18} /> : <AlertIcon size={18} />}</span>
      <div className="text-sm">
        <div className="font-semibold">{ready ? "Ready to issue letters" : `${notReady.length} letterhead${notReady.length === 1 ? " isn't" : "s aren't"} ready`}</div>
        <p>
          {ready
            ? `The company letterhead${heads.branches.length ? ` and all ${heads.branches.length} branch${heads.branches.length === 1 ? "" : "es"}` : ""} have a signatory and signature.`
            : notReady.map((h) => `${h.scope === "company" ? "The company letterhead" : h.branchName} needs ${listMissing(h.missing)}`).join(". ") + "."}
          {" "}{wording}
        </p>
      </div>
    </div>
  );
}
