// The Day / Night switch in both headers (Figma "Theme switch"): a sun by
// day, a moon in a starry track by night. It sets an explicit choice; "Match
// my device" lives in Settings › Appearance.

import { useTheme } from "../lib/theme";
import { MoonIcon, SunIcon } from "./icons";

export default function ThemeSwitch() {
  const { mode, toggle } = useTheme();
  const night = mode === "night";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={night}
      aria-label="Night mode"
      title={night ? "Switch to day" : "Switch to night"}
      onClick={toggle}
      className={`relative shrink-0 w-14 h-7 rounded-full border transition-colors duration-300 ${
        night ? "bg-[var(--sky-top)] border-[var(--border)]" : "bg-[var(--muted)] border-[var(--border)]"
      }`}
    >
      {night && (
        <span aria-hidden="true">
          <span className="absolute left-2 top-1.5 w-0.5 h-0.5 rounded-full bg-[var(--star)]" />
          <span className="absolute left-4 top-4 w-0.5 h-0.5 rounded-full bg-[var(--star)] opacity-70" />
          <span className="absolute left-6 top-2 w-px h-px rounded-full bg-[var(--star)]" />
        </span>
      )}
      <span
        aria-hidden="true"
        className={`absolute top-0.5 left-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-transform duration-300 ease-out ${
          night
            ? "translate-x-7 bg-[var(--star)] text-[var(--sky-top)] shadow-[0_0_10px_2px_rgb(255_244_218/0.35)]"
            : "translate-x-0 bg-[var(--card)] text-[var(--accent)] shadow-sm"
        }`}
      >
        {night ? <MoonIcon size={13} /> : <SunIcon size={14} />}
      </span>
    </button>
  );
}
