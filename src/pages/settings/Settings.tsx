import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import type { Currency } from "../../data/mockData";

type Tab = "profile" | "security" | "notifications" | "sessions";

export default function Settings() {
  const { user, currency, setCurrency } = useApp();
  const [tab, setTab] = useState<Tab>("profile");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "security", label: "Security & 2FA" },
    { id: "notifications", label: "Notifications" },
    { id: "sessions", label: "Active sessions" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Settings</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Manage your account, security, and preferences.</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar tabs */}
        <nav className="space-y-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${tab === t.id ? "bg-[var(--secondary)] font-medium text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="lg:col-span-3">
          {tab === "profile" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="font-semibold mb-5">Profile information</h2>

              {/* KYC status */}
              <div className={`mb-5 px-4 py-3 rounded-xl border flex items-center gap-3 ${user?.kycStatus === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${user?.kycStatus === "approved" ? "bg-emerald-500" : "bg-amber-500"}`} />
                <div>
                  <div className={`text-sm font-medium ${user?.kycStatus === "approved" ? "text-emerald-900" : "text-amber-900"}`}>
                    {user?.kycStatus === "approved" ? "Identity verified" : "KYC pending"}
                  </div>
                  <div className={`text-xs ${user?.kycStatus === "approved" ? "text-emerald-700" : "text-amber-700"}`}>
                    {user?.kycStatus === "approved" ? `${user.kycType === "diaspora" ? "Passport" : "NIN"} — read-only once approved` : "Complete identity verification to transact"}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <FormField label="Full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <FormField label="Email address" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
                <FormField label="Phone number" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" />

                <div>
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Display currency</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm">
                    <option value="NGN">NGN — Nigerian Naira (₦)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button type="submit" className="px-5 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
                    {saved ? "✓ Saved" : "Save changes"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {tab === "security" && (
            <div className="space-y-4">
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <h2 className="font-semibold mb-5">Password</h2>
                <div className="space-y-3 max-w-sm">
                  <FormField label="Current password" value="" onChange={() => {}} type="password" placeholder="••••••••" />
                  <FormField label="New password" value="" onChange={() => {}} type="password" placeholder="Min. 8 characters" />
                  <FormField label="Confirm new password" value="" onChange={() => {}} type="password" placeholder="••••••••" />
                  <button className="px-5 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity mt-1">
                    Update password
                  </button>
                </div>
              </div>

              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold mb-1">Two-factor authentication</h2>
                    <p className="text-sm text-[var(--muted-foreground)]">An extra layer of security for your account. Required before each login.</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${user?.twoFAEnabled ? "bg-emerald-50 text-emerald-700" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user?.twoFAEnabled ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {user?.twoFAEnabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
                {user?.twoFAEnabled && (
                  <div className="mt-4 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-800">
                    2FA is active on your account. Authenticator app (TOTP) is your current method.
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "notifications" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="font-semibold mb-5">Notification preferences</h2>
              <div className="space-y-4">
                {NOTIF_PREFS.map((pref) => (
                  <div key={pref.id} className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border)] last:border-0">
                    <div>
                      <div className="text-sm font-medium">{pref.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{pref.desc}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {["Email", "SMS"].map((ch) => (
                        <label key={ch} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] cursor-pointer">
                          <input type="checkbox" defaultChecked className="rounded" />
                          {ch}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "sessions" && (
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
              <h2 className="font-semibold mb-5">Active sessions</h2>
              <div className="space-y-3">
                {MOCK_SESSIONS.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{s.icon}</span>
                      <div>
                        <div className="text-sm font-medium">{s.device}</div>
                        <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{s.location} · {s.date}</div>
                      </div>
                    </div>
                    {s.current ? (
                      <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Current</span>
                    ) : (
                      <button className="text-xs text-red-600 hover:underline">Revoke</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm"
      />
    </div>
  );
}

const NOTIF_PREFS = [
  { id: "payment", label: "Payment reminders", desc: "Notified before installment due dates" },
  { id: "approval", label: "Approvals & KYC", desc: "Status changes for KYC and upgrade requests" },
  { id: "documents", label: "Document issuance", desc: "When new documents are added to your vault" },
  { id: "construction", label: "Construction updates", desc: "Milestone photos and infrastructure progress" },
  { id: "security", label: "Security alerts", desc: "New logins, 2FA events, and password changes" },
];

const MOCK_SESSIONS = [
  { id: "s1", device: "Chrome on macOS", location: "London, UK", date: "Active now", current: true, icon: "💻" },
  { id: "s2", device: "Safari on iPhone 15", location: "London, UK", date: "2 hours ago", current: false, icon: "📱" },
  { id: "s3", device: "Chrome on Windows", location: "Abuja, NG", date: "3 days ago", current: false, icon: "🖥" },
];
