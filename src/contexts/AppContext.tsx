import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import type { Currency } from "../data/mockData";
import {
  login as loginRequest, logout as logoutRequest, register as registerRequest,
  verifyTwoFactor as verifyTwoFactorRequest, restoreSession, signOutReason,
  MOCK_CLIENT_USER, canUseMarketplace, type AuthUser, type LoginOutcome, type RegisterInput,
} from "../services/authService";
import { IS_MOCK_MODE, onSessionEvent } from "../lib/apiClient";
import { acceptInvitation as acceptInvitationRequest } from "../services/staffService";
import { fetchNotifications, markNotificationRead as markNotificationReadRequest, addNotification as addNotificationRequest, type Notification } from "../services/notificationsService";
import type { WishlistItem } from "../services/marketplaceService";
import { fetchWishlist, removeFromWishlist, saveToWishlist } from "../services/wishlistService";

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
  // Accepting a staff invitation signs the person in, exactly as login does.
  acceptInvitation: (token: string, password: string) => Promise<User>;
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
  // marketplace). Kept on the buyer's account (wishlistService.ts), loaded
  // on sign-in and emptied on sign-out. Saves and removals show at once and
  // are undone if the backend refuses; the promise rejects with its error.
  // A KYC submission or review changed the buyer's standing; the sidebar
  // badge follows it without waiting for the next session refresh.
  kycChanged: (status: User["kycStatus"]) => void;
  wishlist: WishlistItem[];
  wishlistLoaded: boolean;
  reloadWishlist: () => Promise<void>;
  isWishlisted: (listingId: string) => boolean;
  saveWishlistItem: (listingId: string, listingType: WishlistItem["listingType"]) => Promise<void>;
  toggleWishlistItem: (listingId: string, listingType: WishlistItem["listingType"]) => Promise<void>;
}

// Mock mode only: signed in on load as the demo buyer for prototype
// convenience (visit /login as admin@landvault.com for the Super Admin
// console). Against a real backend NOBODY is assumed — the session is
// restored from the refresh cookie on load, or there isn't one.
const DEFAULT_USER: User = MOCK_CLIENT_USER;

// Prices are declared in naira, and HomeTrue is a Nigerian marketplace: a
// visitor who isn't signed in sees naira until they pick another currency.
// Never the demo buyer's preference (GBP) — that leaked onto the public
// estate pages as pound prices.
export const VISITOR_CURRENCY: Currency = "NGN";

// Mock mode only. With no backend there's no refresh cookie to restore a
// session from, so the signed-in user lived only in memory — and ANY reload
// (Chrome's Memory Saver waking a slept tab, a dev-server full reload, F5)
// silently replaced a director with the demo buyer. The session is kept in
// this tab's sessionStorage instead: a reload keeps whoever signed in, and a
// sign-out is remembered as a sign-out. Real mode never uses this — it
// restores from the HttpOnly refresh cookie.
const MOCK_SESSION_KEY = "lv_mock_session";

// undefined = nothing stored (first visit: the demo buyer); null = signed out.
function readMockSession(): User | null | undefined {
  try {
    const raw = sessionStorage.getItem(MOCK_SESSION_KEY);
    return raw === null ? undefined : (JSON.parse(raw) as User | null);
  } catch {
    return undefined;
  }
}

function writeMockSession(user: User | null): void {
  try { sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(user)); } catch { /* storage unavailable: memory only */ }
}

