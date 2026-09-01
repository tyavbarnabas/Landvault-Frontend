// SA-1.1 — onboard a company tenant. The actual 8-step wizard lives in
// ./onboarding/; this file just keeps the /admin/tenants/new route stable.
import OnboardingWizard from "./onboarding/OnboardingWizard";

export default function CreateTenant() {
  return <OnboardingWizard />;
}
