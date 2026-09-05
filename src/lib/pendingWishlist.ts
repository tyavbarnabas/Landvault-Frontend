// Shared by Login.tsx and Register.tsx — resolves and completes a wishlist
// toggle stashed by WishlistButton.tsx before an anonymous visitor was routed
// through signup, for either listing type.

import { PENDING_WISHLIST_INTENT_KEY } from "../components/marketplace/WishlistButton";
import { fetchListingById as fetchPrimaryListingById, fromPrice } from "../services/marketplaceService";
import { fetchListingById as fetchResaleListingById } from "../services/resaleService";
import type { WishlistItem } from "../services/marketplaceService";

type ToggleWishlistItem = (listingId: string, currentFromPrice: number, listingType: WishlistItem["listingType"]) => void;

export async function completePendingWishlistIntent(toggleWishlistItem: ToggleWishlistItem): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_WISHLIST_INTENT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_WISHLIST_INTENT_KEY);

  let intent: { listingId: string; listingType: WishlistItem["listingType"] };
  try {
    intent = JSON.parse(raw);
  } catch {
    return;
  }

  if (intent.listingType === "resale") {
    const listing = await fetchResaleListingById(intent.listingId);
    if (listing) toggleWishlistItem(listing.id, listing.asking, "resale");
  } else {
    const listing = await fetchPrimaryListingById(intent.listingId);
    if (listing) toggleWishlistItem(listing.id, fromPrice(listing), "primary");
  }
}
