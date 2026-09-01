// Backend integration seam for estate ratings & reviews. See INTEGRATION.md.
//
// NOTE: per the platform's real trust rule, review submission should eventually
// require a verified, finance-approved completed transaction on the estate —
// this mock-mode implementation intentionally doesn't enforce that (there's no
// transaction data to check here), so tighten this once the API is wired up.

import { REVIEWS, type Review } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

// In-memory mock store (module-scoped) so posted reviews/likes survive
// navigating away and back within a session, even without a backend.
let mockReviews: Review[] = [...REVIEWS];

export async function fetchReviews(estateId: string): Promise<Review[]> {
  if (apiClient.isMockMode) return mockReviews.filter((r) => r.estateId === estateId);
  return apiClient.get<Review[]>(`/api/estates/${estateId}/reviews`);
}

export async function postReview(estateId: string, author: string, rating: number, comment: string): Promise<Review> {
  if (apiClient.isMockMode) {
    const review: Review = {
      id: `r-${Date.now()}`,
      estateId,
      author,
      rating,
      comment,
      date: new Date().toISOString().split("T")[0],
      likes: 0,
    };
    mockReviews = [review, ...mockReviews];
    return review;
  }
  return apiClient.post<Review>(`/api/estates/${estateId}/reviews`, { rating, comment });
}

export async function setReviewLiked(reviewId: string, liked: boolean): Promise<{ likes: number }> {
  if (apiClient.isMockMode) {
    mockReviews = mockReviews.map((r) => (r.id === reviewId ? { ...r, likes: r.likes + (liked ? 1 : -1) } : r));
    const updated = mockReviews.find((r) => r.id === reviewId);
    return { likes: updated?.likes ?? 0 };
  }
  return apiClient.post<{ likes: number }>(`/api/reviews/${reviewId}/${liked ? "like" : "unlike"}`);
}
