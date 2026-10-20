// Shared by Login.tsx and Register.tsx — completes a wishlist save stashed
// by WishlistButton.tsx before an anonymous visitor was routed through
// signup. A save, not a toggle: the listing may already be on the account.

import { PENDING_WISHLIST_INTENT_KEY } from "../components/marketplace/WishlistButton";
import { saveToWishlist } from "../services/wishlistService";
import type { WishlistItem } from "../services/marketplaceService";

// Saves through the service directly, then reloads the list: the session's
// first load may still be in flight and can't be relied on to include it.
export async function completePendingWishlistIntent(reloadWishlist: () => Promise<void>): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_WISHLIST_INTENT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_WISHLIST_INTENT_KEY);

  let intent: { listingId: string; listingType: WishlistItem["listingType"] };
  try {
    intent = JSON.parse(raw);
  } catch {
    return;
  }
  // A listing that has left the marketplace since is simply not saved.
  await saveToWishlist(intent.listingType, intent.listingId).catch(() => {});
  await reloadWishlist().catch(() => {});
}
