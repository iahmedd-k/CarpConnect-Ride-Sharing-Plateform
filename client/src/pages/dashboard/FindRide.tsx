import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import debounce from "lodash/debounce";
import {
    MapPin, Search, Star, Clock, Car, Navigation,
    Loader2, ChevronRight, X, Users, RefreshCw,
    AlertCircle, CheckCircle2, Calendar, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LeafletMap from "@/components/LeafletMap";
import { StripeCheckoutModal } from "@/components/StripeCheckoutModal";
import {
    fetchAddressSuggestions,
    resolveAddressCoordinates,
    type AddressSuggestion,
} from "@/lib/addressAutocomplete";
import api from "../../lib/api";
import { toast } from "sonner";
import { normalizeOfferStatus } from "@/lib/rideStatus";

// ─────────────────────── Types ─────────────────────────────────────────────────
interface RideResult {
    _id: string;
    origin: string;
    destination: string;
    originCoords: number[] | null;
    destinationCoords: number[] | null;
    departureTime: string;
    pricePerSeat: number;
    currency: string;
    seatsAvailable: number;
    seatsTotal?: number;
    isFull?: boolean;
    estimatedDistanceKm?: number;
    estimatedDurationMin?: number;
    status: string;
    driver: {
        _id?: string;
        id?: string;
        name: string;
        avatar?: string | null;
        ratings?: { average?: number; count?: number };
        vehicle?: { make?: string; model?: string; year?: number; seats?: number } | string;
    };
}

const shortAddress = (value: any, fallback = "—") => {
    const text = typeof value === "string"
        ? value
        : (value?.address || value?.name || "");
    if (!text || typeof text !== "string") return fallback;
    if (["origin", "destination", "pickup", "dropoff"].includes(text.trim().toLowerCase())) return fallback;
    return text.split(",")[0] || fallback;
};

// ─────────────────────── Seat Book Modal ────────────────────────────────────────
interface SeatBookModalProps {
    ride: RideResult;
    onConfirm: (seats: number, paymentMethod: "cash" | "stripe") => void;
    onClose: () => void;
    loading: boolean;
}
function SeatBookModal({ ride, onConfirm, onClose, loading }: SeatBookModalProps) {
    const [seats, setSeats] = useState(1);
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "stripe">("cash");
    const max = Math.min(ride.seatsAvailable, 8);
    const total = ride.pricePerSeat * seats;

    const fmt2 = (n: number) =>
        new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(n);

    const [showBreakdown, setShowBreakdown] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
                className="w-full max-w-sm bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/40">
                    <div>
                        <h3 className="font-display font-bold text-lg">Book Your Seats</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {shortAddress(ride.origin)} → {shortAddress(ride.destination)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Price per seat info */}
                    <div className="flex items-center justify-between bg-muted/20 rounded-2xl px-5 py-4">
                        <div>
                            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Price per seat</div>
                            <div className="text-2xl font-display font-black text-primary">{fmt2(ride.pricePerSeat)}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Available</div>
                            <div className="text-2xl font-display font-black text-emerald-400">{ride.seatsAvailable}</div>
                        </div>
                    </div>

                    {/* Seat selector */}
                    <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-3">
                            Number of seats
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSeats(s => Math.max(1, s - 1))}
                                disabled={seats <= 1}
                                className="w-12 h-12 rounded-2xl border border-border bg-muted/20 flex items-center justify-center text-xl font-bold hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                id="seat-minus"
                            >−</button>

                            <div className="flex-1 text-center">
                                <div className="text-4xl font-display font-black text-foreground">{seats}</div>
                                <div className="text-xs text-muted-foreground">{seats === 1 ? 'seat' : 'seats'}</div>
                            </div>

                            <button
                                onClick={() => setSeats(s => Math.min(max, s + 1))}
                                disabled={seats >= max}
                                className="w-12 h-12 rounded-2xl border border-border bg-muted/20 flex items-center justify-center text-xl font-bold hover:bg-muted/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                id="seat-plus"
                            >+</button>
                        </div>

                        {/* Quick pick buttons */}
                        <div className="flex gap-2 mt-3 justify-center">
                            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
                                <button
                                    key={n}
                                    onClick={() => setSeats(n)}
                                    className={`w-9 h-9 rounded-xl text-sm font-bold transition-all border ${
                                        seats === n
                                            ? "bg-primary text-white border-primary shadow-glow"
                                            : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                                    }`}
                                >{n}</button>
                            ))}
                        </div>
                    </div>

                    {/* Total */}
                    <div className="bg-primary/5 border border-primary/15 rounded-2xl px-5 py-4 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Total fare</div>
                            <div className="text-xs text-muted-foreground">{seats} seat{seats > 1 ? 's' : ''} × {fmt2(ride.pricePerSeat)}</div>
                        </div>
                        <div className="text-3xl font-display font-black text-primary">{fmt2(total)}</div>
                        <button
                            type="button"
                            className="ml-2 px-2 py-1 rounded-xl bg-muted/20 text-xs font-bold text-primary border border-primary/20 hover:bg-primary/10 transition-all"
                            onClick={() => setShowBreakdown(true)}
                        >
                            Fare Breakdown
                        </button>
                    </div>

                    {/* Fare breakdown modal */}
                    <AnimatePresence>
                        {showBreakdown && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                                onClick={e => e.target === e.currentTarget && setShowBreakdown(false)}
                            >
                                <motion.div
                                    initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
                                    className="w-full max-w-xs bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
                                >
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                                        <h4 className="font-display font-bold text-base">Fare Breakdown</h4>
                                        <button onClick={() => setShowBreakdown(false)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                                            <X className="w-4 h-4 text-muted-foreground" />
                                        </button>
                                    </div>
                                    <div className="p-5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground font-bold">Base Fare</span>
                                            <span className="text-xs text-foreground font-semibold">{fmt2(ride.pricePerSeat * seats)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground font-bold">Platform Fee</span>
                                            <span className="text-xs text-foreground font-semibold">{fmt2(Math.round(ride.pricePerSeat * seats * 0.1))}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground font-bold">Total</span>
                                            <span className="text-xs text-primary font-bold">{fmt2(Math.round(ride.pricePerSeat * seats * 1.1))}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                            Payment method
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setPaymentMethod("cash")}
                                className={`h-11 rounded-xl border text-xs font-bold transition-all ${paymentMethod === "cash"
                                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-600"
                                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                                    }`}
                            >
                                Cash / Direct
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentMethod("stripe")}
                                className={`h-11 rounded-xl border text-xs font-bold transition-all ${paymentMethod === "stripe"
                                    ? "bg-primary/10 border-primary text-primary"
                                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                                    }`}
                            >
                                Online
                            </button>
                        </div>
                    </div>

                    <Button
                        onClick={() => onConfirm(seats, paymentMethod)}
                        disabled={loading}
                        className="w-full h-13 py-4 bg-gradient-primary text-white rounded-2xl font-bold text-sm shadow-glow hover:opacity-90 transition-opacity"
                        id="confirm-book-btn"
                    >
                        {loading
                            ? <span className="flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Booking...</span>
                            : <span className="flex items-center gap-2 justify-center"><Wallet className="w-4 h-4" /> Confirm {seats} seat{seats > 1 ? 's' : ''} ({paymentMethod === "cash" ? "Cash" : "Online"}) · {fmt2(total)}</span>
                        }
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─────────────────────── Helpers ───────────────────────────────────────────────
const fmt = {
    currency: (n: any) => {
        const v = Number(n);
        if (!v || isNaN(v)) return "Rs ---";
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(v);
    },
    time: (t: any) => {
        const d = new Date(t);
        return isNaN(d.getTime()) ? "---" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },
    dateShort: (t: any) => {
        const d = new Date(t);
        return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    },
    distanceKm: (n: any) => (n ? `${Number(n).toFixed(1)} km` : "—"),
    durationMin: (n: any) => (n ? `${Math.round(Number(n))} min` : "—"),
    driverName: (r: RideResult) => r.driver?.name || "Driver",
    vehicleMake: (r: RideResult) => {
        const v = r.driver?.vehicle;
        if (!v) return "Car";
        if (typeof v === "string") return v;
        return v.make || "Car";
    },
    rating: (r: RideResult) => {
        const avg = r.driver?.ratings?.average;
        return avg ? Number(avg).toFixed(1) : "N/A";
    },
};

// ─────────────────────── Skeleton ──────────────────────────────────────────────
const SkeletonCard = () => (
    <div className="p-5 rounded-3xl border border-border/30 bg-card animate-pulse">
        <div className="flex gap-4">
            <div className="w-12 h-12 rounded-2xl bg-muted/40 shrink-0" />
            <div className="flex-1 space-y-2.5">
                <div className="h-4 bg-muted/40 rounded-xl w-3/4" />
                <div className="h-3 bg-muted/30 rounded-xl w-1/2" />
                <div className="flex gap-2 pt-1">
                    <div className="h-5 w-16 bg-muted/30 rounded-full" />
                    <div className="h-5 w-20 bg-muted/20 rounded-full" />
                </div>
            </div>
            <div className="h-6 w-16 bg-muted/30 rounded-xl shrink-0" />
        </div>
    </div>
);

// ─────────────────────── Address Input ─────────────────────────────────────────
interface AddressInputProps {
    id: string;
    value: string;
    placeholder: string;
    icon: React.ReactNode;
    suggestions: AddressSuggestion[];
    loading: boolean;
    onChange: (v: string) => void;
    onSelect: (s: AddressSuggestion) => void;
    onClear: () => void;
}
function AddressInput({ id, value, placeholder, icon, suggestions, loading, onChange, onSelect, onClear }: AddressInputProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">{icon}</div>
            <input
                id={id}
                value={value}
                autoComplete="off"
                placeholder={placeholder}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                className="w-full bg-muted/30 border border-border rounded-xl pl-11 pr-9 py-3.5 text-sm
                           focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all
                           placeholder:text-muted-foreground/50 text-foreground"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {loading && <Loader2 className="w-4 h-4 text-primary/60 animate-spin" />}
                {value && !loading && (
                    <button type="button" onClick={onClear} tabIndex={-1}
                        className="p-0.5 rounded-full hover:bg-muted/60 transition-colors">
                        <X className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </button>
                )}
            </div>
            <AnimatePresence>
                {open && suggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-border
                                   rounded-2xl shadow-2xl overflow-hidden"
                    >
                        {suggestions.map((s, i) => (
                            <button key={i} type="button"
                                onClick={() => { onSelect(s); setOpen(false); }}
                                className="w-full text-left px-4 py-3 text-sm flex items-center gap-3
                                           hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0"
                            >
                                <MapPin className="w-3.5 h-3.5 text-primary/50 shrink-0" />
                                <span className="truncate">{s.address}</span>
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─────────────────────── Empty State ───────────────────────────────────────────
function EmptyState({ destination, date, onClearDate, onClearAll }: {
    destination: string; date: string;
    onClearDate: () => void; onClearAll: () => void;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="text-center py-14 px-8 bg-card rounded-3xl border border-border/40"
        >
            <div className="w-20 h-20 rounded-3xl bg-muted/20 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <h4 className="text-lg font-display font-bold mb-2 text-foreground">No rides found</h4>
            <p className="text-sm text-muted-foreground mb-1">
                No scheduled or live rides match{destination && (
                    <strong className="text-foreground"> "{destination}"</strong>
                )}.
            </p>
            <p className="text-xs text-muted-foreground/70 mb-6">
                Try checking spelling, removing the date filter, or searching a nearby area.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
                {date && (
                    <Button size="sm" variant="outline" onClick={onClearDate} className="rounded-xl text-xs gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> Clear date &amp; retry
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={onClearAll} className="rounded-xl text-xs gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Show all upcoming rides
                </Button>
            </div>
        </motion.div>
    );
}

// ─────────────────────── Main Component ────────────────────────────────────────
const FindRide = ({
    onViewProfile,
    initialQuery = "",
}: {
    onViewProfile?: (driverId: string) => void;
    initialQuery?: string;
}) => {
    const navigate = useNavigate();
    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

    // ── Form state
    const [origin, setOrigin] = useState("");
    const [destination, setDestination] = useState(initialQuery || "");
    const [originCoords, setOriginCoords] = useState<number[] | null>(null);
    const [destCoords, setDestCoords] = useState<number[] | null>(null);
    const [date, setDate] = useState("");
    const [requestSeats, setRequestSeats] = useState(1);
    const [requestSeatsInput, setRequestSeatsInput] = useState("1");
    const [maxFarePerSeat, setMaxFarePerSeat] = useState("");
    const [earliestTime, setEarliestTime] = useState("07:30");
    const [latestTime, setLatestTime] = useState("08:30");
    const [requestRecurring, setRequestRecurring] = useState(false);
    const [requestRecurrencePattern, setRequestRecurrencePattern] = useState("weekdays");

    // ── Autocomplete
    const [originSugg, setOriginSugg] = useState<AddressSuggestion[]>([]);
    const [destSugg, setDestSugg] = useState<AddressSuggestion[]>([]);
    const [loadingOrigin, setLoadingOrigin] = useState(false);
    const [loadingDest, setLoadingDest] = useState(false);

    // ── Results
    const [searching, setSearching] = useState(false);
    const [rides, setRides] = useState<RideResult[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [selected, setSelected] = useState<RideResult | null>(null);
    const [bookedIds, setBookedIds] = useState<Record<string, boolean>>({});

    // ── Booking
    const [bookingId, setBookingId] = useState<string | null>(null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [paymentId, setPaymentId] = useState<string | null>(null);
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [bookingLoading, setBookingLoading] = useState(false);
    const [nearbyLoading, setNearbyLoading] = useState(false);
    const [requestLoading, setRequestLoading] = useState(false);
    const [myRequests, setMyRequests] = useState<any[]>([]);
    const [myRequestsLoading, setMyRequestsLoading] = useState(false);
    const [respondingCounterId, setRespondingCounterId] = useState<string | null>(null);

    // ── Edit / Delete modals
    const [editModal, setEditModal] = useState<{ open: boolean; request: any | null }>({ open: false, request: null });
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; requestId: string | null }>({ open: false, requestId: null });
    const [editLoading, setEditLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const resultsRef = useRef<HTMLDivElement>(null);
    const autoSearched = useRef(false);

    const fetchOsmSuggestions = async (query: string): Promise<AddressSuggestion[]> => {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!res.ok) return [];

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data
            .map((item: any): AddressSuggestion => {
                const lng = Number(item?.lon);
                const lat = Number(item?.lat);
                const validCoords = Number.isFinite(lng) && Number.isFinite(lat);

                return {
                    address: String(item?.display_name || "").trim(),
                    coordinates: validCoords ? [lng, lat] as [number, number] : null,
                    placeId: String(item?.place_id || ""),
                };
            })
            .filter((item) => !!item.address);
    };

    // ── Fetch address autocomplete suggestions ───────────────────────────────
    const fetchSuggestions = async (q: string, type: "origin" | "destination") => {
        if (q.trim().length < 2) {
            type === "origin" ? setOriginSugg([]) : setDestSugg([]);
            return;
        }

        const setSuggestions = (items: AddressSuggestion[]) => {
            type === "origin" ? setOriginSugg(items) : setDestSugg(items);
        };

        type === "origin" ? setLoadingOrigin(true) : setLoadingDest(true);
        try {
            const query = q.trim();

            // OSM Nominatim — free, no API key required
            const osmResults = await fetchOsmSuggestions(query);
            if (osmResults.length > 0) {
                setSuggestions(osmResults);
                return;
            }

            // Nothing found — clear suggestions gracefully
            setSuggestions([]);
        } catch { /* non-blocking */ } finally {
            type === "origin" ? setLoadingOrigin(false) : setLoadingDest(false);
        }
    };

    const fetchUnifiedSuggestions = async (q: string, type: "origin" | "destination") => {
        if (q.trim().length < 2) {
            type === "origin" ? setOriginSugg([]) : setDestSugg([]);
            return;
        }

        type === "origin" ? setLoadingOrigin(true) : setLoadingDest(true);
        try {
            const items = await fetchAddressSuggestions(q.trim(), googleMapsApiKey, 6);
            type === "origin" ? setOriginSugg(items) : setDestSugg(items);
        } catch {
            type === "origin" ? setOriginSugg([]) : setDestSugg([]);
        } finally {
            type === "origin" ? setLoadingOrigin(false) : setLoadingDest(false);
        }
    };

    const debouncedOrigin = useCallback(debounce((q: string) => fetchSuggestions(q, "origin"), 350), []);
    const debouncedDest = useCallback(debounce((q: string) => fetchSuggestions(q, "destination"), 350), []);

    const pickAddress = (value: any, fallback = ""): string => {
        if (typeof value === "string") return value;
        if (value && typeof value === "object") {
            if (typeof value.address === "string") return value.address;
            if (typeof value.location?.address === "string") return value.location.address;
            if (typeof value.name === "string") return value.name;
        }
        return fallback;
    };

    const pickCoords = (...candidates: any[]): number[] | null => {
        for (const candidate of candidates) {
            if (!candidate) continue;

            if (Array.isArray(candidate) && candidate.length >= 2) {
                const lng = Number(candidate[0]);
                const lat = Number(candidate[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
            }

            if (Array.isArray(candidate.coordinates) && candidate.coordinates.length >= 2) {
                const lng = Number(candidate.coordinates[0]);
                const lat = Number(candidate.coordinates[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
            }

            if (Array.isArray(candidate.point?.coordinates) && candidate.point.coordinates.length >= 2) {
                const lng = Number(candidate.point.coordinates[0]);
                const lat = Number(candidate.point.coordinates[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
            }

            if (
                typeof candidate.lng !== "undefined" &&
                typeof candidate.lat !== "undefined"
            ) {
                const lng = Number(candidate.lng);
                const lat = Number(candidate.lat);
                if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
            }
        }
        return null;
    };

    const normalizeRide = (raw: any, index: number): RideResult => {
        const driverRaw = raw?.driver || raw?.driverId || {};
        const originTextCandidate = pickAddress(
            raw?.origin,
            pickAddress(raw?.from, String(raw?.originAddress || "").trim() || "Unknown origin")
        );
        const destinationTextCandidate = pickAddress(
            raw?.destination,
            pickAddress(raw?.to, String(raw?.destinationAddress || "").trim() || "Unknown destination")
        );
        const originText = ["origin", "pickup"].includes(String(originTextCandidate || "").toLowerCase())
            ? "Unknown origin"
            : originTextCandidate;
        const destinationText = ["destination", "dropoff"].includes(String(destinationTextCandidate || "").toLowerCase())
            ? "Unknown destination"
            : destinationTextCandidate;

        return {
            _id: String(raw?._id || raw?.id || `ride-${index}`),
            origin: originText,
            destination: destinationText,
            originCoords: pickCoords(
                raw?.originCoords,
                raw?.origin,
                raw?.from,
                raw?.origin?.point,
                raw?.from?.point
            ),
            destinationCoords: pickCoords(
                raw?.destinationCoords,
                raw?.destination,
                raw?.to,
                raw?.destination?.point,
                raw?.to?.point
            ),
            departureTime: raw?.departureTime || raw?.estimatedDeparture || new Date().toISOString(),
            pricePerSeat: Number(raw?.pricePerSeat || 0),
            currency: raw?.currency || "PKR",
            seatsAvailable: Number(raw?.seatsAvailable ?? raw?.availableSeats ?? 0),
            seatsTotal: Number(raw?.seatsTotal ?? raw?.totalSeats ?? 0) || undefined,
            isFull: Boolean(raw?.isFull),
            estimatedDistanceKm: Number(raw?.estimatedDistanceKm ?? raw?.distanceKm ?? 0) || undefined,
            estimatedDurationMin: Number(raw?.estimatedDurationMin ?? raw?.durationMin ?? 0) || undefined,
            status: normalizeOfferStatus(raw?.status),
            driver: {
                _id: driverRaw?._id,
                id: driverRaw?.id,
                name: driverRaw?.name || "Driver",
                avatar: driverRaw?.avatar || driverRaw?.profilePhoto || null,
                ratings: driverRaw?.ratings,
                vehicle: driverRaw?.vehicle,
            },
        };
    };

    const normalizeRides = (payload: any): RideResult[] => {
        // Handle all common response shapes:
        // { data: { rides: [] } }, { data: { offers: [] } },
        // { data: [] }, { rides: [] }, { offers: [] }, or a bare []
        const list =
            payload?.data?.rides   ||
            payload?.data?.offers  ||
            payload?.data?.results ||
            payload?.rides         ||
            payload?.offers        ||
            (Array.isArray(payload?.data) ? payload.data : null) ||
            (Array.isArray(payload)       ? payload       : []);
        if (!Array.isArray(list)) return [];
        return list.map((ride: any, idx: number) => normalizeRide(ride, idx));
    };

    const resolveCoordsFromAddress = async (address: string, placeId?: string): Promise<number[] | null> => {
        // Use OSM Nominatim for geocoding — reliable, no API key needed
        try {
            const osmResults = await fetchOsmSuggestions(address);
            const first = osmResults[0];
            if (Array.isArray(first?.coordinates) && first.coordinates.length >= 2) {
                const lng = Number(first.coordinates[0]);
                const lat = Number(first.coordinates[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
            }
        } catch {
            // Non-blocking
        }
        return null;
    };

    const resolveCoordsWithProviders = async (address: string, placeId?: string): Promise<number[] | null> => {
        const osmCoords = await resolveCoordsFromAddress(address, placeId);
        if (osmCoords) return osmCoords;
        return resolveAddressCoordinates(address, googleMapsApiKey, placeId);
    };

    const resolveCoordsForRequest = async () => {
        let resolvedOrigin = originCoords;
        let resolvedDestination = destCoords;

        if (!resolvedOrigin && origin.trim()) {
            resolvedOrigin = await resolveCoordsWithProviders(origin.trim());
            if (resolvedOrigin) setOriginCoords(resolvedOrigin);
        }

        if (!resolvedDestination && destination.trim()) {
            resolvedDestination = await resolveCoordsWithProviders(destination.trim());
            if (resolvedDestination) setDestCoords(resolvedDestination);
        }

        return { resolvedOrigin, resolvedDestination };
    };

    const fetchMyRequests = async () => {
        setMyRequestsLoading(true);
        try {
            const res = await api.get('/rides/requests/me');
            if (res.data?.success) {
                const all = Array.isArray(res.data?.data?.requests) ? res.data.data.requests : [];
                setMyRequests(
                    all.filter((r: any) => ["open", "matched"].includes(String(r?.status || "").toLowerCase()))
                );
            }
        } catch {
            // Non-blocking
        } finally {
            setMyRequestsLoading(false);
        }
    };

    useEffect(() => {
        fetchMyRequests();
    }, []);

    const respondCounter = async (requestId: string, action: 'accept' | 'decline') => {
        setRespondingCounterId(requestId);
        try {
            await api.post(`/rides/requests/${requestId}/counter/respond`, {
                action,
                paymentMethod: "cash",
            });
            if (action === 'accept') {
                toast.success('Counter offer accepted and booking confirmed. Opening My Rides.');
                navigate("/dashboard?tab=rides");
            } else {
                toast.success('Counter offer declined.');
            }
            await fetchMyRequests();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to respond to counter offer.');
        } finally {
            setRespondingCounterId(null);
        }
    };

    const editRequest = (req: any) => {
        setEditModal({ open: true, request: req });
    };

    const deleteRequest = (requestId: string) => {
        setDeleteModal({ open: true, requestId });
    };

    const handleEditSubmit = async (updated: any) => {
        setEditLoading(true);
        try {
            // Controller requires: origin{lat,lng}, destination{lat,lng},
            // earliestDeparture, latestDeparture, groupSize/seatsNeeded.
            // The shaped response from /me stores coords in GeoJSON — we pass
            // them back as flat lat/lng which is what the controller reads.
            const originCoordArr: number[] | undefined = updated.origin?.coordinates;
            const destCoordArr: number[] | undefined = updated.destination?.coordinates;

            // GeoJSON is [lng, lat]; fall back to flat fields if already unwrapped
            const originLat = updated.originLat ?? (originCoordArr ? originCoordArr[1] : null);
            const originLng = updated.originLng ?? (originCoordArr ? originCoordArr[0] : null);
            const destLat   = updated.destLat   ?? (destCoordArr   ? destCoordArr[1]   : null);
            const destLng   = updated.destLng   ?? (destCoordArr   ? destCoordArr[0]   : null);

            if (!Number.isFinite(Number(originLat)) || !Number.isFinite(Number(originLng)) ||
                !Number.isFinite(Number(destLat))   || !Number.isFinite(Number(destLng))) {
                toast.error("Could not resolve coordinates. Please re-enter addresses.");
                return;
            }

            const payload = {
                origin:              { lat: Number(originLat), lng: Number(originLng) },
                destination:         { lat: Number(destLat),   lng: Number(destLng)   },
                originAddress:       updated.originAddress      || '',
                destinationAddress:  updated.destinationAddress || '',
                earliestDeparture:   updated.earliestDeparture,
                latestDeparture:     updated.latestDeparture,
                seatsNeeded:         Math.max(1, Number(updated.seatsNeeded || 1)),
                maxPricePerSeat:     updated.maxPricePerSeat != null && updated.maxPricePerSeat !== ''
                                         ? Number(updated.maxPricePerSeat)
                                         : null,
                currency:            updated.currency || 'PKR',
                notes:               updated.notes    || '',
            };

            await api.put(`/rides/requests/${updated._id}`, payload);
            toast.success("Request updated!");
            setEditModal({ open: false, request: null });
            fetchMyRequests();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to update request.");
        } finally {
            setEditLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteModal.requestId) return;
        setDeleteLoading(true);
        const targetId = deleteModal.requestId;
        try {
            await api.post(`/rides/requests/${targetId}/cancel`);
            toast.success("Ride request cancelled.");
        } catch (err: any) {
            // 409 = already cancelled on the server — still remove from UI silently
            if (err?.response?.status !== 409) {
                toast.error(err?.response?.data?.message || "Failed to cancel request.");
                setDeleteLoading(false);
                return;
            }
        } finally {
            setDeleteLoading(false);
        }
        // Remove from local list regardless (cancelled either just now or already was)
        setMyRequests(prev => prev.filter(r => r._id !== targetId));
        setDeleteModal({ open: false, requestId: null });
    };

    // ── Core search: uses /api/rides/search-dest ─────────────────────────────
    const executeSearch = useCallback(async (destOverride?: string, dateOverride?: string) => {
        const destVal = (destOverride ?? destination).trim();
        if (!destVal) {
            toast.error("Please enter a destination.");
            return;
        }

        setSearching(true);
        setHasSearched(true);
        setRides([]);
        setSelected(null);

        const params = new URLSearchParams({ destination: destVal });
        if (origin.trim()) params.append("origin", origin.trim());
        if (originCoords?.length === 2) {
            params.append("originLng", String(originCoords[0]));
            params.append("originLat", String(originCoords[1]));
        }
        if (destCoords?.length === 2) {
            params.append("destinationLng", String(destCoords[0]));
            params.append("destinationLat", String(destCoords[1]));
        }
        const usedDate = dateOverride !== undefined ? dateOverride : date;
        if (usedDate) params.append("date", usedDate);

        try {
            const res = await api.get(`/rides/search-dest?${params.toString()}`);

            // Log raw shape so we can verify the response structure
            console.log('[FindRide] /rides/offers raw:', JSON.stringify(res.data).slice(0, 500));

            const found = normalizeRides(res.data);

            setRides(found);
            if (found.length > 0) {
                setSelected(found[0]);
                toast.success(
                    `Found ${found.length} ride${found.length > 1 ? "s" : ""} to "${destVal}"!`,
                    { duration: 3000 }
                );
                setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
            } else {
                toast.info("No rides found. Try removing filters or checking spelling.", { duration: 4000 });
            }
        } catch (err: any) {
            const msg = err?.response?.data?.message || "Search failed. Please try again.";
            console.error("[FindRide] search error:", err);
            toast.error(msg);
        } finally {
            setSearching(false);
        }
    }, [destination, origin, date, originCoords, destCoords]);

    // ── Auto-search from homepage query param ────────────────────────────────
    useEffect(() => {
        if (initialQuery?.trim().length >= 2 && !autoSearched.current) {
            autoSearched.current = true;
            const timer = setTimeout(() => executeSearch(initialQuery.trim()), 400);
            return () => clearTimeout(timer);
        }
    }, [initialQuery]);

    // ── Book a ride directly by offerId ──────────────────────────────────────
    const [seatBookRide, setSeatBookRide] = useState<RideResult | null>(null);

    const executeBooking = async (seatsNeeded: number, paymentMethod: "cash" | "stripe") => {
        if (!seatBookRide) return;
        setBookingLoading(true);
        setBookingId(seatBookRide._id);
        let createdBookingId: string | null = null;

        try {
            const res = await api.post("/rides/book-direct", {
                offerId: seatBookRide._id,
                seatsNeeded,
                paymentMethod,
            });

            createdBookingId = res.data?.data?.booking?._id || res.data?.data?.bookingId;
            const totalFare = res.data?.data?.totalFare || seatBookRide.pricePerSeat * seatsNeeded;
            if (!createdBookingId) throw new Error("Booking ID missing from response.");

            setBookedIds(prev => ({ ...prev, [seatBookRide._id]: true }));
            setRides(prev => prev.map(r =>
                r._id === seatBookRide._id
                    ? { ...r, seatsAvailable: Math.max(0, r.seatsAvailable - seatsNeeded) }
                    : r
            ));
            if (paymentMethod === "stripe") {
                const paymentRes = await api.post("/payments/split", { bookingId: createdBookingId });
                const nextClientSecret = paymentRes.data?.data?.clientSecret;
                const nextPaymentId = paymentRes.data?.data?.paymentId;
                if (!nextClientSecret || !nextPaymentId) throw new Error("Payment setup failed.");

                setClientSecret(nextClientSecret);
                setPaymentId(nextPaymentId);
                setPaymentAmount(totalFare);
                toast.success("Seats reserved. Complete payment to confirm your ride.");
            } else {
                toast.success("Booking confirmed with cash/direct payment. Opening My Rides.");
                navigate("/dashboard?tab=rides");
            }
            setSeatBookRide(null);
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || "Booking failed. Please try again.";
            if (/already have a booking|already booked/i.test(message)) {
                setSeatBookRide(null);
                toast.info("This ride is already reserved for you. Opening My Rides.");
                navigate("/dashboard?tab=rides");
            } else if (createdBookingId) {
                setSeatBookRide(null);
                setBookedIds(prev => ({ ...prev, [seatBookRide._id]: true }));
                toast.warning("Seat reserved, but payment setup still needs attention. Opening My Rides.");
                navigate("/dashboard?tab=rides");
            } else {
                toast.error(message);
            }
        } finally {
            setBookingLoading(false);
            setBookingId(null);
        }
    };

    const bookBtnState = (ride: RideResult) => {
        if (bookedIds[ride._id]) return { label: "Requested ✓", disabled: true, cls: "bg-emerald-600 opacity-80" };
        if (ride.seatsAvailable <= 0) return { label: "Seats Full", disabled: true, cls: "bg-muted-foreground/60 text-white" };
        return { label: "Book Seats", disabled: false, cls: "bg-gradient-primary shadow-glow" };
    };

    const handleNearbyRides = () => {
        if (!navigator.geolocation) {
            toast.error("Geolocation is not supported on this device.");
            return;
        }

        setNearbyLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    setHasSearched(true);
                    setSelected(null);

                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const res = await api.get(`/rides/offers?lat=${lat}&lng=${lng}&maxDistance=12000`);
                    const found = normalizeRides(res.data);

                    setRides(found);
                    if (found.length > 0) {
                        setSelected(found[0]);
                        toast.success(`Found ${found.length} nearby ride${found.length > 1 ? "s" : ""}.`);
                        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
                    } else {
                        toast.info("No nearby rides found right now.");
                    }
                } catch (err: any) {
                    toast.error(err?.response?.data?.message || "Failed to load nearby rides.");
                } finally {
                    setNearbyLoading(false);
                }
            },
            () => {
                setNearbyLoading(false);
                toast.error("Location permission denied. Enable it to find nearby rides.");
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const handleCreateRequest = async () => {
        if (!origin.trim() || !destination.trim()) {
            toast.error("Enter both origin and destination.");
            return;
        }

        setRequestLoading(true);
        try {
            const { resolvedOrigin, resolvedDestination } = await resolveCoordsForRequest();
            if (!resolvedOrigin || !resolvedDestination) {
                toast.error("Could not resolve coordinates for the provided addresses.");
                return;
            }

            const now = new Date();
            const fallbackDate = now.toISOString().slice(0, 10);
            const requestDate = date || fallbackDate;
            const earliest = new Date(`${requestDate}T${earliestTime || "07:30"}:00`);
            const latest = new Date(`${requestDate}T${latestTime || "08:30"}:00`);
            if (Number.isNaN(earliest.getTime()) || Number.isNaN(latest.getTime()) || latest < earliest) {
                toast.error("Please enter a valid earliest/latest departure window.");
                return;
            }

            await api.post("/rides/requests", {
                origin: { lat: resolvedOrigin[1], lng: resolvedOrigin[0] },
                destination: { lat: resolvedDestination[1], lng: resolvedDestination[0] },
                originAddress: origin.trim(),
                destinationAddress: destination.trim(),
                earliestDeparture: earliest.toISOString(),
                latestDeparture: latest.toISOString(),
                seatsNeeded: Math.max(1, Number(requestSeatsInput || requestSeats || 1)) || 1,
                maxPricePerSeat: maxFarePerSeat.trim() && Number(maxFarePerSeat) > 0 ? Number(maxFarePerSeat) : null,
                currency: "PKR",
                isRecurring: requestRecurring,
                recurrencePattern: requestRecurring ? requestRecurrencePattern : undefined,
            });

            toast.success("Ride request created successfully.", {
                description: "Drivers can now match with your route.",
            });
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to create request.");
        } finally {
            setRequestLoading(false);
        }
    };

    const handlePaymentSuccess = () => {
        setClientSecret(null);
        toast.success("Payment successful! Ride booked. 🎉");
        navigate("/dashboard?tab=rides");
    };

    const requestSummary = {
        open: myRequests.filter((req: any) => req.status === "open" || !req.status).length,
        matched: myRequests.filter((req: any) => req.status === "matched").length,
        counters: myRequests.filter((req: any) => req.counterOffer?.status === "pending").length,
        recurring: myRequests.filter((req: any) => req.isRecurring).length,
    };

    // ─────────────────────── Render ──────────────────────────────────────────
    return (
        <div className="space-y-6 pb-24">
            <div className="bg-card rounded-3xl border border-border/50 p-5 md:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-display font-bold text-foreground">Find a Ride</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Search active offers, or create a rider request if no direct ride fits your route.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-semibold text-foreground">
                            {requestSummary.open} open requests
                        </span>
                        <span className="rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-semibold text-foreground">
                            {requestSummary.counters} counter offers
                        </span>
                        <span className="rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs font-semibold text-foreground">
                            {requestSummary.recurring} recurring
                        </span>
                    </div>
                </div>
                <div className="mt-4 rounded-2xl border border-border/40 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    Book direct rides here. Once a ride is confirmed, continue the trip in `My Rides`.
                </div>
            </div>
            {/* ── Seat Modal ──────────────────────────────────────────────── */}
            <AnimatePresence>
                {seatBookRide && (
                    <SeatBookModal
                        ride={seatBookRide}
                        onClose={() => setSeatBookRide(null)}
                        onConfirm={executeBooking}
                        loading={bookingLoading}
                    />
                )}
            </AnimatePresence>

            {/* ── Homepage search banner ──────────────────────────────────── */}
            <AnimatePresence>
                {initialQuery && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                        className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-primary/10 border border-primary/20"
                    >
                        <MapPin className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm text-foreground/70">Showing rides to: </span>
                            <span className="text-sm font-bold text-primary">{initialQuery}</span>
                        </div>
                        {searching
                            ? <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                            : rides.length > 0 && (
                                <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20 shrink-0">
                                    {rides.length} found
                                </span>
                            )
                        }
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Search form ─────────────────────────────────────────────── */}
            <div className="bg-card rounded-3xl p-6 md:p-8 border border-border/50 shadow-sm">
                <div className="flex items-center justify-between mb-6 gap-3">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-display font-bold">Find your ride</h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Search live and scheduled rides across the network
                        </p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Search className="w-5 h-5 text-primary" />
                    </div>
                </div>

                <form
                    id="find-ride-form"
                    onSubmit={e => { e.preventDefault(); executeSearch(); }}
                    className="grid md:grid-cols-2 lg:grid-cols-4 gap-3"
                >
                    {/* Origin */}
                    <AddressInput
                        id="find-ride-origin"
                        value={origin}
                        placeholder="From (optional)"
                        icon={<MapPin className="w-4 h-4 text-muted-foreground/50" />}
                        suggestions={originSugg}
                        loading={loadingOrigin}
                        onChange={v => { setOrigin(v); setOriginCoords(null); debouncedOrigin(v); }}
                        onSelect={async s => {
                            setOrigin(s.address);
                            const coords = s.coordinates || await resolveCoordsWithProviders(s.address, s.placeId);
                            setOriginCoords(coords);
                            setOriginSugg([]);
                        }}
                        onClear={() => { setOrigin(""); setOriginCoords(null); setOriginSugg([]); }}
                    />

                    {/* Destination */}
                    <AddressInput
                        id="find-ride-destination"
                        value={destination}
                        placeholder="Where to? *"
                        icon={<MapPin className="w-4 h-4 text-primary" />}
                        suggestions={destSugg}
                        loading={loadingDest}
                        onChange={v => { setDestination(v); setDestCoords(null); debouncedDest(v); }}
                        onSelect={async s => {
                            setDestination(s.address);
                            const coords = s.coordinates || await resolveCoordsWithProviders(s.address, s.placeId);
                            setDestCoords(coords);
                            setDestSugg([]);
                        }}
                        onClear={() => { setDestination(""); setDestCoords(null); setDestSugg([]); }}
                    />

                    {/* Date */}
                    <div>
                        <input
                            id="find-ride-date"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3.5 text-sm
                                       focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all
                                       text-foreground"
                        />
                    </div>

                    {/* Submit */}
                    <Button
                        id="find-ride-submit"
                        type="submit"
                        disabled={searching}
                        className="bg-gradient-primary text-white h-auto py-3.5 rounded-xl font-bold shadow-glow hover:opacity-90 transition-opacity"
                    >
                        {searching
                            ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</span>
                            : <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Search Rides</span>
                        }
                    </Button>
                </form>

                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                            Seats Needed
                        </label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={requestSeatsInput}
                            onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, "");
                                setRequestSeatsInput(raw);
                                const nextValue = Number(raw);
                                if (Number.isFinite(nextValue) && nextValue > 0) {
                                    setRequestSeats(nextValue);
                                }
                            }}
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                            Max Fare / Seat (optional)
                        </label>
                        <input
                            type="number"
                            step="1"
                            value={maxFarePerSeat}
                            onChange={(e) => setMaxFarePerSeat(e.target.value)}
                            placeholder="Leave blank for no limit"
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                </div>

                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                            Earliest Departure
                        </label>
                        <input
                            type="time"
                            value={earliestTime}
                            onChange={(e) => setEarliestTime(e.target.value)}
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                            Latest Departure
                        </label>
                        <input
                            type="time"
                            value={latestTime}
                            onChange={(e) => setLatestTime(e.target.value)}
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                </div>

                <div className="mt-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                        <div>
                            <div className="text-sm font-semibold">Recurring commute</div>
                            <div className="text-xs text-muted-foreground">Auto-create tomorrow's request when this one is active.</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={requestRecurring}
                            onChange={(e) => setRequestRecurring(e.target.checked)}
                            className="h-4 w-4 accent-primary"
                        />
                    </label>
                    {requestRecurring && (
                        <div className="mt-3">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1.5">
                                Repeat
                            </label>
                            <select
                                value={requestRecurrencePattern}
                                onChange={(e) => setRequestRecurrencePattern(e.target.value)}
                                className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                            >
                                <option value="weekdays">Monday-Friday</option>
                                <option value="daily">Every day</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleNearbyRides}
                        disabled={nearbyLoading || searching}
                        className="rounded-xl text-xs font-bold"
                        id="find-nearby-rides"
                    >
                        {nearbyLoading
                            ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding nearby…</span>
                            : <span className="flex items-center gap-1.5"><Navigation className="w-3.5 h-3.5" /> Nearby Rides</span>
                        }
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCreateRequest}
                        disabled={requestLoading}
                        className="rounded-xl text-xs font-bold"
                        id="create-ride-request"
                    >
                        {requestLoading
                            ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating request…</span>
                            : <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Create Request</span>
                        }
                    </Button>
                </div>
            </div>

            <div className="bg-card rounded-3xl p-5 border border-border/50">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-display font-bold">My Ride Requests</h3>
                    <div className="flex gap-2 flex-wrap justify-end">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/dashboard?tab=rides")}>My Rides</Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchMyRequests}>Refresh</Button>
                    </div>
                </div>

                {myRequestsLoading ? (
                    <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
                ) : myRequests.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-3">No pending or matched requests.</div>
                ) : (
                    <div className="space-y-3">
                        {myRequests.slice(0, 6).map((req) => (
                            <div key={req._id} className="rounded-xl border border-border/50 p-3 bg-muted/10 flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-semibold">{shortAddress(req.originAddress)} → {shortAddress(req.destinationAddress)}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Seats: {req.seatsNeeded} · Max fare/seat: {req.maxPricePerSeat ? `${req.currency || 'PKR'} ${req.maxPricePerSeat}` : 'No limit'}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${req.status === 'matched' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                                        {req.status === 'open' || !req.status ? 'Pending' : req.status === 'matched' ? 'Matched' : req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                                    </span>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="outline" className="h-8 text-xs border-primary text-primary hover:bg-primary/10" onClick={() => editRequest(req)} disabled={['matched'].includes(req.status)}>
                                        Edit
                                    </Button>
                                    <Button size="sm" className="h-8 text-xs bg-red-500 text-white hover:bg-red-500/90 border-red-500" onClick={() => deleteRequest(req._id)} disabled={['matched'].includes(req.status)}>
                                        Cancel
                                    </Button>
                                    {["matched"].includes(req.status) && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => navigate("/dashboard?tab=rides")}
                                        >
                                            Open My Rides
                                        </Button>
                                    )}
                                </div>
                                {req.counterOffer?.status === 'pending' && (
                                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                                        <div className="text-xs font-medium text-amber-500">
                                            Driver countered: {req.counterOffer.currency || 'PKR'} {req.counterOffer.pricePerSeat} / seat
                                        </div>
                                        <div className="mt-2 flex gap-2">
                                            <Button
                                                size="sm"
                                                className="h-8 text-xs bg-emerald-500 text-white hover:bg-emerald-500/90"
                                                disabled={respondingCounterId === req._id}
                                                onClick={() => respondCounter(req._id, 'accept')}
                                            >
                                                Accept Counter
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                disabled={respondingCounterId === req._id}
                                                onClick={() => respondCounter(req._id, 'decline')}
                                            >
                                                Decline
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs"
                                                onClick={() => navigate("/dashboard?tab=rides")}
                                            >
                                                My Rides
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Edit Request Modal ───────────────────────────────────────── */}
            <AnimatePresence>
                {editModal.open && editModal.request && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={e => e.target === e.currentTarget && setEditModal({ open: false, request: null })}
                    >
                        <motion.div
                            initial={{ scale: 0.93, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 24 }}
                            transition={{ type: "spring", stiffness: 320, damping: 28 }}
                            className="w-full max-w-md bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/40">
                                <div>
                                    <h3 className="font-display font-bold text-lg">Edit Ride Request</h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {shortAddress(editModal.request.originAddress)} → {shortAddress(editModal.request.destinationAddress)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEditModal({ open: false, request: null })}
                                    className="p-2 rounded-xl hover:bg-muted/50 transition-colors"
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            </div>

                            {/* Form */}
                            <form
                                onSubmit={e => { e.preventDefault(); handleEditSubmit(editModal.request); }}
                                className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar"
                            >
                                {/* Route */}
                                <div className="space-y-3">
                                    <div className="relative">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                                            From
                                        </label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={editModal.request.originAddress}
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, originAddress: e.target.value } }))}
                                                onBlur={async e => {
                                                    const coords = await resolveCoordsWithProviders(e.target.value);
                                                    if (coords) setEditModal(modal => ({ ...modal, request: { ...modal.request, originLng: coords[0], originLat: coords[1] } }));
                                                }}
                                                className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                                                placeholder="Pickup location"
                                            />
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                                            To
                                        </label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                                            <input
                                                type="text"
                                                value={editModal.request.destinationAddress}
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, destinationAddress: e.target.value } }))}
                                                onBlur={async e => {
                                                    const coords = await resolveCoordsWithProviders(e.target.value);
                                                    if (coords) setEditModal(modal => ({ ...modal, request: { ...modal.request, destLng: coords[0], destLat: coords[1] } }));
                                                }}
                                                className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                                                placeholder="Drop-off location"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Departure window */}
                                <div className="bg-muted/20 rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Departure Window</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-muted-foreground block mb-1.5">Earliest</label>
                                            <input
                                                type="datetime-local"
                                                value={editModal.request.earliestDeparture ? new Date(editModal.request.earliestDeparture).toISOString().slice(0, 16) : ''}
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, earliestDeparture: new Date(e.target.value).toISOString() } }))}
                                                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-muted-foreground block mb-1.5">Latest</label>
                                            <input
                                                type="datetime-local"
                                                value={editModal.request.latestDeparture ? new Date(editModal.request.latestDeparture).toISOString().slice(0, 16) : ''}
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, latestDeparture: new Date(e.target.value).toISOString() } }))}
                                                className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-xs focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Seats + Price */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                                            Seats Needed
                                        </label>
                                        <div className="relative">
                                            <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                                            <input
                                                type="number"
                                                value={editModal.request.seatsNeeded}
                                                min={1}
                                                inputMode="numeric"
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, seatsNeeded: Math.max(1, Number(e.target.value || 1)) } }))}
                                                className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                                            Max / Seat (PKR)
                                        </label>
                                        <div className="relative">
                                            <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                                            <input
                                                type="number"
                                                value={editModal.request.maxPricePerSeat ?? ''}
                                                min={1}
                                                onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, maxPricePerSeat: e.target.value === '' ? null : Number(e.target.value) } }))}
                                                className="w-full bg-muted/30 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                                                placeholder="No limit"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                                        Notes for driver (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={editModal.request.notes || ''}
                                        onChange={e => setEditModal(modal => ({ ...modal, request: { ...modal.request, notes: e.target.value } }))}
                                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground/50"
                                        placeholder="e.g. I have luggage, prefer AC…"
                                    />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-3 pt-1">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setEditModal({ open: false, request: null })}
                                        className="flex-1 rounded-2xl h-11 font-bold text-sm border-border"
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={editLoading}
                                        className="flex-[2] h-11 bg-gradient-primary text-white rounded-2xl font-bold text-sm shadow-glow hover:opacity-90 transition-opacity"
                                    >
                                        {editLoading
                                            ? <span className="flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Saving…</span>
                                            : <span className="flex items-center gap-2 justify-center"><CheckCircle2 className="w-4 h-4" /> Save Changes</span>
                                        }
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

                            {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
            <AnimatePresence>
                {deleteModal.open && deleteModal.requestId && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={e => e.target === e.currentTarget && setDeleteModal({ open: false, requestId: null })}
                    >
                        <motion.div
                            initial={{ scale: 0.93, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93, y: 20 }}
                            transition={{ type: "spring", stiffness: 340, damping: 28 }}
                            className="w-full max-w-xs bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
                        >
                            {/* Icon */}
                            <div className="flex flex-col items-center px-6 pt-8 pb-5 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                                    <AlertCircle className="w-8 h-8 text-red-400" />
                                </div>
                                <h3 className="font-display font-bold text-lg mb-1">Cancel Request?</h3>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    This will cancel your ride request. Drivers will no longer see it.
                                </p>
                            </div>

                            {/* Divider + Actions */}
                            <div className="border-t border-border/40 px-6 py-5 flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setDeleteModal({ open: false, requestId: null })}
                                    className="flex-1 rounded-2xl h-11 font-bold text-sm"
                                >
                                    Keep it
                                </Button>
                                <Button
                                    type="button"
                                    disabled={deleteLoading}
                                    onClick={handleDeleteConfirm}
                                    className="flex-1 h-11 bg-red-500 hover:bg-red-500/90 text-white rounded-2xl font-bold text-sm transition-opacity"
                                >
                                    {deleteLoading
                                        ? <span className="flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cancelling…</span>
                                        : "Yes, Cancel"
                                    }
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results + Map */}
            {(hasSearched || searching) && <div className="grid lg:grid-cols-2 gap-6" ref={resultsRef}>

                {/* ─── Results column ─── */}
                <div className="space-y-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between px-1">
                        <div>
                            <h3 className="text-base font-display font-bold">
                                {searching ? "Searching…" : hasSearched ? `${rides.length} Result${rides.length !== 1 ? "s" : ""}` : "Available Rides"}
                            </h3>
                            {hasSearched && !searching && destination && (
                                <p className="text-xs text-muted-foreground mt-0.5">for "{destination}"</p>
                            )}
                        </div>
                        {hasSearched && !searching && (
                            <button
                                onClick={() => executeSearch()}
                                id="find-ride-refresh"
                                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 transition-colors font-medium"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Refresh
                            </button>
                        )}
                    </div>

                    {/* Skeletons while searching */}
                    {searching && (
                        <div className="space-y-3">
                            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
                        </div>
                    )}

                    {/* Empty state */}
                    {!searching && hasSearched && rides.length === 0 && (
                        <EmptyState
                            destination={destination}
                            date={date}
                            onClearDate={() => { setDate(""); executeSearch(undefined, ""); }}
                            onClearAll={() => {
                                setOrigin(""); setDestination(""); setDate("");
                                setHasSearched(false); setRides([]);
                            }}
                        />
                    )}

                    {/* Pre-search prompt */}
                    {!searching && !hasSearched && (
                        <div className="text-center py-16 bg-card rounded-3xl border-2 border-dashed border-border/40">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-10" />
                            <p className="text-sm text-muted-foreground">Enter a destination to search for rides</p>
                        </div>
                    )}

                    {/* Ride cards */}
                    {!searching && rides.length > 0 && (
                        <div className="space-y-3 max-h-[660px] overflow-y-auto pr-1 custom-scrollbar">
                            {rides.map((ride, i) => {
                                const btn = bookBtnState(ride);
                                const isSelected = selected?._id === ride._id;
                                const isBookingThis = bookingLoading && bookingId === ride._id;

                                const matchScore = (() => {
                                    let score = 100;
                                    if (ride.seatsAvailable < requestSeats) score -= 30;
                                    const rideTime = new Date(ride.departureTime).getTime();
                                    const reqTime = date ? new Date(`${date}T08:00:00`).getTime() : Date.now();
                                    const timeDiff = Math.abs(rideTime - reqTime) / (60 * 60 * 1000);
                                    if (timeDiff > 2) score -= 20;
                                    return Math.max(0, Math.min(100, score));
                                })();

                                return (
                                    <motion.div
                                        key={ride._id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.06 }}
                                        onClick={() => setSelected(ride)}
                                        id={`ride-card-${i}`}
                                        className={`p-4 rounded-3xl border cursor-pointer transition-all ${isSelected
                                            ? "bg-primary/5 border-primary shadow-md shadow-primary/10"
                                            : "bg-card border-border/40 hover:border-primary/30"}
                                        `}
                                    >
                                        <div className="flex gap-3.5">
                                            {/* Avatar */}
                                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                                                {ride.driver?.avatar
                                                    ? <img src={ride.driver.avatar} className="w-full h-full object-cover" alt={fmt.driverName(ride)} />
                                                    : <span className="text-base font-bold text-primary">{fmt.driverName(ride)[0]}</span>
                                                }
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                {/* Route */}
                                                <div className="flex items-center gap-1 mb-1 flex-wrap">
                                                    <span className="text-sm font-bold truncate max-w-[120px]">
                                                        {shortAddress(ride.origin)}
                                                    </span>
                                                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                                                    <span className="text-sm font-bold text-primary truncate max-w-[140px]">
                                                        {shortAddress(ride.destination)}
                                                    </span>
                                                </div>

                                                {/* Match score indicator */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Star className="w-4 h-4 text-amber-400" />
                                                    <span className="text-xs font-bold text-amber-400">Match Score: {matchScore}%</span>
                                                </div>

                                                {/* Meta */}
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mb-2">
                                                    <span className="font-semibold">{fmt.driverName(ride)}</span>
                                                    <span className="flex items-center gap-0.5">
                                                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                                                        {fmt.rating(ride)}
                                                    </span>
                                                    <span className="flex items-center gap-0.5">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {fmt.time(ride.departureTime)} · {fmt.dateShort(ride.departureTime)}
                                                    </span>
                                                    <span className="flex items-center gap-0.5">
                                                        <Car className="w-2.5 h-2.5" />
                                                        {fmt.vehicleMake(ride)}
                                                    </span>
                                                    {ride.isFull || ride.seatsAvailable === 0 ? (
                                                        <span className="flex items-center gap-0.5 font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full border border-red-400/20">
                                                            Seats Full
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-0.5 font-semibold text-emerald-400">
                                                            <Users className="w-2.5 h-2.5" />
                                                            {ride.seatsAvailable} seat{ride.seatsAvailable !== 1 ? "s" : ""}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Chips + price */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex gap-2 items-center flex-wrap">
                                                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/15 uppercase">
                                                            {ride.status}
                                                        </span>
                                                        {ride.estimatedDistanceKm && (
                                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                                <Navigation className="w-2.5 h-2.5" />
                                                                {fmt.distanceKm(ride.estimatedDistanceKm)}
                                                            </span>
                                                        )}
                                                        {bookedIds[ride._id] && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                                                <CheckCircle2 className="w-3 h-3" /> Requested
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-black text-emerald-400 shrink-0">
                                                        {fmt.currency(ride.pricePerSeat)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Inline book button (shows on selected) */}
                                        <AnimatePresence>
                                            {isSelected && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-3 pt-3 border-t border-border/30 flex gap-2"
                                                >
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="flex-1 rounded-2xl h-9 text-xs font-bold border-border hover:bg-muted/40"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            const driverId = ride.driver?._id || ride.driver?.id;
                                                            if (driverId) {
                                                                onViewProfile ? onViewProfile(driverId) : navigate(`/dashboard`);
                                                            }
                                                        }}
                                                        id={`view-profile-${i}`}
                                                    >
                                                        Driver Profile
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={btn.disabled || bookingLoading}
                                                        onClick={e => { e.stopPropagation(); setSeatBookRide(ride); }}
                                                        className={`flex-[2] text-white rounded-2xl h-9 text-xs font-bold ${btn.cls}`}
                                                        id={`book-btn-${i}`}
                                                    >
                                                        {isBookingThis
                                                            ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Booking…</span>
                                                            : btn.label
                                                        }
                                                    </Button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ─── Map / Detail column ─── */}
                <div className="lg:sticky lg:top-20">
                    <AnimatePresence mode="wait">
                        {selected ? (
                            <motion.div
                                key={selected._id}
                                initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }}
                                className="bg-card rounded-3xl border border-border/50 overflow-hidden"
                            >
                                {/* Map */}
                                <div className="h-72 relative overflow-hidden">
                                    <LeafletMap
                                        origin={selected.originCoords
                                            ? { lat: selected.originCoords[1], lng: selected.originCoords[0] }
                                            : undefined}
                                        destination={selected.destinationCoords
                                            ? { lat: selected.destinationCoords[1], lng: selected.destinationCoords[0] }
                                            : undefined}
                                        routeCoords={
                                            selected.originCoords && selected.destinationCoords
                                                ? [[selected.originCoords[1], selected.originCoords[0]],
                                                [selected.destinationCoords[1], selected.destinationCoords[0]]]
                                                : undefined
                                        }
                                    />
                                    <div className="absolute top-3 left-3 right-3 flex justify-between pointer-events-none">
                                        <span className="bg-background/80 backdrop-blur text-[11px] px-3 py-1.5 rounded-xl border border-border font-bold shadow">Route Map</span>
                                        <span className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shadow text-white uppercase ${selected.status === "active" ? "bg-red-500" : "bg-emerald-600"}`}>
                                            {selected.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Detail panel */}
                                <div className="p-5">
                                    {/* Route + price */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-display font-bold text-lg leading-tight">
                                                {shortAddress(selected.origin)} → {shortAddress(selected.destination)}
                                            </h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {new Date(selected.departureTime).toLocaleString([], {
                                                    weekday: "short", month: "short", day: "numeric",
                                                    hour: "2-digit", minute: "2-digit"
                                                })}
                                            </p>
                                        </div>
                                        <div className="text-right ml-3 shrink-0">
                                            <div className="text-2xl font-black text-primary">{fmt.currency(selected.pricePerSeat)}</div>
                                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">per seat</div>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                        {[
                                            { label: "Distance", value: fmt.distanceKm(selected.estimatedDistanceKm), icon: <Navigation className="w-3.5 h-3.5" /> },
                                            { label: "Duration", value: fmt.durationMin(selected.estimatedDurationMin), icon: <Clock className="w-3.5 h-3.5" /> },
                                            { label: "Seats", value: String(selected.seatsAvailable), icon: <Users className="w-3.5 h-3.5" /> },
                                        ].map(s => (
                                            <div key={s.label} className="bg-muted/20 rounded-2xl p-3 text-center">
                                                <div className="flex justify-center mb-1 text-muted-foreground/60">{s.icon}</div>
                                                <div className="text-sm font-bold">{s.value}</div>
                                                <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground/60 mt-0.5">{s.label}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Driver */}
                                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-muted/20 border border-border/30 mb-4">
                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
                                            {selected.driver?.avatar
                                                ? <img src={selected.driver.avatar} className="w-full h-full object-cover" alt={fmt.driverName(selected)} />
                                                : <span className="font-bold text-primary">{fmt.driverName(selected)[0]}</span>
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{fmt.driverName(selected)}</div>
                                            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                                                <span className="flex items-center gap-0.5">
                                                    <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                                                    {fmt.rating(selected)}
                                                </span>
                                                <span>{fmt.vehicleMake(selected)}</span>
                                            </div>
                                        </div>
                                        <span className="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold shrink-0">
                                            {selected.seatsAvailable} seats left
                                        </span>
                                    </div>

                                    {/* CTA buttons */}
                                    <div className="flex gap-3">
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                const driverId = selected.driver?._id || selected.driver?.id;
                                                if (driverId) {
                                                    onViewProfile ? onViewProfile(driverId) : navigate("/dashboard");
                                                }
                                            }}
                                            className="flex-1 rounded-2xl h-11 font-bold text-sm"
                                            id="detail-view-profile"
                                        >
                                            View Profile
                                        </Button>
                                        <Button
                                            disabled={bookBtnState(selected).disabled || bookingLoading}
                                            onClick={() => setSeatBookRide(selected)}
                                            className={`flex-[2] text-white rounded-2xl h-11 font-bold text-sm ${bookBtnState(selected).cls}`}
                                            id="detail-book-btn"
                                        >
                                            {bookingLoading && bookingId === selected._id
                                                ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Booking…</span>
                                                : <>
                                                    <Wallet className="w-4 h-4 mr-1.5" />
                                                    {bookBtnState(selected).label}
                                                </>
                                            }
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="h-64 bg-muted/10 rounded-3xl border-2 border-dashed border-border/30
                                           flex flex-col items-center justify-center text-muted-foreground/40 gap-3"
                            >
                                <Navigation className="w-14 h-14" />
                                <p className="text-sm">Select a ride to view its route</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>}

            {/* ── Stripe payment modal ─────────────────────────────────────── */}
            {clientSecret && (
                <StripeCheckoutModal
                    clientSecret={clientSecret}
                    paymentId={paymentId}
                    amount={paymentAmount}
                    onPaymentSuccess={handlePaymentSuccess}
                    onClose={() => {
                        setClientSecret(null);
                        setPaymentId(null);
                    }}
                />
            )}
        </div>
    );
};

export default FindRide;


