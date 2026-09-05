import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useApp } from "../contexts/AppContext"

// One nav config for the whole app, not a per-role branch. Every item names
// the permission it needs; Layout below renders only what the signed-in
// user's `permissions` actually grant (and drops any section left empty),
// which is the same mechanism a real per-user RBAC/permission system would
// slot into later (see DP-1.4 / SA-2.1) — a client and a Super Admin sharing
// one login point just end up with different permission sets, not different code paths.
const NAV_SECTIONS = [
  {
    label: "Main",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: GridIcon, permission: "client.dashboard.view" },
      { path: "/marketplace", label: "Marketplace", icon: TagIcon, permission: "client.marketplace.view" },
      { path: "/estates", label: "Estates", icon: MapIcon, permission: "client.estates.view" },
    ],
  },
  {
    label: "My account",
    items: [
      { path: "/portfolio", label: "Portfolio", icon: BriefcaseIcon, permission: "client.portfolio.view" },
      { path: "/documents", label: "Vault", icon: FolderIcon, permission: "client.documents.view" },
      { path: "/inspections", label: "Inspections", icon: CalendarIcon, permission: "client.inspections.view" },
      { path: "/enquiries", label: "Enquiries", icon: ChatIcon, permission: "client.enquiries.view" },
      { path: "/syndicates", label: "Co-ownership", icon: UsersIcon, permission: "client.syndicates.view" },
    ],
  },
  {
    label: "Account",
    items: [
      { path: "/support", label: "Support", icon: ChatIcon, permission: "client.support.view" },
      { path: "/settings", label: "Settings", icon: GearIcon, permission: "client.settings.view" },
    ],
  },
  {
    label: "Platform",
    items: [
      { path: "/admin/dashboard", label: "Dashboard", icon: GridIcon, permission: "admin.dashboard.view" },
      { path: "/admin/tenants", label: "Tenants", icon: BriefcaseIcon, permission: "admin.tenants.view" },
    ],
  },
]

function GridIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}
function MapIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
      <path d="M9 3v16M15 5v16" />
    </svg>
  )
}
function TagIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line
        x1="7"
        y1="7"
        x2="7.01"
        y2="7"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
function BriefcaseIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function ChatIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    user,
    logout,
    notifications,
    markNotificationRead,
    currency,
    setCurrency,
  } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)

  const unread = notifications.filter((n) => !n.read).length
  const isSuperAdmin = user?.role === "super_admin"

  const visibleNavSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => user?.permissions?.includes(item.permission)),
    }))
    .filter((section) => section.items.length > 0)

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex h-full bg-[var(--background)]">
      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-56 bg-[var(--primary)] flex flex-col
          transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:relative lg:translate-x-0 lg:flex
        `}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <span className="font-display text-xl text-white tracking-tight">
            LandVault
          </span>
          <span className="block text-[10px] text-white/40 mt-0.5 font-mono-data uppercase tracking-wider">
            {isSuperAdmin ? "Platform Console" : "Real Estate Platform"}
          </span>
        </div>

        {/* KYC pill (client accounts only — not meaningful for the platform operator) */}
        {!isSuperAdmin && user?.kycStatus === "approved" && (
          <div className="mx-3 mt-3 px-3 py-1.5 bg-white/8 rounded-md flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[11px] text-white/70">KYC verified</span>
          </div>
        )}
        {!isSuperAdmin && user?.kycStatus === "under_review" && (
          <div className="mx-3 mt-3 px-3 py-1.5 bg-amber-500/20 rounded-md flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[11px] text-white/70">KYC under review</span>
          </div>
        )}

        {/* Nav — rendered from whatever the signed-in user's permissions grant */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-4">
          {visibleNavSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map(({ path, label, icon: Icon }) => {
                  const active =
                    location.pathname === path ||
                    (path !== "/dashboard" &&
                      location.pathname.startsWith(path))
                  return (
                    <Link
                      key={path}
                      to={path}
                      onClick={() => setMobileOpen(false)}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors
                        ${
                          active
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/55 hover:bg-white/8 hover:text-white/85"
                        }
                      `}
                    >
                      <Icon />
                      {label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">
                {user?.name}
              </div>
              <div className="text-[10px] text-white/40 truncate">
                {user?.country} · {user?.currency}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-[11px] text-white/35 hover:text-white/60 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="h-13 border-b border-[var(--border)] bg-[var(--card)] flex items-center px-4 lg:px-5 gap-3 shrink-0"
          style={{ height: "52px" }}
        >
          <button
            className="lg:hidden text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => setMobileOpen(true)}
          >
            <svg
              width="19"
              height="19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Page breadcrumb placeholder */}
          <div className="flex-1" />

          {/* Currency (client accounts only — a display preference for buyers, not the platform operator) */}
          {!isSuperAdmin && (
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="text-xs font-mono-data bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] rounded px-2 py-1.5 cursor-pointer"
            >
              <option value="NGN">NGN ₦</option>
              <option value="USD">USD $</option>
              <option value="GBP">GBP £</option>
              <option value="EUR">EUR €</option>
            </select>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <BellIcon />
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent)]" />
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-11 w-80 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unread > 0 && (
                    <span className="text-xs text-[var(--accent)] font-medium">
                      {unread} unread
                    </span>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-[var(--muted)] transition-colors ${
                        !n.read ? "bg-[var(--secondary)]" : ""
                      }`}
                    >
                      <div className="text-xs font-medium flex items-start gap-2">
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0 mt-1" />
                        )}
                        {n.title}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                        {n.body}
                      </div>
                      <div className="text-[10px] text-[var(--muted-foreground)] mt-1 font-mono-data">
                        {n.date}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
