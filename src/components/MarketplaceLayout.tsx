// A slim, public top-nav shell for the marketplace surface — deliberately
// distinct from the authenticated sidebar Layout.tsx, since these pages must
// render for anonymous visitors too. Never assumes `user` exists.
import { Suspense } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../contexts/AppContext";
import { landingRouteFor } from "../services/authService";
import ErrorBoundary from "./ErrorBoundary";
import PageLoading from "./PageLoading";
import SiteFooter from "./marketplace/SiteFooter";
import ThemeSwitch from "./ThemeSwitch";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-full flex flex-col bg-[var(--background)]">
      <header className="h-14 border-b border-[var(--border)] bg-[var(--card)] flex items-center px-4 lg:px-6 gap-4 sm:gap-6 shrink-0">
        <Link to="/" className="font-display text-lg text-[var(--foreground)] tracking-tight shrink-0">HomeTrue</Link>
        <nav className="flex items-center gap-6 flex-1 min-w-0">
          {/* Public destinations that exist; on a phone they live in the footer
              (the Day/Night switch takes the room). */}
          <Link to="/marketplace" className="hidden sm:inline text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Marketplace</Link>
          <Link to="/verify" className="hidden md:inline text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Verify a document</Link>
          <Link to="/list-your-company" className="hidden md:inline text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">List your company</Link>
        </nav>

        <ThemeSwitch />
        {isAuthenticated ? (
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <Link to="/wishlist" aria-label="Wishlist" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              <span className="hidden sm:inline">Wishlist</span>
            </Link>
            <Link to={landingRouteFor(user)} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              Dashboard
            </Link>
            <button onClick={handleLogout} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Sign out</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/login" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Sign in</Link>
            <Link to="/register" className="text-sm px-3 sm:px-4 py-2 whitespace-nowrap bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">Create account</Link>
          </div>
        )}
      </header>

      <main className="flex-1">
        <ErrorBoundary section="this page" key={location.pathname}>
          <Suspense fallback={<PageLoading />}>{children}</Suspense>
        </ErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  );
}
