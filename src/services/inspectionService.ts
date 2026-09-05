// Backend integration seam for inspection bookings. Part 3 of the buyer
// flow. CRITICAL, resolved decision (see landvault-buyer-purchase-flow in
// project memory): a plot is NEVER held during an inspection — a 45-minute
// checkout lock cannot cover a site visit days away. Nothing in this module
// touches plot status; that only happens in reservationService.ts.

import { apiClient } from "../lib/apiClient";

export type InspectionType = "physical" | "virtual";
export type InspectionStatus = "scheduled" | "completed" | "cancelled";

export interface InspectionAgent {
  name: string;
  phone: string;
}

export interface Inspection {
  id: string;
  listingId: string;
  listingName: string;
  plotId: string;
  plotLabel: string;
  type: InspectionType;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  note?: string;
  status: InspectionStatus;
  agent: InspectionAgent;
  meetingPoint?: string; // physical visits only
  createdAt: string;
}

// A small deterministic agent pool, assigned by seller so the same company's
// bookings tend to route to the same agent — not meant to model a real
// scheduling/assignment system.
const AGENTS: InspectionAgent[] = [
  { name: "Chidinma Eze", phone: "+234 803 111 2222" },
  { name: "Tunde Bakare", phone: "+234 805 333 4444" },
  { name: "Grace Umeh", phone: "+234 701 555 6666" },
];

function assignAgent(seed: string): InspectionAgent {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AGENTS[Math.abs(h) % AGENTS.length];
}

const TIME_SLOTS = ["9:00 AM", "10:30 AM", "12:00 PM", "1:30 PM", "3:00 PM", "4:30 PM"];

// Deterministic per-date slot availability so different dates plausibly show
// different (sometimes fully booked) options, without a real scheduling backend.
export function availableSlotsForDate(date: string): string[] {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return TIME_SLOTS.filter((_, i) => ((Math.abs(h) >> i) & 1) === 0 || i < 2); // always keep at least the first two open
}

export interface CreateInspectionInput {
  listingId: string;
  listingName: string;
  plotId: string;
  plotLabel: string;
  sellerBranchName: string;
  type: InspectionType;
  date: string;
  timeSlot: string;
  note?: string;
}

let mockInspections: Inspection[] = [];

export async function createInspection(input: CreateInspectionInput): Promise<Inspection> {
  if (!apiClient.isMockMode) return apiClient.post<Inspection>("/api/inspections", input);

  const inspection: Inspection = {
    id: `insp-${Date.now()}`,
    listingId: input.listingId,
    listingName: input.listingName,
    plotId: input.plotId,
    plotLabel: input.plotLabel,
    type: input.type,
    date: input.date,
    timeSlot: input.timeSlot,
    note: input.note,
    status: "scheduled",
    agent: assignAgent(input.sellerBranchName),
    meetingPoint: input.type === "physical" ? `${input.listingName} main gate — ask for the LandVault visitor sign-in desk` : undefined,
    createdAt: new Date().toISOString(),
  };
  mockInspections = [inspection, ...mockInspections];
  return inspection;
}

export async function fetchMyInspections(): Promise<Inspection[]> {
  if (apiClient.isMockMode) return mockInspections;
  return apiClient.get<Inspection[]>("/api/inspections");
}

export async function cancelInspection(id: string): Promise<void> {
  if (apiClient.isMockMode) {
    mockInspections = mockInspections.map((i) => (i.id === id ? { ...i, status: "cancelled" } : i));
    return;
  }
  await apiClient.post(`/api/inspections/${id}/cancel`);
}

export async function rescheduleInspection(id: string, date: string, timeSlot: string): Promise<Inspection | undefined> {
  if (apiClient.isMockMode) {
    mockInspections = mockInspections.map((i) => (i.id === id ? { ...i, date, timeSlot } : i));
    return mockInspections.find((i) => i.id === id);
  }
  return apiClient.post<Inspection>(`/api/inspections/${id}/reschedule`, { date, timeSlot });
}
