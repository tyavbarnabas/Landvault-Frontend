import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Currency } from "../data/mockData";
import {
  login as loginRequest, logout as logoutRequest, register as registerRequest,
  verifyTwoFactor as verifyTwoFactorRequest, restoreSession, signOutReason,
  MOCK_CLIENT_USER, type AuthUser, type LoginOutcome, type RegisterInput,
} from "../services/authService";
import { IS_MOCK_MODE, onSessionEvent } from "../lib/apiClient";
import { fetchNotifications, markNotificationRead as markNotificationReadRequest, addNotification as addNotificationRequest, type Notification } from "../services/notificationsService";
import type { WishlistItem } from "../services/marketplaceService";

export type { Notification };

type User = AuthUser;

interface AppContextValue {
  user: User | null;
  isAuthenticated: boolean;
  // True only while the startup refresh is deciding whether anyone is signed
  // in. Route guards wait on it rather than bouncing a signed-in user to
  // /login for the length of one request.
  restoringSession: boolean;
  // Why the last session ended, when there is something to say (a suspension,
  // an ended session) — shown once on the sign-in page.
  signOutNotice: string | null;
  clearSignOutNotice: () => void;
  // A CONFIGURATION problem, not an expired session: this page's origin isn't
  // allowed by the backend, or the backend can't be reached to renew.
  sessionProblem: "origin_not_allowed" | "unreachable" | null;
  // Returns an OUTCOME, not a user: login either authenticates or hands back a
  // two-factor challenge, and nothing is signed in until a code verifies.
  login: (email: string, password?: string) => Promise<LoginOutcome>;
  // The second step. Exchanges a challenge token plus a TOTP or recovery code
  // for a real session.
  completeTwoFactor: (challengeToken: string, code: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
  // The server clears `mustChangePassword` on a successful change; this
  // mirrors that on the user already in hand rather than re-fetching it.
  passwordChanged: () => void;
  savedPlots: string[];
  toggleSavedPlot: (id: string) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  addNotification: (input: Omit<Notification, "id" | "read">) => Promise<void>;
  // Marketplace wishlist — separate from savedPlots (that's individual plots
  // in one company's inventory; this is estate-level across the national
  // marketplace). See marketplaceService.ts's WishlistItem for why
  // `priceAtSave` isn't the same thing as "the displayed price."
  wishlist: WishlistItem[];
  isWishlisted: (listingId: string) => boolean;
  toggleWishlistItem: (listingId: string, currentFromPrice: number, listingType: WishlistItem["listingType"]) => void;
}

// Mock mode only: signed in on load as the demo buyer for prototype
// convenience (visit /login as admin@landvault.com for the Super Admin
// console). Against a real backend NOBODY is assumed — the session is
// restored from the refresh cookie on load, or there isn't one.
const DEFAULT_USER: User = MOCK_CLIENT_USER;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(IS_MOCK_MODE ? DEFAULT_USER : null);
  const [restoringSession, setRestoringSession] = useState(!IS_MOCK_MODE);
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);
  const [sessionProblem, setSessionProblem] = useState<"origin_not_allowed" | "unreachable" | null>(null);

  // One refresh on load restores the whole session — `{ user, token }`, the
  // same user login returns.
  useEffect(() => {
    let cancelled = false;
    restoreSession().then((outcome) => {
      if (cancelled) return;
      if (outcome.kind === "signed_in") { setUser(outcome.user); setCurrencyState(outcome.user.currency); }
      if (outcome.kind === "signed_out") setSignOutNotice(signOutReason(outcome.code));
      if (outcome.kind === "config_problem") setSessionProblem(outcome.problem);
      setRestoringSession(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Session changes that happen inside ordinary requests.
  useEffect(() => onSessionEvent((event) => {
    if (event.kind === "refreshed") {
      // Read fresh server-side: permissions, KYC and 2FA flags can change.
      if (event.user) setUser(event.user as User);
      setSessionProblem(null);
    } else if (event.kind === "signed_out") {
      setUser(null);
      setSignOutNotice(signOutReason(event.code));
    } else {
      setSessionProblem(event.problem);
    }
  }), []);
  const [savedPlots, setSavedPlots] = useState<string[]>(["peaceland:2-7", "sunrise-gardens:5-3"]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_USER.currency);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;
    // The bell dropdown shows recent notifications, not a paginated list —
    // one generously-sized page, no "Load more" here.
    fetchNotifications({ limit: 50 }).then((page) => { if (!cancelled) setNotifications(page.items); });
    return () => { cancelled = true; };
  }, []);

  const signIn = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    setSignOutNotice(null);
    setSessionProblem(null);
    setCurrencyState(loggedInUser.currency);
    return loggedInUser;
  };

  const login = async (email: string, password?: string): Promise<LoginOutcome> => {
    const outcome = await loginRequest(email, password);
    // A challenge is NOT a session — no user is set until it verifies.
    if (outcome.kind === "authenticated") signIn(outcome.user);
    return outcome;
  };

  const completeTwoFactor = async (challengeToken: string, code: string) =>
    signIn(await verifyTwoFactorRequest(challengeToken, code));

  const register = async (input: RegisterInput) => signIn(await registerRequest(input));

  // Signed out in the UI at once; the server call and dropping the access
  // token follow under the cross-tab lock (see apiClient.logoutSession).
  const logout = () => {
    setUser(null);
    void logoutRequest();
  };

  const passwordChanged = () => {
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  };

  const toggleSavedPlot = (id: string) => {
    setSavedPlots((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const isWishlisted = (listingId: string) => wishlist.some((w) => w.listingId === listingId);

  const toggleWishlistItem = (listingId: string, currentFromPrice: number, listingType: WishlistItem["listingType"]) => {
    setWishlist((prev) =>
      prev.some((w) => w.listingId === listingId)
        ? prev.filter((w) => w.listingId !== listingId)
        : [...prev, { listingId, listingType, savedAt: new Date().toISOString(), priceAtSave: currentFromPrice }]
    );
  };

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (user) setUser({ ...user, currency: c });
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    markNotificationReadRequest(id).catch(() => {});
  };

  const addNotification = async (input: Omit<Notification, "id" | "read">) => {
    const notification = await addNotificationRequest(input);
    setNotifications((prev) => [notification, ...prev]);
  };

  return (
    <AppContext.Provider value={{ user, isAuthenticated: !!user, restoringSession, signOutNotice, clearSignOutNotice: () => setSignOutNotice(null), sessionProblem, login, completeTwoFactor, register, logout, passwordChanged, savedPlots, toggleSavedPlot, currency, setCurrency, notifications, markNotificationRead, addNotification, wishlist, isWishlisted, toggleWishlistItem }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
