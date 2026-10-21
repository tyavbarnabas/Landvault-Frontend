// The wizard's last step: everything entered, as cards with Edit links,
// anything still missing first, and what submitting will do.

import { useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { CheckboxField } from "./FormField";
import { STEP_LABELS } from "./defaultValues";
import Card from "../../../../components/ui/Card";
import Alert from "../../../../components/ui/Alert";
import Button from "../../../../components/ui/Button";
import { showInternational } from "../../../../lib/phone";

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
  return f ? f.name : "Not uploaded";
}

export default function Step8Review({ onEditStep, missing }: { onEditStep: (index: number) => void; missing: { step: number; message: string }[] }) {
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
        { label: "Name", value: v.firstName || v.lastName ? `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim() : undefined },
        { label: "Role", value: v.roleTitle },
        { label: "Work email", value: v.workEmail },
        { label: "Mobile", value: v.phone ? showPhone(v.phone) : undefined },
      ],
    },
    {
      title: STEP_LABELS[2], stepIndex: 2,
      rows: [
        { label: "Company email", value: v.companyEmail },
        { label: "Company phone", value: v.companyPhone ? showPhone(v.companyPhone) : undefined },
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

  const company = v.tradingName || v.registeredName || "The company";
  const contact = [v.firstName, v.lastName].filter(Boolean).join(" ") || "the primary contact";

  return (
    <div className="space-y-5">
      {missing.length > 0 && (
        <Alert tone="error" title={`${missing.length} ${missing.length === 1 ? "step needs" : "steps need"} attention before you can submit`}>
          <ul className="mt-1 space-y-1">
            {missing.map((m) => (
              <li key={m.step} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{STEP_LABELS[m.step]}:</span> {m.message}
                <Button variant="link" className="text-sm font-medium" onClick={() => onEditStep(m.step)}>Fix it →</Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {sections.map((section) => {
          const needsFix = missing.some((m) => m.step === section.stepIndex);
          return (
            <Card key={section.title} as="section" padding="md" className={needsFix ? "border-[var(--error-border)]" : undefined}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{section.title}</h3>
                <Button variant="link" className="text-sm font-medium" onClick={() => onEditStep(section.stepIndex)} aria-label={`Edit ${section.title}`}>Edit</Button>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {section.rows.map((r) => <SummaryRow key={r.label} {...r} />)}
              </div>
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="submit-heading" className="rounded-xl bg-[var(--secondary)] p-5">
        <h3 id="submit-heading" className="text-sm font-semibold text-[var(--foreground)] mb-3">When you submit</h3>
        <ol className="space-y-2">
          {[
            `${company} is created as a draft company.`,
            `${contact} is invited by email as its first Executive Director.`,
            "It goes to HomeTrue's verification with these documents. Converting a request also closes it.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-[var(--foreground)]">
              <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-3">
        <CheckboxField
          label="I confirm the information provided in this application is accurate and complete."
          error={errors.accuracyAttestation?.message}
          {...register("accuracyAttestation")}
        />
        <CheckboxField
          label="I agree to HomeTrue's platform terms on behalf of this company."
          error={errors.termsAgreement?.message}
          {...register("termsAgreement")}
        />
      </div>
    </div>
  );
}

const showPhone = showInternational;
