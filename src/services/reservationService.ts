// Backend integration seam for the plot reservation lock. Part 5 of the
// buyer flow, continued.
//
// CRITICAL, resolved decision (see landvault-buyer-purchase-flow in project
// memory): the 45-minute lock starts ONLY after KYC clears (or was already
// held) — never before, and never as the thing an inspection sits inside.
// Models the *shape* of a real lock (reserve → hold → expire/convert) the
// same way checkoutService.ts already does for the internal flow — this does
// NOT itself talk to a real lock store.
//
// TODO (backend): a real backend takes this out in Redis with a TTL so two
// buyers can never hold the same plot at once — mock mode just mutates the
// in-memory plot-status store below.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { PaymentsUnavailableError } from "./paymentsUnavailable";
import { fetchPlotById, setPlotStatusMock, type PlotStatus } from "./marketplacePlotsService";

export const RESERVATION_SECONDS = 45 * 60;

export interface Reservation {
  id: string;
  listingId: string;
  plotId: string;
  tierId: string;
  expiresAt: string; // ISO
  status: "active" | "expired" | "released" | "converted";
}

interface MockReservation extends Reservation {
  previousStatus: PlotStatus;
}

const mockReservations = new Map<string, MockReservation>();

// ReservationDto. The hold is the backend's — a closed laptop still returns
// the plot when it lapses; the browser's countdown only displays expiresAt.
interface ReservationDto {
  id: string;
  estateId: string;
  plotId: string;
  priceTierId: string;
  status: Reservation["status"];
  expiresAt: string;
  secondsRemaining: number;
}

function fromReservationDto(dto: ReservationDto): Reservation {
  return { id: dto.id, listingId: dto.estateId, plotId: dto.plotId, tierId: dto.priceTierId, expiresAt: dto.expiresAt, status: dto.status };
}

export async function startReservation(listingId: string, plotId: string): Promise<Reservation> {
  // CreateReservationRequest is { plotId } alone: the estate follows from it.
  if (!isMock("reservation")) return fromReservationDto(await apiClient.post<ReservationDto>("/api/reservations", { plotId }));

  const plot = await fetchPlotById(listingId, plotId);
  const previousStatus: PlotStatus = plot?.status ?? "available-dev";
  setPlotStatusMock(listingId, plotId, "reserved");

  const reservation: MockReservation = {
    id: `res-${Date.now()}`,
    listingId,
    plotId,
    tierId: plot?.tierId ?? "",
    expiresAt: new Date(Date.now() + RESERVATION_SECONDS * 1000).toISOString(),
    status: "active",
    previousStatus,
  };
  mockReservations.set(reservation.id, reservation);
  return reservation;
}

// Plot returns to the pool — used on explicit cancel or on the 45-minute
// timer expiring client-side (a real backend expires the Redis TTL itself).
export async function releaseReservation(id: string): Promise<void> {
  // Releasing a hold is DELETE /api/reservations/{id}.
  if (!isMock("reservation")) { await apiClient.del(`/api/reservations/${id}`); return; }
  const r = mockReservations.get(id);
  if (!r || r.status !== "active") return;
  setPlotStatusMock(r.listingId, r.plotId, r.previousStatus);
  r.status = "expired";
}

// Called once finance verification lands (see marketplaceCheckoutService.ts)
// — the plot converts from held to sold. Its tier's stock count drops for
// free: estatesService.ts's tiersFromPlots() always recomputes plotsRemaining
// live from plot statuses, so there's no separate counter to update here.
// TODO (backend): this, the finance decision, and document issuance must be
// one atomic transaction — see the note in marketplaceCheckoutService.ts.
export async function convertReservation(id: string): Promise<void> {
  // No such route: on the backend a reservation becomes a purchase only through
  // a finance-verified payment, which isn't built. Never faked as done.
  if (!isMock("reservation")) throw new PaymentsUnavailableError();
  const r = mockReservations.get(id);
  if (!r) return;
  setPlotStatusMock(r.listingId, r.plotId, "sold");
  r.status = "converted";
}

// The buyer's own active holds — GET /api/reservations/mine.
export async function fetchMyReservations(): Promise<Reservation[]> {
  if (!isMock("reservation")) return (await apiClient.get<ReservationDto[]>("/api/reservations/mine")).map(fromReservationDto);
  return [...mockReservations.values()].filter((r) => r.status === "active");
}
