// Where `mustSetUpTwoFa` routes to. True for platform staff, who hold the
// platform-scope RLS bypass and for whom a password alone is too thin.
//
// ROUTED, NOT BLOCKED. Login deliberately succeeds without 2FA, because
// blocking would strand the bootstrapped Super Admin, who cannot set up 2FA
// without signing in first. So this screen is somewhere the user is SENT, and
// they can leave it — the requirement is met by finishing, not by trapping them.
// Laid out from the Figma "Sign-in & landing" proposal.

import { useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { landingRouteFor } from "../../services/authService";
import TwoFactorSetup from "../../components/auth/TwoFactorSetup";
import Page from "../../components/ui/Page";

export default function TwoFactorSetupPage() {
  const navigate = useNavigate();
  const { user } = useApp();
  const home = landingRouteFor(user);

  return (
    <Page
      width="sm"
      title="Set up two-factor authentication"
      description={user?.mustSetUpTwoFa
        ? "Your account has platform-wide access, so it needs a code as well as a password."
        : "Add a second step to signing in, so your password alone isn't enough."}
    >
      <TwoFactorSetup onEnabled={() => navigate(home)} onCancel={() => navigate(home)} />

      {user?.mustSetUpTwoFa && (
        <p className="text-xs text-[var(--muted-foreground)] mt-4">
          You can carry on without finishing this for now, but you'll be brought back here next time you sign in.
        </p>
      )}
    </Page>
  );
}
