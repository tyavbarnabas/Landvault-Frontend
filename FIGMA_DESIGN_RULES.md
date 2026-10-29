# Figma → code rules for LandVault

Read this before turning a Figma design into code here (via the Figma MCP's
`get_design_context`). The MCP's output is React + Tailwind **reference code**:
always rewrite it into this project's tokens, components and idioms below.
Don't paste it in as it comes.

## 1. Stack

| Concern | What this repo uses |
|---|---|
| UI framework | React 19 + TypeScript 5.7, function components only |
| Routing | `react-router-dom` v7, routes in `src/App.tsx`; heavy surfaces are `React.lazy` + `<Suspense fallback={<PageLoading />}>` |
| Styling | Tailwind CSS v4 through `@tailwindcss/vite`. **No** `tailwind.config`, PostCSS, CSS Modules or CSS-in-JS |
| Forms | `react-hook-form` + `zod` (`@hookform/resolvers`) |
| Maps | `leaflet` / `react-leaflet` (`src/components/map/`); the Leaflet CSS is imported in `src/index.css` |
| Build | Vite 8 (`vite.config.ts`, `@` → `src`), served by Figma Make on `$PORT` (8443) |
| Tests / format | Vitest (`*.test.ts` beside the source), oxfmt |
| Component docs | **No Storybook.** `vite.config.ts` registers `src/**/*.stories.tsx` for the Figma Make kit, but none exist yet |

Don't add UI libraries such as shadcn, MUI, Radix, lucide or Framer Motion. Everything is
hand-built with Tailwind.

## 2. Design tokens

Every token is a CSS custom property in **`src/index.css`**. There's no token
pipeline (no Style Dictionary, no JSON tokens). Figma variables are mapped to
these by hand.

```css
:root {
  --background: #FAFAF8;  --foreground: #0D1F14;
  --card: #FFFFFF;        --card-foreground: #0D1F14;
  --primary: #0D2B1E;     --primary-foreground: #F5F0E8;   /* deep forest green */
  --secondary: #EFF4F0;   --secondary-foreground: #1A3D28;
  --muted: #F0EDE8;       --muted-foreground: #6B7A6E;
  --accent: #C4922A;      --accent-foreground: #FFFFFF;    /* gold */
  --border: #DDD9D3;      --ring: #0D2B1E;
  --radius: 6px;
  --font-display: "DM Serif Display", Georgia, serif;
  --font-body: "Outfit", system-ui, sans-serif;
  --font-mono: "DM Mono", "Courier New", monospace;
}
.dark { /* Night: same names, warm night values; toggled by lib/theme.ts */ }
```

`@theme inline` also exposes them as Tailwind colours (`bg-primary` and so on), **but
the codebase never uses that form.** About 600 call sites use the arbitrary-value
form. Match it:

```tsx
// ✅ house style
<div className="bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]" />
// ❌ don't introduce
<div className="bg-card border-border text-muted-foreground" />
<div className="bg-[#0D2B1E]" />           // hard-coded hex from Figma
```

**Mapping Figma values to tokens:**
- Find the nearest token for each Figma colour. Only add a new variable to `:root`, and
  its `.dark` twin, if a colour really is new to the system.
- **Status colours are tokens too.** Four tones (`success`, `warning`, `info`,
  `error`), each with five variables in `:root` and `.dark`:

  | Variable | Use |
  |---|---|
  | `--{tone}` / `--{tone}-foreground` | solid colour + text on it (status dots, the danger button) |
  | `--{tone}-surface` / `--{tone}-border` / `--{tone}-text` | tinted messages, pills and info boxes |

  Don't write these directly in pages. Go through `components/ui/` (`Alert`,
  `Badge`, `InfoBox`, `Button variant="danger"`), whose classes come from
  `components/ui/tones.ts`. For one-off toned text, use
  `text-[var(--error-text)]` and similar. **Never use Tailwind's `red-*` / `amber-*` /
  `emerald-*` / `blue-*` in new code.** Older screens still do; convert them when touched.
- **Radius:** use Tailwind's scale. `rounded-md` for buttons and inputs, `rounded-xl` for cards,
  `rounded-full` for pills and badges, `rounded-2xl` for dialogs.
