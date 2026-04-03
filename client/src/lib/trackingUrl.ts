const FALLBACK_TRACKING_BASE_URL = "https://carp-connect-ride-sharing-plateform.vercel.app";

export const TRACKING_BASE_URL =
  import.meta.env.VITE_PUBLIC_APP_URL?.replace(/\/$/, "") || FALLBACK_TRACKING_BASE_URL;

export const buildTrackingUrl = (rideId: string) => {
  if (!rideId) return "";
  return `${TRACKING_BASE_URL}/track/${rideId}`;
};