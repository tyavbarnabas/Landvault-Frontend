import { useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { CheckboxField } from "./FormField";
import { STEP_LABELS } from "./defaultValues";

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="text-[var(--foreground)] text-right">{value}</span>
    </div>
  );
}

function fileLabel(f: File | null | undefined) {
  return f ? f.name : "— not uploaded —";
}

export default function Step8Review({ onEditStep }: { onEditStep: (index: number) => void }) {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const v = useWatch({ control }) as Partial<TenantOnboardingValues>;

  const sections: { title: string; stepIndex: number; rows: { label: string; value: React.ReactNode }[] }[] = [
    {
      title: STEP_LABELS[0], stepIndex: 0,
      rows: [
        { label: "Registered name", value: v.registeredName },
        { label: "Trading name", value: v.tradingName || v.registeredName },
        { label: "RC number", value: v.rcNumber },
        { label: "Company type", value: v.companyType },
        { label: "Incorporated", value: v.dateOfIncorporation },
        { label: "States of operation", value: v.statesOfOperation?.join(", ") },
      ],
    },
    {
      title: STEP_LABELS[1], stepIndex: 1,
      rows: [
        { label: "Name", value: v.fullName },
        { label: "Role", value: v.roleTitle },
        { label: "Work email", value: v.workEmail },
        { label: "Phone", value: v.phone },
      ],
    },
    {
      title: STEP_LABELS[2], stepIndex: 2,
      rows: [
        { label: "Company email", value: v.companyEmail },
        { label: "Company phone", value: v.companyPhone },
        { label: "Website", value: v.website },
      ],
    },
    {
      title: STEP_LABELS[3], stepIndex: 3,
      rows: [
        { label: "CAC Certificate", value: fileLabel(v.cacCertificate) },
        { label: "CAC Status Report", value: fileLabel(v.cacStatusReport) },
        { label: "TIN", value: v.tinNumber },
        { label: "TIN document", value: fileLabel(v.tinDocument) },
        { label: "Proof of address", value: fileLabel(v.proofOfAddress) },
      ],
    },
    {
      title: STEP_LABELS[4], stepIndex: 4,
      rows: [
        { label: "SCUML number", value: v.scumlNumber },
        { label: "SCUML certificate", value: fileLabel(v.scumlCertificate) },
        { label: "LASRERA number", value: v.lasreraRegNumber },
        { label: "REDAN number", value: v.redanNumber },
        { label: "Other state regulators", value: v.otherStateRegulators?.length ?? 0 },
      ],
    },
    {
      title: STEP_LABELS[5], stepIndex: 5,
      rows: [
        { label: "Directors", value: v.directors?.length ?? 0 },
        { label: "Beneficial owners (≥25%)", value: v.directors?.filter((d) => Number(d?.ownershipPct) >= 25).length ?? 0 },
        { label: "Attestation", value: v.attestation ? "Confirmed" : "Not confirmed" },
      ],
    },
    {
      title: STEP_LABELS[6], stepIndex: 6,
      rows: [
        { label: "Bank", value: v.bankName },
        { label: "Account number", value: v.accountNumber },
        { label: "Account name", value: v.accountName },
        { label: "Settlement currency", value: v.settlementCurrency },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">{section.title}</div>
            <button type="button" onClick={() => onEditStep(section.stepIndex)} className="text-xs text-[var(--accent)] font-medium hover:underline">
              Edit
            </button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {section.rows.map((r) => <SummaryRow key={r.label} {...r} />)}
          </div>
        </div>
      ))}

      <div className="space-y-3 pt-2">
        <CheckboxField
          label="I confirm the information provided in this application is accurate and complete."
          error={errors.accuracyAttestation?.message}
          {...register("accuracyAttestation")}
        />
        <CheckboxField
          label="I agree to LandVault's platform terms on behalf of this company."
          error={errors.termsAgreement?.message}
          {...register("termsAgreement")}
        />
      </div>
    </div>
  );
}