- **Spacing and type sizes:** use Tailwind's default scale, not px-perfect arbitrary values.
  Snap Figma numbers to the nearest step. Small arbitrary sizes like `text-[11px]` are
  only used inside badges.

## 3. Typography

| Use | Class |
|---|---|
| Body (default on `body`) | nothing, Outfit is inherited |
| Page titles and hero headings | `font-display` (DM Serif Display), e.g. `font-display text-3xl text-[var(--foreground)] mb-1` |
| Money, references (`LV-…`), plot numbers, figures | `font-mono-data` (DM Mono) |
| Section headings | `font-semibold` (Outfit) |
| Secondary text | `text-sm text-[var(--muted-foreground)]` |

The fonts load from Google Fonts at the top of `src/index.css`. Keep `@import`
lines first in that file.

Format money with `src/lib/formatCurrency.ts` (`formatDeclaredAmount`,
`formatCompactCurrency`) or `formatAmount` from `src/data/mockData.ts`. Never
hand-build a `₦` string.

## 4. Component library

**UI primitives live in `src/components/ui/`.** Build every new screen from them.
Never hand-write the button, card, input or alert class strings again. The payments
screens are fully migrated (`pages/payments`, `pages/purchases`,
`pages/portal/finance`, `pages/admin/payments`, `components/payments`,
`components/purchases`). Use them as the reference. Older screens still have
inline classes; convert a screen when you touch it.

