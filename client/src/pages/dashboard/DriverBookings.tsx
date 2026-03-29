import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import { motion } from "framer-motion";
import {
  CheckCircle, XCircle, User, MessageSquare,
  Loader2, Navigation, Clock, DollarSign,
  Users, MapPin, AlertCircle, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "../../lib/api";
import { RateRideModal } from "@/components/RateRideModal";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

/* ------------------------------------------------------------------ */
/*  Reverse-geocode cache (same pattern as MyOffers)                   */
/* ------------------------------------------------------------------ */
const _geoCache: Record<string, string> = {};

async function reverseGeocode(coords: [number, number]): Promise<string> {
  const [lng, lat] = coords;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (_geoCache[key]) return _geoCache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const a = data.address || {};
    const label =
      a.neighbourhood || a.suburb || a.village || a.town ||
      a.city_district  || a.city   || a.county  ||
      data.display_name?.split(",")[0] || key;
    _geoCache[key] = label;
    return label;
  } catch {
    return key;
  }
}

function useAddr(geoPoint: { coordinates?: [number, number], address?: string } | undefined): string {
  const [label, setLabel] = useState("...");
  useEffect(() => {
    const coords = geoPoint?.coordinates;
    if (!coords || coords.length < 2) {
      if (geoPoint?.address) { setLabel(geoPoint.address.split(",")[0]); return; }
      setLabel("—"); return;
    }
    const [lng, lat] = coords;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (_geoCache[key]) { setLabel(_geoCache[key]); return; }
    reverseGeocode(coords as [number, number]).then(setLabel);
  }, [geoPoint?.coordinates?.[0], geoPoint?.coordinates?.[1], geoPoint?.address]);
  return label;
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                       */
/* ------------------------------------------------------------------ */
function fmtTime(raw: string | undefined) {
  if (!raw) return "—";
  try { return new Date(raw).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return raw; }
}

function fmtDate(raw: string | undefined) {
  if (!raw) return "—";
  try { return new Date(raw).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return raw; }
}

function shortAddr(point: any, fallback = "Unknown") {
  if (!point) return fallback;
  if (typeof point?.address === "string" && point.address) return point.address.split(",")[0];
  if (typeof point?.location?.address === "string" && point.location.address) return point.location.address.split(",")[0];
  if (Array.isArray(point?.coordinates) && point.coordinates.length >= 2) {
    const [lng, lat] = point.coordinates;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return fallback;
}

function fareDisplay(fare: any, fallback = "—"): string {
  if (!fare) return fallback;
  if (typeof fare === "number") return `PKR ${fare}`;
  if (typeof fare === "object" && fare.totalAmount != null)
    return `${fare.currency || "PKR"} ${Number(fare.totalAmount).toLocaleString()}`;
  return fallback;
}

function statusBadge(status: string) {
  switch (status) {
    case "confirmed": return "bg-emerald-50 text-emerald-600 border border-emerald-200";
    case "pending":   return "bg-amber-50 text-amber-600 border border-amber-200";
    case "cancelled":
    case "rejected":  return "bg-red-50 text-red-500 border border-red-200";
    case "live":      return "bg-blue-50 text-blue-600 border border-blue-200";
    default:          return "bg-gray-100 text-gray-500 border border-gray-200";
  }
}

/* ------------------------------------------------------------------ */
/*  BookingCard — own component so hooks are called at top level       */
/* ------------------------------------------------------------------ */
function BookingCard({
  booking, updatingId, onStatus, onLive, onReview,
}: {
  booking: any;
  updatingId: string | null;
  onStatus: (id: string, status: string) => void;
  onLive: (b: any) => void;
  onReview: (b: any) => void;
}) {
  // Resolve addresses from GeoJSON coordinates, fallback to nested address fields
  const originGeo = booking.offer?.origin || booking.origin;
  const destGeo   = booking.offer?.destination || booking.destination;
  const originLabel =
    (originGeo && originGeo.coordinates && originGeo.coordinates.length >= 2)
      ? useAddr(originGeo)
      : (booking.offer?.origin?.address || booking.originAddress || "Unknown origin");
  const destLabel =
    (destGeo && destGeo.coordinates && destGeo.coordinates.length >= 2)
      ? useAddr(destGeo)
      : (booking.offer?.destination?.address || booking.destinationAddress || "Unknown destination");
  const isBusy = updatingId === booking._id;
  return (
    <motion.div
      key={booking._id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl p-5 border shadow-sm relative overflow-hidden
        ${booking.status === "confirmed" ? "border-emerald-300" :
          booking.status === "cancelled" || booking.status === "rejected" ? "border-red-200 opacity-70" :
          "border-amber-200"}`}
    >
      {/* Corner accent */}
      {booking.status === "confirmed" && <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full" />}
      {booking.status === "pending"   && <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full" />}

      {/* Rider header */}
      <div className="flex justify-between items-start mb-4 relative z-10 gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{booking.rider?.name || 'Rider'}</p>
          <p className="text-xs text-gray-400 mt-0.5 break-words">{originLabel} → {destLabel}</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold uppercase border border-emerald-200 flex-shrink-0">
          {booking.seatCount || 1} seat{(booking.seatCount || 1) > 1 ? 's' : ''}
        </span>
      </div>

      {/* Route & details */}
      <div className="space-y-2 mb-4 text-xs">
        <div className="flex items-start justify-between gap-2">
          <span className="text-gray-400 flex items-center gap-1 flex-shrink-0">
            <MapPin size={11} /> From
          </span>
          <span className="font-medium text-gray-700 text-right truncate max-w-[46vw] sm:max-w-[160px]">{originLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Navigation size={11} /> To
          </span>
          <span className="font-medium text-gray-700 text-right truncate max-w-[46vw] sm:max-w-[160px]">{destLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-2 pt-2 border-t border-gray-100">
          <span className="text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock size={11} /> Departs
          </span>
          <span className="font-medium text-gray-700">{fmtDate(booking.offer?.departureTime || booking.departureTime)}</span>
        </div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-gray-400 flex items-center gap-1 flex-shrink-0">
            <DollarSign size={11} /> Fare
          </span>
          <span className="font-bold text-emerald-600">{fareDisplay(booking.fare)}</span>
        </div>
        {booking.seatCount && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-gray-400 flex items-center gap-1 flex-shrink-0">
              <Users size={11} /> Seats
            </span>
            <span className="font-medium text-gray-700">{booking.seatCount}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {booking.status === "pending" && (
        <div className="flex gap-2">
          <Button
            disabled={isBusy}
            onClick={() => onStatus(booking._id, "cancelled")}
            variant="outline"
            className="flex-1 h-9 border-red-200 text-red-500 hover:bg-red-50 text-xs font-semibold"
          >
            <XCircle className="w-4 h-4 mr-1" /> Reject
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => onStatus(booking._id, "confirm")}
            className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1" /> Accept</>}
          </Button>
        </div>
      )}

      {booking.status === "confirmed" && (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-9 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-semibold border border-emerald-200"
            onClick={() => { window.location.href = "/driver-dashboard?tab=messages"; }}
          >
            <MessageSquare className="w-4 h-4 mr-2" /> Open Chat
          </Button>
          <Button
            className="w-full h-9 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-semibold border border-blue-200"
            onClick={() => onLive(booking)}
          >
            <Navigation className="w-4 h-4 mr-2" /> Pickup Flow
          </Button>
        </div>
      )}

      {booking.status === "completed" && (
        <Button
          onClick={() => onReview(booking)}
          className="w-full h-9 bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs font-semibold border border-amber-200"
        >
          <Star className="w-4 h-4 mr-2" /> Rate Rider
        </Button>
      )}

      {booking.status === "cancelled" && (
        <p className="text-center text-[10px] font-bold text-red-400 uppercase py-1">
          Cancelled
        </p>
      )}
    </motion.div>
  );
// Removed stray/duplicate JSX after BookingCard's return
}

/* ------------------------------------------------------------------ */
/*  LiveRideTracker modal                                               */
/* ------------------------------------------------------------------ */
function LiveRideTracker({
  booking, onClose, onStatus,
}: {
  booking: any;
  onClose: () => void;
  onStatus: (s: string) => void;
}) {
  const [stage, setStage] = useState(1);
  const labels = ["En route to pickup", "Arrived at pickup", "Ready to continue in Live Ride"];
  const originLabel = useAddr(booking.offer?.origin || booking.origin);
  const destLabel   = useAddr(booking.offer?.destination || booking.destination);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-6"
      >
        <h3 className="font-bold text-lg text-gray-900 mb-4">Live Ride Tracker</h3>
        <span className="inline-block px-3 py-1 rounded-full bg-blue-50 text-blue-600 font-bold text-xs border border-blue-200 mb-4">
          {labels[stage - 1]}
        </span>
        <div className="space-y-2 text-sm mb-6">
          <p><span className="font-semibold text-gray-500">From: </span>{originLabel}</p>
          <p><span className="font-semibold text-gray-500">To: </span>{destLabel}</p>
        </div>
        <div className="space-y-2">
          {stage === 1 && (
            <Button onClick={() => { setStage(2); onStatus("arrived"); }}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold">
              Arrived at Pickup
            </Button>
          )}
          {stage === 2 && (
            <Button onClick={() => { setStage(3); onStatus("picked_up"); }}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold">
              Picked Up Rider
            </Button>
          )}
          {stage === 3 && (
            <Button onClick={() => onStatus("go_live")}
              className="w-full bg-purple-500 hover:bg-purple-600 text-white rounded-2xl font-bold">
              Open Live Ride
            </Button>
          )}
        </div>
        <div className="mt-4 text-right">
          <Button variant="outline" onClick={onClose} className="rounded-2xl">Close</Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RideRequestCard — own component for hooks                          */
/* ------------------------------------------------------------------ */
function RideRequestCard({
  req, actionId, counterFare, onCounterChange, onAccept, onReject, onCounter,
}: {
  req: any;
  actionId: string | null;
  counterFare: string;
  onCounterChange: (v: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
}) {
  // Resolve addresses from origin/destination GeoJSON on the request itself, fallback to string address
  const originLabel =
    (req.origin && req.origin.coordinates && req.origin.coordinates.length >= 2)
      ? useAddr(req.origin)
      : (req.originAddress || "Unknown origin");
  const destLabel =
    (req.destination && req.destination.coordinates && req.destination.coordinates.length >= 2)
      ? useAddr(req.destination)
      : (req.destinationAddress || "Unknown destination");

  const isBusy = actionId === req._id;
  const riderMaxFare = req.maxPricePerSeat ?? req.maxPrice ?? req.maxFare ?? null;
  const hasCompatibleOffer = Array.isArray(req?.compatibleOffers) && req.compatibleOffers.length > 0;

  return (
    <div className="rounded-2xl border border-gray-200 p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{req.rider?.name || "Rider"}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {originLabel} → {destLabel}
          </p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold uppercase border border-emerald-200 flex-shrink-0">
          {req.seatsNeeded} seat{req.seatsNeeded > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-3">
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <p className="text-gray-400 mb-0.5">Earliest</p>
          <p className="font-semibold text-gray-700">{fmtTime(req.earliestDeparture)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <p className="text-gray-400 mb-0.5">Latest</p>
          <p className="font-semibold text-gray-700">{fmtTime(req.latestDeparture)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2">
          <p className="text-gray-400 mb-0.5">Max fare</p>
          <p className="font-semibold text-gray-700">
            {riderMaxFare ? `${req.currency || "PKR"} ${riderMaxFare}` : "No limit"}
          </p>
        </div>
      </div>

      {/* Counter fare */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="number"
          min={1}
          placeholder="Counter fare / seat"
          value={counterFare}
          onChange={e => onCounterChange(e.target.value)}
          className="h-8 w-full sm:w-36 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs outline-none focus:border-emerald-400 transition-colors"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!counterFare || isBusy}
          onClick={onCounter}
          className="h-8 text-xs rounded-xl"
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Counter"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={onReject}
          className="flex-1 h-9 text-xs border-red-200 text-red-500 hover:bg-red-50 rounded-xl"
        >
          Reject
        </Button>
        <Button
          size="sm"
          disabled={isBusy || !hasCompatibleOffer}
          onClick={onAccept}
          className="flex-1 h-9 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl"
        >
          {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Accept Request"}
        </Button>
      </div>
      {!hasCompatibleOffer && (
        <p className="mt-2 text-[11px] font-medium text-amber-600">
          This request cannot be accepted because none of your offers match its route and timing.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */
const DriverBookings = () => {
  const [bookings, setBookings]         = useState<any[]>([]);
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [liveBooking, setLiveBooking]   = useState<any>(null);
  const [reviewBooking, setReviewBooking] = useState<any>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [counterFareById, setCounterFareById] = useState<Record<string, string>>({});
  const [timeFilter, setTimeFilter]     = useState<"all" | "today" | "week" | "month">("all");
  const socketRef = useRef<any>(null);

  /* ---- API calls ---- */
  const fetchBookings = async () => {
    try {
      const res = await api.get("/bookings?role=driver");
      const list = res.data?.data?.bookings || res.data?.bookings || [];
      const user = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
      // Filter to only bookings where this driver is the driver
      const mine = list.filter((b: any) =>
        (b.driver?._id === user._id || b.driver === user._id ||
        b.driverId === user._id || String(b.driverId) === String(user._id)) &&
        !b.hiddenForDriver
      );
      setBookings(mine);
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDriverRequests = async () => {
    setRequestsLoading(true);
    try {
      // ✓ correct — backend: GET /api/rides/requests/driver/open
      const res = await api.get("/rides/requests/driver/open");
      setRideRequests(res.data?.data?.requests || []);
    } catch (err) {
      console.error("Failed to fetch driver requests:", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const fetchDriverOffers = async () => {
    try {
      // FIX: was "/rideoffers/offers" → correct path is "/rides/offers/me"
      const res = await api.get("/rides/offers/me");
      const offers = res.data?.data?.offers || res.data?.offers || [];
      setDriverOffers(
        (Array.isArray(offers) ? offers : []).filter(
          (offer: any) =>
            !offer.hiddenForDriver &&
            ["open", "active", "booked", "matched"].includes(String(offer?.status || ""))
        )
      );
    } catch (err) {
      console.error("Failed to fetch driver offers:", err);
    }
  };

  useEffect(() => {
    fetchBookings();
    fetchDriverRequests();
    fetchDriverOffers();

    // Real-time socket
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, { transports: ["websocket"], reconnection: true });
    }
    const socket = socketRef.current;
    socket.on("bookingStatusUpdated", (data: any) => {
      if (data?.bookingId && data?.status) {
        setBookings(prev => prev.map(b => b._id === data.bookingId ? { ...b, status: data.status } : b));
      }
    });
    return () => { socket?.disconnect(); };
  }, []);

  /* ---- helpers ---- */
  const getBestOffer = (request: any) => {
    const compatible = Array.isArray(request?.compatibleOffers) ? request.compatibleOffers[0] : null;
    return compatible?._id ? compatible : null;
  };

  /* ---- accept request ---- */
  const handleAcceptRequest = async (request: any) => {
    const offer  = getBestOffer(request);
    const offerId = offer?._id;
    if (!offerId) {
      toast.error("This request cannot be accepted because none of your ride offers match it.");
      return;
    }
    setRequestActionId(request._id);
    try {
      await api.post("/match/matches", { offerId, requestId: request._id });
      await fetchDriverRequests();
      await fetchBookings();
      await fetchDriverOffers();
      toast.success("Request accepted! Ride will appear in your dashboard.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to accept this request.");
    } finally {
      setRequestActionId(null);
    }
  };

  /* ---- reject request ---- */
  const handleRejectRequest = async (requestId: string) => {
    setRequestActionId(requestId);
    try {
      // Correct: POST /rides/requests/:id/reject
      await api.post(`/rides/requests/${requestId}/reject`);
      await fetchDriverRequests();
      toast.success("Request rejected.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to reject request.");
    } finally {
      setRequestActionId(null);
    }
  };

  /* ---- counter offer ---- */
  const handleCounterRequest = async (request: any) => {
    const fare = Number(counterFareById[request._id]);
    if (!Number.isFinite(fare) || fare <= 0) {
      toast.error("Enter a valid counter fare first."); return;
    }
    const offer = getBestOffer(request);
    if (!offer?._id) {
      toast.error("You need an active ride offer to send a counter. Create one first."); return;
    }
    setRequestActionId(request._id);
    try {
      await api.post(`/rides/requests/${request._id}/counter`, {
        offerId: offer._id,
        pricePerSeat: fare,
        currency: offer.currency || request.currency || "PKR",
      });
      setRideRequests(prev => prev.map(r =>
        r._id === request._id
          ? { ...r, counterOffer: { pricePerSeat: fare, status: "pending" } }
          : r
      ));
      toast.success("Counter offer sent!");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to send counter offer.");
    } finally {
      setRequestActionId(null);
    }
  };

  /* ---- booking status ---- */
  const handleStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      if (newStatus === "confirm") {
        await api.put(`/bookings/${id}/confirm`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "confirmed" } : b));
      } else if (newStatus === "arrived") {
        await api.patch(`/bookings/${id}/arrived`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, arrivedAt: new Date().toISOString() } : b));
      } else if (newStatus === "picked_up") {
        await api.patch(`/bookings/${id}/picked-up`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "picked_up" } : b));
      } else if (newStatus === "live") {
        await api.patch(`/bookings/${id}/status`, { status: "live" });
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "live" } : b));
      } else if (newStatus === "completed") {
        await api.patch(`/bookings/${id}/completed`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "completed" } : b));
      } else {
        await api.patch(`/bookings/${id}/status`, { status: newStatus });
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: newStatus } : b));
      }
    } catch (err: any) {
      console.error("Failed to update status:", err);
      toast.error(err?.response?.data?.message || "Failed to update booking status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLiveStatus = async (booking: any, status: string) => {
    if (status === "go_live") {
      setLiveBooking(null);
      window.location.href = "/driver-dashboard?tab=live";
      return;
    }
    await handleStatus(booking._id, status);
    if (status === "picked_up" || status === "live") {
      setLiveBooking(null);
      window.location.href = "/driver-dashboard?tab=live";
    }
  };

  /* ---- filter ---- */
  const filtered = bookings.filter(b => {
    if (timeFilter === "all") return true;
    const d = new Date(b.offer?.departureTime || b.createdAt);
    const now = new Date();
    if (timeFilter === "today") return d.toDateString() === now.toDateString();
    if (timeFilter === "week")  { const ago = new Date(); ago.setDate(now.getDate() - 7);  return d >= ago; }
    if (timeFilter === "month") { const ago = new Date(); ago.setMonth(now.getMonth() - 1); return d >= ago; }
    return true;
  });

  const activeOffersCount = driverOffers.filter((offer: any) => ["open", "active", "booked", "matched"].includes(offer.status)).length;
  const openSeatsCount = driverOffers.reduce((sum: number, offer: any) => sum + Number(offer.seatsAvailable || 0), 0);
  const acceptedBookingsCount = bookings.filter((booking: any) => ["confirmed", "picked_up", "live"].includes(booking.status)).length;
  const completedBookingsCount = bookings.filter((booking: any) => booking.status === "completed").length;
  const bookingGroups = filtered.reduce((acc: Record<string, { offer: any; bookings: any[] }>, booking: any) => {
    const offerId = booking.offer?._id || booking.offerId || booking.offer || "unassigned";
    if (!acc[offerId]) {
      const matchingOffer = driverOffers.find((offer: any) => offer._id === offerId) || booking.offer || null;
      acc[offerId] = { offer: matchingOffer, bookings: [] };
    }
    acc[offerId].bookings.push(booking);
    return acc;
  }, {});
  const bookingGroupEntries = Object.entries(bookingGroups) as Array<[string, { offer: any; bookings: any[] }]>;

  /* ---- render ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Published Offers</p>
          <p className="text-2xl font-bold text-gray-900">{activeOffersCount}</p>
          <p className="text-xs text-gray-400 mt-1">Visible in My Offers</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Open Seats</p>
          <p className="text-2xl font-bold text-gray-900">{openSeatsCount}</p>
          <p className="text-xs text-gray-400 mt-1">Still available across your offers</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Accepted Riders</p>
          <p className="text-2xl font-bold text-gray-900">{acceptedBookingsCount}</p>
          <p className="text-xs text-gray-400 mt-1">Move these riders into pickup flow</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Completed Trips</p>
          <p className="text-2xl font-bold text-gray-900">{completedBookingsCount}</p>
          <p className="text-xs text-gray-400 mt-1">Ready for rider reviews</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-lg font-bold text-gray-900">How Driver Flow Works</h3>
        <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm text-gray-600">
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <p className="font-semibold text-gray-900">1. My Offers</p>
            <p className="mt-1">Your created offers, remaining seats, and offer details stay there.</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <p className="font-semibold text-gray-900">2. Manage Requests</p>
            <p className="mt-1">Open rider requests, counter offers, and accepted rider cards are handled here.</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <p className="font-semibold text-gray-900">3. Live Ride</p>
            <p className="mt-1">After pickup starts, use Live Ride for arrival, picked-up riders, route progress, and drop-offs.</p>
          </div>
        </div>
      </div>

      {/* ── Open Rider Requests ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900">Open Rider Requests</h3>
          <p className="text-xs text-gray-400 mt-0.5">Compare requested seats and rider budget before accepting.</p>
        </div>

        {requestsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        ) : rideRequests.filter(r => r.status === 'open').length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm text-gray-400">No open rider requests right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rideRequests.filter(r => r.status === 'open').map(req => (
              <RideRequestCard
                key={req._id}
                req={req}
                actionId={requestActionId}
                counterFare={counterFareById[req._id] || ""}
                onCounterChange={v => setCounterFareById(prev => ({ ...prev, [req._id]: v }))}
                onAccept={() => handleAcceptRequest(req)}
                onReject={() => handleRejectRequest(req._id)}
                onCounter={() => handleCounterRequest(req)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bookings header + filter ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Requests</h2>
          <p className="text-sm text-gray-400 mt-0.5">Review and manage rider requests for your rides</p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
          {(["all", "today", "week", "month"] as const).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeFilter(tf)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                timeFilter === tf ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* ── Booking cards ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-base font-bold text-gray-800 mb-1">No Bookings Found</h3>
          <p className="text-gray-400 text-sm">
            {timeFilter !== "all" ? "Try changing the time filter." : "No bookings yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {bookingGroupEntries.map(([offerId, group]) => {
            const offer = group.offer;
            const routeLabel = offer
              ? `${shortAddr(offer.origin, "Origin")} -> ${shortAddr(offer.destination, "Destination")}`
              : "Offer details unavailable";
            const activeRiders = group.bookings.filter((booking: any) => ["confirmed", "picked_up", "live"].includes(booking.status)).length;
            const seatDemand = group.bookings.reduce((sum: number, booking: any) => sum + Number(booking.seatCount || booking.seatsRequested || booking.seats || 1), 0);

            return (
              <div key={offerId} className="bg-white rounded-3xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{routeLabel}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {offer ? `${fmtDate(offer.departureTime)} • ${offer.seatsAvailable ?? 0} seats left` : "Linked bookings for this offer"}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                      {group.bookings.length} riders
                    </span>
                    <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200 text-[10px] font-bold uppercase tracking-wider">
                      {seatDemand} seats requested
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold uppercase tracking-wider">
                      {activeRiders} active
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.bookings.map(booking => (
                    <BookingCard
                      key={booking._id}
                      booking={booking}
                      updatingId={updatingId}
                      onStatus={handleStatus}
                      onLive={setLiveBooking}
                      onReview={setReviewBooking}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Live tracker modal ── */}
      {liveBooking && (
        <LiveRideTracker
          booking={liveBooking}
          onClose={() => setLiveBooking(null)}
          onStatus={s => handleLiveStatus(liveBooking, s)}
        />
      )}

      {reviewBooking && (
        <RateRideModal
          booking={reviewBooking}
          targetUser={reviewBooking.rider}
          subjectLabel="ride with rider"
          onClose={() => setReviewBooking(null)}
          onSuccess={() => {
            setReviewBooking(null);
            toast.success("Review submitted!");
          }}
        />
      )}
    </div>
  );
};

export default DriverBookings;
