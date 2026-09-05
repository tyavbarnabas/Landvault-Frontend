// Generalizes the auth-intent pattern WishlistButton.tsx pioneered
// (PENDING_WISHLIST_INTENT_KEY) to the other plot-detail CTAs. An anonymous
// visitor's click is stashed here before routing them through signup/login;
// Login.tsx/Register.tsx consume it after a successful sign-in and navigate
// straight to the intended action instead of just dropping the buyer back on
// the listing page.

export type PendingIntentAction = "reserve" | "inspect" | "enquire" | "resale_offer";

export interface PendingIntent {
  action: PendingIntentAction;
  listingId: string;
  // Only "reserve"/"inspect"/"enquire" (primary marketplace CTAs) carry a
  // specific plot; "resale_offer" targets the listing itself — a resale
  // listing already IS one specific plot.
  plotId?: string;
}

const KEY = "landvault_pending_plot_intent";

export function stashPendingIntent(intent: PendingIntent): void {
  sessionStorage.setItem(KEY, JSON.stringify(intent));
}

export function consumePendingIntent(): PendingIntent | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as PendingIntent;
  } catch {
    return null;
  }
}
