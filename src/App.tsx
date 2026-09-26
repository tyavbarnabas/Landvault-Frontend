import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AppProvider, useApp } from "./contexts/AppContext";
import Layout from "./components/Layout";
import MarketplaceLayout from "./components/MarketplaceLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoading from "./components/PageLoading";

// Auth — kept eager: the first thing an unauthenticated visitor hits, so
// there's nothing to gain by chunking it separately.
import Landing from "./pages/Landing";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";

// Onboarding — lazy: a one-time wizard most sessions never load.
const KYC = lazy(() => import("./pages/onboarding/KYC"));

// Core app
import Dashboard from "./pages/Dashboard";
import Browse from "./pages/estates/Browse";
import EstateDetail from "./pages/estates/EstateDetail";
import Portfolio from "./pages/portfolio/Portfolio";
import PlotView from "./pages/portfolio/PlotView";
import Vault from "./pages/documents/Vault";
import Settings from "./pages/settings/Settings";

// Upgrade / swap
import Upgrade, { UpgradeRequestDetail } from "./pages/upgrade/Upgrade";

// Resale — seller workspace only (buyer-side browsing lives in the unified
// /marketplace feed; /resale itself redirects there, see below)
import { MyListings, ListPlot, ResaleTransferDetail } from "./pages/resale/Resale";

// Syndicates
import { SyndicateList, CreateSyndicate, SyndicateDetail } from "./pages/syndicate/Syndicate";

// Support
import Support from "./pages/support/Support";