function initialUser(): User | null {
  if (!IS_MOCK_MODE) return null;
  const stored = readMockSession();
  return stored === undefined ? DEFAULT_USER : stored;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(initialUser);

  // Mock mode: every change to the user — sign-in, sign-out, a changed
  // password or currency — is what a reload comes back to.
  useEffect(() => {
    if (IS_MOCK_MODE) writeMockSession(user);
  }, [user]);
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
      setCurrencyState(VISITOR_CURRENCY);
      setSignOutNotice(signOutReason(event.code));
    } else {
      setSessionProblem(event.problem);
    }
  }), []);
  const [savedPlots, setSavedPlots] = useState<string[]>(["peaceland:2-7", "sunrise-gardens:5-3"]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistLoaded, setWishlistLoaded] = useState(false);
  const [currency, setCurrencyState] = useState<Currency>(() => user?.currency ?? VISITOR_CURRENCY);
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

  const acceptInvitation = async (token: string, password: string) => signIn(await acceptInvitationRequest(token, password));

  // Signed out in the UI at once; the server call and dropping the access
  // token follow under the cross-tab lock (see apiClient.logoutSession).
  const logout = () => {
    setUser(null);
    // The next person on this device is a visitor, not the last user.
    setCurrencyState(VISITOR_CURRENCY);
    void logoutRequest();
  };

  const kycChanged = (status: User["kycStatus"]) => {
    setUser((prev) => (prev && prev.kycStatus !== status ? { ...prev, kycStatus: status } : prev));
  };

  const passwordChanged = () => {
    setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
  };

  const toggleSavedPlot = (id: string) => {
    setSavedPlots((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  // Only the latest load is applied, so a slow first load can't overwrite a
  // save made (and reloaded) since, and one user's list never lands on the
  // next. No closure over the user: sign-in calls this before re-rendering.
  const wishlistLoad = useRef(0);
  const canSave = canUseMarketplace(user);
  const reloadWishlist = useCallback(async () => {
    const seq = ++wishlistLoad.current;
    try {
      const items = await fetchWishlist();
      if (seq === wishlistLoad.current) setWishlist(items);
    } finally {
      if (seq === wishlistLoad.current) setWishlistLoaded(true);
    }
  }, []);

  useEffect(() => {
    wishlistLoad.current++;
    setWishlist([]);
    setWishlistLoaded(!canSave);
    if (canSave) reloadWishlist().catch(() => {});
  }, [user?.email, canSave, reloadWishlist]);

  const isWishlisted = (listingId: string) => wishlist.some((w) => w.listingId === listingId);

  const saveWishlistItem = async (listingId: string, listingType: WishlistItem["listingType"]) => {
    if (isWishlisted(listingId)) return;
    // Shown at once; the backend's own copy (name, prices) replaces it.
    const placeholder: WishlistItem = {
      listingType, listingId, name: "", savedAt: new Date().toISOString(), priceAtSave: null, currency: null,
      available: true, currentPrice: null, currentCurrency: null, plotsRemaining: null,
    };
    setWishlist((prev) => [placeholder, ...prev]);
    try {
      const saved = await saveToWishlist(listingType, listingId);
      setWishlist((prev) => prev.map((w) => (w === placeholder ? saved : w)));
    } catch (err) {
      setWishlist((prev) => prev.filter((w) => w !== placeholder));
      throw err;
    }
  };

  const removeWishlistItem = async (listingId: string, listingType: WishlistItem["listingType"]) => {
    const removed = wishlist.find((w) => w.listingId === listingId);
    setWishlist((prev) => prev.filter((w) => w.listingId !== listingId));
    try {
      await removeFromWishlist(listingType, listingId);
    } catch (err) {
      if (removed) setWishlist((prev) => (prev.some((w) => w.listingId === listingId) ? prev : [removed, ...prev].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))));
      throw err;
    }
  };

  const toggleWishlistItem = (listingId: string, listingType: WishlistItem["listingType"]) =>
    isWishlisted(listingId) ? removeWishlistItem(listingId, listingType) : saveWishlistItem(listingId, listingType);

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
    <AppContext.Provider value={{ user, isAuthenticated: !!user, restoringSession, signOutNotice, clearSignOutNotice: () => setSignOutNotice(null), sessionProblem, login, completeTwoFactor, register, acceptInvitation, logout, passwordChanged, kycChanged, savedPlots, toggleSavedPlot, currency, setCurrency, notifications, markNotificationRead, addNotification, wishlist, wishlistLoaded, reloadWishlist, isWishlisted, saveWishlistItem, toggleWishlistItem }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
