import { useState, useEffect } from "react";
import type { Review } from "../data/mockData";
import { fetchReviews, postReview, setReviewLiked } from "../services/reviewsService";
import { useApp } from "../contexts/AppContext";

// ─── Gold star rating (display) ────────────────────────────────────────────

export function StarRating({ rating, size = "text-sm" }: { rating: number; size?: string }) {
  return (
    <span className={`inline-flex ${size}`} aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= Math.round(rating) ? "var(--accent)" : "var(--border)" }}>
          ★
        </span>
      ))}
    </span>
  );
}

// ─── Gold star rating (input) ──────────────────────────────────────────────

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="inline-flex gap-0.5 text-2xl">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="leading-none transition-transform hover:scale-110"
          style={{ color: n <= (hover || value) ? "var(--accent)" : "var(--border)" }}
          aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// ─── Estate reviews (list + write form + likes) ────────────────────────────

export default function EstateReviews({ estateId, estateName }: { estateId: string; estateName: string }) {
  const { user } = useApp();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReviews(estateId).then((data) => { if (!cancelled) { setReviews(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, [estateId]);

  const average = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const toggleLike = async (id: string) => {
    const alreadyLiked = likedIds.has(id);
    // Optimistic update
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(id);
      else next.add(id);
      return next;
    });
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, likes: r.likes + (alreadyLiked ? -1 : 1) } : r)));
    try {
      await setReviewLiked(id, !alreadyLiked);
    } catch {
      // Revert on failure
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (alreadyLiked) next.add(id);
        else next.delete(id);
        return next;
      });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, likes: r.likes + (alreadyLiked ? 1 : -1) } : r)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || !comment.trim() || posting) return;
    setPosting(true);
    try {
      const newReview = await postReview(estateId, user?.name ?? "You", rating, comment.trim());
      setReviews((prev) => [newReview, ...prev]);
      setRating(0);
      setComment("");
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 2500);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-sm">Ratings & reviews — {estateName}</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">From verified buyers and resale participants.</p>
        </div>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <StarRating rating={average} size="text-base" />
            <span className="text-sm font-semibold font-mono-data">{average.toFixed(1)}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
            </span>
          </div>
        )}
      </div>

      {/* Write a review */}
      <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-[var(--border)] bg-[var(--muted)]/40 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">Your rating</span>
          <StarInput value={rating} onChange={setRating} />
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`Share your experience with ${estateName}...`}
          rows={2}
          className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm bg-[var(--card)] resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-emerald-700">{justSubmitted ? "✓ Review posted" : ""}</span>
          <button
            type="submit"
            disabled={!rating || !comment.trim() || posting}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {posting ? "Posting…" : "Post review"}
          </button>
        </div>
      </form>

      {/* Review list */}
      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
          No reviews yet — be the first to rate {estateName}.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {reviews.map((r) => (
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-xs font-semibold shrink-0">
                    {r.author.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{r.author}</div>
                    <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{r.date}</div>
                  </div>
                </div>
                <StarRating rating={r.rating} />
              </div>
              <p className="text-sm text-[var(--foreground)] leading-relaxed mb-2 pl-9">{r.comment}</p>
              <div className="pl-9">
                <button
                  onClick={() => toggleLike(r.id)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md border transition-colors ${
                    likedIds.has(r.id)
                      ? "border-[var(--accent)] text-[var(--accent)] bg-amber-50"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {likedIds.has(r.id) ? "👍 Liked" : "👍 Like"} · {r.likes}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
