import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Currency } from "../data/mockData";
import {
  login as loginRequest, logout as logoutRequest, register as registerRequest,
  verifyTwoFactor as verifyTwoFactorRequest,
  MOCK_CLIENT_USER, type AuthUser, type LoginOutcome, type RegisterInput,
} from "../services/authService";
import { fetchNotifications, markNotificationRead as markNotificationReadRequest, addNotification as addNotificationRequest, type Notification } from "../services/notificationsService";
import type { WishlistItem } from "../services/marketplaceService";

export type { Notification };

type User = AuthUser;

interface AppContextValue {
  user: User | null;
  isAuthenticated: boolean;
  // Returns an OUTCOME, not a user: login either authenticates or hands back a
  // two-factor challenge, and nothing is signed in until a code verifies.
  login: (email: string, password?: string) => Promise<LoginOutcome>;
  // The second step. Exchanges a challenge token plus a TOTP or recovery code
  // for a real session.
  completeTwoFactor: (challengeToken: string, code: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
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

// Signed-in on load for prototype convenience — swap for a real session check
// (e.g. a token in localStorage + a "me" request) once the backend exists.
// Defaults to the client account; visit /login as admin@landvault.com to see
// the Super Admin console instead.
const DEFAULT_USER: User = MOCK_CLIENT_USER;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
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

  const logout = () => {
    logoutRequest();
    setUser(null);
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
    <AppContext.Provider value={{ user, isAuthenticated: !!user, login, completeTwoFactor, register, logout, savedPlots, toggleSavedPlot, currency, setCurrency, notifications, markNotificationRead, addNotification, wishlist, isWishlisted, toggleWishlistItem }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
