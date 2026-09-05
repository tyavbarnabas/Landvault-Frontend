import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import type { WishlistItem } from "../../services/marketplaceService";

export const PENDING_WISHLIST_INTENT_KEY = "landvault_pending_wishlist_intent";

export interface PendingWishlistIntent {
  listingId: string;
  listingType: WishlistItem["listingType"];
}

interface WishlistButtonProps {
  listingId: string;
  listingType: WishlistItem["listingType"];
  fromPrice: number;
  className?: string;
}

// Optimistic (local state, no network round-trip to wait for). When the
// visitor isn't signed in, stashes the intent and routes through signup with
// a returnUrl — Register.tsx completes the toggle once signup succeeds and
// sends them right back here. See AppContext's toggleWishlistItem.
export default function WishlistButton({ listingId, listingType, fromPrice, className }: WishlistButtonProps) {
  const { isAuthenticated, isWishlisted, toggleWishlistItem } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const wishlisted = isWishlisted(listingId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // cards wrap this in a <Link> — don't navigate on heart taps
    e.stopPropagation();
    if (!isAuthenticated) {
      const intent: PendingWishlistIntent = { listingId, listingType };
      sessionStorage.setItem(PENDING_WISHLIST_INTENT_KEY, JSON.stringify(intent));
      navigate(`/register?returnUrl=${encodeURIComponent(location.pathname)}`);
      return;
    }
    toggleWishlistItem(listingId, fromPrice, listingType);
  };

  return (
    <button
      type="button"
      aria-pressed={wishlisted}
      aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
      onClick={handleClick}
      className={className ?? "w-8 h-8 flex items-center justify-center rounded-full bg-white/90 backdrop-blur hover:bg-white shadow-sm transition-colors"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className={wishlisted ? "text-red-500" : "text-[var(--muted-foreground)]"}>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    </button>
  );
}
