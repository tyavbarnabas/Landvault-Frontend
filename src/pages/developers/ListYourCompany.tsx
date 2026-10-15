// /list-your-company — the public "list your estates on HomeTrue" form. A
// developer company leaves its details and how it would like to be contacted;
// HomeTrue's team gets in touch. Nothing is created — no account, no company —
// until a Super Admin has spoken to them and converts the request.

import { useState } from "react";
import { Link } from "react-router-dom";
import { NIGERIAN_STATES, type NigerianState } from "../../data/nigerianStates";
import { CONTACT_METHODS, OnboardingError, submitOnboardingRequest, type OnboardingSubmission } from "../../services/onboardingRequestsService";
import Page from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import TextLink from "../../components/ui/TextLink";
import { ErrorText, Field, Input, Textarea, describedBy } from "../../components/ui/Field";

const EMPTY: OnboardingSubmission = {
  companyName: "", rcNumber: "", companyAddress: "", statesOfOperation: [], estimatedEstateCount: "",
  contactName: "", contactRole: "", contactEmail: "", contactPhone: "+234 ", preferredContactMethod: "", preferredContactTime: "", message: "",
};

export default function ListYourCompany() {
  const [form, setForm] = useState<OnboardingSubmission>(EMPTY);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [received, setReceived] = useState<string | null>(null);

  const set = <K extends keyof OnboardingSubmission>(key: K, value: OnboardingSubmission[K]) => setForm((f) => ({ ...f, [key]: value }));
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);
  const toggleState = (state: NigerianState) =>
    set("statesOfOperation", form.statesOfOperation.includes(state) ? form.statesOfOperation.filter((s) => s !== state) : [...form.statesOfOperation, state]);

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
    <div className="min-h-full bg-[var(--background)]">
      <nav className="border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link to="/" className="font-display text-2xl text-[var(--foreground)] tracking-tight">HomeTrue</Link>
          <div className="flex-1" />
          <TextLink to="/login" muted className="text-sm">Sign in</TextLink>
        </div>
      </nav>

      <Page title="List your estates on HomeTrue" width="lg" eyebrow="For developers"
        description="Tell us about your company and how you'd like to be contacted. Our team will speak to you before anything is set up — this form creates no account.">
        {received ? (
          <Alert tone="success" title="Request received" role="status">
            <p>{received}</p>
            <p className="mt-2"><TextLink to="/">Back to HomeTrue</TextLink></p>
          </Alert>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-6">
            <Card as="section" className="space-y-4" aria-labelledby="company-heading">
              <h2 id="company-heading" className="font-semibold text-[var(--foreground)]">Your company</h2>
              <Field id="ob-company" label="Company name" error={errorFor("companyName")}>
                <Input id="ob-company" value={form.companyName} maxLength={200} onChange={(e) => set("companyName", e.target.value)}
                  aria-describedby={describedBy("ob-company", { error: errorFor("companyName") })} autoComplete="organization" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="ob-rc" label="CAC RC number (optional)" error={errorFor("rcNumber")}>
                  <Input id="ob-rc" value={form.rcNumber} maxLength={20} placeholder="RC1234567" onChange={(e) => set("rcNumber", e.target.value)} />
                </Field>
                <Field id="ob-estates" label="Roughly how many estates? (optional)" error={errorFor("estimatedEstateCount")}>
                  <Input id="ob-estates" inputMode="numeric" value={form.estimatedEstateCount} onChange={(e) => set("estimatedEstateCount", e.target.value)} />
                </Field>
              </div>
              <Field id="ob-address" label="Office address (optional)" error={errorFor("companyAddress")}>
                <Input id="ob-address" value={form.companyAddress} maxLength={500} onChange={(e) => set("companyAddress", e.target.value)} autoComplete="street-address" />
              </Field>
              <fieldset>
                <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">States you sell land in (optional)</legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 max-h-56 overflow-y-auto border border-[var(--border)] rounded-md p-3">
                  {NIGERIAN_STATES.map((state) => (
                    <label key={state} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={form.statesOfOperation.includes(state)} onChange={() => toggleState(state)} />
                      {state}
                    </label>
                  ))}
                </div>
                {errorFor("statesOfOperation") && <p className="text-xs text-[var(--error-text)] mt-1">{errorFor("statesOfOperation")}</p>}
              </fieldset>
            </Card>

            <Card as="section" className="space-y-4" aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="font-semibold text-[var(--foreground)]">Who we should speak to</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="ob-name" label="Your name" error={errorFor("contactName")}>
                  <Input id="ob-name" value={form.contactName} maxLength={150} onChange={(e) => set("contactName", e.target.value)} autoComplete="name" />
                </Field>
                <Field id="ob-role" label="Your role (optional)" error={errorFor("contactRole")}>
                  <Input id="ob-role" value={form.contactRole} maxLength={100} placeholder="e.g. Managing Director" onChange={(e) => set("contactRole", e.target.value)} autoComplete="organization-title" />
                </Field>
                <Field id="ob-email" label="Email" error={errorFor("contactEmail")}>
                  <Input id="ob-email" type="email" value={form.contactEmail} maxLength={254} onChange={(e) => set("contactEmail", e.target.value)} autoComplete="email" />
                </Field>
                <Field id="ob-phone" label="Phone" error={errorFor("contactPhone")}>
                  <Input id="ob-phone" type="tel" value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} autoComplete="tel" />
                </Field>
              </div>
              <fieldset>
                <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">How should we contact you?</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {CONTACT_METHODS.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="contact-method" checked={form.preferredContactMethod === m.id} onChange={() => set("preferredContactMethod", m.id)} />
                      {m.label}
                    </label>
                  ))}
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
        )}
      </Page>
    </div>
  );
}
