import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Currency } from "../data/mockData";
import { login as loginRequest, logout as logoutRequest, MOCK_CLIENT_USER, type AuthUser } from "../services/authService";
import { fetchNotifications, markNotificationRead as markNotificationReadRequest, type Notification } from "../services/notificationsService";

export type { Notification };

type User = AuthUser;

interface AppContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<User>;
  logout: () => void;
  savedPlots: string[];
  toggleSavedPlot: (id: string) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
}

// Signed-in on load for prototype convenience — swap for a real session check
// (e.g. a token in localStorage + a "me" request) once the backend exists.
// Defaults to the client account; visit /login as admin@landvault.com to see
// the Super Admin console instead.
const DEFAULT_USER: User = MOCK_CLIENT_USER;

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [savedPlots, setSavedPlots] = useState<string[]>(["millbrook:2-7", "sterling:5-3"]);
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_USER.currency);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications().then((data) => { if (!cancelled) setNotifications(data); });
    return () => { cancelled = true; };
  }, []);

  const login = async (email: string, password?: string) => {
    const loggedInUser = await loginRequest(email, password);
    setUser(loggedInUser);
    setCurrencyState(loggedInUser.currency);
    return loggedInUser;
  };

  const logout = () => {
    logoutRequest();
    setUser(null);
  };

  const toggleSavedPlot = (id: string) => {
    setSavedPlots((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    if (user) setUser({ ...user, currency: c });
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    markNotificationReadRequest(id).catch(() => {});
  };

  return (
    <AppContext.Provider value={{ user, isAuthenticated: !!user, login, logout, savedPlots, toggleSavedPlot, currency, setCurrency, notifications, markNotificationRead }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
