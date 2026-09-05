// Backend integration seam for estate construction/infrastructure progress.
// Fix 7: this used to be hardcoded literals inside PlotView.tsx's
// ConstructionTab — convincing-looking milestone percentages and stock
// photography that had no relationship to any real estate, keyed to nothing
// (the component accepted `estateId` and never used it). Moved behind the
// service layer and gated by CAPABILITIES.constructionTracking (currently
// false) so the tab hides entirely rather than showing invented progress.
//
// TODO (backend): real progress data — milestone completion percentages and
// dated site updates with real photography — is published per estate by the
// developer portal (a DP-* story, not built in this repo yet).

import { apiClient } from "../lib/apiClient";

export interface ConstructionMilestone {
  id: string;
  label: string;
  percentComplete: number;
  expectedOrCompletedDate: string;
}

export interface ConstructionUpdate {
  id: string;
  date: string;
  title: string;
  body: string;
  imageUrl?: string;
}

export interface ConstructionProgress {
  estateId: string;
  milestones: ConstructionMilestone[];
  updates: ConstructionUpdate[];
}

// Only present for estates that have actually published progress in mock
// mode — every other estateId correctly returns undefined, exercising the
// "no published progress" empty state.
const MOCK_PROGRESS: Record<string, ConstructionProgress> = {
  peaceland: {
    estateId: "peaceland",
    milestones: [
      { id: "m1", label: "Site clearing", percentComplete: 100, expectedOrCompletedDate: "Mar 2024" },
      { id: "m2", label: "Perimeter fencing", percentComplete: 100, expectedOrCompletedDate: "Jun 2024" },
      { id: "m3", label: "Road grading & base course", percentComplete: 78, expectedOrCompletedDate: "In progress" },
      { id: "m4", label: "Drainage system", percentComplete: 55, expectedOrCompletedDate: "In progress" },
      { id: "m5", label: "Solar street lighting", percentComplete: 30, expectedOrCompletedDate: "Est. Q4 2026" },
      { id: "m6", label: "Electrification", percentComplete: 0, expectedOrCompletedDate: "Est. Q1 2027" },
    ],
    updates: [
      { id: "u1", date: "2026-08-20", title: "Road grading update", body: "Northern section road grading at 78%. Laterite compaction complete on 14 of 18 internal roads. On track for November completion." },
      { id: "u2", date: "2026-07-12", title: "Drainage installation", body: "Phase 1 drainage trenching complete. Pipes laid on eastern grid. Phase 2 (western) begins next week." },
      { id: "u3", date: "2026-06-03", title: "Fencing milestone complete", body: "Perimeter fencing 100% complete across all 1.2km of the estate boundary. Gates installed at all 3 entry points." },
    ],
  },
};

export async function fetchConstructionProgress(estateId: string): Promise<ConstructionProgress | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<ConstructionProgress>(`/api/estates/${estateId}/construction`); } catch { return undefined; }
  }
  return MOCK_PROGRESS[estateId];
}
