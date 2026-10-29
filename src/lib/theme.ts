// Day / Night (from the Figma "Screen — Night mode" proposal). The choice is a
// per-device preference, so localStorage is its home and every access is
// guarded. "system" follows the device and is the default. Night is the
// `dark` class on <html>; index.css holds its colours and its motion.

import { useSyncExternalStore } from "react";

export type ThemePreference = "day" | "night" | "system";
export type ThemeMode = "day" | "night";

const STORAGE_KEY = "hometrue.theme";
const NIGHT_QUERY = "(prefers-color-scheme: dark)";

export function parsePreference(raw: string | null | undefined): ThemePreference {
  return raw === "day" || raw === "night" ? raw : "system";
}

export function resolveMode(preference: ThemePreference, deviceIsNight: boolean): ThemeMode {
  if (preference === "system") return deviceIsNight ? "night" : "day";
  return preference;
}

function readStored(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

function deviceIsNight(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(NIGHT_QUERY).matches;
}

function reducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

let preference: ThemePreference = "system";
let mode: ThemeMode = "day";
const listeners = new Set<() => void>();
let snapshot: { preference: ThemePreference; mode: ThemeMode } = { preference, mode };

function emit() {
  snapshot = { preference, mode };
  listeners.forEach((l) => l());
}

// The wash runs 0–700 ms; the theme flips at its peak (300 ms) and the lamps
// stagger on from there. Reduced motion: the theme just changes.
function apply(next: ThemeMode, animate: boolean) {
  const root = document.documentElement;
  if (!animate || reducedMotion()) {
    root.classList.toggle("dark", next === "night");
    return;
  }
  const wash = document.createElement("div");
  wash.className = `theme-wash ${next === "night" ? "to-night" : "to-day"}`;
  wash.setAttribute("aria-hidden", "true");
  document.body.appendChild(wash);
  window.setTimeout(() => {
    root.classList.add("theme-switching");
    if (next === "night") root.classList.add("lights-on");
    root.classList.toggle("dark", next === "night");
  }, 300);
  window.setTimeout(() => root.classList.remove("theme-switching"), 700);
  window.setTimeout(() => {
    wash.remove();
    root.classList.remove("lights-on");
  }, 2000);
}

function update(nextPreference: ThemePreference, animate: boolean) {
  const next = resolveMode(nextPreference, deviceIsNight());
  preference = nextPreference;
  if (next !== mode) apply(next, animate);
  mode = next;
  emit();
}

// Called once from main.tsx, before the first render, so a night visit
// doesn't flash the day colours.
export function initTheme() {
  preference = readStored();
  mode = resolveMode(preference, deviceIsNight());
  apply(mode, false);
  snapshot = { preference, mode };
  window.matchMedia?.(NIGHT_QUERY).addEventListener?.("change", () => {
    if (preference === "system") update("system", true);
  });
}

export function setThemePreference(next: ThemePreference) {
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode: the choice lasts this visit only.
  }
  update(next, true);
}

export function useTheme() {
  const state = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
  return {
    ...state,
    setPreference: setThemePreference,
    // The header switch: an explicit choice, the opposite of what shows now.
    toggle: () => setThemePreference(state.mode === "night" ? "day" : "night"),
  };
}
