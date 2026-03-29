import { forwardRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Car,
  Clock,
  Users,
  ArrowRight,
  Loader2,
  Trash2,
  Pencil,
  X,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  MapPin,
  Navigation,
  Hash,
  RefreshCw,
} from "lucide-react";
import api from "../../lib/api";
import { normalizeOfferStatus, offerStatusLabel } from "@/lib/rideStatus";

/* ------------------------------------------------------------------ */
/*  Types — matched exactly to backend RideOffer schema                */
/* ------------------------------------------------------------------ */
type TimeFilter = "all" | "today" | "week" | "month";

// Backend statuses can include: open, matched, booked, active, completed, cancelled
type OfferStatus = "open" | "matched" | "booked" | "active" | "completed" | "cancelled";

interface GeoPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

interface Offer {
  _id: string;
  driverId: string | { _id: string; name: string; email: string };
  origin: GeoPoint;
  destination: GeoPoint;
  departureTime: string;          // backend field name
  seatsAvailable: number;         // backend has NO seatsTotal
  seatsTotal?: number;
  pricePerSeat: number;
  status: OfferStatus;
  preferences?: {
    smoking: boolean;
    pets: boolean;
    music: boolean;
    conversation?: boolean;
  };
  isRecurring?: boolean;
  recurrencePattern?: string;
  routeGeoJson?: any;
  createdAt: string;
}

interface OfferBookingSummary {
  riders: number;
  bookedSeats: number;
  confirmedRiders: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */


/** Cache so we never hit Nominatim twice for the same coord */
const geocodeCache: Record<string, string> = {};

async function reverseGeocode(coords: [number, number]): Promise<string> {
  const [lng, lat] = coords;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geocodeCache[key]) return geocodeCache[key];
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
      data.display_name?.split(",")[0] ||
      key;
    geocodeCache[key] = label;
    return label;
  } catch {
    return key;
  }
}

/** Hook: resolves [lng, lat] to place name; shows "..." while loading */
function useReverseGeocode(coords: [number, number] | undefined): string {
  const [label, setLabel] = useState<string>("...");
  useEffect(() => {
    if (!coords || coords.length < 2) { setLabel("—"); return; }
    const [lng, lat] = coords;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (geocodeCache[key]) { setLabel(geocodeCache[key]); return; }
    setLabel("...");
    reverseGeocode(coords).then(setLabel);
  }, [coords?.[0], coords?.[1]]);
  return label;
}

