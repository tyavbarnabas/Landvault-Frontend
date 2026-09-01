// SA-1.2 verify (full verification-state machine + audit trail), SA-1.3 plan
// & entitlements, SA-1.4 suspend/reactivate, SA-1.6 guarded support access.
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import {
  fetchTenantById, updateTenantPlan, setTenantStatus,
  requestSupportAccess, fetchSupportAccessGrants,
  beginReview, recordVerificationDecision, resubmitDocument,
  tenantDisplayName,
  type Tenant, type TenantPlan, type TenantEntitlements, type SupportAccessGrant,
  type TenantDocument, type DocumentType,
} from "../../../services/tenantsService";
import { accountNameLooksMismatched } from "../../../lib/onboarding/schema";
import StatusBadge, { tenantStatusBadge, verificationStateBadge } from "../../../components/StatusBadge";
import FileUpload from "../../../components/onboarding/FileUpload";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cac_certificate: "CAC Certificate of Incorporation",
  cac_status_report: "CAC Status Report / Memart",
  tin: "TIN",
  proof_of_address: "Proof of Address",
  scuml_certificate: "SCUML Certificate",
  state_regulator_permit: "State Regulator Permit",
  redan_certificate: "REDAN Certificate",
  other: "Other Document",
};

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const [tenant, setTenant] = useState<Tenant | undefined>();
  const [grants, setGrants] = useState<SupportAccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [plan, setPlan] = useState<TenantPlan>("starter");
  const [entitlements, setEntitlements] = useState<TenantEntitlements>({ marketplacePublishing: false, mlmModule: false, fxRails: false });

  const [showAccessForm, setShowAccessForm] = useState(false);
  const [accessReason, setAccessReason] = useState("");
  const [lastGrant, setLastGrant] = useState<SupportAccessGrant | null>(null);

  const [reviewAction, setReviewAction] = useState<"reject" | "request_info" | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [failedDocIds, setFailedDocIds] = useState<Set<string>>(new Set());
  const [revealedBvn, setRevealedBvn] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!id) return;
    let t = await fetchTenantById(id);
    if (t?.verificationState === "documents_submitted") t = await beginReview(id);
    const g = await fetchSupportAccessGrants(id);
    setTenant(t);
    setGrants(g);
    if (t) { setPlan(t.plan); setEntitlements(t.entitlements); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading tenant…</div>;
  if (!tenant || !id) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Tenant not found.</div>;

  const estateCount = tenant.branches.reduce((s, b) => s + b.estateCount, 0);
  const canPublishAndTakePayments = tenant.verificationState === "verified";
  const reviewerName = user?.name ?? "Super Admin";

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    await action();
    await load();
    setBusy(false);
  };

  const handleSavePlan = () => runAction(() => updateTenantPlan(id, plan, entitlements));

  const handleApprove = () => runAction(() => recordVerificationDecision(id, { reviewerName, decision: "approved" }));

  const handleReject = () => runAction(() =>
    recordVerificationDecision(id, { reviewerName, decision: "rejected", reason: reviewReason, failedDocumentIds: Array.from(failedDocIds) })
  ).then(() => { setReviewAction(null); setReviewReason(""); setFailedDocIds(new Set()); });

  const handleRequestInfo = () => runAction(() =>
    recordVerificationDecision(id, { reviewerName, decision: "request_more_info", reason: reviewReason })
  ).then(() => { setReviewAction(null); setReviewReason(""); });

  const handleResubmit = (doc: TenantDocument, file: File) => runAction(() => resubmitDocument(id, doc.id, { fileName: file.name, size: file.size }));

  const handleSupportAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessReason.trim()) return;
    setBusy(true);
    const grant = await requestSupportAccess(id, accessReason.trim(), reviewerName);
    setLastGrant(grant);
    setAccessReason("");
    setShowAccessForm(false);
    await load();
    setBusy(false);
  };

  const verBadge = verificationStateBadge(tenant.verificationState);
  const statusBadge = tenantStatusBadge(tenant.status);
  const accountMismatch = tenant.financial && accountNameLooksMismatched(tenant.identity.registeredName, tenant.financial.accountName);
  const canReview = tenant.verificationState === "under_review";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/admin/tenants" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Tenants</Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mt-2 mb-6">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">{tenantDisplayName(tenant)}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{tenant.primaryContact.fullName} ({tenant.primaryContact.roleTitle}) · {tenant.primaryContact.workEmail}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge label={verBadge.label} variant={verBadge.variant} />
          <StatusBadge label={statusBadge.label} variant={statusBadge.variant} />
        </div>
      </div>

      {/* Publish/payments gate */}
      <div className={`mb-6 rounded-xl p-4 border ${canPublishAndTakePayments ? "bg-emerald-50 border-emerald-200" : "bg-[var(--muted)] border-[var(--border)]"}`}>
        <div className={`text-sm font-medium mb-1 ${canPublishAndTakePayments ? "text-emerald-900" : "text-[var(--foreground)]"}`}>
          {canPublishAndTakePayments ? "Verified — can publish to the marketplace and collect payments." : "Marketplace publishing and payment collection are locked."}
        </div>
        {!canPublishAndTakePayments && (
          <p className="text-xs text-[var(--muted-foreground)]" title="Locked until verificationState becomes 'verified'">
            This tenant can still explore the portal and set up estates while verification is in progress — it just can't go live until a reviewer approves it below.
          </p>
        )}
      </div>

      {/* Reviewer action panel (SA-1.2) */}
      {canReview && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-sm font-medium text-amber-900 mb-1">Awaiting your review</div>
          <p className="text-xs text-amber-800 mb-3">Check the documents, regulatory registrations, and directors below before deciding.</p>

          {reviewAction === null && (
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={handleApprove} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60">
                Approve
              </button>
              <button disabled={busy} onClick={() => setReviewAction("reject")} className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-60">
                Reject
              </button>
              <button disabled={busy} onClick={() => setReviewAction("request_info")} className="px-4 py-2 bg-white border border-amber-300 text-amber-900 rounded-md text-sm font-medium hover:bg-amber-100 disabled:opacity-60">
                Request more information
              </button>
            </div>
          )}

          {reviewAction === "reject" && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-amber-900">Select which documents failed:</div>
              <div className="space-y-1.5">
                {tenant.documents.map((doc) => (
                  <label key={doc.id} className="flex items-center gap-2 text-xs text-[var(--foreground)]">
                    <input
                      type="checkbox"
                      checked={failedDocIds.has(doc.id)}
                      onChange={() => setFailedDocIds((prev) => { const next = new Set(prev); next.has(doc.id) ? next.delete(doc.id) : next.add(doc.id); return next; })}
                      className="w-3.5 h-3.5 accent-[var(--accent)]"
                    />
                    {DOCUMENT_TYPE_LABELS[doc.type]} — {doc.fileName}
                  </label>
                ))}
              </div>
              <textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder="Reason (required, shown to the tenant)…"
                rows={2}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-md text-sm"
              />
              <div className="flex gap-2">
                <button disabled={busy || !reviewReason.trim() || failedDocIds.size === 0} onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  Confirm rejection
                </button>
                <button onClick={() => { setReviewAction(null); setReviewReason(""); setFailedDocIds(new Set()); }} className="px-4 py-2 text-sm text-amber-900">Cancel</button>
              </div>
            </div>
          )}

          {reviewAction === "request_info" && (
            <div className="space-y-3">
              <textarea
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                placeholder="What's missing or needs clarifying?…"
                rows={2}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-md text-sm"
              />
              <div className="flex gap-2">
                <button disabled={busy || !reviewReason.trim()} onClick={handleRequestInfo} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60">
                  Send request
                </button>
                <button onClick={() => { setReviewAction(null); setReviewReason(""); }} className="px-4 py-2 text-sm text-amber-900">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Company identity */}
      <Section title="Company identity">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Registered name" value={tenant.identity.registeredName} />
          <Row label="Trading name" value={tenant.identity.tradingName || "—"} />
          <Row label="RC number" value={tenant.identity.rcNumber} />
          <Row label="Company type" value={tenant.identity.companyType} />
          <Row label="Incorporated" value={tenant.identity.dateOfIncorporation} />
          <Row label="States of operation" value={tenant.identity.statesOfOperation.join(", ")} />
          <Row label="Registered address" value={`${tenant.identity.registeredAddress.street}, ${tenant.identity.registeredAddress.city}, ${tenant.identity.registeredAddress.state}`} />
          <Row label="Operating address" value={`${tenant.identity.operatingAddress.street}, ${tenant.identity.operatingAddress.city}, ${tenant.identity.operatingAddress.state}`} />
        </div>
      </Section>

      {/* Company contact & presence */}
      <Section title="Company contact & presence">
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Company email" value={tenant.presence.companyEmail} />
          <Row label="Company phone" value={tenant.presence.companyPhone} />
          <Row label="Website" value={tenant.presence.website || "—"} />
        </div>
      </Section>

      {/* Documents */}
      <Section title="Corporate documents" subtitle="Land title documents are collected per estate, not here.">
        {tenant.documents.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No documents submitted yet.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {tenant.documents.map((doc) => (
              <div key={doc.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">{DOCUMENT_TYPE_LABELS[doc.type]}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{doc.fileName} · {(doc.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <StatusBadge {...(doc.status === "verified" ? { label: "Verified", variant: "success" as const } : doc.status === "rejected" ? { label: "Rejected", variant: "error" as const } : { label: "Pending", variant: "neutral" as const })} />
                </div>
                {doc.status === "rejected" && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    {doc.rejectionReason && <p className="text-xs text-red-800 mb-2">{doc.rejectionReason}</p>}
                    <ResubmitControl doc={doc} onResubmit={(file) => handleResubmit(doc, file)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Regulatory & compliance */}
      {tenant.regulatory && (
        <Section title="Regulatory & compliance">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
            <Row label="SCUML number" value={tenant.regulatory.scumlNumber} />
            <Row label="REDAN number" value={tenant.regulatory.redanNumber || "—"} />
          </div>
          {tenant.regulatory.stateRegulators.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">State regulators</div>
              {tenant.regulatory.stateRegulators.map((r) => (
                <div key={r.id} className="text-sm">{r.state} — {r.regulatorName} ({r.regNumber})</div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Directors & beneficial ownership */}
      {tenant.directors.length > 0 && (
        <Section title="Directors & beneficial ownership" subtitle={tenant.directorsAttestation ? "Submitting director attested authorisation to register this company." : "Attestation not recorded."}>
          <div className="space-y-3">
            {tenant.directors.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--border)] last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium text-[var(--foreground)]">{d.fullName} — {d.role}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{d.nationality} · {d.idType} {d.idNumber} · Ownership {d.ownershipPct}%</div>
                  {d.bvn && (
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      BVN: <MaskedValue value={d.bvn} revealed={revealedBvn.has(d.id)} onToggle={() => setRevealedBvn((prev) => { const next = new Set(prev); next.has(d.id) ? next.delete(d.id) : next.add(d.id); return next; })} />
                    </div>
                  )}
                </div>
                {d.isBeneficialOwner && <StatusBadge label="Beneficial owner" variant="warning" />}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Financial & settlement */}
      {tenant.financial && (
        <Section title="Financial & settlement">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3">
            <Row label="Bank" value={tenant.financial.bankName} />
            <Row label="Account number" value={tenant.financial.accountNumber} />
            <Row label="Account name" value={tenant.financial.accountName} />
            <Row label="Settlement currency" value={tenant.financial.settlementCurrency} />
          </div>
          {accountMismatch && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-3">
              Account name doesn't closely match the registered company name ("{tenant.identity.registeredName}") — a compliance red flag worth a closer look, though not a blocker on its own.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {Object.entries(tenant.financial.gateways).map(([name, status]) => (
              <StatusBadge key={name} label={`${name} · ${status === "connected" ? "Connected" : "Connect later"}`} variant={status === "connected" ? "success" : "neutral"} />
            ))}
          </div>
        </Section>
      )}

      {/* Branches */}
      <Section title="Branches" subtitle={`${tenant.branches.length} ${tenant.branches.length === 1 ? "branch" : "branches"} · ${estateCount} ${estateCount === 1 ? "estate" : "estates"} total`}>
        {tenant.branches.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No branches yet — the tenant's Executive Director creates these themselves.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {tenant.branches.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium text-[var(--foreground)]">{b.name}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">Manager: {b.managerName}</div>
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">{b.estateCount} {b.estateCount === 1 ? "estate" : "estates"}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Verification audit trail */}
      <Section title="Verification history" subtitle="Immutable — every reviewer decision is appended, never edited.">
        {tenant.verificationHistory.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No decisions recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {tenant.verificationHistory.slice().reverse().map((v) => (
              <div key={v.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--foreground)] capitalize">{v.decision.replace("_", " ")}</span>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono-data">by {v.reviewerName} · {new Date(v.timestamp).toLocaleString()}</span>
                </div>
                {v.reason && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{v.reason}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Plan & entitlements (SA-1.3) */}
      <Section title="Plan & entitlements" subtitle="Limits are enforced server-side once a real backend exists — not just hidden in the UI.">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Plan</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value as TenantPlan)} className="w-full max-w-xs px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="space-y-2">
            <Checkbox label="Marketplace publishing" checked={entitlements.marketplacePublishing} onChange={(v) => setEntitlements({ ...entitlements, marketplacePublishing: v })} />
            <Checkbox label="Realtor / MLM commission module" checked={entitlements.mlmModule} onChange={(v) => setEntitlements({ ...entitlements, mlmModule: v })} />
            <Checkbox label="Foreign-currency (FX) rails" checked={entitlements.fxRails} onChange={(v) => setEntitlements({ ...entitlements, fxRails: v })} />
          </div>
          <button disabled={busy} onClick={handleSavePlan} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60">
            Save plan & entitlements
          </button>
        </div>
      </Section>

      {/* Suspend / reactivate (SA-1.4) */}
      <Section title="Account status">
        <p className="text-sm text-[var(--muted-foreground)] mb-3">
          {tenant.status === "suspended"
            ? "Suspended: staff access is blocked and public listings are hidden. Data and client obligations are preserved."
            : "Suspending blocks tenant staff access and hides their public listings — it never touches their data or client obligations, and is independent of verification status."}
        </p>
        {tenant.status === "suspended" ? (
          <button disabled={busy} onClick={() => runAction(() => setTenantStatus(id, "active", reviewerName))} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60">
            Reactivate tenant
          </button>
        ) : (
          <button disabled={busy} onClick={() => runAction(() => setTenantStatus(id, "suspended", reviewerName))} className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-40">
            Suspend tenant
          </button>
        )}
      </Section>

      {/* Support access (SA-1.6) */}
      <Section title="Support access" subtitle="Guarded: reason-required, time-boxed, fully logged. Never used to move money or sign documents on the tenant's behalf.">
        {lastGrant && (
          <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
            Access granted, expires <span className="font-mono-data">{new Date(lastGrant.expiresAt).toLocaleString()}</span>. Logged against this tenant.
          </div>
        )}
        {showAccessForm ? (
          <form onSubmit={handleSupportAccessSubmit} className="space-y-3">
            <textarea
              value={accessReason}
              onChange={(e) => setAccessReason(e.target.value)}
              placeholder="Reason for support access (required, shown in the audit log)…"
              rows={2}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || !accessReason.trim()} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60">
                Grant 30-minute access
              </button>
              <button type="button" onClick={() => setShowAccessForm(false)} className="px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAccessForm(true)} className="px-4 py-2 bg-white border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)]">
            Request support access
          </button>
        )}

        {grants.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2">
            <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Access log</div>
            {grants.map((g) => (
              <div key={g.id} className="text-xs text-[var(--muted-foreground)]">
                <span className="font-mono-data text-[var(--foreground)]">{new Date(g.requestedAt).toLocaleString()}</span> — "{g.reason}"
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="text-[var(--foreground)] text-right">{value}</span>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-[var(--foreground)] mb-0.5">{title}</h2>
      {subtitle && <p className="text-xs text-[var(--muted-foreground)] mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-[var(--foreground)] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

// Sensitive data (see the SENSITIVE comment on Director in tenantsService.ts)
// — masked to the last 4 digits by default, revealed only on demand.
function MaskedValue({ value, revealed, onToggle }: { value: string; revealed: boolean; onToggle: () => void }) {
  const masked = `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
  return (
    <span className="font-mono-data">
      {revealed ? value : masked}{" "}
      <button type="button" onClick={onToggle} className="text-[var(--accent)] hover:underline">{revealed ? "Hide" : "Reveal"}</button>
    </span>
  );
}

function ResubmitControl({ onResubmit }: { doc: TenantDocument; onResubmit: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const submitted = useRef(false);
  return (
    <FileUpload
      label="Re-upload this document"
      file={file}
      onChange={(f) => {
        setFile(f);
        if (f && !submitted.current) { submitted.current = true; onResubmit(f); }
      }}
    />
  );
}
