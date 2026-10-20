// /list-your-company — the public "list your estates on HomeTrue" form. A
// developer company leaves its details and how it would like to be contacted;
// HomeTrue's team gets in touch. Nothing is created — no account, no company —
// until a Super Admin has spoken to them and converts the request.
//
// Laid out from the Figma "KYC, list your company, verify" proposal: why
// and what happens next beside the form, inside the site's own header.

import { useState } from "react";
import { CONTACT_METHODS, OnboardingError, submitOnboardingRequest, type OnboardingSubmission } from "../../services/onboardingRequestsService";
import Card from "../../components/ui/Card";
import Button, { LinkButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { MultiStateSelect } from "../../components/onboarding/StateSelect";
import IntlPhoneInput from "../../components/onboarding/IntlPhoneInput";
import { CheckIcon, GridIcon, MessageIcon, ReceiptIcon, ShieldCheckIcon, UsersIcon } from "../../components/icons";
import { ErrorText, Field, Input, Textarea, describedBy } from "../../components/ui/Field";

const EMPTY: OnboardingSubmission = {
  companyName: "", rcNumber: "", companyAddress: "", statesOfOperation: [], estimatedEstateCount: "",
  contactName: "", contactRole: "", contactEmail: "", contactPhone: "", preferredContactMethod: "", preferredContactTime: "", message: "",
};

export default function ListYourCompany() {
  const [form, setForm] = useState<OnboardingSubmission>(EMPTY);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [received, setReceived] = useState<string | null>(null);

  const set = <K extends keyof OnboardingSubmission>(key: K, value: OnboardingSubmission[K]) => setForm((f) => ({ ...f, [key]: value }));
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      setReceived(await submitOnboardingRequest(form));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof OnboardingError ? { field: err.field, message: err.message } : { field: "form", message: "That didn't go through. Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
      {received ? (
        <Card className="max-w-xl mx-auto text-center py-10 space-y-3" role="status">
          <span className="w-12 h-12 mx-auto rounded-xl bg-[var(--success-surface)] text-[var(--success-text)] flex items-center justify-center"><CheckIcon size={24} /></span>
          <h1 className="font-display text-3xl text-[var(--foreground)]">Request received</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{received}</p>
          <p className="text-sm text-[var(--muted-foreground)]">Nothing has been set up yet, and nothing is on the marketplace.</p>
          <LinkButton to="/" variant="secondary">Back to HomeTrue</LinkButton>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-10 items-start">
          <div className="space-y-6 lg:sticky lg:top-6">
            <div>
              <p className="font-mono-data text-xs tracking-widest text-[var(--accent)] mb-2">FOR DEVELOPERS</p>
              <h1 className="font-display text-4xl leading-tight text-[var(--foreground)] mb-3">Sell your estates to buyers across Nigeria and abroad</h1>
              <p className="text-[var(--muted-foreground)]">
                Tell us about your company. Our team speaks to you first — this form creates no account and puts nothing on the marketplace.
              </p>
            </div>
            <ul className="space-y-4">
              {WHY.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><Icon size={18} /></span>
                  <span>
                    <span className="block text-sm font-semibold text-[var(--foreground)]">{title}</span>
                    <span className="block text-sm text-[var(--muted-foreground)]">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
            <section aria-labelledby="next-heading" className="rounded-xl bg-[var(--secondary)] p-5">
              <h2 id="next-heading" className="text-sm font-semibold text-[var(--foreground)] mb-3">What happens next</h2>
              <ol className="space-y-2.5">
                {NEXT.map((t, i) => (
                  <li key={t} className="flex gap-2.5 text-sm text-[var(--foreground)]">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <form onSubmit={submit} noValidate className="space-y-5">
            <Card as="section" className="space-y-4 sm:p-6" aria-labelledby="company-heading">
              <h2 id="company-heading" className="font-semibold text-[var(--foreground)]">Your company</h2>
              <Field id="ob-company" label="Company name" error={errorFor("companyName")}>
                <Input id="ob-company" value={form.companyName} maxLength={200} onChange={(e) => set("companyName", e.target.value)}
                  aria-describedby={describedBy("ob-company", { error: errorFor("companyName") })} autoComplete="organization" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="ob-rc" label="CAC RC number (optional)" error={errorFor("rcNumber")}>
                  <Input id="ob-rc" value={form.rcNumber} maxLength={20} placeholder="RC1234567" onChange={(e) => set("rcNumber", e.target.value)} />
                </Field>
                <Field id="ob-estates" label="How many estates? (optional)" error={errorFor("estimatedEstateCount")}>
                  <Input id="ob-estates" inputMode="numeric" value={form.estimatedEstateCount} onChange={(e) => set("estimatedEstateCount", e.target.value)} />
                </Field>
              </div>
              <Field id="ob-address" label="Office address (optional)" error={errorFor("companyAddress")}>
                <Input id="ob-address" value={form.companyAddress} maxLength={500} onChange={(e) => set("companyAddress", e.target.value)} autoComplete="street-address" />
              </Field>
              <MultiStateSelect label="States you sell land in (optional)" values={form.statesOfOperation}
                onChange={(next) => set("statesOfOperation", next)} error={errorFor("statesOfOperation")} />
            </Card>

            <Card as="section" className="space-y-4 sm:p-6" aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="font-semibold text-[var(--foreground)]">Who we should speak to</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="ob-name" label="Your name" error={errorFor("contactName")}>
                  <Input id="ob-name" value={form.contactName} maxLength={150} onChange={(e) => set("contactName", e.target.value)} autoComplete="name" />
                </Field>
                <Field id="ob-role" label="Your role (optional)" error={errorFor("contactRole")}>
                  <Input id="ob-role" value={form.contactRole} maxLength={100} placeholder="e.g. Managing Director" onChange={(e) => set("contactRole", e.target.value)} autoComplete="organization-title" />
                </Field>
              </div>
              <Field id="ob-email" label="Email" error={errorFor("contactEmail")}>
                <Input id="ob-email" type="email" value={form.contactEmail} maxLength={254} onChange={(e) => set("contactEmail", e.target.value)} autoComplete="email" />
              </Field>
              <IntlPhoneInput id="ob-phone" label="Phone" value={form.contactPhone} onChange={(v) => set("contactPhone", v)} error={errorFor("contactPhone")}
                purpose="Only used to talk to you about listing." />
              <fieldset>
                <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">How should we contact you?</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONTACT_METHODS.map((m) => {
                    const Icon = METHOD_ICONS[m.id];
                    const on = form.preferredContactMethod === m.id;
                    return (
                      <label key={m.id} className={cx("flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm cursor-pointer text-center focus-within:shadow-[0_0_0_2px_var(--ring)]",
                        on ? "border-[var(--ring)] bg-[var(--secondary)] font-medium" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")}>
                        <input type="radio" name="contact-method" className="sr-only" checked={on} onChange={() => set("preferredContactMethod", m.id)} />
                        <span className="text-[var(--primary)]"><Icon size={18} /></span>
                        {m.label}
                      </label>
                    );
                  })}
                </div>
                {errorFor("preferredContactMethod") && <p className="text-xs text-[var(--error-text)] mt-1">{errorFor("preferredContactMethod")}</p>}
              </fieldset>
              <Field id="ob-time" label="When suits you? (optional)" error={errorFor("preferredContactTime")}>
                <Input id="ob-time" value={form.preferredContactTime} maxLength={200} placeholder="e.g. Weekdays after 2pm" onChange={(e) => set("preferredContactTime", e.target.value)} />
              </Field>
              <Field id="ob-message" label="Anything else we should know? (optional)" error={errorFor("message")}>
                <Textarea id="ob-message" rows={4} value={form.message} maxLength={2000} onChange={(e) => set("message", e.target.value)} />
              </Field>
            </Card>

            {/* Also here for a field error, which may be scrolled out of view. */}
            {error && <ErrorText>{error.message}</ErrorText>}
            <Button type="submit" size="lg" disabled={sending}>{sending ? "Sending…" : "Send request"}</Button>
          </form>
        </div>
      )}
    </div>
  );
}

const WHY = [
  { icon: ShieldCheckIcon, title: "A verified badge buyers trust", body: "Your company, titles and land are checked, then shown on every listing." },
  { icon: ReceiptIcon, title: "Payments, receipts and letters handled", body: "Buyers pay through HomeTrue; receipts and allocation letters are issued for you." },
  { icon: GridIcon, title: "Your plots on a live map", body: "Buyers choose the exact plot, and a plot can't be sold twice." },
];

const NEXT = [
  "We contact you the way you choose — usually within 2 working days.",
  "We onboard your company and check its documents with you.",
  "You add your estates; they go live once everything is verified.",
];

function PhoneIcon(p: { size?: number }) {
  return <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></svg>;
}

function MailIcon(p: { size?: number }) {
  return <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-10 6L2 7" /></svg>;
}

const METHOD_ICONS: Record<string, (p: { size?: number }) => React.ReactElement> = {
  phone: PhoneIcon, whatsapp: MessageIcon, email: MailIcon, meeting: UsersIcon,
};
