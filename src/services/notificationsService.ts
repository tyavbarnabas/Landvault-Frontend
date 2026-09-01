// Backend integration seam for in-app notifications. See INTEGRATION.md.

import { apiClient } from "../lib/apiClient";

export interface Notification {
  id: string;
  type: "payment" | "document" | "approval" | "reminder" | "construction";
  title: string;
  body: string;
  date: string;
  read: boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "reminder", title: "Installment Due in 5 Days", body: "Your next installment of ₦3,200,000 for Millbrook Gardens Block C Plot 4 is due on 15 Sep 2026.", date: "2026-09-10", read: false },
  { id: "n2", type: "construction", title: "Construction Milestone — Emerald Park", body: "Perimeter fencing at Emerald Park is now 100% complete. Road grading at 65%.", date: "2026-08-20", read: false },
  { id: "n3", type: "document", title: "Document Available", body: "Your Installment 6 receipt for Millbrook Gardens is ready in your vault.", date: "2026-08-15", read: true },
  { id: "n4", type: "approval", title: "KYC Approved", body: "Your identity verification has been approved. You can now transact on the platform.", date: "2024-08-10", read: true },
];

// In-memory mock store so read/unread state survives for the rest of the
// session, even without a backend.
let mockNotifications: Notification[] = [...MOCK_NOTIFICATIONS];

export async function fetchNotifications(): Promise<Notification[]> {
  if (apiClient.isMockMode) return mockNotifications;
  return apiClient.get<Notification[]>("/api/notifications");
}

export async function markNotificationRead(id: string): Promise<void> {
  if (apiClient.isMockMode) {
    mockNotifications = mockNotifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    return;
  }
  await apiClient.post(`/api/notifications/${id}/read`);
}