| Primitive | File | Use |
|---|---|---|
| `Page`, `Loading` | `ui/Page.tsx` | Page container + serif title + description (`width="sm\|md\|lg\|xl"`, `titleSize`, `eyebrow`, `back` for sub-pages); inline "Loading…" |
| `Pagination` | `ui/Pagination.tsx` | Previous / Next with "11–20 of 54" (1-based `page`); keep the page in `?page=`. Lists that can grow live on their own paged sub-page, linked from the parent page |
| `DisclosureTable`, `DisclosureRow`, `TableRow` | `ui/DisclosureTable.tsx` | A queue as a table: header columns + a `grid` class for `lg:` with one last unlabelled column; each row stacks on a phone. `DisclosureRow` opens in place (title reviews, payout accounts); `TableRow` carries an action in that column and full-width notes underneath (payouts ready, refunds due). Count its tabs with `useTabCounts` / `withCount` (`lib/useTabCounts.ts`) |
| `Figure`, `Figures` | `ui/Figure.tsx` | Headline figures above a list (money in DM Mono, counts in the serif; `tone` colours the icon only) |
| `FilterChips` | `ui/FilterChips.tsx` | Counted toggle chips that narrow a list on screen, where a second tab row would be too many |
| `Button` | `ui/Button.tsx` | `variant="primary\|secondary\|danger\|link\|linkMuted\|linkDanger"`, `size="md\|lg"`, `fullWidth`. Defaults to `type="button"` |
| `TextLink` | `ui/TextLink.tsx` | Router `Link` styled as the accent link (`muted` for back links) |
| `Card`, `ListCard`, `InfoBox` | `ui/Card.tsx` | Bordered card (`as="li\|section\|dl…"`, `padding="sm\|md\|lg"`, `alert`); **`ListCard` for every page-level list row** (the Branches row: `p-5`, `min-h-28`, full page width, in `<ul className="space-y-3">`; title left, status badge or action right; `to` makes the whole row a link; `density="compact"` (`p-4`, no minimum height) for lists people scan: documents, tickets, inspections, enquiries, transfers, and lists inside a dashboard panel); tinted label/value box inside a card (`tone`) |
| `Alert` | `ui/Alert.tsx` | Tinted message, `tone` (default `warning`). No `title` = compact inline note; with `title` = status panel |
| `Badge` | `ui/Badge.tsx` | The pill. Domain mappers stay in `components/StatusBadge.tsx` (`<StatusBadge {...payoutStatusBadge(s)} />`). Add a mapper there |
| `Field`, `Input`, `Select`, `Textarea`, `ErrorText`, `describedBy` | `ui/Field.tsx` | Label + hint + error wrapper and controls (`inputSize="sm\|md\|lg"`, `kind="code"` for OTP boxes); `ErrorText` for form/action errors |
| `Dialog`, `DialogActions` | `ui/Dialog.tsx` | Modal with focus trap, Escape, focus restore, first field auto-focused; Cancel + confirm row (`variant="danger"` for destructive) |
| `TabBar` | `ui/Tabs.tsx` | ARIA tabs with arrow keys; `divider` for the page-level underline. Panels use `id="panel-{id}"` |
| `EmptyState` | `ui/EmptyState.tsx` | Icon + title + description for empty lists |
| tones | `ui/tones.ts` | **The only place status colours live** (`TONE_SURFACE`, `TONE_BADGE`, `TONE_FILL`, `TONE_DOT`) |
| `cx` | `ui/cx.ts` | Join class names (no conflict resolution, so add a prop rather than override a primitive's classes) |

Other shared pieces:

| Need | Use |
|---|---|
| App shell, side nav (permission-driven) | `components/Layout.tsx` (`NAV_SECTIONS`), `components/MarketplaceLayout.tsx` |
| Route-level loading / load errors | `components/PageLoading.tsx`, `components/LoadError.tsx` (`describeLoadError`) |
| Data fetching | `lib/useFetch.ts` (`useFetch`, `usePolling`). Components call `src/services/*Service.ts` and never `fetch` directly |
| Bank account form | `components/payments/BankAccountForm.tsx` |
| Password field | `components/auth/PasswordInput.tsx` |
| Verified mark | `components/marketplace/VerifiedBadge.tsx` |
| Plot map / grid | `components/map/*`, `components/PlotCanvas.tsx` |
| Global state / session | `contexts/AppContext.tsx` → `useApp()` |

**Component conventions:**
- **Default export** per component file (AGENTS.md rule). Small helpers can be
  named exports in the same file.
- Props are typed inline or as an `interface XxxProps`. No `React.FC`.
- Open the file with a short `//` comment saying *why* it exists or where it came from.
  That's the house comment style.
- Imports are relative (`../../components/ui/Button`), not `@/`.
- Strings with apostrophes go in double quotes (`"We're…"`). An unescaped `'` breaks the build.
- Accessibility is expected: real `<button>`s, `aria-label` on icon-only
  buttons, labelled inputs (`Field`), `role="alert"` / `role="status"` on messages.

## 5. Composing a screen

```tsx
import Page, { Loading } from "../../components/ui/Page";
import Card, { InfoBox } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import Dialog, { DialogActions } from "../../components/ui/Dialog";
import TabBar from "../../components/ui/Tabs";

<Page title="Payouts" description="Send verified sales' proceeds to developers.">
  <TabBar tabs={TABS} active={tab} onActivate={setTab} ariaLabel="Payouts" divider />
  <ul className="space-y-3">
    <Card as="li" className="space-y-3">
      <InfoBox label="Agreed price"><div className="font-mono-data text-lg">{price}</div></InfoBox>
      {blocked && <Alert>The company has no approved payout account.</Alert>}
      <div className="flex gap-3">
        <Button onClick={approve}>Approve</Button>
        <Button variant="secondary" onClick={reject}>Reject</Button>
      </div>
    </Card>
  </ul>
</Page>

<Dialog title="Reject this payment?" onClose={close}>
  <p className="text-sm mb-3">…</p>
  <DialogActions onCancel={close} onConfirm={go} confirmLabel="Reject" busy={busy} variant="danger" />
</Dialog>
```

**Page widths:** list pages use `Page`'s default (`max-w-5xl`), in all three
surfaces. Detail pages and forms stay narrower (`lg`/`md`/`sm`), because they're
easier to read that way.

Layout (`flex`, `grid`, `space-y-*`, `gap-*`) and text styling stay as Tailwind
utilities in the page. Primitives own colour, border, radius and padding.

Inputs get their focus ring globally (`box-shadow: 0 0 0 2px var(--ring)` in
`index.css`). Don't add `focus:ring-*` utilities.

## 6. Styling approach

- **Utility-first Tailwind in JSX**, conditional classes with template literals
  (`` `... ${active ? "a" : "b"}` ``). There's no `clsx` / `cn` helper.
- **Global CSS** goes only in `src/index.css`: tokens, fonts, body defaults, thin
  scrollbars, focus ring, and a few named classes (`.font-display`,
  `.font-mono-data`, `.plot-canvas-cell`). Add a global class only for something
  utilities can't express, such as SVG hover states.
- **Responsive design** is mobile-first with Tailwind breakpoints, mostly `sm:` and `lg:`
  (`md:` is rare). Typical uses are `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` and a side
  nav that collapses below `lg`. Figma desktop frames should still collapse cleanly at
  phone width.
- **Night (dark) mode:** `lib/theme.ts` puts `.dark` on `<html>` (Day / Night / Match my device,
  switch in both headers and Settings › Appearance). Pages get it free through the tokens; don't add
  `dark:` classes. Dark bands (side nav, footer, trust panels) use `--surface-inverse` /
  `--surface-inverse-foreground`, never `--primary` (Night's primary is a light gold). Wrap estate
  photos in `components/marketplace/EstatePhoto` (the night lamp) and give hero bands `NightSky`.
  are used. If you use the tokens, dark mode will come for free later. Don't add `dark:` classes.

## 7. Icons

- **No icon library.** Icons are **inline SVG React components** defined in the
  file that uses them. Nav icons are at the bottom of `src/components/Layout.tsx`
  (`GridIcon`, `TagIcon`, `MapIcon`, `BriefcaseIcon`, `FolderIcon`, `CalendarIcon`,
  `ChatIcon`, `UsersIcon`, `GearIcon`, `ShieldIcon`, `AlertTriangleIcon`).
- **Naming:** `PascalCase` + `Icon` suffix.
- **Style:** a 24×24 `viewBox`, `fill="none"`, `stroke="currentColor"`, stroke width 1.8 in the nav (up to 3 for tiny badge ticks),
  sized with `width`/`height` attributes (17px in the nav, 11–16px inline). Colour comes from the parent's
  `text-*`.
- When a Figma design brings a new icon, export its SVG path from Figma, write it
  as a small component in that style, and check `Layout.tsx` for an existing one
  first. If the same icon is needed in three or more files, move it to a shared
  `src/components/icons.tsx`.

```tsx
function MapIcon() {
  return (
    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="..." />
    </svg>
  );
}
```

## 8. Assets

- There's **no `public/` folder and no local image assets** today. Estate and listing photos
  are remote URLs (Unsplash with `?w=…&h=…&fit=crop&auto=format` sizing in mock
  data, and backend-provided URLs in live mode). There's no CDN config and no image pipeline.
- When a Figma design needs a bitmap, use the asset URL the Figma MCP returns,
  or `download_assets` into `src/assets/` and `import` it so Vite fingerprints it.
  **Don't invent placeholder images**, and don't add an icon or image package.
- Use `<img loading="lazy">` with explicit aspect sizing (`aspect-[4/3] object-cover`)
  for photo cards.
- Favicon and OG image are set in `.figma/make/site.json`, which `vite.config.ts` applies.

## 9. Project structure

```
src/
  App.tsx              routes (lazy-loaded per surface)
  index.css            tokens, fonts, global styles
  components/          shared + feature components (default exports)
  pages/               one folder per area: marketplace/, checkout/, purchases/,
                       payments/, portal/{estates,staff,branches,finance}/,
                       admin/{tenants,payments,…}/, auth/, …
  services/            *Service.ts: one per domain; live backend or mock (see lib/backends.ts)
  lib/                 hooks + pure helpers (useFetch, formatCurrency, purchaseStatus…)
  contexts/            AppContext (session, permissions, display currency)
  data/                mock data (mockData.ts, nigerianBanks.ts, …)
```

There are three surfaces in one app, each gated by permission slugs: **Client** (`/dashboard`,
`/marketplace`…), **Developer portal** (`/portal/*`) and **Super Admin**
(`/admin/*`). A new screen means a page in `src/pages/<area>/`, a route in
`App.tsx` and, if it belongs in navigation, an entry in `NAV_SECTIONS` with its
`permission`.

## 10. Figma → code workflow

1. `create_session`, then `get_design_context` (and `get_screenshot` for a visual check).
2. Map every colour, font and radius to the tokens and classes above. **No hex values
   in JSX.**
3. Replace the generated markup with `components/ui/` primitives (§4). If a Figma
   component has no primitive yet, add one to `ui/` rather than inlining its classes.
4. Put data behind a `src/services/` function, not inline constants in the page.
5. Check at phone width and desktop. Run `pnpm test` if logic changed.
