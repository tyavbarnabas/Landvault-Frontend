import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tenantOnboardingSchema, type TenantOnboardingValues, isBeneficialOwner } from "../../../../lib/onboarding/schema";
import { getOnboardingDefaultValues, STEP_FIELDS, STEP_LABELS } from "./defaultValues";
import StepProgress from "../../../../components/onboarding/StepProgress";
import { StepActions } from "./FormField";
import { createTenantDraft, submitForVerification, type Director, type Regulatory, type TenantDocument, type FinancialSettlement } from "../../../../services/tenantsService";

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

function saveDraft(values: TenantOnboardingValues) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values, stripFiles));
  } catch {
    // Best-effort only — private browsing / full storage shouldn't block onboarding.
  }
}

function loadDraft(): Partial<TenantOnboardingValues> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

const STEPS = [Step1CompanyIdentity, Step2PrimaryContact, Step3ContactPresence, Step4Documents, Step5Regulatory, Step6Directors, Step7Financial];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const form = useForm<TenantOnboardingValues>({
    resolver: zodResolver(tenantOnboardingSchema),
    defaultValues: getOnboardingDefaultValues(),
    mode: "onSubmit",
  });
  const { trigger, getValues, reset } = form;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [furthestIndex, setFurthestIndex] = useState(0);
  const [draftNotice, setDraftNotice] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      reset({ ...getOnboardingDefaultValues(), ...draft });
      setDraftNotice(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveForLater = () => {
    saveDraft(getValues());
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

  const handleSubmitForVerification = async () => {
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
      fullName: d.fullName,
      role: d.role,
      nationality: d.nationality,
      idType: d.idType,
      idNumber: d.idNumber,
      bvn: d.bvn || undefined,
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
    const tenant = await createTenantDraft({
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
      primaryContact: { fullName: v.fullName, roleTitle: v.roleTitle, workEmail: v.workEmail, phone: v.phone, govIdType: v.govIdType, govIdNumber: v.govIdNumber },
      presence: { companyEmail: v.companyEmail, companyPhone: v.companyPhone, website: v.website || undefined, socials: v.socials },
      plan: "starter",
    });

    await submitForVerification(tenant.id, { documents, regulatory, directors, directorsAttestation: v.attestation, financial });

    clearDraft();
    setSubmitting(false);
    navigate(`/admin/tenants/${tenant.id}`);
  };

  const isLastStep = currentIndex === STEP_LABELS.length - 1;
  const StepComponent = STEPS[currentIndex];

  return (
    <div className="p-6 max-w-3xl mx-auto pb-16">
      {draftNotice && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-center justify-between">
          <span>Resumed from a saved draft. Files aren't stored in drafts — please re-attach any documents you'd uploaded before.</span>
          <button type="button" onClick={() => setDraftNotice(false)} className="text-blue-800 font-medium ml-3 shrink-0">Dismiss</button>
        </div>
      )}
      {savedNotice && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">Draft saved — you can come back and continue later.</div>
      )}

      <StepProgress steps={STEP_LABELS} currentIndex={currentIndex} furthestIndex={furthestIndex} onStepClick={goToStep} />

      <FormProvider {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          {isLastStep ? <Step8Review onEditStep={goToStep} /> : <StepComponent />}

          <StepActions
            isFirst={currentIndex === 0}
            isSubmitting={submitting}
            nextLabel={isLastStep ? "Submit for verification" : "Continue"}
            onBack={() => goToStep(Math.max(0, currentIndex - 1))}
            onNext={handleNext}
            onSaveForLater={handleSaveForLater}
          />
        </form>
      </FormProvider>
    </div>
  );
}
