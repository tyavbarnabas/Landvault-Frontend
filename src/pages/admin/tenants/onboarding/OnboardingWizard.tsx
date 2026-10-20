// Onboard a developer company: eight steps, from the Figma admin onboarding
// proposal — the steps listed beside one card per step, and a sticky action
// bar. The rules are the zod schema's, checked step by step as before.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tenantOnboardingSchema, type TenantOnboardingValues, isBeneficialOwner } from "../../../../lib/onboarding/schema";
import { getOnboardingDefaultValues, STEP_FIELDS, STEP_LABELS } from "./defaultValues";
import WizardSteps, { type WizardStepState } from "../../../../components/onboarding/WizardSteps";
import Page from "../../../../components/ui/Page";
import Card from "../../../../components/ui/Card";
import Alert from "../../../../components/ui/Alert";
import Button from "../../../../components/ui/Button";
import TextLink from "../../../../components/ui/TextLink";
import { StepActions } from "./FormField";
import { createTenantDraft, submitForVerification, type CreateTenantDraftInput, type Director, type Regulatory, type TenantDocument, type FinancialSettlement } from "../../../../services/tenantsService";
import { convertRequest, fetchOnboardingRequest, wizardPrefill } from "../../../../services/onboardingRequestsService";
import { useApp } from "../../../../contexts/AppContext";

import Step1CompanyIdentity from "./Step1CompanyIdentity";
import Step2PrimaryContact from "./Step2PrimaryContact";
import Step3ContactPresence from "./Step3ContactPresence";
import Step4Documents from "./Step4Documents";
import Step5Regulatory from "./Step5Regulatory";
import Step6Directors from "./Step6Directors";
import Step7Financial from "./Step7Financial";
import Step8Review from "./Step8Review";

const DRAFT_KEY = "landvault_tenant_onboarding_draft";

// File objects can't round-trip through localStorage — this drops them from
// the persisted draft (a real backend would persist the wizard's draft state
// server-side instead, and could store partial document uploads for real).
function stripFiles(_key: string, value: unknown) {
  if (value instanceof File) return undefined;
  return value;
}

// Converting an onboarding request keeps its own draft, so it never
// overwrites (or resumes) a blank onboarding's.
const draftKeyFor = (fromRequest: string | null) => (fromRequest ? `${DRAFT_KEY}:${fromRequest}` : DRAFT_KEY);

function saveDraft(values: TenantOnboardingValues, key: string) {
  try {
    localStorage.setItem(key, JSON.stringify(values, stripFiles));
  } catch {
    // Best-effort only — private browsing / full storage shouldn't block onboarding.
  }
}

