// Settings › Appearance (Figma "Appearance menu"): Day, Night or Match my
// device. The header switch sets Day or Night directly; only here can a
// person go back to following their device.

import Card from "../ui/Card";
import { useTheme, type ThemePreference } from "../../lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "../icons";

const OPTIONS: { id: ThemePreference; label: string; hint: string; icon: typeof SunIcon }[] = [
  { id: "day", label: "Day", hint: "Light and bright, all the time.", icon: SunIcon },
  { id: "night", label: "Night", hint: "Warm and dim, with the estates' lamps lit.", icon: MoonIcon },
  { id: "system", label: "Match my device", hint: "Day or Night as your phone or computer is set.", icon: MonitorIcon },
];

export default function AppearanceSettings() {
  const { preference, mode, setPreference } = useTheme();

  return (
    <Card as="section" padding="lg" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className="font-semibold mb-1">Appearance</h2>
      <p className="text-sm text-[var(--muted-foreground)] mb-5">Saved on this device only.</p>
      <fieldset>
        <legend className="sr-only">Theme</legend>
        <div className="grid sm:grid-cols-3 gap-3">
          {OPTIONS.map(({ id, label, hint, icon: Icon }) => {
            const on = preference === id;
            return (
              <label
                key={id}
                className={`flex flex-col gap-2 rounded-xl border p-4 cursor-pointer transition-colors ${
                  on ? "border-[var(--accent)] bg-[var(--secondary)]" : "border-[var(--border)] hover:border-[var(--accent)]/50"
                }`}
              >
                <input type="radio" name="theme" value={id} checked={on} onChange={() => setPreference(id)} className="sr-only" />
                <span className={on ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}><Icon size={20} /></span>
                <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
                <span className="text-xs text-[var(--muted-foreground)]">{hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {preference === "system" && (
        <p className="text-xs text-[var(--muted-foreground)] mt-3" role="status">Your device is set to {mode === "night" ? "Night" : "Day"} now.</p>
      )}
    </Card>
  );
}
