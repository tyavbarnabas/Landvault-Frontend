// Shared paginated-list envelope. Every genuinely unbounded list endpoint
// (marketplace listings, a tenant's plots, platform-wide audit logs, ...)
// returns this instead of a bare array — see landvault's backend-integration-
// readiness notes in project memory for the full rationale. A naturally
// bounded list (price tiers on one estate, reviews on one estate, similar
// listings already limit-capped) stays a plain array; don't over-apply this.

export interface Page<T> {
  items: T[];
  total: number;
  cursor?: string; // opaque — never parse this client-side; undefined when there are no more pages
  hasMore: boolean;
}

export interface PageParams {
  limit?: number;
  cursor?: string;
}

export const DEFAULT_PAGE_SIZE = 20;

// Mock-mode-only helper: every paginated service's mock branch slices its
// (already filtered/sorted) fixture array through this, so paging behaviour
// — real `total`, real `hasMore`, a real cursor — is exercised in
// development instead of only ever appearing once a backend exists. The
// cursor is just a stringified offset; callers must still treat it as
// opaque, since a real backend's cursor won't be.
export function paginateMock<T>(all: T[], params: PageParams = {}): Page<T> {
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const offset = params.cursor ? Number(params.cursor) || 0 : 0;
  const items = all.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < all.length;
  return { items, total: all.length, cursor: hasMore ? String(nextOffset) : undefined, hasMore };
}

// Appends a newly-fetched page's items to what's already loaded — the
// "Load more" accumulation every paginated list page does the same way.
export function appendPage<T>(existing: T[], page: Page<T>): T[] {
  return [...existing, ...page.items];
}
