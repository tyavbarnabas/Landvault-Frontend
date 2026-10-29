import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import type { WishlistItem } from "../../services/marketplaceService";
import { wishlistErrorMessage } from "../../services/wishlistService";
import Alert from "../ui/Alert";

export const PENDING_WISHLIST_INTENT_KEY = "landvault_pending_wishlist_intent";

export interface PendingWishlistIntent {
  listingId: string;
  listingType: WishlistItem["listingType"];
}

interface WishlistButtonProps {
  listingId: string;
  listingType: WishlistItem["listingType"];
  className?: string;
  // Visible text beside the heart, e.g. "Save estate" — the whole button is
  // then the click target, and the text says "Saved" once it is.
  label?: string;
}

// Optimistic: the heart fills at once and the save goes to the buyer's
// account (AppContext's toggleWishlistItem); if the backend refuses, it
// empties again and says why. When the visitor isn't signed in, stashes the
// intent and routes through signup with a returnUrl — Register.tsx completes
// the save once signup succeeds and sends them right back here.
export default function WishlistButton({ listingId, listingType, className, label }: WishlistButtonProps) {
  const { isAuthenticated, isWishlisted, toggleWishlistItem } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const wishlisted = isWishlisted(listingId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // cards wrap this in a <Link> — don't navigate on heart taps
    e.stopPropagation();
    if (!isAuthenticated) {
      const intent: PendingWishlistIntent = { listingId, listingType };
      sessionStorage.setItem(PENDING_WISHLIST_INTENT_KEY, JSON.stringify(intent));
      navigate(`/register?returnUrl=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    toggleWishlistItem(listingId, listingType)
      .catch((err) => setError(wishlistErrorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <span className="relative inline-flex">
    <button
      type="button"
      aria-pressed={wishlisted}
      aria-busy={busy || undefined}
      aria-label={label ? undefined : wishlisted ? "Remove from wishlist" : "Save to wishlist"}
      onClick={handleClick}
      className={className ?? "w-8 h-8 flex items-center justify-center rounded-full bg-[var(--card)]/90 backdrop-blur hover:bg-[var(--card)] shadow-sm transition-colors"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={wishlisted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true" className={wishlisted ? "text-[var(--error)]" : label ? "" : "text-[var(--muted-foreground)]"}>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
      {label && <span>{wishlisted ? "Saved" : label}</span>}
    </button>
    {error && (
      <Alert tone="error" role="alert" className="absolute right-0 top-full mt-1.5 z-20 w-60 text-xs font-normal text-left shadow-sm">{error}</Alert>
    )}
    </span>
  );
}