/** Synchronous fallback — returns cached name or plain coords */
function coordsToLabel(coords: [number, number] | undefined): string {
  if (!coords || coords.length < 2) return "—";
  const [lng, lat] = coords;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  return geocodeCache[key] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
function fmtDate(raw: string | undefined): string {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleString("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return raw;
  }
}

function statusColor(s: OfferStatus): string {
  const display = normalizeOfferStatus(s);
  switch (display) {
    case "open":      return "bg-emerald-50 text-emerald-600 border border-emerald-200";
    case "active":    return "bg-blue-50 text-blue-600 border border-blue-200";
    case "completed": return "bg-gray-100 text-gray-600 border border-gray-200";
    case "cancelled": return "bg-red-50 text-red-500 border border-red-200";
    default:          return "bg-gray-100 text-gray-500 border border-gray-200";
  }
}

function statusLabel(s: OfferStatus): string {
  return offerStatusLabel(s);
}

/* ------------------------------------------------------------------ */
/*  SeatBar — uses seatsAvailable only (no seatsTotal in backend)      */
/* ------------------------------------------------------------------ */
function SeatBar({ available }: { available: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.max(available, 0) }).map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-full bg-emerald-400" />
        ))}
      </div>
      <span className="text-xs text-gray-500 tabular-nums">
        {available} seat{available !== 1 ? "s" : ""} available
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast                                                               */
/* ------------------------------------------------------------------ */
function Toast({ msg, type, onDone }: { msg: string; type: "success" | "error"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium
        ${type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}
    >
      {type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
      {msg}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  FieldRow — reusable input                                           */
/* ------------------------------------------------------------------ */
function FieldRow({
  icon, placeholder, value, onChange, type = "text",
}: {
  icon: React.ReactNode;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-emerald-400 transition-colors bg-white">
      <span className="text-emerald-500 flex-shrink-0">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MetaItem                                                            */
/* ------------------------------------------------------------------ */
function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-gray-400 text-[10px] uppercase tracking-wider font-semibold mb-0.5">
        {icon}{label}
      </div>
      <p className="text-xs text-gray-700 font-medium break-words">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BookingDetailsModal                                                 */
/*  Shows riders who booked this driver's offer                        */
/* ------------------------------------------------------------------ */
function BookingDetailsModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/bookings?offerId=${offer._id}`);
        const list =
          res.data?.data?.bookings ||
          res.data?.bookings ||
          (Array.isArray(res.data) ? res.data : []);
        setBookings(list);
      } catch {
        setError("Failed to load booking details.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [offer._id]);

  const originLabel = useReverseGeocode(offer.origin?.coordinates);
  const destLabel   = useReverseGeocode(offer.destination?.coordinates);
  const bookedSeats = bookings.reduce((sum, booking) => sum + Number(booking.seatsRequested || booking.seatCount || booking.seats || 1), 0);
  const confirmedRiders = bookings.filter((booking) => ["confirmed", "picked_up", "live", "completed"].includes(booking.status)).length;
  const seatsTotal = Number(offer.seatsTotal || offer.seatsAvailable + bookedSeats);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow shadow-emerald-200">
              <Hash size={15} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Riders on this Offer</h3>
              <p className="text-xs text-gray-400">{fmtDate(offer.departureTime)}</p>
            </div>
          </div>
          <button onClick={onClose} type="button"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X size={14} className="text-gray-600" />
          </button>
        </div>

        {/* Offer summary */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Pickup</p>
            <p className="text-xs text-gray-700 font-medium">{originLabel}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Drop-off</p>
            <p className="text-xs text-gray-700 font-medium">{destLabel}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Price/seat</p>
            <p className="text-xs text-emerald-600 font-bold">PKR {offer.pricePerSeat}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Seats left</p>
            <p className="text-xs text-gray-700 font-medium">{offer.seatsAvailable}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Seats filled</p>
            <p className="text-xs text-gray-700 font-medium">{bookedSeats}/{seatsTotal}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Active riders</p>
            <p className="text-xs text-gray-700 font-medium">{confirmedRiders}</p>
          </div>
        </div>

        {/* Bookings list */}
        <div className="px-6 py-5 space-y-3 max-h-[45vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4 justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading riders…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-500 py-4 justify-center">
              <AlertCircle size={14} /> {error}
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">🙋</div>
              <p className="text-sm font-semibold text-gray-700">No riders yet</p>
              <p className="text-xs text-gray-400 mt-1">No one has booked this ride offer yet.</p>
            </div>
          ) : (
            bookings.map((b) => {
              const riderName  = b.rider?.name  || b.userId?.name  || "Rider";
              const riderEmail = b.rider?.email || b.userId?.email || null;
              const riderPhone = b.rider?.phone || b.userId?.phone || null;
              const seats      = b.seatsRequested || b.seatCount || b.seats || 1;
              const fareRaw = b.fare;
              const fare: number = typeof fareRaw === "object" && fareRaw !== null
                ? (fareRaw.totalAmount ?? seats * offer.pricePerSeat)
                : (typeof fareRaw === "number" ? fareRaw : seats * offer.pricePerSeat);

              // Rider's requested pickup / dropoff (if stored on booking)
              const pickupCoords   = b.pickupPoint?.coordinates  || b.pickup?.coordinates;
              const dropoffCoords  = b.dropoffPoint?.coordinates || b.dropoff?.coordinates;

              return (
                <div key={b._id}
                  className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
                  {/* Rider identity */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                    <img
                      src={
                        b.rider?.avatar ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(riderName)}&background=10b981&color=fff&size=64`
                      }
                      alt="avatar"
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">{riderName}</p>
                      {riderEmail && <p className="text-xs text-gray-400 truncate">{riderEmail}</p>}
                      {riderPhone && <p className="text-xs text-gray-400">{riderPhone}</p>}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor(b.status)}`}>
                      {b.status}
                    </span>
                  </div>

                  {/* Booking details grid */}
                  <div className="px-4 py-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <MapPin size={10} /> Pickup
                      </p>
                      <p className="text-xs text-gray-700 font-medium">
                        {pickupCoords ? coordsToLabel(pickupCoords) : "Same as offer"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Navigation size={10} /> Drop-off
                      </p>
                      <p className="text-xs text-gray-700 font-medium">
                        {dropoffCoords ? coordsToLabel(dropoffCoords) : "Same as offer"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <Users size={10} /> Seats booked
                      </p>
                      <p className="text-xs text-gray-700 font-medium">{seats}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <DollarSign size={10} /> Total fare
                      </p>
                      <p className="text-xs text-emerald-600 font-bold">PKR {fare}</p>
                    </div>
                    {b.bookedAt && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5 flex items-center gap-1">
                          <Clock size={10} /> Booked at
                        </p>
                        <p className="text-xs text-gray-700 font-medium">{fmtDate(b.bookedAt || b.createdAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EditDialog — sends exact shape backend expects                      */
/*  PUT /rides/offers/:id → { origin:{lat,lng}, destination:{lat,lng}, */
/*  departureTime, seatsAvailable, pricePerSeat, preferences }         */
/* ------------------------------------------------------------------ */
function EditDialog({
  offer, onClose, onSave,
}: {
  offer: Offer;
  onClose: () => void;
  onSave: (fields: any) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const [lng0, lat0] = offer.origin?.coordinates      || [0, 0];
  const [lng1, lat1] = offer.destination?.coordinates || [0, 0];

  const [fields, setFields] = useState({
    originLat:        String(lat0),
    originLng:        String(lng0),
    destinationLat:   String(lat1),
    destinationLng:   String(lng1),
    departureTime:    offer.departureTime?.slice(0, 16) || "",
    seatsAvailable:   String(offer.seatsAvailable ?? ""),
    pricePerSeat:     String(offer.pricePerSeat ?? ""),
    prefMusic:        offer.preferences?.music        ?? true,
    prefSmoking:      offer.preferences?.smoking      ?? false,
    prefPets:         offer.preferences?.pets         ?? false,
    prefConversation: offer.preferences?.conversation ?? true,
    isRecurring:      offer.isRecurring || false,
    recurrencePattern: offer.recurrencePattern || "",
  });

  const setStr = (k: keyof typeof fields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((f) => ({ ...f, [k]: e.target.value }));

  const toggleBool = (k: keyof typeof fields) =>
    setFields((f) => ({ ...f, [k]: !f[k] }));

  const handleSave = async () => {
    setSaving(true);
    // Build payload matching exactly what updateRideOffer expects
    await onSave({
      origin: {
        lat: Number(fields.originLat),
        lng: Number(fields.originLng),
      },
      destination: {
        lat: Number(fields.destinationLat),
        lng: Number(fields.destinationLng),
      },
      departureTime:  fields.departureTime
        ? new Date(fields.departureTime).toISOString()
        : undefined,
      seatsAvailable: Number(fields.seatsAvailable),
      pricePerSeat:   Number(fields.pricePerSeat),
      preferences: {
        music:        fields.prefMusic,
        smoking:      fields.prefSmoking,
        pets:         fields.prefPets,
        conversation: fields.prefConversation,
      },
      isRecurring:      fields.isRecurring,
      recurrencePattern: fields.isRecurring ? fields.recurrencePattern : undefined,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow shadow-emerald-200">
              <Pencil size={15} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Edit Ride Offer</h3>
              <p className="text-xs text-gray-400">Only open offers can be edited</p>
            </div>
          </div>
          <button onClick={onClose} type="button"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X size={14} className="text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

          {/* Origin */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Origin coordinates</p>
            <div className="grid grid-cols-2 gap-2">
              <FieldRow icon={<MapPin size={13} />} placeholder="Latitude" type="number"
                value={fields.originLat} onChange={setStr("originLat")} />
              <FieldRow icon={<MapPin size={13} />} placeholder="Longitude" type="number"
                value={fields.originLng} onChange={setStr("originLng")} />
            </div>
          </div>

          {/* Destination */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Destination coordinates</p>
            <div className="grid grid-cols-2 gap-2">
              <FieldRow icon={<Navigation size={13} />} placeholder="Latitude" type="number"
                value={fields.destinationLat} onChange={setStr("destinationLat")} />
              <FieldRow icon={<Navigation size={13} />} placeholder="Longitude" type="number"
                value={fields.destinationLng} onChange={setStr("destinationLng")} />
            </div>
          </div>

          {/* Schedule */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Departure time</p>
            <FieldRow icon={<Calendar size={13} />} type="datetime-local"
              value={fields.departureTime} onChange={setStr("departureTime")} />
          </div>

          {/* Seats & Price */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Seats & Price</p>
            <div className="grid grid-cols-2 gap-2">
              <FieldRow icon={<Users size={13} />} placeholder="Seats available" type="number"
                value={fields.seatsAvailable} onChange={setStr("seatsAvailable")} />
              <FieldRow icon={<DollarSign size={13} />} placeholder="Price per seat (PKR)" type="number"
                value={fields.pricePerSeat} onChange={setStr("pricePerSeat")} />
            </div>
          </div>

          {/* Preferences */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Preferences</p>
            <div className="flex flex-wrap gap-2">
              {([ ["prefMusic","🎵 Music"], ["prefSmoking","🚬 Smoking"], ["prefPets","🐾 Pets"], ["prefConversation","💬 Chat"] ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => toggleBool(key)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all
                    ${fields[key]
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white border-gray-200 text-gray-500 hover:border-emerald-300"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recurring */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer"
              onClick={() => toggleBool("isRecurring")}>
              <div className="relative pointer-events-none">
                <div className={`w-9 h-5 rounded-full transition-colors ${fields.isRecurring ? "bg-emerald-500" : "bg-gray-200"}`} />
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${fields.isRecurring ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm text-gray-700">Recurring ride</span>
            </label>
            <AnimatePresence>
              {fields.isRecurring && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mt-2"
                >
                  <FieldRow icon={<RefreshCw size={13} />} placeholder="e.g. Mon / Wed / Fri"
                    value={fields.recurrencePattern} onChange={setStr("recurrencePattern")} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} type="button"
            className="flex-1 py-2.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} type="button"
            className="flex-1 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
            {saving
              ? <><RefreshCw size={13} className="animate-spin" /> Saving…</>
              : <><CheckCircle size={13} /> Save Changes</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CancelDialog                                                        */
/* ------------------------------------------------------------------ */
function CancelDialog({ offer, onClose, onConfirm }: {
  offer: Offer;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const originName = useReverseGeocode(offer.origin?.coordinates);
  const destName   = useReverseGeocode(offer.destination?.coordinates);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
      >
        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-base mb-1">Cancel this ride?</h3>
        <div className="text-sm text-gray-500 mb-1 space-y-0.5">
          <p><span className="font-medium text-gray-700">From:</span> {originName}</p>
          <p><span className="font-medium text-gray-700">To:</span>   {destName}</p>
          <p><span className="font-medium text-gray-700">Departs:</span> {fmtDate(offer.departureTime)}</p>
        </div>
        <p className="text-xs text-gray-400 mt-3 mb-6">This will mark the offer as cancelled. Riders will be notified.</p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Keep it
          </button>
          <button
            disabled={loading}
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); }}
            className="flex-1 py-2.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Cancel Ride
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  OfferCard                                                           */
/* ------------------------------------------------------------------ */
const OfferCard = forwardRef<HTMLDivElement, {
  offer: Offer;
  summary: OfferBookingSummary;
  onEdit: () => void;
  onCancel: () => void;
  onDetails: () => void;
}>(({ offer, summary, onEdit, onCancel, onDetails }, ref) => {
  const originName  = useReverseGeocode(offer.origin?.coordinates);
  const destName    = useReverseGeocode(offer.destination?.coordinates);
  const isCancelled = offer.status === "cancelled";
  const seatsTotal = Number(offer.seatsTotal || offer.seatsAvailable + summary.bookedSeats);

  const prefLabels = offer.preferences
    ? [
        offer.preferences.music        && "🎵",
        offer.preferences.conversation && "💬",
        offer.preferences.smoking      && "🚬",
        offer.preferences.pets         && "🐾",
      ].filter(Boolean).join("  ")
    : "";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`bg-white rounded-2xl border border-gray-200 p-5 transition-all duration-200 hover:shadow-md ${isCancelled ? "opacity-60" : ""}`}
    >
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Icon */}
        <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow shadow-emerald-200">
          <Car size={18} className="text-white" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          {/* Coordinate route */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="font-bold text-gray-900 text-sm truncate max-w-[42vw] sm:max-w-[160px]">
              {originName}
            </span>
            <ArrowRight size={13} className="text-gray-400 flex-shrink-0" />
            <span className="font-bold text-gray-900 text-sm truncate max-w-[42vw] sm:max-w-[160px]">
              {destName}
            </span>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3 mb-3">
            <MetaItem
              icon={<Clock size={12} />}
              label="Departure"
              value={fmtDate(offer.departureTime)}
            />
            <MetaItem
              icon={<DollarSign size={12} />}
              label="Price/seat"
              value={`PKR ${offer.pricePerSeat}`}
            />
            <MetaItem
              icon={<Users size={12} />}
              label="Seats available"
              value={`${offer.seatsAvailable} left`}
            />
            <MetaItem
              icon={<Hash size={12} />}
              label="Seat usage"
              value={`${summary.bookedSeats}/${seatsTotal} booked`}
            />
            <MetaItem
              icon={<Users size={12} />}
              label="Riders"
              value={`${summary.riders} linked • ${summary.confirmedRiders} active`}
            />
            {prefLabels && (
              <MetaItem icon={<Car size={12} />} label="Preferences" value={prefLabels} />
            )}
            {offer.isRecurring && (
              <MetaItem icon={<RefreshCw size={12} />} label="Recurring" value={offer.recurrencePattern || "Yes"} />
            )}
          </div>

          {/* Seat dots */}
          <SeatBar available={offer.seatsAvailable} />
          <div className="mt-3 rounded-2xl bg-gray-50 border border-gray-100 px-3 py-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-900">Next step</p>
            <p className="mt-1">
              Use <span className="font-semibold">Manage Requests</span> for incoming and accepted riders, then move to <span className="font-semibold">Live Ride</span> once pickup starts.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex md:flex-col items-center gap-2 self-start md:self-start w-full md:w-auto justify-between md:justify-start">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor(offer.status)}`}>
            {statusLabel(offer.status)}
          </span>

          {!isCancelled && (
            <div className="flex gap-1.5 mt-1">
              {/* Only "open" offers can be edited per backend */}
              {offer.status === "open" && (
                <button onClick={onEdit}
                  className="w-8 h-8 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-colors"
                  title="Edit offer">
                  <Pencil size={14} />
                </button>
              )}
              <button onClick={onCancel}
                className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors"
                title="Cancel offer">
                <Trash2 size={14} />
              </button>
              <button onClick={onDetails}
                className="w-8 h-8 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-colors"
                title="View riders and seats">
                <Hash size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

OfferCard.displayName = "OfferCard";

/* ------------------------------------------------------------------ */
/*  Main Page                                                           */
/* ------------------------------------------------------------------ */
const MyOffers = () => {
  const [offers, setOffers]         = useState<Offer[]>([]);
  const [bookingSummaryByOffer, setBookingSummaryByOffer] = useState<Record<string, OfferBookingSummary>>({});
  const [loading, setLoading]       = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [editOffer, setEditOffer]   = useState<Offer | null>(null);
  const [cancelOffer, setCancelOffer] = useState<Offer | null>(null);
  const [detailsOffer, setDetailsOffer] = useState<Offer | null>(null);
  const [toast, setToast]           = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") =>
    setToast({ msg, type });

  const fetchOffers = async () => {
    try {
      const [offersRes, bookingsRes] = await Promise.all([
        api.get("/rides/offers/me"),
        api.get("/bookings"),
      ]);
      const list: Offer[] =
        offersRes.data?.data?.offers ||
        offersRes.data?.offers ||
        (Array.isArray(offersRes.data) ? offersRes.data : []);
      const bookings =
        bookingsRes.data?.data?.bookings ||
        bookingsRes.data?.bookings ||
        (Array.isArray(bookingsRes.data) ? bookingsRes.data : []);
      const summary = bookings.filter((booking: any) => !booking.hiddenForDriver).reduce((acc: Record<string, OfferBookingSummary>, booking: any) => {
        const offerId = booking.offer?._id || booking.offerId || booking.offer;
        if (!offerId) return acc;
        if (!acc[offerId]) {
          acc[offerId] = { riders: 0, bookedSeats: 0, confirmedRiders: 0 };
        }
        acc[offerId].riders += 1;
        acc[offerId].bookedSeats += Number(booking.seatsRequested || booking.seatCount || booking.seats || 1);
        if (["confirmed", "picked_up", "live", "completed"].includes(booking.status)) {
          acc[offerId].confirmedRiders += 1;
        }
        return acc;
      }, {});
      const nextOffers = list
        .filter((offer: any) => !offer.hiddenForDriver)
        .map((offer: any) => ({ ...offer, status: normalizeOfferStatus(offer.status) }));
      setOffers(nextOffers.filter((offer: any) => !["completed", "cancelled"].includes(String(offer.status || ""))));
      setBookingSummaryByOffer(summary);
    } catch {
      showToast("Could not load your offers.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOffers(); }, []);

  /* ---- filter by departureTime ---- */
  const filtered = offers.filter((o) => {
    if (timeFilter === "all") return true;
    const d   = new Date(o.departureTime || o.createdAt);
    const now = new Date();
    if (timeFilter === "today") return d.toDateString() === now.toDateString();
    if (timeFilter === "week")  { const ago = new Date(); ago.setDate(now.getDate() - 7);  return d >= ago; }
    if (timeFilter === "month") { const ago = new Date(); ago.setMonth(now.getMonth() - 1); return d >= ago; }
    return true;
  });

  /* ---- edit: PUT /rides/offers/:id with backend-expected shape ---- */
  const handleEdit = async (fields: any) => {
    if (!editOffer) return;
    try {
      await api.put(`/rides/offers/${editOffer._id}`, fields);
      showToast("Ride offer updated successfully.");
      setEditOffer(null);
      fetchOffers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to update offer.";
      showToast(msg, "error");
    }
  };

  /* ---- cancel: POST /rides/offers/:id/cancel ---- */
  const handleCancel = async () => {
    if (!cancelOffer) return;
    try {
      await api.post(`/rides/offers/${cancelOffer._id}/cancel`);
      showToast("Ride offer cancelled.");
      setCancelOffer(null);
      fetchOffers();
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Failed to cancel offer.";
      showToast(msg, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const stats = [
    { label: "Active", value: offers.filter((o) => normalizeOfferStatus(o.status) === "active").length, color: "text-blue-600" },
    { label: "Open", value: offers.filter((o) => o.status === "open").length, color: "text-emerald-600" },
    { label: "Total", value: offers.length, color: "text-gray-700" },
  ];
  const totalBookedSeats = Object.values(bookingSummaryByOffer).reduce((sum, summary) => sum + summary.bookedSeats, 0);
  const totalActiveRiders = Object.values(bookingSummaryByOffer).reduce((sum, summary) => sum + summary.confirmedRiders, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">My Published Rides</h2>
          <p className="text-sm text-gray-400 mt-0.5">Manage the rides you have offered to others</p>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
          {(["all", "today", "week", "month"] as const).map((tf) => (
            <button key={tf} onClick={() => setTimeFilter(tf)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                timeFilter === tf ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400 hover:text-gray-700"
              }`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {offers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-2xl font-bold text-gray-900">{totalBookedSeats}</p>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Seats Booked</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <p className="text-2xl font-bold text-gray-900">{totalActiveRiders}</p>
            <p className="text-xs text-gray-400 font-medium mt-0.5">Active Riders</p>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-bold text-gray-900">Offer Ownership</h3>
          <div className="grid md:grid-cols-3 gap-4 mt-4 text-sm text-gray-600">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="font-semibold text-gray-900">Offer Details</p>
              <p className="mt-1">Each card shows route, seats left, seat usage, preferences, and recurrence.</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="font-semibold text-gray-900">Riders On Offer</p>
              <p className="mt-1">Use the green details action to see riders attached to that specific offer and their booked seats.</p>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <p className="font-semibold text-gray-900">Next Step</p>
              <p className="mt-1">New and accepted rider actions continue in Manage Requests, then pickup moves into Live Ride.</p>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-20 bg-white rounded-3xl border border-gray-200">
              <div className="text-5xl mb-4">🚗</div>
              <h3 className="font-bold text-gray-800 text-base mb-1">No rides found</h3>
              <p className="text-gray-400 text-sm">
                {timeFilter !== "all" ? "Try changing the time filter." : "Active offers appear here. Completed rides move to history automatically."}
              </p>
            </motion.div>
          ) : (
            filtered.map((offer) => (
              <OfferCard
                key={offer._id}
                offer={offer}
                summary={bookingSummaryByOffer[offer._id] || { riders: 0, bookedSeats: 0, confirmedRiders: 0 }}
                onEdit={() => setEditOffer(offer)}
                onCancel={() => setCancelOffer(offer)}
                onDetails={() => setDetailsOffer(offer)}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {editOffer && (
          <EditDialog key="edit" offer={editOffer}
            onClose={() => setEditOffer(null)} onSave={handleEdit} />
        )}
        {cancelOffer && (
          <CancelDialog key="cancel" offer={cancelOffer}
            onClose={() => setCancelOffer(null)} onConfirm={handleCancel} />
        )}
        {detailsOffer && (
          <BookingDetailsModal key="details" offer={detailsOffer}
            onClose={() => setDetailsOffer(null)} />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <Toast key="toast" msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MyOffers;
