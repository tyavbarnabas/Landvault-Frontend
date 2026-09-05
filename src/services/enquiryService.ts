// Backend integration seam for marketplace enquiries. Part 4 of the buyer
// flow — a lightweight message to the seller's sales team, distinct from a
// full inspection booking. See INTEGRATION.md conventions used elsewhere.

import { apiClient } from "../lib/apiClient";

export type EnquiryContactMethod = "in_app" | "whatsapp" | "phone";

export interface EnquiryMessage {
  id: string;
  author: "buyer" | "seller";
  body: string;
  date: string;
}

export interface Enquiry {
  id: string;
  listingId: string;
  listingName: string;
  plotId?: string;
  preferredContact: EnquiryContactMethod;
  status: "open" | "answered" | "closed";
  createdAt: string;
  messages: EnquiryMessage[];
}

export interface CreateEnquiryInput {
  listingId: string;
  listingName: string;
  plotId?: string;
  message: string;
  preferredContact: EnquiryContactMethod;
}

// In-memory mock store so an enquiry (and any reply) survives for the rest
// of the session — same idiom as portfolioService.ts / notificationsService.ts.
let mockEnquiries: Enquiry[] = [];

export async function createEnquiry(input: CreateEnquiryInput): Promise<Enquiry> {
  if (!apiClient.isMockMode) return apiClient.post<Enquiry>("/api/marketplace/enquiries", input);

  const enquiry: Enquiry = {
    id: `enq-${Date.now()}`,
    listingId: input.listingId,
    listingName: input.listingName,
    plotId: input.plotId,
    preferredContact: input.preferredContact,
    status: "open",
    createdAt: new Date().toISOString(),
    messages: [{ id: `msg-${Date.now()}`, author: "buyer", body: input.message, date: new Date().toISOString() }],
  };
  mockEnquiries = [enquiry, ...mockEnquiries];
  return enquiry;
}

export async function fetchMyEnquiries(): Promise<Enquiry[]> {
  if (apiClient.isMockMode) return mockEnquiries;
  return apiClient.get<Enquiry[]>("/api/marketplace/enquiries");
}

// TODO (backend): a real WhatsApp handoff goes through the WhatsApp Business
// API with a pre-provisioned number per seller/estate. This just builds a
// wa.me deep link with a prefilled message — there's no integration behind it.
export function whatsappHandoffUrl(listingName: string, plotLabel?: string): string {
  const text = encodeURIComponent(`Hi, I'm interested in ${listingName}${plotLabel ? ` (${plotLabel})` : ""} on LandVault.`);
  return `https://wa.me/2348020000000?text=${text}`;
}
