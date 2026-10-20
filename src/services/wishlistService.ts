// The buyer's wishlist, kept on their account (/api/marketplace/wishlist):
// signed-in buyers only, each sees only their own list. Live, the backend
// works out the names, prices and availability; in demo mode they come from
// the demo listings, so the page renders the same way from one call.

import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { cheapestTier, fetchListingById as fetchPrimaryListingById, fromPrice, type WishlistItem } from "./marketplaceService";
import { fetchListingById as fetchResaleListingById } from "./resaleService";

export type ListingType = WishlistItem["listingType"];

// The backend's cap; a plain array, not a page, because of it.
export const WISHLIST_LIMIT = 200;

const path = (type: ListingType, id: string) => `/api/marketplace/wishlist/${type}/${encodeURIComponent(id)}`;

export async function fetchWishlist(): Promise<WishlistItem[]> {
  if (!isMock("wishlist")) return apiClient.get<WishlistItem[]>("/api/marketplace/wishlist");
  const items = await Promise.all(mockSaved.map(refreshMock));
  return items.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

// Idempotent: saving a saved listing returns it unchanged.
export async function saveToWishlist(type: ListingType, id: string): Promise<WishlistItem> {
  if (!isMock("wishlist")) return apiClient.put<WishlistItem>(path(type, id));
  const existing = mockSaved.find((s) => s.listingType === type && s.listingId === id);
  if (existing) return refreshMock(existing);
  if (mockSaved.length >= WISHLIST_LIMIT) throw new ApiError(409, "Your wishlist is full.", { code: "WISHLIST_FULL" });
  const now = await currentMock(type, id);
  if (!now.available) throw new ApiError(404, "That listing isn't on the marketplace.", { code: "LISTING_NOT_FOUND" });
  const saved: WishlistItem = { ...now, savedAt: new Date().toISOString(), priceAtSave: now.currentPrice, currency: now.currentCurrency };
  mockSaved.push(saved);
  return saved;
}

// Idempotent: removing something that isn't saved is fine. Saving it again
// later starts fresh, with a new savedAt and priceAtSave.
export async function removeFromWishlist(type: ListingType, id: string): Promise<void> {
  if (!isMock("wishlist")) { await apiClient.del<void>(path(type, id)); return; }
  mockSaved = mockSaved.filter((s) => !(s.listingType === type && s.listingId === id));
}

// What to tell the buyer when a save or removal fails.
export function wishlistErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.body?.code : undefined;
  if (code === "WISHLIST_FULL") return `Your wishlist is full (${WISHLIST_LIMIT} saved). Remove one to save another.`;
  if (code === "LISTING_NOT_FOUND") return "This listing isn't on the marketplace any more.";
  if (code === "WISHLIST_TYPE_NOT_SUPPORTED") return "Resale plots can't be saved yet.";
  return "Couldn't update your wishlist. Try again.";
}

// ─── Demo mode ───────────────────────────────────────────────────────────────
//
// Held for the session only, like the rest of the demo. What the backend
// works out (name, today's price, plots left) is read from the demo listings.

let mockSaved: WishlistItem[] = [];

type Current = Pick<WishlistItem, "listingType" | "listingId" | "name" | "available" | "currentPrice" | "currentCurrency" | "plotsRemaining">;

async function currentMock(type: ListingType, id: string): Promise<Current> {
  const gone: Current = { listingType: type, listingId: id, name: "", available: false, currentPrice: null, currentCurrency: null, plotsRemaining: null };
  if (type === "resale") {
    const listing = await fetchResaleListingById(id);
    if (!listing) return gone;
    const name = `${listing.estateName} — ${listing.plotLabel}`;
    if (listing.status !== "active") return { ...gone, name };
    return { ...gone, name, available: true, currentPrice: listing.asking, currentCurrency: listing.currency === "USD" ? "USD" : "NGN", plotsRemaining: 1 };
  }
  const listing = await fetchPrimaryListingById(id);
  if (!listing) return gone;
  const plotsRemaining = listing.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0);
  const tier = listing.priceTiers.length > 0 ? cheapestTier(listing) : undefined;
  return {
    ...gone, name: listing.name, available: true, plotsRemaining,
    currentPrice: tier ? fromPrice(listing) : null,
    currentCurrency: tier ? (tier.currency === "USD" ? "USD" : "NGN") : null,
  };
}

// The saved fields stay; the rest is read again. A listing that has gone
// keeps the name it was saved under.
async function refreshMock(saved: WishlistItem): Promise<WishlistItem> {
  const now = await currentMock(saved.listingType, saved.listingId);
  return { ...saved, ...now, name: now.name || saved.name };
}
