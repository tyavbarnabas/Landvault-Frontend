// A slim, public top-nav shell for the marketplace surface — deliberately
// distinct from the authenticated sidebar Layout.tsx, since these pages must
// render for anonymous visitors too. Never assumes `user` exists.
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../contexts/AppContext";

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useApp();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-full flex flex-col bg-[var(--background)]">
      <header className="h-14 border-b border-[var(--border)] bg-[var(--card)] flex items-center px-4 lg:px-6 gap-6 shrink-0">
        <Link to="/" className="font-display text-lg text-[var(--foreground)] tracking-tight shrink-0">LandVault</Link>
        <nav className="flex items-center gap-4 flex-1">
          <Link to="/marketplace" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Marketplace</Link>
        </nav>

        {isAuthenticated ? (
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/wishlist" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              Wishlist
            </Link>
            <Link to={user?.role === "super_admin" ? "/admin/dashboard" : "/dashboard"} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              Dashboard
            </Link>
            <button onClick={handleLogout} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Sign out</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/login" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Sign in</Link>
            <Link to="/register" className="text-sm px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">Get started</Link>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
