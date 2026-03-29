export type CanonicalOfferStatus = "open" | "active" | "completed" | "cancelled";
export type CanonicalBookingStatus =
  | "pending"
  | "confirmed"
  | "picked_up"
  | "live"
  | "completed"
  | "cancelled"
  | "rejected";

export function normalizeOfferStatus(status: string | undefined | null): CanonicalOfferStatus {
  const s = String(status || "").toLowerCase();
  if (s === "matched" || s === "booked" || s === "active" || s === "live") return "active";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "open";
}

export function isOfferActiveLike(status: string | undefined | null): boolean {
  return normalizeOfferStatus(status) === "active";
}

export function offerStatusLabel(status: string | undefined | null): string {
  const normalized = normalizeOfferStatus(status);
  if (normalized === "open") return "Open";
  if (normalized === "active") return "Active";
  if (normalized === "completed") return "Completed";
  return "Cancelled";
}

export function normalizeBookingStatus(status: string | undefined | null): CanonicalBookingStatus {
  const s = String(status || "").toLowerCase();
  if (s === "in-ride" || s === "active") return "live";
  if (s === "pending") return "pending";
  if (s === "confirmed") return "confirmed";
  if (s === "picked_up" || s === "picked-up") return "picked_up";
  if (s === "live") return "live";
  if (s === "completed") return "completed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "rejected") return "rejected";
  return "pending";
}