function loadDraft(key: string): Partial<TenantOnboardingValues> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const STEPS = [Step1CompanyIdentity, Step2PrimaryContact, Step3ContactPresence, Step4Documents, Step5Regulatory, Step6Directors, Step7Financial];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useApp();
  // Set when converting an onboarding request: /admin/tenants/new?fromRequest=…
  const fromRequest = useSearchParams()[0].get("fromRequest");
  const draftKey = draftKeyFor(fromRequest);
  const [requestCompany, setRequestCompany] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const form = useForm<TenantOnboardingValues>({
    resolver: zodResolver(tenantOnboardingSchema),
    defaultValues: getOnboardingDefaultValues(),
    mode: "onSubmit",
  });
  const { trigger, getValues, reset } = form;
  const values = useWatch({ control: form.control }) as Partial<TenantOnboardingValues>;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [draftNotice, setDraftNotice] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const draft = loadDraft(draftKey);
    if (draft) {
      reset({ ...getOnboardingDefaultValues(), ...draft });
      setDraftNotice(true);
    }
    if (!fromRequest) return;
    // Only what a first-contact form asks; the rest is the admin's to fill.
    fetchOnboardingRequest(fromRequest).then((request) => {
      setRequestCompany(request.companyName);
      if (draft) return;
      const p = wizardPrefill(request);
      const defaults = getOnboardingDefaultValues();
      reset({
        ...defaults,
        registeredName: p.registeredName, rcNumber: p.rcNumber, statesOfOperation: p.statesOfOperation,
        registeredAddress: { ...defaults.registeredAddress, street: p.registeredAddressStreet },
        firstName: p.firstName, lastName: p.lastName, roleTitle: p.roleTitle, workEmail: p.workEmail, phone: p.phone,
      });
    }).catch((err) => setSubmitError(err instanceof Error ? err.message : "Couldn't load the onboarding request."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveForLater = () => {
    saveDraft(getValues(), draftKey);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const goToStep = (index: number) => {
    setCurrentIndex(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = async () => {
    const isLastStep = currentIndex === STEP_LABELS.length - 1;
    const valid = await trigger(STEP_FIELDS[currentIndex] as (keyof TenantOnboardingValues)[]);
    if (!valid) return;

    if (!isLastStep) {
      const next = currentIndex + 1;
      setFurthestIndex((f) => Math.max(f, next));
      goToStep(next);
      return;
    }

    await handleSubmitForVerification();
  };

  // A refusal must never leave the button stuck on "Submitting". The two the
  // backend names go back to the field they're about; anything else is said
  // plainly at the top.
  const handleSubmitForVerification = async () => {
    setSubmitError("");
    try {
      await submitForVerificationUnsafe();
    } catch (err) {
      setSubmitting(false);
      // A converted request reports the same codes on OnboardingError.code.
      const code = (err as { body?: { code?: string } }).body?.code ?? (err as { code?: string }).code;
      if (code === "EMAIL_ALREADY_REGISTERED") {
        // The primary contact becomes the first Executive Director by
        // invitation — which needs an email with no LandVault account yet.
        goToStep(1);
        form.setError("workEmail", { message: "This email already has a HomeTrue account. Use the contact's work email — the first Executive Director is invited, and needs an address with no account yet." });
      } else if (code === "RC_NUMBER_ALREADY_REGISTERED") {
        goToStep(0);
        form.setError("rcNumber", { message: "A company with this RC number is already registered on HomeTrue." });
      } else if (code === "ONBOARDING_REQUEST_CLOSED" || code === "ONBOARDING_REQUEST_NOT_FOUND") {
        setSubmitError(err instanceof Error ? err.message : "This onboarding request is no longer open.");
      } else {
        setSubmitError("Couldn't create the tenant. Nothing was submitted — please try again.");
      }
    }
  };

  const submitForVerificationUnsafe = async () => {
    setSubmitting(true);
    const v = getValues();

    // Every uploaded File becomes a TenantDocument record (metadata only —
    // there's no real file storage yet, see INTEGRATION.md).
    const documents: TenantDocument[] = [];
    const now = new Date().toISOString();
    const addDoc = (file: File | null | undefined, type: TenantDocument["type"]) => {
      if (!file) return undefined;
      const doc: TenantDocument = { id: `doc-${Date.now()}-${documents.length}`, type, fileName: file.name, size: file.size, status: "pending", uploadedAt: now };
      documents.push(doc);
      return doc.id;
    };

    addDoc(v.cacCertificate, "cac_certificate");
    addDoc(v.cacStatusReport, "cac_status_report");
    addDoc(v.tinDocument, "tin");
    addDoc(v.proofOfAddress, "proof_of_address");
    addDoc(v.scumlCertificate, "scuml_certificate");
    const lasreraDocId = addDoc(v.lasreraDocument, "state_regulator_permit");

    const stateRegulators = [
      ...(v.lasreraRegNumber ? [{ id: `reg-lasrera-${Date.now()}`, state: "Lagos", regulatorName: "LASRERA", regNumber: v.lasreraRegNumber, documentId: lasreraDocId }] : []),
      ...v.otherStateRegulators.map((r) => ({ id: r.id, state: r.state, regulatorName: r.regulatorName, regNumber: r.regNumber, documentId: addDoc(r.document, "state_regulator_permit") })),
    ];

    const additionalPermits = v.additionalPermits.map((p) => ({ id: p.id, name: p.name, documentId: addDoc(p.document, "other") }));

    const regulatory: Regulatory = {
      scumlNumber: v.scumlNumber,
      stateRegulators,
      redanNumber: v.redanNumber || undefined,
      additionalPermits,
    };

    const directors: Director[] = v.directors.map((d) => ({
      id: d.id,
      fullName: `${d.firstName} ${d.lastName}`.trim(),
      role: d.role,
      nationality: d.nationality,
      idType: d.idType,
      idNumber: d.idNumber,
      ownershipPct: Number(d.ownershipPct),
      isBeneficialOwner: isBeneficialOwner(Number(d.ownershipPct)),
    }));

    const financial: FinancialSettlement = {
      bankName: v.bankName,
      accountNumber: v.accountNumber,
      accountName: v.accountName,
      settlementCurrency: v.settlementCurrency,
      gateways: v.gateways,
    };

    // Plan/entitlements aren't part of this onboarding spec — every new
    // tenant starts on "starter" and the Super Admin adjusts it afterward
    // from the tenant detail page's existing Plan & entitlements section.
    const draftInput: CreateTenantDraftInput = {
      identity: {
        registeredName: v.registeredName,
        tradingName: v.tradingName || undefined,
        rcNumber: v.rcNumber,
        companyType: v.companyType,
        dateOfIncorporation: v.dateOfIncorporation,
        registeredAddress: v.registeredAddress,
        operatingAddress: v.sameAsRegisteredAddress ? v.registeredAddress : v.operatingAddress,
        statesOfOperation: v.statesOfOperation,
      },
      primaryContact: { fullName: `${v.firstName} ${v.lastName}`.trim(), roleTitle: v.roleTitle, workEmail: v.workEmail, phone: v.phone, govIdType: v.govIdType, govIdNumber: v.govIdNumber },
      presence: { companyEmail: v.companyEmail, companyPhone: v.companyPhone, website: v.website || undefined, socials: v.socials },
      plan: "starter",
    };
    // From a request, the backend creates the tenant AND closes the request,
    // all or nothing; otherwise the ordinary create.
    const tenantId = fromRequest
      ? (await convertRequest(fromRequest, draftInput, user?.email ?? "")).organizationId!
      : (await createTenantDraft(draftInput)).id;
    const tenant = { id: tenantId };

    // The tenant now EXISTS (and its first Executive Director has been
    // invited). If the submission step is refused, say exactly that on the
    // tenant's page — never "nothing was submitted", which would be untrue.
    let submitProblem: string | null = null;
    try {
      await submitForVerification(tenant.id, { documents, regulatory, directors, directorsAttestation: v.attestation, financial });
    } catch (err) {
      const body = (err as { body?: { code?: string; message?: string } }).body;
      submitProblem = body?.message ?? (err instanceof Error ? err.message : "The submission was refused.");
      if (body?.code) submitProblem += ` (${body.code})`;
    }

    clearDraft(draftKey);
    setSubmitting(false);
    navigate(`/admin/tenants/${tenant.id}`, { state: submitProblem ? { submitProblem } : undefined });
  };

  const isLastStep = currentIndex === STEP_LABELS.length - 1;
  const StepComponent = STEPS[currentIndex];
  const missing = stepsMissing(values);
  // Where each step stands: where you are, something to fix (an error the
  // last check found, or — on the review — anything still missing), done once
  // passed, otherwise still to do.
  const errorKeys = Object.keys(form.formState.errors);
  const states: WizardStepState[] = STEP_LABELS.map((_, i) => {
    if (i === currentIndex) return "current";
    const fields = STEP_FIELDS[i].map((f) => String(f).split(".")[0]);
    if (fields.some((f) => errorKeys.includes(f)) || (isLastStep && missing.some((m) => m.step === i))) return "fix";
    return i < furthestIndex ? "done" : "todo";
  });

  return (
    <Page width="xl" back={{ to: "/admin/tenants", label: "Tenants" }} title="Onboard a developer"
      description="Creates the company as a draft, invites its first Executive Director, and sends it for HomeTrue's verification.">
      <div className="space-y-3 mb-6 empty:hidden">
        {fromRequest && (
          <Alert tone="info" role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span>
              Converting {requestCompany ? `${requestCompany}'s` : "an"} onboarding request. What they told us is filled in — check it and
              complete the rest. Submitting also closes the request.
            </span>
            <TextLink to={`/admin/onboarding-requests/${encodeURIComponent(fromRequest)}`} className="font-medium shrink-0">View the request →</TextLink>
          </Alert>
        )}
        {draftNotice && (
          <Alert tone="info" className="flex items-center justify-between gap-3">
            <span>Resumed from a saved draft. Files aren't stored in drafts — please re-attach any documents you'd uploaded before.</span>
            <Button variant="linkMuted" onClick={() => setDraftNotice(false)} className="shrink-0">Dismiss</Button>
          </Alert>
        )}
        {submitError && <Alert tone="error" role="alert">{submitError}</Alert>}
      </div>

      <div className="grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-6 items-start">
        <WizardSteps steps={STEP_LABELS} states={states} currentIndex={currentIndex} furthestIndex={furthestIndex} onStepClick={goToStep}
          aside={<Button variant="link" className="text-sm font-medium" onClick={handleSaveForLater}>Save a draft on this device</Button>} />

        <FormProvider {...form}>
          <form onSubmit={(e) => e.preventDefault()} noValidate>
            <Card as="section" aria-labelledby="step-heading" className="sm:p-6">
              <p className="font-mono-data text-xs text-[var(--muted-foreground)]">Step {currentIndex + 1} of {STEP_LABELS.length}</p>
              <h2 id="step-heading" className="text-xl font-semibold text-[var(--foreground)] mt-0.5">{STEP_LABELS[currentIndex]}</h2>
              <p className="text-sm text-[var(--muted-foreground)] mt-1 mb-6">{STEP_DESCRIPTIONS[currentIndex]}</p>
              {isLastStep ? <Step8Review onEditStep={goToStep} missing={missing} /> : <StepComponent />}
            </Card>

            <StepActions
              isFirst={currentIndex === 0}
              isSubmitting={submitting}
              backLabel={STEP_LABELS[currentIndex - 1]}
              nextLabel={isLastStep ? "Submit for verification" : `Continue: ${STEP_LABELS[currentIndex + 1]} →`}
              nextDisabled={isLastStep && missing.length > 0}
              savedNotice={savedNotice}
              onBack={() => goToStep(Math.max(0, currentIndex - 1))}
              onNext={handleNext}
              onSaveForLater={handleSaveForLater}
            />
          </form>
        </FormProvider>
      </div>
    </Page>
  );
}

// What each step is for, under its title.
const STEP_DESCRIPTIONS = [
  "As it appears on the CAC certificate. HomeTrue checks these against the documents in step 4.",
  "The person HomeTrue deals with. They become the company's first Executive Director, invited by email when you submit.",
  "How buyers and HomeTrue reach the company itself.",
  "PDF, JPG or PNG, up to 10 MB each. HomeTrue checks each one before the company is verified.",
  "The company's anti-money-laundering registration and the state and industry regulators it's registered with.",
  "Everyone on the CAC record. Anyone holding 25% or more is a beneficial owner and gets enhanced verification.",
  "The company's bank account for sale proceeds, and how it takes payments.",
  "Check everything once. Anything still missing is listed first, and submitting waits until it's fixed.",
];

// Named in the review's list where the schema's message doesn't say which.
const FIELD_NAMES: Record<string, string> = {
  cacCertificate: "CAC certificate", cacStatusReport: "CAC status report", tinDocument: "TIN document",
  proofOfAddress: "Proof of registered address", scumlCertificate: "SCUML certificate", phone: "Mobile number", companyPhone: "Company phone",
};

// Steps 1–7 with something the schema refuses, for the review: which step,
// and the first problem in it. The two confirmations on the review itself are
// checked when Submit is pressed.
export function stepsMissing(values: Partial<TenantOnboardingValues>): { step: number; message: string }[] {
  const result = tenantOnboardingSchema.safeParse(values);
  if (result.success) return [];
  const found = new Map<number, string>();
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    const step = STEP_FIELDS.findIndex((fields) => fields.some((f) => String(f).split(".")[0] === key));
    if (step >= 0 && step < STEP_LABELS.length - 1 && !found.has(step)) found.set(step, FIELD_NAMES[key] ? `${FIELD_NAMES[key]} — ${issue.message.toLowerCase().replace(/\.$/, "")}.` : issue.message);
  }
  return [...found.entries()].sort(([a], [b]) => a - b).map(([step, message]) => ({ step, message }));
}
