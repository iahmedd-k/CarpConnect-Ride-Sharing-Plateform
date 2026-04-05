import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import { motion } from "framer-motion";
import {
  CheckCircle, XCircle, User, MessageSquare,
  Loader2, Navigation, Clock, DollarSign,
  Users, MapPin, AlertCircle, Star, PlusCircle, Send, Trash2, X, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "../../lib/api";
import { RateRideModal } from "@/components/RateRideModal";
import { useNavigate } from "react-router-dom";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

const buildReviewedBookingMap = (reviews: any[] = []) =>
  reviews.reduce((acc: Record<string, boolean>, review: any) => {
    const bookingId = String(review?.bookingId || "");
    if (bookingId) acc[bookingId] = true;
    return acc;
  }, {});

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
  if (typeof point === "string" && point.trim()) return point.split(",")[0];
  if (typeof point?.originAddress === "string" && point.originAddress) return point.originAddress.split(",")[0];
  if (typeof point?.destinationAddress === "string" && point.destinationAddress) return point.destinationAddress.split(",")[0];
  if (typeof point?.address === "string" && point.address) return point.address.split(",")[0];
  if (typeof point?.location?.address === "string" && point.location.address) return point.location.address.split(",")[0];
  if (typeof point?.point?.address === "string" && point.point.address) return point.point.address.split(",")[0];
  if (typeof point?.label === "string" && point.label) return point.label.split(",")[0];
  if (typeof point?.name === "string" && point.name) return point.name.split(",")[0];
  if (typeof point?.origin?.address === "string" && point.origin.address) return point.origin.address.split(",")[0];
  if (typeof point?.destination?.address === "string" && point.destination.address) return point.destination.address.split(",")[0];
  if (Array.isArray(point?.coordinates) && point.coordinates.length >= 2) {
    const [lng, lat] = point.coordinates;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  if (Array.isArray(point?.point?.coordinates) && point.point.coordinates.length >= 2) {
    const [lng, lat] = point.point.coordinates;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return fallback;
}

function toLocalDateInput(raw: string | undefined) {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalTimeInput(raw: string | undefined) {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function fareDisplay(fare: any, fallback = "—"): string {
  if (!fare) return fallback;
  if (typeof fare === "number") return `PKR ${fare}`;
  if (typeof fare === "object" && fare.totalAmount != null)
    return `${fare.currency || "PKR"} ${Number(fare.totalAmount).toLocaleString()}`;
  return fallback;
}

function getBookingRouteSource(booking: any, kind: "origin" | "destination") {
  const requestField = booking?.request?.[kind];
  if (requestField?.coordinates?.length >= 2 || requestField?.address) return requestField;

  const bookingField = booking?.[kind];
  if (bookingField?.coordinates?.length >= 2 || bookingField?.address) return bookingField;

  return booking?.offer?.[kind] || null;
}

function getBookingRouteFallback(booking: any, kind: "origin" | "destination") {
  const requestAddress = kind === "origin"
    ? booking?.request?.originAddress
    : booking?.request?.destinationAddress;
  if (typeof requestAddress === "string" && requestAddress.trim()) return requestAddress;

  const bookingAddress = kind === "origin" ? booking?.originAddress : booking?.destinationAddress;
  if (typeof bookingAddress === "string" && bookingAddress.trim()) return bookingAddress;

  const offerAddress = booking?.offer?.[kind]?.address;
  if (typeof offerAddress === "string" && offerAddress.trim()) return offerAddress;

  return kind === "origin" ? "Unknown origin" : "Unknown destination";
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

function ChatModal({ booking, me, onClose }: { booking: any; me: any; onClose: () => void }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const socketRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const asId = (value: any) => String(value?._id || value?.id || value || "");
  const dedupeMsgs = (items: any[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = String(item?._id || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const partner = asId(booking.driver) === asId(me) ? booking.rider : booking.driver;

  useEffect(() => {
    const fetchMsgs = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/chat/${booking._id}`);
        setMsgs(dedupeMsgs(res.data?.data?.messages || []));
        setIsLocked(Boolean(res.data?.data?.room?.isLocked));
      } catch {
        toast.error("Failed to load chat.");
      } finally {
        setLoading(false);
      }
    };

    fetchMsgs();
    const token = localStorage.getItem("carpconnect_token");
    if (!token) return;
    socketRef.current = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    socketRef.current.emit("join:chat", { bookingId: booking._id }, (response: any) => {
      setIsLocked(Boolean(response?.isLocked));
    });
    socketRef.current.on("chat:message", (msg: any) => {
      setMsgs((prev: any[]) => dedupeMsgs([
        ...prev,
        {
          _id: msg._id || Date.now(),
          content: msg.content,
          createdAt: msg.timestamp || new Date(),
          sender: msg.sender || { _id: msg.senderId, role: msg.senderRole },
          status: msg.status || "delivered",
        },
      ]));
    });
    socketRef.current.on("ride_ended", () => {
      setIsLocked(true);
    });

    return () => {
      socketRef.current?.emit("leave:chat", { bookingId: booking._id });
      socketRef.current?.disconnect();
    };
  }, [booking._id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    if (!text.trim() || isLocked) return;
    const payload = text.trim();
    setText("");
    try {
      const res = await api.post("/chat", { bookingId: booking._id, content: payload });
      if (res.data?.data?.message) {
        setMsgs((prev: any[]) => dedupeMsgs([...prev, res.data.data.message]));
      }
    } catch {
      toast.error("Failed to send message.");
    }
  };

  const del = async (id: string) => {
    try {
      await api.delete(`/chat/${id}`);
      setMsgs((prev: any[]) => prev.filter((item) => item._id !== id));
    } catch {
      toast.error("Failed to delete message.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-lg bg-card rounded-3xl border border-border/50 shadow-2xl flex flex-col overflow-hidden"
        style={{ height: "70vh", maxHeight: "600px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-card flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
            {partner?.avatar
              ? <img src={partner.avatar} alt="avatar" className="w-full h-full object-cover" />
              : <span className="font-bold text-primary text-sm">{partner?.name?.[0] || "?"}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{partner?.name || "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground truncate">
              {booking.offer?.origin?.address?.split(",")[0] || "Ride"} → {booking.offer?.destination?.address?.split(",")[0] || ""}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-muted/5 min-h-0">
          {isLocked && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700">
              This ride has ended. Group chat is now closed.
            </div>
          )}
          {loading && (
            <div className="flex justify-center pt-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
            </div>
          )}
          {!loading && msgs.length === 0 && (
            <div className="text-center text-sm text-muted-foreground pt-10">No messages yet. Say hello!</div>
          )}
          {msgs.map((msg) => {
            const isMe = asId(msg.sender) === asId(me);
            return (
              <div key={msg._id} className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
                <div className="flex items-center gap-2">
                  {isMe && (
                    <button onClick={() => del(msg._id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/10 rounded-full transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-primary text-white" : "bg-card border border-border text-foreground"}`}>
                    <p>{msg.content}</p>
                    <div className="text-[9px] mt-1 opacity-60 flex items-center gap-1 justify-end">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-border bg-card flex items-center gap-2 flex-shrink-0">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={isLocked ? "Chat closed for completed ride" : "Type a message..."}
            disabled={isLocked}
            className="flex-1 bg-muted/30 rounded-xl px-4 py-2.5 text-sm outline-none border border-border focus:border-primary transition-all disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button onClick={send} disabled={isLocked || !text.trim()} className="h-10 w-10 p-0 bg-primary text-white rounded-xl shrink-0 disabled:opacity-60">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  BookingCard — own component so hooks are called at top level       */
/* ------------------------------------------------------------------ */
function BookingCard({
  booking, updatingId, onStatus, onLive, onReview, onChat, alreadyReviewed,
}: {
  booking: any;
  updatingId: string | null;
  onStatus: (id: string, status: string) => void;
  onLive: (b: any) => void;
  onReview: (b: any) => void;
  onChat: (b: any) => void;
  alreadyReviewed: boolean;
}) {
  // Resolve addresses from GeoJSON coordinates, fallback to nested address fields
  const originGeo = getBookingRouteSource(booking, "origin");
  const destGeo   = getBookingRouteSource(booking, "destination");
  const originLabel =
    (originGeo && originGeo.coordinates && originGeo.coordinates.length >= 2)
      ? useAddr(originGeo)
      : getBookingRouteFallback(booking, "origin");
  const destLabel =
    (destGeo && destGeo.coordinates && destGeo.coordinates.length >= 2)
      ? useAddr(destGeo)
      : getBookingRouteFallback(booking, "destination");
  const isBusy = updatingId === booking._id;
  return (
    <motion.div
      key={booking._id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl p-4 border shadow-sm relative overflow-hidden
        ${booking.status === "confirmed" ? "border-emerald-300" :
          booking.status === "cancelled" || booking.status === "rejected" ? "border-red-200 opacity-70" :
          "border-amber-200"}`}
    >
      {/* Corner accent */}
      {booking.status === "confirmed" && <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full" />}
      {booking.status === "pending"   && <div className="absolute top-0 right-0 w-16 h-16 bg-amber-50 rounded-bl-full" />}

      {/* Rider header */}
      <div className="flex justify-between items-start mb-3 relative z-10 gap-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{booking.rider?.name || 'Rider'}</p>
          <p className="text-xs text-gray-400 mt-0.5 break-words">{originLabel} → {destLabel}</p>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-bold uppercase border border-emerald-200 flex-shrink-0">
          {booking.seatCount || 1} seat{(booking.seatCount || 1) > 1 ? 's' : ''}
        </span>
      </div>

      {/* Route & details */}
      <div className="space-y-2 mb-3 text-xs">
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
            className="flex-1 h-8.5 border-red-200 text-red-500 hover:bg-red-50 text-xs font-semibold"
          >
            <XCircle className="w-4 h-4 mr-1" /> Reject
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => onStatus(booking._id, "confirm")}
            className="flex-1 h-8.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold"
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1" /> Accept</>}
          </Button>
        </div>
      )}

      {booking.status === "confirmed" && (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full h-8.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-semibold border border-emerald-200"
            onClick={() => onChat(booking)}
          >
            <MessageSquare className="w-4 h-4 mr-2" /> Open Chat
          </Button>
          <Button
            className="w-full h-8.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-semibold border border-blue-200"
            onClick={() => onLive(booking)}
          >
            <Navigation className="w-4 h-4 mr-2" /> Pickup Flow
          </Button>
        </div>
      )}

      {booking.status === "completed" && (
        alreadyReviewed ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.info("You already reviewed this rider.")}
            className="w-full h-8.5 border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-semibold"
          >
            <CheckCircle className="w-4 h-4 mr-2" /> Already Reviewed
          </Button>
        ) : (
          <Button
            onClick={() => onReview(booking)}
            className="w-full h-8.5 bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs font-semibold border border-amber-200"
          >
            <Star className="w-4 h-4 mr-2" /> Rate Rider
          </Button>
        )
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
  const originGeo = getBookingRouteSource(booking, "origin");
  const destGeo   = getBookingRouteSource(booking, "destination");
  const originLabel =
    originGeo?.coordinates?.length >= 2
      ? useAddr(originGeo)
      : getBookingRouteFallback(booking, "origin");
  const destLabel =
    destGeo?.coordinates?.length >= 2
      ? useAddr(destGeo)
      : getBookingRouteFallback(booking, "destination");

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
  req, actionId, counterFare, onCounterChange, onAccept, onReject, onCounter, onCreateOffer, highlighted = false,
}: {
  req: any;
  actionId: string | null;
  counterFare: string;
  onCounterChange: (v: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onCounter: () => void;
  onCreateOffer: () => void;
  highlighted?: boolean;
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
    <div
      className={`rounded-2xl border p-3.5 bg-white transition-all ${
        highlighted
          ? "border-emerald-300 ring-2 ring-emerald-100 shadow-sm shadow-emerald-100"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-2.5">
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
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
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
        <div className="mt-2 space-y-2">
          <p className="text-[11px] font-medium text-amber-600">
            Create a matching offer first. This rider request cannot be accepted until you have a relevant route and time.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onCreateOffer}
            className="w-full h-9 text-xs rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Create Matching Offer
          </Button>
        </div>
      )}
      {hasCompatibleOffer && highlighted && (
        <p className="mt-2 text-[11px] font-medium text-emerald-600">
          Your newly created offer matches this request. You can accept it now.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */
const DriverBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings]         = useState<any[]>([]);
  const [rideRequests, setRideRequests] = useState<any[]>([]);
  const [driverOffers, setDriverOffers] = useState<any[]>([]);
  const [requestsMeta, setRequestsMeta] = useState<{ limit: number; scope: string; driverAreas: string[]; needsCity?: boolean } | null>(null);
  const [loading, setLoading]           = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [liveBooking, setLiveBooking]   = useState<any>(null);
  const [chatBooking, setChatBooking]   = useState<any>(null);
  const [reviewBooking, setReviewBooking] = useState<any>(null);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Record<string, boolean>>({});
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [counterFareById, setCounterFareById] = useState<Record<string, string>>({});
  const [highlightRequestId, setHighlightRequestId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter]     = useState<"all" | "today" | "week" | "month">("all");
  const socketRef = useRef<any>(null);

  /* ---- API calls ---- */
  const fetchBookings = async () => {
    try {
      const [res, reviewRes] = await Promise.all([
        api.get("/bookings?role=driver"),
        api.get("/reviews/history"),
      ]);
      const list = res.data?.data?.bookings || res.data?.bookings || [];
      const givenReviews = reviewRes.data?.data?.reviewsGiven || [];
      const user = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
      // Filter to only bookings where this driver is the driver
      const mine = list.filter((b: any) =>
        (b.driver?._id === user._id || b.driver === user._id ||
        b.driverId === user._id || String(b.driverId) === String(user._id)) &&
        !b.hiddenForDriver
      );
      setBookings(mine);
      setReviewedBookingIds(buildReviewedBookingMap(givenReviews));
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
      setRequestsMeta({
        limit: Number(res.data?.data?.limit || 20),
        scope: String(res.data?.data?.scope || "Showing top 20 rider requests from your area"),
        driverAreas: Array.isArray(res.data?.data?.driverAreas) ? res.data.data.driverAreas : [],
        needsCity: Boolean(res.data?.data?.needsCity),
      });
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

  const handleRefresh = async () => {
    setLoading(true);
    setRequestsLoading(true);
    try {
      await Promise.all([
        fetchBookings(),
        fetchDriverRequests(),
        fetchDriverOffers(),
      ]);
      toast.success("Manage Requests refreshed.");
    } catch {
      toast.error("Failed to refresh requests.");
    }
  };

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

  const handleCreateMatchingOffer = (request: any) => {
    const offerDraft = {
      origin: request.originAddress || "",
      destination: request.destinationAddress || "",
      departureDate: toLocalDateInput(request.earliestDeparture),
      earliestTime: toLocalTimeInput(request.earliestDeparture) || "08:00",
      latestTime: toLocalTimeInput(request.latestDeparture) || "08:30",
      seatsTotal: Number(request.seatsNeeded || 1),
      pricePerSeat: request.maxPricePerSeat ? String(request.maxPricePerSeat) : "",
    };
    localStorage.setItem("carpconnect_offer_draft", JSON.stringify(offerDraft));
    localStorage.setItem(
      "carpconnect_offer_return_request",
      JSON.stringify({
        requestId: request._id,
        riderName: request.rider?.name || "Rider",
        originAddress: request.originAddress || "",
        destinationAddress: request.destinationAddress || "",
      })
    );
    navigate("/driver-dashboard?tab=offer");
  };

  useEffect(() => {
    const rawContext = localStorage.getItem("carpconnect_offer_return_request");
    if (!rawContext || rideRequests.length === 0) return;

    try {
      const context = JSON.parse(rawContext);
      const requestId = String(context?.requestId || "");
      if (!requestId) {
        localStorage.removeItem("carpconnect_offer_return_request");
        return;
      }

      const matchedRequest = rideRequests.find((request: any) => String(request._id) === requestId);
      if (!matchedRequest) return;

      setHighlightRequestId(requestId);
      if (Array.isArray(matchedRequest.compatibleOffers) && matchedRequest.compatibleOffers.length > 0) {
        toast.success("Your new offer matches this rider request. You can accept it now.");
        localStorage.removeItem("carpconnect_offer_return_request");
        return;
      }

      toast.info("Offer created. We’re checking whether this rider request now matches your route.");
      localStorage.removeItem("carpconnect_offer_return_request");
    } catch {
      localStorage.removeItem("carpconnect_offer_return_request");
    }
  }, [rideRequests]);

  /* ---- booking status ---- */
  const handleStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      if (newStatus === "confirm") {
        await api.put(`/bookings/${id}/confirm`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "confirmed" } : b));
      } else if (newStatus === "cancelled") {
        await api.put(`/bookings/${id}/reject`);
        setBookings(prev => prev.map(b => b._id === id ? { ...b, status: "cancelled" } : b));
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
    <div className="space-y-4">

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Published Offers</p>
          <p className="text-xl font-semibold text-gray-900">{activeOffersCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Open Seats</p>
          <p className="text-xl font-semibold text-gray-900">{openSeatsCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Accepted Riders</p>
          <p className="text-xl font-semibold text-gray-900">{acceptedBookingsCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Completed Trips</p>
          <p className="text-xl font-semibold text-gray-900">{completedBookingsCount}</p>
        </div>
      </div>

      {/* ── Open Rider Requests ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-gray-900">Open Rider Requests</h3>
          <p className="mt-1 text-xs text-gray-500">
            {requestsMeta?.scope || "Showing top 20 rider requests from your area."}
          </p>
          {requestsMeta?.needsCity && (
            <p className="mt-1 text-xs text-amber-600">
              Add your city in Settings for better local request matching.
            </p>
          )}
        </div>

        {requestsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        ) : rideRequests.filter(r => r.status === 'open').length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm text-gray-400">
              {requestsMeta?.needsCity ? "Add your city in Settings to unlock local open requests." : "No open rider requests right now."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
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
                onCreateOffer={() => handleCreateMatchingOffer(req)}
                highlighted={highlightRequestId === req._id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Bookings header + filter ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Manage Requests</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || requestsLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-emerald-200 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || requestsLoading) ? "animate-spin" : ""}`} />
            Refresh
          </button>
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
      </div>

      {/* ── Booking cards ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">No Bookings Found</h3>
          <p className="text-gray-400 text-sm">
            {timeFilter !== "all" ? "Try changing the time filter." : "No bookings yet."}
          </p>
        </div>
      ) : (
          <div className="space-y-4">
            {bookingGroupEntries.map(([offerId, group]) => {
            const offer = group.offer;
            const routeLabel = offer
              ? `${shortAddr(offer.originAddress || offer.origin?.address || offer.origin, "Origin")} -> ${shortAddr(offer.destinationAddress || offer.destination?.address || offer.destination, "Destination")}`
              : "Offer details unavailable";
            const pendingRequests = group.bookings.filter((booking: any) => booking.status === "pending").length;
            const activeRiders = group.bookings.filter((booking: any) => ["confirmed", "picked_up", "live"].includes(booking.status)).length;
            const confirmedSeats = group.bookings
              .filter((booking: any) => ["confirmed", "picked_up", "live"].includes(booking.status))
              .reduce((sum: number, booking: any) => sum + Number(booking.seatCount || booking.seatsRequested || booking.seats || 1), 0);

            return (
              <div key={offerId} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{routeLabel}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {offer ? `${fmtDate(offer.departureTime)} • ${offer.seatsAvailable ?? 0} seats left` : "Linked bookings for this offer"}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold uppercase tracking-wider">
                      {group.bookings.length} requests
                    </span>
                    <span className="px-3 py-1 rounded-full bg-gray-50 text-gray-600 border border-gray-200 text-[10px] font-bold uppercase tracking-wider">
                      {confirmedSeats} seats confirmed
                    </span>
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold uppercase tracking-wider">
                      {activeRiders} active
                    </span>
                    {pendingRequests > 0 && (
                      <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold uppercase tracking-wider">
                        {pendingRequests} pending
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.bookings.map(booking => (
                    <BookingCard
                      key={booking._id}
                      booking={booking}
                      updatingId={updatingId}
                      onStatus={handleStatus}
                      onLive={setLiveBooking}
                      onReview={setReviewBooking}
                      onChat={setChatBooking}
                      alreadyReviewed={Boolean(reviewedBookingIds[String(booking?._id || "")])}
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

      {chatBooking && (
        <ChatModal
          booking={chatBooking}
          me={JSON.parse(localStorage.getItem("carpconnect_user") || "{}")}
          onClose={() => setChatBooking(null)}
        />
      )}

      {reviewBooking && (
        <RateRideModal
          booking={reviewBooking}
          targetUser={reviewBooking.rider}
          subjectLabel="ride with rider"
          alreadyReviewed={Boolean(reviewedBookingIds[String(reviewBooking?._id || "")])}
          onClose={() => setReviewBooking(null)}
          onSuccess={() => {
            setReviewedBookingIds((prev) => ({ ...prev, [String(reviewBooking?._id || "")]: true }));
            setReviewBooking(null);
            toast.success("Review submitted!");
          }}
        />
      )}
    </div>
  );
};

export default DriverBookings;
