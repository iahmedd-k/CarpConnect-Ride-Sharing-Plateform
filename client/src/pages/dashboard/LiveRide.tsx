import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Navigation, Clock, ShieldCheck,
  AlertTriangle, Play, Square, CheckCircle,
  Loader2, Leaf, ArrowRight, User, Car,
  MessageSquare, MessageCircle, Users, RefreshCw, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { useDriverTracking } from "@/hooks/useDriverTracking";
import RouteOptimizationScreen from "@/components/RouteOptimizationScreen";
import ChatScreen from "@/components/ChatScreen";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */
const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function addrFrom(field: any): string {
  if (!field) return "—";
  if (typeof field === "string") return field.split(",")[0];
  if (field.address) return String(field.address).split(",")[0];
  if (field.originAddress) return String(field.originAddress).split(",")[0];
  if (field.destinationAddress) return String(field.destinationAddress).split(",")[0];
  if (field.location?.address) return String(field.location.address).split(",")[0];
  if (field.point?.address) return String(field.point.address).split(",")[0];
  if (field.point?.coordinates) {
    const [lng, lat] = field.point.coordinates;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  if (field.coordinates) {
    const [lng, lat] = field.coordinates;
    return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
  }
  return "—";
}

function statusColor(s: string) {
  switch (s) {
    case "confirmed":  return "bg-emerald-50 text-emerald-600 border-emerald-200";
    case "picked_up":  return "bg-blue-50 text-blue-600 border-blue-200";
    case "live":       return "bg-purple-50 text-purple-600 border-purple-200";
    case "completed":  return "bg-gray-100 text-gray-500 border-gray-200";
    case "cancelled":  return "bg-red-50 text-red-500 border-red-200";
    default:           return "bg-amber-50 text-amber-500 border-amber-200";
  }
}

function extractApiError(error: any, fallback: string) {
  return error?.response?.data?.message || error?.message || fallback;
}

function getBookingActionMeta(booking: any, arrived: boolean) {
  if (!booking) return null;

  if (booking.status === "confirmed" && !arrived) {
    return { key: "arrived", label: "Mark Arrived", cls: "bg-amber-500 hover:bg-amber-600" };
  }
  if (booking.status === "confirmed" && arrived) {
    return { key: "pickup", label: "Pick Up", cls: "bg-blue-500 hover:bg-blue-600" };
  }
  if (booking.status === "picked_up") {
    return { key: "live", label: "Start Leg", cls: "bg-violet-500 hover:bg-violet-600" };
  }
  if (booking.status === "live") {
    return { key: "complete", label: "Drop Off", cls: "bg-emerald-500 hover:bg-emerald-600" };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  BookingStatusRow                                                    */
/* ------------------------------------------------------------------ */
function BookingStatusRow({
  booking,
  arrived,
  onArrived,
  onPickup,
  onGoLive,
  onComplete,
  onUpdate,
  onChat,
}: {
  booking: any;
  arrived: boolean;
  onArrived: () => void;
  onPickup: () => void;
  onGoLive: () => void;
  onComplete: () => void;
  onUpdate: () => void;
  onChat: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      onUpdate();
    } catch (error: any) {
      toast.error(extractApiError(error, "Failed to update rider status."));
    } finally {
      setBusy(false);
    }
  };
  const primaryAction = getBookingActionMeta(booking, arrived);

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <User size={14} className="text-emerald-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {booking.rider?.name || "Rider"}
          </p>
          <p className="text-xs text-gray-400">
            {booking.seatCount || 1} seat{(booking.seatCount || 1) > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor(booking.status)}`}>
          {booking.status}
        </span>
        {busy ? (
          <Loader2 size={14} className="animate-spin text-emerald-500" />
        ) : (
          <>
            {primaryAction && (
              <button
                onClick={() => run(async () => {
                  if (primaryAction.key === "arrived") await onArrived();
                  if (primaryAction.key === "pickup") await onPickup();
                  if (primaryAction.key === "live") await onGoLive();
                  if (primaryAction.key === "complete") await onComplete();
                })}
                className={`text-xs px-2.5 py-1 rounded-xl text-white font-semibold transition-colors ${primaryAction.cls}`}
              >
                {primaryAction.label}
              </button>
            )}
            <button
              type="button"
              onClick={onChat}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              <MessageCircle size={12} /> Chat
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  RideSummaryModal                                                    */
/* ------------------------------------------------------------------ */
function RideSummaryModal({
  activeRide, summaryData, onClose,
}: {
  activeRide: any;
  summaryData: any;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="h-1.5 w-full bg-emerald-500" />
        <div className="p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Ride Complete!</h2>
            <p className="text-sm text-gray-400 mt-1">Here's a summary of your trip</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: "Distance",  value: `${activeRide?.estimatedDistanceKm || "—"} km` },
              { label: "Earnings",  value: `PKR ${activeRide?.estimatedEarnings || "—"}` },
              { label: "CO\u2082 saved", value: summaryData?.stats?.totalCo2SavedKg != null ? `${summaryData.stats.totalCo2SavedKg} kg` : "—" },
              { label: "Trees eq.", value: summaryData?.stats?.treesEquivalent   != null ? `${summaryData.stats.treesEquivalent}` : "—" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-2xl p-4 text-center border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-xl font-bold text-gray-800">{s.value}</p>
              </div>
            ))}
          </div>

          <Button onClick={onClose}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold">
            Done
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RideChatModal({
  rideId,
  me,
  title,
  subtitle,
  onClose,
}: {
  rideId?: string | null;
  me?: any;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.94, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 20 }}
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border/50 bg-card shadow-2xl"
        style={{ height: "75vh", maxHeight: "720px" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 transition-colors hover:bg-muted/50"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="h-[calc(100%-73px)]">
          <ChatScreen
            rideId={rideId}
            me={me}
            title={title}
            subtitle={subtitle}
            participantsLabel="Live ride chat"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ItineraryStep                                                       */
/* ------------------------------------------------------------------ */
function ItineraryStep({
  step, idx, activeStep, rideStatus, eta, isLast,
}: {
  step: any; idx: number; activeStep: number;
  rideStatus: string; eta: number | null; isLast: boolean;
}) {
  const isPast    = idx < activeStep;
  const isCurrent = idx === activeStep;

  return (
    <div className={`flex gap-4 transition-all duration-300
      ${isPast ? "opacity-40" : ""}
      ${isCurrent && rideStatus === "in_progress" ? "bg-emerald-50 px-3 py-2 rounded-2xl border border-emerald-200 -mx-1" : "py-1"}`}
    >
      {/* Dot + line */}
      <div className="flex flex-col items-center flex-shrink-0 w-8">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0
          ${isPast    ? "bg-emerald-500 border-emerald-500" :
            isCurrent ? "bg-emerald-500 border-emerald-500 shadow shadow-emerald-200" :
                        "bg-white border-gray-200"}`}
        >
          {isPast    && <CheckCircle size={13} className="text-white" />}
          {isCurrent && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[24px]" />}
      </div>

      {/* Content */}
      <div className="pb-3 flex-1 min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5
          ${step.type === "pickup" ? "text-emerald-500" : "text-amber-500"}`}>
          {step.type === "pickup" ? "Pickup" : "Drop-off"}
        </p>
        <p className="text-sm font-bold text-gray-800 truncate">{step.name}</p>
        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
          <MapPin size={9} className="flex-shrink-0" />
          {step.location || "Location pending"}
        </p>
        {isCurrent && eta !== null && rideStatus === "in_progress" && (
          <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <Clock size={9} /> {eta} min away
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */
const LiveRide = () => {
  const [rideStatus,     setRideStatus]     = useState<"ready" | "in_progress" | "completed">("ready");
  const [loading,        setLoading]        = useState(true);
  const [activeRide,     setActiveRide]     = useState<any>(null);
  const [matchData,      setMatchData]      = useState<any>(null);
  const [bookings,       setBookings]       = useState<any[]>([]);
  const [arrivedBookings,setArrivedBookings]= useState<Record<string, boolean>>({});
  const [activeStep,     setActiveStep]     = useState(0);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [eta,            setEta]            = useState<number | null>(null);
  const [speed,          setSpeed]          = useState(0);
  const [showSummary,    setShowSummary]    = useState(false);
  const [showChat,       setShowChat]       = useState(false);
  const [summaryData,    setSummaryData]    = useState<any>(null);
  const [completedRideSnapshot, setCompletedRideSnapshot] = useState<any>(null);
  const [optimizingDecision, setOptimizingDecision] = useState(false);
  const [me,            setMe]             = useState<any>(null);
  const socketRef  = useRef<Socket | null>(null);
  const trackingRideId = activeRide?._id || completedRideSnapshot?._id || null;
  const { error: trackingError, publishLocation } = useDriverTracking({
    rideId: trackingRideId,
    enabled: rideStatus === "in_progress",
    cleanupOnComplete: rideStatus === "completed",
    onLocation: (location) => {
      setDriverLocation({ lat: location.lat, lng: location.lng });
      setSpeed(location.speedKmh || 0);
      socketRef.current?.emit("driverLocationUpdate", {
        rideId: trackingRideId,
        latitude: location.lat,
        longitude: location.lng,
        timestamp: new Date(location.updatedAt).toISOString(),
      });
    },
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
    setMe(user);
  }, []);

  useEffect(() => {
    if (trackingError) {
      toast.error(trackingError);
    }
  }, [trackingError]);

  /* ---- fetch ---- */
  const fetchActiveRide = async () => {
    try {
      setLoading(true);
      const res = await api.get("/rides/active");
      const data = res.data?.data;
      setActiveRide(data?.ride || data);
      setMatchData(data?.match || null);
      const nextBookings = data?.bookings || [];
      setBookings(nextBookings);
      setArrivedBookings(
        nextBookings.reduce((acc: Record<string, boolean>, booking: any) => {
          acc[booking._id] = Boolean(booking.arrivedAt);
          return acc;
        }, {})
      );
    } catch (error: any) {
      if (error?.response?.status === 404) {
        setActiveRide(null);
        setMatchData(null);
        setBookings([]);
        setArrivedBookings({});
        return;
      }
      toast.error("Failed to fetch active ride.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const shouldRefreshOptimization =
      Boolean(matchData?._id) &&
      Boolean(matchData?.optimizedRoute?.pendingDecision) &&
      (!Array.isArray(matchData?.optimizedRoute?.suggestedPickupOrder) ||
        matchData.optimizedRoute.suggestedPickupOrder.length === 0);

    if (!shouldRefreshOptimization) return;

    let cancelled = false;
    api.post(`/rides/optimize/${matchData._id}`)
      .then((res) => {
        if (cancelled) return;
        setMatchData((prev: any) => ({
          ...(prev || {}),
          optimizedRoute: res.data?.data?.optimizedRoute || prev?.optimizedRoute
        }));
      })
      .catch((error) => {
        console.error("[live-ride] failed to refresh optimization:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [matchData?._id, matchData?.optimizedRoute?.pendingDecision, matchData?.optimizedRoute?.suggestedPickupOrder]);

  useEffect(() => {
    fetchActiveRide();

    const token = localStorage.getItem("carpconnect_token");
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"], reconnection: true, auth: { token },
    });
    socketRef.current.on("bookingStatusUpdated", (data: any) => {
      if (data?.bookingId && data?.status) {
        setBookings(prev => prev.map(b => b._id === data.bookingId ? { ...b, status: data.status } : b));
      }
    });
    socketRef.current.on("bookingArrived", (data: any) => {
      if (data?.bookingId) {
        setArrivedBookings(prev => ({ ...prev, [data.bookingId]: true }));
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  /* ---- actions ---- */
  const handleStartRide = async () => {
    const remainingConfirmedBookings = bookings.filter((b: any) => b.status === "confirmed");
    const pickedUpBookings = bookings.filter((b: any) => b.status === "picked_up");
    if (remainingConfirmedBookings.length > 0) {
      toast.error("Pick up every accepted rider before starting the ride.");
      return;
    }
    if (pickedUpBookings.length === 0) {
      toast.error("Pick up at least one rider before starting the ride.");
      return;
    }
    try {
      for (const b of pickedUpBookings) {
        await api.patch(`/bookings/${b._id}/status`, { status: "live" });
      }
      fetchActiveRide();
      toast.success("Ride started!");
    } catch {
      toast.error("Failed to start ride.");
    }
  };

  const handleArrived = async (booking: any) => {
    await api.patch(`/bookings/${booking._id}/arrived`);
    setArrivedBookings(prev => ({ ...prev, [booking._id]: true }));
    toast.success(`${booking.rider?.name || "Rider"} marked as arrived.`);
    await fetchActiveRide();
  };

  const handlePickup = async (booking: any) => {
    await api.patch(`/bookings/${booking._id}/picked-up`);
    toast.success(`${booking.rider?.name || "Rider"} picked up.`);
    await fetchActiveRide();
  };

  const handleGoLive = async (booking: any) => {
    await api.patch(`/bookings/${booking._id}/status`, { status: "live" });
    toast.success(`${booking.rider?.name || "Rider"} is now on route.`);
    await fetchActiveRide();
  };

  const handleDropoff = async (booking: any) => {
    await api.patch(`/bookings/${booking._id}/completed`);
    toast.success(`${booking.rider?.name || "Rider"} dropped off.`);
    await fetchActiveRide();
  };

  const handleCompleteRide = async () => {
    try {
      const openRideBookings = bookings.filter((b: any) => ["confirmed", "picked_up", "live"].includes(b.status));
      if (openRideBookings.length > 0) {
        toast.error("Complete all rider drop-offs before completing this ride.");
        return;
      }
      if (!activeRide?._id) {
        toast.error("Active ride is missing. Please refresh and try again.");
        return;
      }

      await api.put(`/rides/offers/${activeRide._id}/complete`);
      setCompletedRideSnapshot(activeRide);
      setRideStatus("completed");
      try {
        const res = await api.get("/emissions/me");
        setSummaryData(res.data?.data);
      } catch { /* show modal anyway */ }
      setActiveRide(null);
      setBookings([]);
      setArrivedBookings({});
      setShowSummary(true);
      toast.success("Ride completed successfully.");
    } catch (error: any) {
      toast.error(extractApiError(error, "Failed to complete ride."));
    }
  };

  const simulateDrive = () => {
    const stop = itinerary[activeStep];
    if (!stop?.coords) {
      toast.error("No route stop is available for simulation."); return;
    }
    const originCoords = activeRide?.origin?.coordinates || activeRide?.origin?.point?.coordinates;
    const fallbackLocation =
      Array.isArray(originCoords) && originCoords.length >= 2
        ? { lat: Number(originCoords[1]), lng: Number(originCoords[0]) }
        : null;
    if (!driverLocation && !fallbackLocation) {
      toast.error("Enable location access or add route coordinates to use simulation.");
      return;
    }
    const [tLng, tLat] = stop.coords;
    if (!driverLocation && fallbackLocation) {
      setDriverLocation(fallbackLocation);
    }
    const sim = setInterval(() => {
      setDriverLocation(prev => {
        const current = prev || fallbackLocation;
        if (!current) return prev;
        const dLat = tLat - current.lat;
        const dLng = tLng - current.lng;
        if (Math.abs(dLat) < 0.0001 && Math.abs(dLng) < 0.0001) {
          clearInterval(sim); setSpeed(0);
          return { lat: tLat, lng: tLng };
        }
        setSpeed(45);
        const next = { lat: current.lat + dLat * 0.1, lng: current.lng + dLng * 0.1 };
        publishLocation({ lat: next.lat, lng: next.lng, speedKmh: 45 }).catch((error) => {
          console.error("[live-ride] failed to publish simulated location:", error);
        });
        return next;
      });
    }, 1000);
  };

  /* ---- itinerary ---- */
  const orderedBookings = useMemo(() => {
    const pickupOrder = matchData?.optimizedRoute?.suggestedPickupOrder || [];
    const shouldReorder = matchData?.optimizedRoute?.selectedRoute === "suggested" && pickupOrder.length > 0;

    if (!shouldReorder) {
      return bookings;
    }

    const orderMap = new Map(
      pickupOrder.map((item: any, index: number) => [String(item.riderId), index])
    );

    return [...bookings].sort((a: any, b: any) => {
      const aOrder = orderMap.get(String(a?.rider?._id || "")) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(String(b?.rider?._id || "")) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  }, [bookings, matchData?.optimizedRoute?.selectedRoute, matchData?.optimizedRoute?.suggestedPickupOrder]);

  const itinerary = useMemo(() => {
    if (activeRide?.stops?.length) {
      return activeRide.stops.map((s: any) => {
        const b = orderedBookings.find((bk: any) => bk._id === s.bookingId);
        return {
          id: `${s.bookingId}_${s.type}`, bookingId: s.bookingId,
          name: b?.rider?.name || "Rider", type: s.type,
          location: s.location?.address || addrFrom(s.type === "pickup" ? b?.request?.origin : b?.request?.destination),
          coords: s.location?.point?.coordinates || (s.type === "pickup" ? b?.request?.origin?.coordinates : b?.request?.destination?.coordinates),
          isDone: s.completed,
        };
      });
    }
    return orderedBookings.flatMap((b: any) => [
      {
        id: `${b._id}_p`, bookingId: b._id,
        name: b.rider?.name || "Rider", type: "pickup",
        location: addrFrom(b.request?.origin),
        coords: b.request?.origin?.coordinates || b.request?.origin?.point?.coordinates,
        isDone: ["picked_up", "live", "completed"].includes(b.status),
      },
      {
        id: `${b._id}_d`, bookingId: b._id,
        name: b.rider?.name || "Rider", type: "dropoff",
        location: addrFrom(b.request?.destination),
        coords: b.request?.destination?.coordinates || b.request?.destination?.point?.coordinates,
        isDone: b.status === "completed",
      },
    ]);
  }, [orderedBookings, activeRide]);

  /* ---- auto-advance step ---- */
  useEffect(() => {
    if (!itinerary.length) return;
    if (activeRide?.currentStopIndex != null) {
      setActiveStep(Math.min(activeRide.currentStopIndex, itinerary.length - 1));
      return;
    }
    const next = itinerary.findIndex(s => !s.isDone);
    setActiveStep(next !== -1 ? next : itinerary.length - 1);
  }, [activeRide, itinerary]);

  useEffect(() => {
    if (!bookings.length) {
      setRideStatus("ready");
      return;
    }
    if (bookings.some((booking: any) => booking.status === "live")) {
      setRideStatus("in_progress");
      return;
    }
    if (bookings.every((booking: any) => booking.status === "completed")) {
      setRideStatus("completed");
      return;
    }
    setRideStatus("ready");
  }, [bookings]);

  /* ---- ETA ---- */
  useEffect(() => {
    if (!driverLocation || !itinerary[activeStep]?.coords) return;
    const coords = itinerary[activeStep].coords;
    const [sLng, sLat] = coords;
    const R = 6371;
    const dLat = ((sLat - driverLocation.lat) * Math.PI) / 180;
    const dLon = ((sLng - driverLocation.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(driverLocation.lat * Math.PI / 180) *
      Math.cos(sLat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    setEta(Math.round((dist / (speed > 5 ? speed : 30)) * 60));
  }, [driverLocation, activeStep, speed, itinerary]);

  /* ---- derived ---- */
  const rideBookings     = orderedBookings.filter((booking: any) => ["confirmed", "picked_up", "live", "completed"].includes(booking.status));
  const pickedUpCount    = rideBookings.filter((booking: any) => ["picked_up", "live", "completed"].includes(booking.status)).length;
  const liveCount        = rideBookings.filter((booking: any) => booking.status === "live").length;
  const completedRiders  = rideBookings.filter((booking: any) => booking.status === "completed").length;
  const completedCount   = itinerary.filter(s => s.isDone).length;
  const progressPct      = itinerary.length > 0 ? Math.round((completedCount / itinerary.length) * 100) : 0;
  const originLabel      = addrFrom(activeRide?.origin);
  const destLabel        = addrFrom(activeRide?.destination);
  const seatsTotal       = Number(activeRide?.seatsTotal || (activeRide?.seatsAvailable || 0) + rideBookings.reduce((sum, booking) => sum + (booking.seatCount || 1), 0));
  const seatsRemaining   = Number(activeRide?.seatsAvailable || 0);
  const seatsFilled      = Math.max(seatsTotal - seatsRemaining, 0);
  const pendingPickupCount = rideBookings.filter((booking: any) => booking.status === "confirmed").length;
  const activeOnboardCount = rideBookings.filter((booking: any) => ["picked_up", "live"].includes(booking.status)).length;
  const canStartRide = pickedUpCount > 0 && pendingPickupCount === 0 && rideStatus === "ready";
  const canCompleteRide = rideBookings.length > 0 && rideBookings.every((booking: any) => ["completed", "cancelled"].includes(booking.status));

  const shareLiveTrip = async () => {
    if (!activeRide) return;
    const shareText = `Live ride: ${originLabel} -> ${destLabel} | status: ${rideStatus} | riders onboard: ${pickedUpCount}/${rideBookings.length}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Live Trip", text: shareText });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        toast.success("Live trip details copied");
      } else {
        toast.info(shareText);
      }
    } catch {
      toast.error("Could not share live trip");
    }
  };

  const triggerEmergency = () => {
    window.open("tel:15", "_self");
  };

  const handleOptimizationDecision = async (decision: "accept" | "reject") => {
    if (!matchData?._id) return;
    try {
      setOptimizingDecision(true);
      const res = await api.post(`/rides/optimize/${matchData._id}`, { decision });
      setMatchData((prev: any) => ({
        ...(prev || {}),
        optimizedRoute: res.data?.data?.optimizedRoute || prev?.optimizedRoute
      }));
      toast.success(
        decision === "accept"
          ? "Optimized route accepted. Pickup order is ready."
          : "Original route kept. You can proceed with the default path."
      );
      await fetchActiveRide();
    } catch (error: any) {
      toast.error(extractApiError(error, "Failed to save route decision."));
    } finally {
      setOptimizingDecision(false);
    }
  };

  /* ================================================================= */
  /*  RENDER                                                             */
  /* ================================================================= */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  /* ---- Empty state ---- */
  if (!activeRide) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] h-[calc(100vh-200px)] text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-6">
          <Navigation className="w-9 h-9 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Active Ride</h2>
        <p className="text-gray-400 max-w-sm text-sm mb-8">
          No ride is ready yet. Confirmed riders from your published offers will appear here once pickup is ready.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="outline" onClick={fetchActiveRide} className="rounded-2xl px-6 font-semibold gap-2">
            <RefreshCw size={14} /> Refresh
          </Button>
          <Link to="/driver-dashboard?tab=my-offers">
            <Button variant="outline" className="rounded-2xl px-6 font-semibold">
              My Offers
            </Button>
          </Link>
          <Link to="/driver-dashboard?tab=offer">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl px-6 font-semibold">
              Offer a Ride
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (matchData?.optimizedRoute?.pendingDecision) {
    return (
      <RouteOptimizationScreen
        origin={activeRide?.origin}
        destination={activeRide?.destination}
        optimization={matchData.optimizedRoute}
        bookings={bookings}
        submitting={optimizingDecision}
        onAccept={() => handleOptimizationDecision("accept")}
        onReject={() => handleOptimizationDecision("reject")}
      />
    );
  }

  /* ---- Main layout ---- */
  return (
    <div className="space-y-4">

      {/* Summary modal */}
      <AnimatePresence>
        {showSummary && (
          <RideSummaryModal
            activeRide={completedRideSnapshot}
            summaryData={summaryData}
            onClose={() => {
              setShowSummary(false);
              setCompletedRideSnapshot(null);
              fetchActiveRide();
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Top status bar ── */}
      <div className="bg-white rounded-2xl border border-gray-200 px-4 sm:px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow shadow-emerald-200 flex-shrink-0">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-900 flex-wrap">
              <span className="truncate max-w-[36vw] sm:max-w-[130px]">{originLabel}</span>
              <ArrowRight size={13} className="text-gray-400 flex-shrink-0" />
              <span className="truncate max-w-[36vw] sm:max-w-[130px]">{destLabel}</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {rideBookings.length} rider{rideBookings.length !== 1 ? "s" : ""} linked • {seatsFilled}/{seatsTotal || seatsFilled} seats filled
            </p>
          </div>
        </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2">
              <div className="w-20 sm:w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 font-medium tabular-nums">{progressPct}%</span>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border
            ${rideStatus === "in_progress" ? "bg-purple-50 text-purple-600 border-purple-200" :
              rideStatus === "completed"   ? "bg-gray-100 text-gray-500 border-gray-200" :
                                             "bg-emerald-50 text-emerald-600 border-emerald-200"}`}>
            {rideStatus === "in_progress" ? "Live" : rideStatus === "completed" ? "Done" : "Ready"}
          </span>
        </div>
      </div>

      {/* ── Main two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* ── Left column ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Seats</p>
              <p className="text-xl font-bold text-gray-900">{seatsFilled}/{seatsTotal || seatsFilled}</p>
              <p className="text-xs text-gray-400 mt-1">{seatsRemaining} seat{seatsRemaining !== 1 ? "s" : ""} still open</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Riders</p>
              <p className="text-xl font-bold text-gray-900">{pickedUpCount}/{rideBookings.length}</p>
              <p className="text-xs text-gray-400 mt-1">Picked up or already on route</p>
            </div>
          </div>

          {/* Ride control card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Ride Control</p>
            <div className="space-y-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-sm font-semibold text-emerald-700">Trip flow</p>
                <p className="text-xs text-emerald-600 mt-1">
                  1. Mark arrival. 2. Pick up rider. 3. Start ride. 4. Drop off each rider. 5. End service.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={handleStartRide}
                  disabled={!canStartRide}
                  className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-200 text-white font-bold rounded-2xl shadow shadow-emerald-200 gap-2"
                >
                  <Play size={16} className="fill-current" /> Start Ride (Live)
                </Button>
                <Button
                  onClick={simulateDrive}
                  variant="outline"
                  className="w-full h-10 rounded-2xl text-sm font-semibold border-gray-200 gap-2"
                >
                  <Navigation size={13} /> Simulate Drive
                </Button>
                <Button
                  onClick={handleCompleteRide}
                  disabled={!canCompleteRide}
                  className="w-full h-10 bg-red-500 hover:bg-red-600 disabled:bg-red-200 text-white font-semibold rounded-2xl gap-2"
                >
                  <CheckCircle size={12} className="fill-current" /> Complete Ride
                </Button>
              </div>
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
                Use rider action buttons for arrival, pickup, live, and drop-off. Complete Ride becomes available after all riders are dropped off or cancelled.
              </div>
              {rideStatus === "completed" && (
                <div className="text-center py-2">
                  <CheckCircle size={28} className="text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-700">Ride completed successfully</p>
                </div>
              )}
            </div>
          </div>

          {/* ETA / speed strip — only if location available */}
          {driverLocation && (
            <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Speed</p>
                <p className="text-xl font-bold text-gray-900">
                  {Math.round(speed)} <span className="text-xs font-normal text-gray-400">km/h</span>
                </p>
              </div>
              {eta !== null && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">ETA</p>
                  <p className="text-xl font-bold text-emerald-600">
                    ~{eta} <span className="text-xs font-normal text-gray-400">min</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Riders panel */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Riders ({rideBookings.length})
            </p>
            {rideBookings.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No confirmed bookings yet.</p>
            ) : (
              rideBookings.map(b => (
                <BookingStatusRow
                  key={b._id}
                  booking={b}
                  arrived={Boolean(arrivedBookings[b._id])}
                  onArrived={() => handleArrived(b)}
                  onPickup={() => handlePickup(b)}
                  onGoLive={() => handleGoLive(b)}
                  onComplete={() => handleDropoff(b)}
                  onUpdate={fetchActiveRide}
                  onChat={() => setShowChat(true)}
                />
              ))
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Trip Summary</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pending Pickup</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{pendingPickupCount}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Onboard</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{activeOnboardCount}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Completed</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{completedRiders}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Live Riders</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{liveCount}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={shareLiveTrip}
                className="rounded-xl h-9 text-xs font-semibold gap-2"
              >
                <ShieldCheck size={13} /> Share Live
              </Button>
              <Button variant="outline" onClick={() => setShowChat(true)} className="rounded-xl h-9 text-xs font-semibold gap-2">
                <MessageCircle size={13} /> Ride Chat
              </Button>
              <Button
                variant="outline"
                onClick={triggerEmergency}
                className="rounded-xl h-9 text-xs font-semibold text-red-500 border-red-200 hover:bg-red-50 gap-2"
              >
                <AlertTriangle size={13} /> Emergency
              </Button>
            </div>
          </div>
        </div>

        {/* ── Right column: itinerary ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Live Itinerary</h3>
              <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-full font-bold">
                {itinerary.length > 0 ? activeStep + 1 : 0} / {itinerary.length} stops
              </span>
            </div>

            {itinerary.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🗺️</div>
                <p className="text-sm font-semibold text-gray-700 mb-1">No stops yet</p>
                <p className="text-xs text-gray-400">Accepted riders with pickup and drop-off details will appear here automatically.</p>
              </div>
            ) : (
              <div>
                {itinerary.map((step, idx) => (
                  <ItineraryStep
                    key={step.id}
                    step={step}
                    idx={idx}
                    activeStep={activeStep}
                    rideStatus={rideStatus}
                    eta={eta}
                    isLast={idx === itinerary.length - 1}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Emissions strip */}
          {activeRide?.estimatedEmissionsSaved != null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <Leaf size={16} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-700">Estimated CO\u2082 saved this ride</p>
                <p className="text-sm font-bold text-emerald-600">
                  {Number(activeRide.estimatedEmissionsSaved).toFixed(2)} kg
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showChat && (
          <RideChatModal
            rideId={activeRide?._id || completedRideSnapshot?._id || null}
            me={me}
            title="Live Ride Chat"
            subtitle={activeRide ? `${addrFrom(activeRide.origin)} → ${addrFrom(activeRide.destination)}` : "Coordinate with riders in real time."}
            onClose={() => setShowChat(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveRide;