// Super Admin (platform operator console) — lazy: an entire surface a
// client-role session never navigates into at all.
const PortalEstateList = lazy(() => import("./pages/portal/estates/PortalEstateList"));
const CreatePortalEstate = lazy(() => import("./pages/portal/estates/CreatePortalEstate"));
const PortalEstateDetail = lazy(() => import("./pages/portal/estates/PortalEstateDetail"));
const PortalEstateInventory = lazy(() => import("./pages/portal/estates/PortalEstateInventory"));
const CreatePortalPlots = lazy(() => import("./pages/portal/estates/CreatePortalPlots"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const TenantDirectory = lazy(() => import("./pages/admin/tenants/TenantDirectory"));
const CreateTenant = lazy(() => import("./pages/admin/tenants/CreateTenant"));
const TenantDetail = lazy(() => import("./pages/admin/tenants/TenantDetail"));
const ListingConflicts = lazy(() => import("./pages/admin/marketplace/ListingConflicts"));

// Public marketplace — lazy: its own surface (distinct layout, often entered
// anonymously straight from a shared link) rather than something every
// session touches on first load.
const MarketplaceFeed = lazy(() => import("./pages/marketplace/MarketplaceFeed"));
const MarketplaceEstateDetail = lazy(() => import("./pages/marketplace/MarketplaceEstateDetail"));
const MarketplaceResaleDetail = lazy(() => import("./pages/marketplace/MarketplaceResaleDetail"));
const MarketplacePlotSelection = lazy(() => import("./pages/marketplace/MarketplacePlotSelection"));
const MarketplaceCheckout = lazy(() => import("./pages/marketplace/MarketplaceCheckout"));
const Wishlist = lazy(() => import("./pages/marketplace/Wishlist"));

// Inspections & enquiries (buyer flow, Parts 3–4)
import NewInspection from "./pages/inspections/NewInspection";
import Inspections from "./pages/inspections/Inspections";
import Enquiries from "./pages/enquiries/Enquiries";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useApp();
  const location = useLocation();
  return isAuthenticated ? <>{children}</> : <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname)}`} replace />;
}

// Estate ids and plot ids are shared between /estates and /marketplace now
// (one canonical Estate/Plot model — see landvault-catalogue-unification-plan
// in project memory), so the same two params carry straight over.
function CheckoutRedirect() {
  const { estateId, plotId } = useParams<{ estateId: string; plotId: string }>();
  return <Navigate to={`/marketplace/checkout/${estateId}/${plotId}`} replace />;
}

function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <PrivateRoute>
      <Layout>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </Layout>
    </PrivateRoute>
  );
}

// Same login point as everyone else — this just also requires the "super_admin"
// role the login response came back with. A client account is bounced to its
// own dashboard rather than an error, since this isn't a page that exists for them.
// The portal is gated on its permission, not on a role check, so a future
// account that holds portal.estates.view alongside another role still reaches
// it — same mechanism the nav already uses.
function PortalRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.permissions?.includes("portal.estates.view")) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PortalPage({ children }: { children: React.ReactNode }) {
  return (
    <PortalRoute>
      <Layout>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </Layout>
    </PortalRoute>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AdminPage({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <Layout>
        <Suspense fallback={<PageLoading />}>{children}</Suspense>
      </Layout>
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
      <Route path="/onboarding/kyc" element={<Suspense fallback={<PageLoading />}><KYC /></Suspense>} />

      {/* Checkout — the legacy internal flow is retired; MarketplaceCheckout
          is the one purchase path now that estates/marketplace share one
          canonical plot model (see landvault-catalogue-unification-plan in
          project memory). Redirect keeps existing links working. */}
      <Route path="/checkout/:estateId/:plotId" element={<CheckoutRedirect />} />

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
      <Route path="/upgrade/request/:requestId" element={<AppPage><UpgradeRequestDetail /></AppPage>} />

      {/* Resale — /resale as a browse destination is retired; the unified
          marketplace feed replaces it. Redirect keeps existing links working. */}
      <Route path="/resale" element={<Navigate to="/marketplace?type=resale" replace />} />
      <Route path="/resale/my-listings" element={<AppPage><MyListings /></AppPage>} />
      <Route path="/resale/list/:plotId" element={<AppPage><ListPlot /></AppPage>} />
      <Route path="/resale/transfer/:transferId" element={<AppPage><ResaleTransferDetail /></AppPage>} />

      {/* Syndicates */}
      <Route path="/syndicates" element={<AppPage><SyndicateList /></AppPage>} />
      <Route path="/syndicates/new" element={<AppPage><CreateSyndicate /></AppPage>} />
      <Route path="/syndicates/:id" element={<AppPage><SyndicateDetail /></AppPage>} />

      {/* Support */}
      <Route path="/support" element={<AppPage><Support /></AppPage>} />

      {/* Public marketplace — the 4th surface; browsable anonymously */}
      <Route path="/marketplace" element={<MarketplaceLayout><MarketplaceFeed /></MarketplaceLayout>} />
      <Route path="/marketplace/:estateId" element={<MarketplaceLayout><MarketplaceEstateDetail /></MarketplaceLayout>} />
      <Route path="/marketplace/resale/:listingId" element={<MarketplaceLayout><MarketplaceResaleDetail /></MarketplaceLayout>} />
      <Route path="/marketplace/:estateId/plots" element={<MarketplaceLayout><MarketplacePlotSelection /></MarketplaceLayout>} />
      <Route path="/wishlist" element={<MarketplaceLayout><PrivateRoute><Wishlist /></PrivateRoute></MarketplaceLayout>} />

      {/* Marketplace checkout — no sidebar, same convention as /checkout */}
      <Route path="/marketplace/checkout/:listingId/:plotId" element={<PrivateRoute><Suspense fallback={<PageLoading />}><MarketplaceCheckout /></Suspense></PrivateRoute>} />

      {/* Inspections & enquiries — Parts 3–4 of the buyer flow */}
      <Route path="/inspections/new" element={<PrivateRoute><NewInspection /></PrivateRoute>} />
      <Route path="/inspections" element={<AppPage><Inspections /></AppPage>} />
      <Route path="/enquiries" element={<AppPage><Enquiries /></AppPage>} />

      {/* Super Admin (platform operator console — same login point, gated by role) */}
      {/* Developer portal — a company managing its own estates */}
      <Route path="/portal" element={<Navigate to="/portal/estates" replace />} />
      <Route path="/portal/estates" element={<PortalPage><PortalEstateList /></PortalPage>} />
      <Route path="/portal/estates/new" element={<PortalPage><CreatePortalEstate /></PortalPage>} />
      <Route path="/portal/estates/:estateId" element={<PortalPage><PortalEstateDetail /></PortalPage>} />
      <Route path="/portal/estates/:estateId/inventory" element={<PortalPage><PortalEstateInventory /></PortalPage>} />
      <Route path="/portal/estates/:estateId/plots/new" element={<PortalPage><CreatePortalPlots /></PortalPage>} />

      <Route path="/admin/dashboard" element={<AdminPage><AdminDashboard /></AdminPage>} />
      <Route path="/admin/tenants" element={<AdminPage><TenantDirectory /></AdminPage>} />
      <Route path="/admin/tenants/new" element={<AdminPage><CreateTenant /></AdminPage>} />
      <Route path="/admin/tenants/:id" element={<AdminPage><TenantDetail /></AdminPage>} />
      <Route path="/admin/listing-conflicts" element={<AdminPage><ListingConflicts /></AdminPage>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary section="LandVault">
      <BrowserRouter>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
