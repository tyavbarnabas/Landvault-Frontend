import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./contexts/AppContext";
import Layout from "./components/Layout";

// Auth
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";

// Onboarding
import KYC from "./pages/onboarding/KYC";

// Core app
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/estates/Browse";
import EstateDetail from "./pages/estates/EstateDetail";
import Checkout from "./pages/checkout/Checkout";
import Portfolio from "./pages/portfolio/Portfolio";
import PlotView from "./pages/portfolio/PlotView";
import Vault from "./pages/documents/Vault";
import Settings from "./pages/settings/Settings";

// Upgrade / swap
import Upgrade from "./pages/upgrade/Upgrade";

// Resale
import { ResaleMarketplace, MyListings, ListPlot } from "./pages/resale/Resale";

// Syndicates
import { SyndicateList, CreateSyndicate, SyndicateDetail } from "./pages/syndicate/Syndicate";

// Support
import Support from "./pages/support/Support";

// Super Admin (platform operator console)
import AdminDashboard from "./pages/admin/Dashboard";
import TenantDirectory from "./pages/admin/tenants/TenantDirectory";
import CreateTenant from "./pages/admin/tenants/CreateTenant";
import TenantDetail from "./pages/admin/tenants/TenantDetail";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useApp();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <PrivateRoute>
      <Layout>{children}</Layout>
    </PrivateRoute>
  );
}

// Same login point as everyone else — this just also requires the "super_admin"
// role the login response came back with. A client account is bounced to its
// own dashboard rather than an error, since this isn't a page that exists for them.
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <Layout>{children}</Layout>
    </AdminRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/onboarding/kyc" element={<KYC />} />

      {/* Checkout (no sidebar) */}
      <Route path="/checkout/:estateId/:plotId" element={<PrivateRoute><Checkout /></PrivateRoute>} />

      {/* Core app */}
      <Route path="/dashboard" element={<AppPage><Dashboard /></AppPage>} />
      <Route path="/estates" element={<AppPage><Browse /></AppPage>} />
      <Route path="/estates/:id" element={<AppPage><EstateDetail /></AppPage>} />
      <Route path="/portfolio" element={<AppPage><Portfolio /></AppPage>} />
      <Route path="/portfolio/:id" element={<AppPage><PlotView /></AppPage>} />
      <Route path="/documents" element={<AppPage><Vault /></AppPage>} />
      <Route path="/settings" element={<AppPage><Settings /></AppPage>} />

      {/* Upgrade / swap */}
      <Route path="/upgrade/:id" element={<AppPage><Upgrade /></AppPage>} />

      {/* Resale */}
      <Route path="/resale" element={<AppPage><ResaleMarketplace /></AppPage>} />
      <Route path="/resale/my-listings" element={<AppPage><MyListings /></AppPage>} />
      <Route path="/resale/list/:plotId" element={<AppPage><ListPlot /></AppPage>} />

      {/* Syndicates */}
      <Route path="/syndicates" element={<AppPage><SyndicateList /></AppPage>} />
      <Route path="/syndicates/new" element={<AppPage><CreateSyndicate /></AppPage>} />
      <Route path="/syndicates/:id" element={<AppPage><SyndicateDetail /></AppPage>} />

      {/* Support */}
      <Route path="/support" element={<AppPage><Support /></AppPage>} />

      {/* Super Admin (platform operator console — same login point, gated by role) */}
      <Route path="/admin/dashboard" element={<AdminPage><AdminDashboard /></AdminPage>} />
      <Route path="/admin/tenants" element={<AdminPage><TenantDirectory /></AdminPage>} />
      <Route path="/admin/tenants/new" element={<AdminPage><CreateTenant /></AdminPage>} />
      <Route path="/admin/tenants/:id" element={<AdminPage><TenantDetail /></AdminPage>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
