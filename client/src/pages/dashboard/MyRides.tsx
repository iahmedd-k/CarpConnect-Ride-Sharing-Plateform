import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Navigation, Clock, Car, Search, Loader2, MapPin,
  ChevronDown, ChevronUp, MessageSquare, Star, AlertCircle,
  CheckCircle2, XCircle, Info, RefreshCw, Eye, Play,
  Send, X, Trash2, CheckCheck, Check, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../lib/api";
import { toast } from "sonner";
import { RateRideModal } from "@/components/RateRideModal";
import { io, Socket } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import { normalizeBookingStatus } from "@/lib/rideStatus";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";
import { normalizePlanId } from "@/lib/plans";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

const PAGE_SIZE = 8;

/* ------------------------------------------------------------------ */
/*  Status config                                                       */
/* ------------------------------------------------------------------ */
const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",       icon: Clock },
  confirmed: { label: "Confirmed", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",          icon: CheckCircle2 },
  rejected:  { label: "Declined",  cls: "bg-red-500/10 text-red-400 border-red-500/20",             icon: XCircle },
  cancelled: { label: "Cancelled", cls: "bg-muted/30 text-muted-foreground border-border",          icon: XCircle },
  picked_up: { label: "En Route",  cls: "bg-primary/10 text-primary border-primary/20",             icon: Navigation },
  live:      { label: "Live",      cls: "bg-purple-500/10 text-purple-400 border-purple-500/20",    icon: Navigation },
  completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
const fmt = {
  date: (d: any) =>
    d ? new Date(d).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "—",
  time: (d: any) =>
    d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
  currency: (n: any) => {
    const v = Number(n);
    if (!v || isNaN(v)) return "—";
    return new Intl.NumberFormat("en-PK", {
      style: "currency", currency: "PKR", minimumFractionDigits: 0,
    }).format(v);
  },
  addr: (s: string | undefined) => s?.split(",")[0] || "—",
  car: (offer: any) => {
    const v = offer?.vehicle || offer?.driver?.vehicle;
    if (!v) return "Not provided";
    if (typeof v === "string") return v;
    const parts = [v.make, v.model, v.year].filter(Boolean);
    return parts.length ? parts.join(" ") : "Not provided";
  },
  plate: (offer: any) => {
    const v = offer?.vehicle || offer?.driver?.vehicle;
    return v?.plateNumber || "Not provided";
  },
};

/* ------------------------------------------------------------------ */
/*  StatusBadge                                                         */
/* ------------------------------------------------------------------ */
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS[status] || STATUS.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers for coords                                                  */
/* ------------------------------------------------------------------ */
function getOfferCoords(offer: any, type: "origin" | "destination"): [number, number] | null {
  const direct = offer?.[type]?.point?.coordinates;
  if (Array.isArray(direct) && direct.length === 2) return direct as [number, number];
  const fallback = offer?.[type]?.coordinates;
  if (Array.isArray(fallback) && fallback.length === 2) return fallback as [number, number];
  const alt = type === "origin" ? offer?.originCoords : offer?.destinationCoords;
  if (Array.isArray(alt) && alt.length === 2) return alt as [number, number];
  return null;
}

/* ------------------------------------------------------------------ */
/*  RideTrackerModal                                                    */
/* ------------------------------------------------------------------ */
function RideTrackerModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [routeDeviationAlert, setRouteDeviationAlert] = useState<string | null>(null);
  const [currentBooking, setCurrentBooking] = useState<any>(booking);
  const socketRef = useRef<Socket | null>(null);

  const offer  = currentBooking?.offer || {};
  const rideId = offer?._id || offer?.id;

  const originCoords      = getOfferCoords(offer, "origin");
  const destinationCoords = getOfferCoords(offer, "destination");
  const hasMapData        = !!(originCoords && destinationCoords);

  /* Socket setup */
  useEffect(() => {
    const token = localStorage.getItem("carpconnect_token");
    if (!token || !rideId) return;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect",    () => { setSocketConnected(true);  socket.emit("join:ride", { rideId }); });
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("driverLocationUpdate", (data: any) => {
      if (data?.latitude != null && data?.longitude != null) {
        setDriverLocation({ lat: data.latitude, lng: data.longitude });
      }
    });
    socket.on("bookingStatusUpdated", (data: any) => {
      if (data?.bookingId && data?.bookingId === currentBooking?._id && data?.status) {
        setCurrentBooking((prev: any) => ({ ...prev, status: data.status }));
      }
    });
    socket.on("routeDeviationAlert", (data: any) => {
      const message = data?.message || "Driver appears to be off the planned route.";
      setRouteDeviationAlert(message);
      toast.error(message);
    });

    return () => {
      socket.emit("leave:ride", { rideId });
      socket.disconnect();
    };
  }, [rideId]);

  const statusOrder = ["pending", "confirmed", "picked_up", "live", "completed"];
  const currentStatus = String(currentBooking?.status || "pending");
  const currentIdx = Math.max(0, statusOrder.indexOf(currentStatus));
  const timeline = [
    {
      key: "confirmed",
      title: "Driver accepted booking",
      when: currentBooking?.updatedAt
    },
    {
      key: "picked_up",
      title: "Rider picked up",
      when: currentBooking?.pickedUpAt
    },
    {
      key: "live",
      title: "Ride in progress",
      when: currentBooking?.liveAt
    },
    {
      key: "completed",
      title: "Ride completed",
      when: currentBooking?.completedAt
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-2xl bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-bold text-base">Ride Tracker</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmt.addr(offer?.origin?.address)} {" -> "} {fmt.addr(offer?.destination?.address)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
              ${socketConnected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
              {socketConnected ? "Live" : "Connecting..."}
            </span>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={currentStatus} />
            <span className="text-xs text-muted-foreground">
              Updated: {fmt.date(currentBooking?.updatedAt)} {fmt.time(currentBooking?.updatedAt)}
            </span>
          </div>

          {routeDeviationAlert && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-400">Route deviation alert</div>
                  <div className="text-xs text-red-300/90 mt-0.5">{routeDeviationAlert}</div>
                </div>
              </div>
            </div>
          )}

          {/* Map placeholder / live map */}
          {hasMapData ? (
            <div className="h-64 rounded-2xl bg-muted/20 border border-border/40 flex items-center justify-center">
              <div className="text-center">
                <Navigation className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {driverLocation
                    ? `Driver at ${driverLocation.lat.toFixed(4)}, ${driverLocation.lng.toFixed(4)}`
                    : "Waiting for driver location..."}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-40 rounded-2xl border-2 border-dashed border-border/40 bg-muted/10 flex items-center justify-center text-center p-6">
              <div>
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">Map coordinates unavailable</p>
                <p className="text-xs text-muted-foreground mt-1">Live tracking will appear once driver location is shared.</p>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/20 border border-border/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
              <StatusBadge status={currentStatus} />
            </div>
            <div className="rounded-xl bg-muted/20 border border-border/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Driver</p>
              <p className="text-sm font-semibold">{currentBooking?.driver?.name || "-"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/40 bg-muted/10 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Trip timeline</p>
            <div className="space-y-2">
              {timeline.map((item, idx) => {
                const idxInOrder = Math.max(0, statusOrder.indexOf(item.key));
                const passed = currentIdx >= idxInOrder;
                return (
                  <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className={passed ? "text-foreground font-semibold" : "text-muted-foreground"}>
                      {item.title}
                    </span>
                    <span className="text-muted-foreground">
                      {item.when ? `${fmt.date(item.when)} ${fmt.time(item.when)}` : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatModal                                                           */
/* ------------------------------------------------------------------ */
function ChatModal({ booking, me, onClose }: { booking: any; me: any; onClose: () => void }) {
  const [msgs, setMsgs]     = useState<any[]>([]);
  const [text, setText]     = useState("");
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const partner = booking.driver?._id === me?._id ? booking.rider : booking.driver;

  useEffect(() => {
    fetchMsgs();
    const token = localStorage.getItem("carpconnect_token");
    if (!token) return;
    socketRef.current = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    socketRef.current.emit("join:chat", { bookingId: booking._id });
    socketRef.current.on("chat:message", (msg: any) => {
      setMsgs(prev => prev.find(m => m._id === msg._id) ? prev : [
        ...prev,
        { _id: msg._id || Date.now(), content: msg.content, createdAt: msg.timestamp || new Date(), sender: { _id: msg.senderId } },
      ]);
    });
    return () => {
      socketRef.current?.emit("leave:chat", { bookingId: booking._id });
      socketRef.current?.disconnect();
    };
  }, [booking._id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const fetchMsgs = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/chat/${booking._id}`);
      setMsgs(res.data?.data?.messages || []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const send = async () => {
    if (!text.trim()) return;
    const payload = text.trim();
    setText("");
    try {
      const res = await api.post("/chat", { bookingId: booking._id, content: payload });
      if (res.data?.data?.message) setMsgs(prev => [...prev, res.data.data.message]);
      else fetchMsgs();
    } catch { toast.error("Failed to send message."); }
  };

  const del = async (id: string) => {
    await api.delete(`/chat/${id}`);
    setMsgs(prev => prev.filter(m => m._id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-lg bg-card rounded-3xl border border-border/50 shadow-2xl flex flex-col overflow-hidden"
        style={{ height: "70vh", maxHeight: "600px" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-muted/5 min-h-0">
          {loading && (
            <div className="flex justify-center pt-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
            </div>
          )}
          {!loading && msgs.length === 0 && (
            <div className="text-center text-sm text-muted-foreground pt-10">No messages yet. Say hello! 👋</div>
          )}
          {msgs.map(msg => {
            const isMe = msg.sender?._id === me?._id;
            return (
              <div key={msg._id} className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
                <div className="flex items-center gap-2">
                  {isMe && (
                    <button onClick={() => del(msg._id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/10 rounded-full transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${isMe ? "bg-primary text-white" : "bg-card border border-border text-foreground"}`}>
                    <p>{msg.content}</p>
                    <div className="text-[9px] mt-1 opacity-60 flex items-center gap-1 justify-end">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {isMe && (msg.status === "seen"
                        ? <CheckCheck className="w-2.5 h-2.5 text-blue-300" />
                        : <Check className="w-2.5 h-2.5" />)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border bg-card flex items-center gap-2 flex-shrink-0">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Type a message…"
            className="flex-1 bg-muted/30 rounded-xl px-4 py-2.5 text-sm outline-none border border-border focus:border-primary transition-all"
          />
          <Button onClick={send}
            className="h-10 w-10 p-0 bg-primary text-white rounded-xl shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  DetailDrawer                                                        */
/* ------------------------------------------------------------------ */
function DetailDrawer({ booking, onClose }: { booking: any; onClose: () => void }) {
  const offer  = booking.offer;
  const fields = [
    { label: "Booking ID", value: `#${booking._id?.slice(-8).toUpperCase()}` },
    { label: "Date",       value: `${fmt.date(offer?.departureTime)} at ${fmt.time(offer?.departureTime)}` },
    { label: "From",       value: offer?.origin?.address || "—" },
    { label: "To",         value: offer?.destination?.address || "—" },
    { label: "Driver",     value: booking.driver?.name || "—" },
    { label: "Seats",      value: booking.seatsRequested || 1 },
    { label: "Fare",       value: fmt.currency(booking.fare?.totalAmount) },
    { label: "Vehicle",    value: fmt.car(offer) },
    { label: "Plate No.",  value: fmt.plate(offer) },
    { label: "Status",     value: <StatusBadge status={booking.status} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-md bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-bold text-base">Booking Details</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {fields.map(f => (
            <div key={f.label} className="flex items-start justify-between gap-4">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider shrink-0">{f.label}</span>
              <span className="text-xs text-foreground font-semibold text-right">{f.value as any}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  RebookModal                                                         */
/* ------------------------------------------------------------------ */
function RebookModal({
  offer, onConfirm, onClose, loading,
}: {
  offer: any; loading: boolean; onConfirm: (s: number) => void; onClose: () => void;
}) {
  const [seats, setSeats] = useState(1);
  const maxAvailable = offer.seatsAvailable || 8;
  const max   = Math.min(maxAvailable, 8);
  const total = (offer.pricePerSeat || 0) * seats;
  const fmtPKR = (n: number) =>
    new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(n);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
        className="w-full max-w-sm bg-card rounded-3xl border border-border/50 shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-4">Rebook this ride</h3>
        <div className="flex justify-between bg-muted/20 rounded-2xl p-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground font-bold">Price / Seat</p>
            <p className="text-xl font-black text-primary">{fmtPKR(offer.pricePerSeat || 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-bold">Available</p>
            <p className="text-xl font-black text-emerald-400">{maxAvailable}</p>
          </div>
        </div>

        <label className="text-xs font-bold text-muted-foreground block mb-3">Number of seats</label>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSeats(s => Math.max(1, s - 1))} disabled={seats <= 1}
            className="w-12 h-12 rounded-2xl bg-muted/20 border hover:bg-muted/40 font-bold text-xl transition-all disabled:opacity-30">−</button>
          <div className="flex-1 text-center">
            <span className="text-4xl font-black">{seats}</span>
          </div>
          <button onClick={() => setSeats(s => Math.min(max, s + 1))} disabled={seats >= max}
            className="w-12 h-12 rounded-2xl bg-muted/20 border hover:bg-muted/40 font-bold text-xl transition-all disabled:opacity-30">+</button>
        </div>

        <Button onClick={() => onConfirm(seats)} disabled={loading || max === 0}
          className="w-full py-6 bg-primary text-white rounded-2xl font-bold">
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : max === 0 ? "Seats Full"
            : `Confirm ${seats} seat${seats > 1 ? "s" : ""} · ${fmtPKR(total)}`}
        </Button>
      </motion.div>
    </motion.div>
  );
}

function RideCompletedModal({
  booking,
  onRate,
  onClose,
}: {
  booking: any;
  onRate: () => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-md bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-xl font-display font-bold">Ride Service Completed</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Your trip has been completed successfully. You may now rate {booking?.driver?.name || "your driver"} and share a brief service review.
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-2xl">
              Review Later
            </Button>
            <Button onClick={onRate} className="flex-1 rounded-2xl bg-primary text-white">
              Rate This Ride
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */
const MyRides = () => {
  const navigate = useNavigate();
  const [bookings,          setBookings]          = useState<any[]>([]);
  const [rideRequests,      setRideRequests]      = useState<any[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [filter,            setFilter]            = useState("all");
  const [search,            setSearch]            = useState("");
  const [sortAsc,           setSortAsc]           = useState(false);
  const [page,              setPage]              = useState(1);
  const [chatBooking,       setChatBooking]       = useState<any>(null);
  const [detailBooking,     setDetailBooking]     = useState<any>(null);
  const [trackBooking,      setTrackBooking]      = useState<any>(null);
  const [reviewBooking,     setReviewBooking]     = useState<any>(null);
  const [completedPrompt,   setCompletedPrompt]   = useState<any>(null);
  const [rebookOffer,       setRebookOffer]       = useState<any>(null);
  const [rebookingLoading,  setRebookingLoading]  = useState(false);
  const [me,                setMe]                = useState<any>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
    setMe(user);
    fetchRiderData();
  }, []);

  const fetchRiderData = async () => {
    setLoading(true);
    try {
      const [bookingRes, requestRes] = await Promise.all([
        api.get("/bookings?role=rider"),
        api.get("/rides/requests/me"),
      ]);
      const nextBookings = (bookingRes.data?.data?.bookings || bookingRes.data?.bookings || []).map((booking: any) => ({
        ...booking,
        status: normalizeBookingStatus(booking?.status),
      }));
      const nextRequests = requestRes.data?.data?.requests || [];
      setBookings(nextBookings.filter((booking: any) => !booking.hiddenForRider));
      setRideRequests(
        nextRequests.filter((request: any) => ["open", "matched"].includes(String(request?.status || "").toLowerCase()))
      );
    } catch {
      toast.error("Failed to load rider trips.");
    } finally {
      setLoading(false);
    }
  };

  const hideHistoryItem = async (id: string) => {
    try {
      await api.patch(`/history/bookings/${id}/hide`);
      setBookings(prev => prev.filter(b => b._id !== id));
      toast.success("Booking removed from your history view.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to remove booking from history.");
    }
  };

  const clearHistory = async () => {
    try {
      await api.patch("/history/bookings/clear");
      setBookings(prev => prev.filter(b => !["completed", "cancelled", "rejected"].includes(b.status)));
      toast.success("Rider history cleared from view.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to clear history.");
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.delete(`/bookings/${id}`);
      toast.success("Ride booking cancelled successfully.");
      fetchRiderData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to cancel booking.");
    }
  };

  const executeRebook = async (seatsNeeded: number) => {
    if (!rebookOffer) return;
    setRebookingLoading(true);
    try {
      await api.post("/rides/book-direct", { offerId: rebookOffer._id, seatsNeeded });
      toast.success("Ride rebooked! 🎉");
      setRebookOffer(null);
      fetchRiderData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Rebooking failed.");
    } finally {
      setRebookingLoading(false);
    }
  };

  // Step 3: Add real-time updates for booking status (optional, for best UX)
  useEffect(() => {
    const token = localStorage.getItem("carpconnect_token");
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token }, transports: ["websocket"] });
    socket.on("bookingStatusUpdated", (data: any) => {
      if (data?.bookingId && data?.status) {
        setBookings(prev => prev.map(b => {
          if (b._id !== data.bookingId) return b;
          const next = { ...b, status: normalizeBookingStatus(data.status) };
          if (data.status === "completed") {
            setCompletedPrompt(next);
          }
          return next;
        }));
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  /* ---- filter / search / sort (defined ONCE, in component scope) ---- */
  const filtered = bookings
    .filter(b => {
      if (filter === "all") return true;
      // "confirmed" bucket also includes picked_up / active / live
      if (filter === "confirmed")
        return ["confirmed", "picked_up", "live"].includes(b.status);
      return b.status === filter;
    })
    .filter(b => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        b.offer?.origin?.address?.toLowerCase().includes(q) ||
        b.offer?.destination?.address?.toLowerCase().includes(q) ||
        b.driver?.name?.toLowerCase().includes(q) ||
        b._id?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = new Date(a.offer?.departureTime || a.createdAt).getTime();
      const db = new Date(b.offer?.departureTime || b.createdAt).getTime();
      return sortAsc ? da - db : db - da;
    });

  const paged      = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const activeRequests = rideRequests.filter((request: any) =>
    ["open", "matched"].includes(String(request?.status || "").toLowerCase())
  );
  const activeRideCount = bookings.filter(b => ["confirmed", "picked_up", "live"].includes(b.status)).length;
  const pendingCount = bookings.filter(b => b.status === "pending").length;
  const completedCount = bookings.filter(b => b.status === "completed").length;
  const cancelledCount = bookings.filter(b => ["cancelled", "rejected"].includes(b.status)).length;
  const currentPlan = normalizePlanId(me?.subscription?.plan || currentPlanFromStorage());
  const canTrackRide = hasPlanAtLeast(currentPlan, "plus");

  const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Active Rides</p>
          <p className="text-2xl font-display font-black text-foreground">{activeRideCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Confirmed, picked up, or live</p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pending</p>
          <p className="text-2xl font-display font-black text-foreground">{pendingCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Waiting for driver response</p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Completed</p>
          <p className="text-2xl font-display font-black text-foreground">{completedCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Ready for rating and history</p>
        </div>
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Cancelled / Declined</p>
          <p className="text-2xl font-display font-black text-foreground">{cancelledCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Can be rebooked when available</p>
        </div>
      </div>

      <div className="bg-card rounded-3xl border border-border/50 p-5">
        <h3 className="font-bold text-lg">How Rider Ride Flow Works</h3>
        <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm text-muted-foreground">
          <div className="rounded-2xl bg-muted/20 border border-border/40 p-4">
            <p className="font-semibold text-foreground">1. Booking Status</p>
            <p className="mt-1">Pending, confirmed, pickup, live, and completed bookings all stay on this page.</p>
          </div>
          <div className="rounded-2xl bg-muted/20 border border-border/40 p-4">
            <p className="font-semibold text-foreground">2. Track and Chat</p>
            <p className="mt-1">Use Track for live ride status and Message Driver for trip-specific chat.</p>
          </div>
          <div className="rounded-2xl bg-muted/20 border border-border/40 p-4">
            <p className="font-semibold text-foreground">3. After the Ride</p>
            <p className="mt-1">Completed rides can be reviewed here, and cancelled rides can be rebooked.</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">My Rides</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""} total
            {activeRequests.length > 0 ? ` • ${activeRequests.length} active request${activeRequests.length !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearHistory} className="rounded-xl gap-2 h-10 text-red-400 border-red-500/20 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4" /> Clear History
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard?tab=find")} className="rounded-xl gap-2 h-10">
            <Search className="w-4 h-4" /> Find Rides
          </Button>
          <Button variant="outline" size="sm" onClick={fetchRiderData} className="rounded-xl gap-2 h-10">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {activeRequests.length > 0 && (
        <div className="bg-card rounded-3xl border border-border/50 p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="font-bold text-lg">Active Ride Requests</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Matched or open requests stay visible here even if booking history is cleared.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard?tab=find")} className="rounded-xl gap-2 h-10">
              <Search className="w-4 h-4" /> Manage Requests
            </Button>
          </div>
          <div className="space-y-3">
            {activeRequests.map((request: any) => (
              <div key={request._id} className="rounded-2xl border border-border/50 bg-muted/10 p-4 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {fmt.addr(request.originAddress || request.origin?.address)} → {fmt.addr(request.destinationAddress || request.destination?.address)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Seats: {request.seatsNeeded || request.groupSize || 1}
                    {request.maxPricePerSeat ? ` • Max fare/seat: ${fmt.currency(request.maxPricePerSeat)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    ["matched", "booked"].includes(String(request.status || "").toLowerCase())
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {String(request.status || "open")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => navigate("/dashboard?tab=find")} className="rounded-xl h-9 text-xs">
                    Open Find Ride
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by origin, destination, driver or booking ID…"
            className="w-full bg-muted/20 border border-border rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border
                ${filter === f
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Empty */}
      {paged.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-card rounded-3xl border-2 border-dashed border-border/40"
        >
          <AlertCircle className="w-14 h-14 mx-auto mb-4 opacity-15" />
          <h3 className="font-bold text-lg mb-1">No bookings found</h3>
          <p className="text-sm text-muted-foreground">
            {search || filter !== "all"
              ? "No bookings match your filters."
              : activeRequests.length > 0
                ? "You still have active ride requests listed above."
                : "Start exploring rides to book your first trip."}
          </p>
        </motion.div>
      ) : (

        /* Table */
        <div className="bg-card rounded-3xl border border-border/50 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  {["Booking ID", "Driver", "Route", "Date", "Vehicle", "Seats", "Fare", "Status", "Actions"].map((h, i) => (
                    <th key={h} className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                      {h === "Date" ? (
                        <button onClick={() => setSortAsc(p => !p)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Date {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((b, i) => (
                  <motion.tr
                    key={b._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                  >
                    {/* ID */}
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-muted-foreground font-bold">
                        #{b._id?.slice(-8).toUpperCase()}
                      </span>
                    </td>

                    {/* Driver */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                          {b.driver?.avatar
                            ? <img src={b.driver.avatar} alt="avatar" className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold text-primary">{b.driver?.name?.[0] || "?"}</span>}
                        </div>
                        <div>
                          <p className="font-semibold text-xs">{b.driver?.name || "—"}</p>
                          <div className="flex items-center gap-0.5 text-[10px] text-amber-400">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            {b.driver?.ratings?.average?.toFixed(1) || "N/A"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Route */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <MapPin className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="truncate max-w-[90px] font-medium" title={b.offer?.origin?.address}>
                          {fmt.addr(b.offer?.origin?.address)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="truncate max-w-[90px] font-medium text-primary" title={b.offer?.destination?.address}>
                          {fmt.addr(b.offer?.destination?.address)}
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-xs font-semibold">{fmt.date(b.offer?.departureTime || b.createdAt)}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt.time(b.offer?.departureTime || b.createdAt)}</p>
                    </td>

                    {/* Vehicle */}
                    <td className="px-5 py-4">
                      <p className="text-xs font-semibold">{fmt.car(b.offer)}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt.plate(b.offer)}</p>
                    </td>

                    {/* Seats */}
                    <td className="px-5 py-4 text-xs font-semibold text-center">{b.seatsRequested || 1}</td>

                    {/* Fare */}
                    <td className="px-5 py-4 text-xs font-black text-emerald-400 whitespace-nowrap">
                      {fmt.currency(b.fare?.totalAmount)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <StatusBadge status={b.status} />
                      {b.counterOffer && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Counter: {b.counterOffer.status}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => setDetailBooking(b)} title="View Details"
                          className="p-2 rounded-xl bg-muted/30 hover:bg-primary/10 hover:text-primary transition-all">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setChatBooking(b)} title="Message Driver"
                          className="p-2 rounded-xl bg-muted/30 hover:bg-primary/10 hover:text-primary transition-all">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        {["confirmed", "picked_up", "live"].includes(b.status) && (
                          canTrackRide ? (
                            <button onClick={() => setTrackBooking(b)} title="Track Ride"
                              className="p-2 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all">
                              <Play className="w-3 h-3" /> Track
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate("/dashboard?tab=subscription")}
                              title="Tracking locked on Free"
                              className="p-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all"
                            >
                              <Lock className="w-3 h-3" /> Track (Plus)
                            </button>
                          )
                        )}

                        {["pending", "confirmed"].includes(b.status) && (
                          <button onClick={() => handleCancel(b._id)} title="Cancel"
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {b.status === "completed" && (
                          <button onClick={() => setReviewBooking(b)} title="Rate Journey"
                            className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all">
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {["cancelled", "rejected"].includes(b.status) && b.offer && (
                          <button onClick={() => setRebookOffer(b.offer)} title="Rebook"
                            className="p-2 px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all">
                            <RefreshCw className="w-3 h-3" /> Rebook
                          </button>
                        )}

                        {["completed", "cancelled", "rejected"].includes(b.status) && (
                          <button onClick={() => hideHistoryItem(b._id)} title="Remove from history"
                            className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/30 bg-muted/10">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-xl text-xs font-bold transition-all
                      ${p === page ? "bg-primary text-white" : "border border-border hover:bg-muted/30"}`}>
                    {p}
                  </button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {chatBooking    && <ChatModal       key="chat"    booking={chatBooking}    me={me}      onClose={() => setChatBooking(null)} />}
        {detailBooking  && <DetailDrawer   key="detail"  booking={detailBooking}               onClose={() => setDetailBooking(null)} />}
        {trackBooking   && <RideTrackerModal key="track" booking={trackBooking}                onClose={() => setTrackBooking(null)} />}
        {rebookOffer    && <RebookModal     key="rebook"  offer={rebookOffer}      loading={rebookingLoading} onClose={() => setRebookOffer(null)} onConfirm={executeRebook} />}
        {reviewBooking  && (
          <RateRideModal
            key="review"
            booking={reviewBooking}
            onClose={() => setReviewBooking(null)}
            onSuccess={() => { setReviewBooking(null); toast.success("Review submitted! ⭐"); fetchRiderData(); }}
          />
        )}
        {completedPrompt && (
          <RideCompletedModal
            key="completed-prompt"
            booking={completedPrompt}
            onClose={() => setCompletedPrompt(null)}
            onRate={() => {
              setReviewBooking(completedPrompt);
              setCompletedPrompt(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyRides;
