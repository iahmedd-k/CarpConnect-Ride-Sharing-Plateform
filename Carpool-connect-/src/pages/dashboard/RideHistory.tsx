import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Car, MapPin, Clock, Loader2, CheckCircle2, XCircle,
    Navigation, ChevronDown, ChevronUp, Search, RefreshCw,
    AlertCircle, Eye, X, Users, Wallet, Trash2, Lock
} from "lucide-react";
import api from "../../lib/api";
import { toast } from "sonner";
import { normalizeOfferStatus } from "@/lib/rideStatus";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    open:       { label: "Open",       cls: "bg-blue-500/10 text-blue-400 border-blue-500/20",        icon: Clock },
    active:     { label: "Active",     cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: Navigation },
    completed:  { label: "Completed",  cls: "bg-muted/30 text-muted-foreground border-border",         icon: CheckCircle2 },
    cancelled:  { label: "Cancelled",  cls: "bg-red-500/10 text-red-400 border-red-500/20",            icon: XCircle },
};

const fmt = {
    date: (d: any) => d ? new Date(d).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "—",
    time: (d: any) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    currency: (n: any) => {
        const v = Number(n);
        if (!v || isNaN(v)) return "—";
        return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(v);
    },
    addr: (s?: string) => s?.split(",")[0] || "—",
    km: (n: any) => n ? `${Number(n).toFixed(1)} km` : "—",
    passengers: (bookings: any[] = []) => {
        const confirmed = bookings.filter(b => ["confirmed", "picked_up", "completed"].includes(b.status));
        return confirmed.reduce((sum, b) => sum + (b.seatsRequested || 1), 0);
    },
    earnings: (bookings: any[] = []) => {
        const completed = bookings.filter(b => b.status === "completed");
        const total = completed.reduce((sum, b) => sum + (b.fare?.totalAmount || 0), 0);
        return total;
    },
};

const getStoredDriverId = () => {
    try {
        const storedUser = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
        return String(storedUser?._id || storedUser?.id || "");
    } catch {
        return "";
    }
};

const getOfferDriverId = (offer: any) => String(
    offer?.driverId?._id ||
    offer?.driverId ||
    offer?.driver?._id ||
    offer?.driver ||
    ""
);

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS[normalizeOfferStatus(status)] || STATUS.cancelled;
    const Icon = cfg.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
            <Icon className="w-2.5 h-2.5" />
            {cfg.label}
        </span>
    );
}

// ── Detail modal ────────────────────────────────────────────────────────────
function OfferDetail({ offer, bookings, onClose }: { offer: any; bookings: any[]; onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
                className="w-full max-w-lg bg-card rounded-3xl border border-border/50 shadow-2xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <h3 className="font-display font-bold">Ride Offer Details</h3>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {/* Route */}
                    <div className="flex items-start gap-3 bg-muted/20 rounded-2xl p-4">
                        <Navigation className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div>
                            <div className="text-sm font-bold">{offer.origin?.address}</div>
                            <div className="text-xs text-muted-foreground my-1">→</div>
                            <div className="text-sm font-bold text-primary">{offer.destination?.address}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: "Departure", value: `${fmt.date(offer.departureTime)} ${fmt.time(offer.departureTime)}` },
                            { label: "Distance", value: fmt.km(offer.estimatedDistanceKm) },
                            { label: "Price/Seat", value: fmt.currency(offer.pricePerSeat) },
                            { label: "Total Seats", value: offer.seatsTotal || "—" },
                            { label: "Seats Left", value: offer.seatsAvailable ?? "—" },
                            { label: "Status", value: <StatusBadge status={offer.status} /> },
                        ].map((f, i) => (
                            <div key={i} className="bg-muted/10 rounded-2xl p-3">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">{f.label}</div>
                                <div className="text-sm font-semibold">{f.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Bookings list */}
                    {bookings.length > 0 && (
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                Passengers ({bookings.length})
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {bookings.map(b => (
                                    <div key={b._id} className="flex items-center justify-between text-xs bg-muted/10 rounded-xl px-4 py-2.5">
                                        <span className="font-semibold">{b.rider?.name || "Rider"}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground">{b.seatsRequested} seat{b.seatsRequested !== 1 ? "s" : ""}</span>
                                            <StatusBadge status={b.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const RideHistory = () => {
    const [offers, setOffers] = useState<any[]>([]);
    const [bookingsMap, setBookingsMap] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");
    const [search, setSearch] = useState("");
    const [sortAsc, setSortAsc] = useState(false);
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<any>(null);
    const currentPlan = currentPlanFromStorage();
    const canUseHistory = hasPlanAtLeast(currentPlan, "plus");

    const PAGE_SIZE = 8;

    useEffect(() => { fetchData(); }, []);

    const hideRide = async (offerId: string, bookings: any[] = []) => {
        try {
            const bookingIds = bookings
                .map((booking: any) => booking?._id)
                .filter(Boolean);

            const results = await Promise.allSettled([
                api.patch(`/history/rides/${offerId}/hide`),
                ...bookingIds.map((bookingId: string) => api.patch(`/history/bookings/${bookingId}/hide`)),
            ]);

            const succeeded = results.some((result: any) => result.status === "fulfilled");
            if (!succeeded) {
                throw new Error("Failed to remove ride from history.");
            }

            setOffers(prev => prev.filter(o => o._id !== offerId));
            setBookingsMap(prev => {
                const next = { ...prev };
                delete next[offerId];
                return next;
            });
            toast.success("Ride removed from history view.");
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to remove ride from history.");
        }
    };

    const clearHistory = async () => {
        try {
            await Promise.all([
                api.patch("/history/rides/clear"),
                api.patch("/history/bookings/clear?role=driver"),
            ]);
            setOffers(prev => prev.filter(o => !["completed", "cancelled"].includes(o.status)));
            setBookingsMap(prev => {
                const next: Record<string, any[]> = {};
                Object.entries(prev).forEach(([offerId, bookings]) => {
                    const visible = bookings.filter((booking: any) => !["completed", "cancelled"].includes(booking.status));
                    if (visible.length > 0) {
                        next[offerId] = visible;
                    }
                });
                return next;
            });
            toast.success("Driver history cleared from view.");
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Failed to clear ride history.");
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const driverId = getStoredDriverId();
            const [offerRes, bookingRes] = await Promise.all([
                api.get("/rides/offers/me"),
                api.get("/bookings?role=driver"),
            ]);

            const driverOffers: any[] = (offerRes.data?.data?.offers || []).filter((offer: any) => {
                if (offer.hiddenForDriver) return false;
                const ownerId = getOfferDriverId(offer);
                return !driverId || !ownerId || ownerId === driverId;
            });
            const allBookings: any[] = (bookingRes.data?.data?.bookings || []).filter((booking: any) => !booking.hiddenForDriver);

            const validOfferIds = new Set(
                driverOffers
                    .map((offer: any) => offer?._id)
                    .filter(Boolean)
            );

            const bMap: Record<string, any[]> = {};
            allBookings.forEach((booking: any) => {
                const offerId = booking?.offer?._id || booking?.offerId || booking?.offer;
                if (!offerId || !validOfferIds.has(offerId)) return;

                if (!bMap[offerId]) {
                    bMap[offerId] = [];
                }
                bMap[offerId].push(booking);
            });

            const normalizedOffers = driverOffers.map((offer: any) => ({
                ...offer,
                status: normalizeOfferStatus(offer.status),
            }));
            setOffers(normalizedOffers);
            setBookingsMap(bMap);
        } catch (err: any) {
            setOffers([]);
            setBookingsMap({});
            toast.error(err?.response?.data?.message || "Failed to load your driver history.");
        } finally {
            setLoading(false);
        }
    };

    const filtered = offers
        .filter(o => filter === "all" || o.status === filter)
        .filter(o => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return (
                o.origin?.address?.toLowerCase().includes(q) ||
                o.destination?.address?.toLowerCase().includes(q)
            );
        })
        .sort((a, b) => {
            const da = new Date(a.departureTime).getTime();
            const db = new Date(b.departureTime).getTime();
            return sortAsc ? da - db : db - da;
        });

    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    // Summary stats
    const totalEarned = Object.values(bookingsMap).flat().filter(b => b.status === "completed")
        .reduce((sum, b) => sum + (b.fare?.totalAmount || 0), 0);
    const totalRides = offers.filter(o => o.status === "completed").length;
    const totalPassengers = Object.values(bookingsMap).flat().filter(b =>
        ["confirmed", "completed", "picked_up"].includes(b.status)
    ).reduce((sum, b) => sum + (b.seatsRequested || 1), 0);

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

    if (!canUseHistory) {
        return (
            <div className="space-y-6 pb-10">
                <div className="bg-card rounded-3xl border border-amber-300/60 p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                                <Lock className="w-5 h-5 text-amber-500" />
                                Ride History (Locked)
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Booking history and detailed ride tracking are available on Plus and Pro.
                            </p>
                        </div>
                        <button
                            onClick={() => { window.location.href = "/driver-dashboard?tab=subscription"; }}
                            className="rounded-xl bg-primary text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90"
                        >
                            Upgrade Plan
                        </button>
                    </div>
                    <div className="mt-5 grid md:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                            <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Includes on Plus</p>
                            <p className="text-foreground">Ride-by-ride history, search, filters, and status timelines.</p>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                            <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Includes on Pro</p>
                            <p className="text-foreground">History plus priority placement and deeper analytics views.</p>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                            <p className="font-bold uppercase tracking-wider text-muted-foreground mb-1">Current plan</p>
                            <p className="text-foreground">{String(currentPlan).toUpperCase()}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-display font-bold">Ride History</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Your full journey record as a driver</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={clearHistory} className="flex items-center gap-2 text-sm text-red-400 hover:opacity-80 font-semibold transition-colors">
                        <Trash2 className="w-4 h-4" /> Clear History
                    </button>
                    <button onClick={fetchData} className="flex items-center gap-2 text-sm text-primary hover:opacity-80 font-semibold transition-colors" id="history-refresh">
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                </div>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Rides", value: String(offers.length), icon: Car, sub: `${totalRides} completed` },
                    { label: "Passengers", value: String(totalPassengers), icon: Users, sub: "confirmed seats" },
                    { label: "Total Earnings", value: fmt.currency(totalEarned), icon: Wallet, sub: "from completed rides", cls: "text-emerald-400" },
                ].map((s, i) => (
                    <div key={i} className="bg-card rounded-2xl border border-border/50 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">{s.label}</span>
                            <s.icon className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                        <div className={`text-xl font-display font-black ${s.cls || "text-foreground"}`}>{s.value}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </div>

            {/* Search + filter */}
            <div className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search by origin or destination…"
                        className="w-full bg-muted/20 border border-border rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                        id="history-search"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {["all", "open", "active", "completed", "cancelled"].map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(1); }}
                            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${filter === f
                                ? "bg-primary/10 border-primary text-primary"
                                : "bg-card border-border text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {f === "all" ? "All" : f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            {paged.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="text-center py-20 bg-card rounded-3xl border-2 border-dashed border-border/40"
                >
                    <AlertCircle className="w-14 h-14 mx-auto mb-4 opacity-15" />
                    <h3 className="font-bold text-lg mb-1">No past trips</h3>
                    <p className="text-sm text-muted-foreground">
                        {search || filter !== "all" ? "No rides match your filters." : "Completed rides will appear here."}
                    </p>
                </motion.div>
            ) : (
                <div className="bg-card rounded-3xl border border-border/50 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border/50 bg-muted/20">
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Offer ID</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Route</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                        <button onClick={() => setSortAsc(p => !p)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                            Date {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                    </th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Distance</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Passengers</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Earnings</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Status</th>
                                    <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((offer, i) => {
                                    const bkgs = bookingsMap[offer._id] || [];
                                    const pax = fmt.passengers(bkgs);
                                    const earned = fmt.earnings(bkgs);
                                    return (
                                        <motion.tr
                                            key={offer._id || i}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                                        >
                                            {/* ID */}
                                            <td className="px-5 py-4">
                                                <span className="font-mono text-xs text-muted-foreground font-bold">
                                                    #{offer._id?.slice(-8).toUpperCase() || "—"}
                                                </span>
                                            </td>

                                            {/* Route */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <MapPin className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                                                    <span className="truncate max-w-[90px] font-medium" title={offer.origin?.address}>
                                                        {fmt.addr(offer.origin?.address)}
                                                    </span>
                                                    <span className="text-muted-foreground">→</span>
                                                    <span className="truncate max-w-[90px] font-medium text-primary" title={offer.destination?.address}>
                                                        {fmt.addr(offer.destination?.address)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Date */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <div className="text-xs font-semibold">{fmt.date(offer.departureTime)}</div>
                                                <div className="text-[10px] text-muted-foreground">{fmt.time(offer.departureTime)}</div>
                                            </td>

                                            {/* Distance */}
                                            <td className="px-5 py-4 text-xs font-semibold text-muted-foreground">
                                                {fmt.km(offer.estimatedDistanceKm)}
                                            </td>

                                            {/* Passengers */}
                                            <td className="px-5 py-4">
                                                <span className="text-xs font-bold">{pax > 0 ? pax : "—"}</span>
                                                {bkgs.length > 0 && (
                                                    <span className="text-[10px] text-muted-foreground ml-1">/{bkgs.length} bkgs</span>
                                                )}
                                            </td>

                                            {/* Earnings */}
                                            <td className="px-5 py-4">
                                                <span className={`text-xs font-black ${earned > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                                    {earned > 0 ? fmt.currency(earned) : "—"}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-4">
                                                <StatusBadge status={offer.status || "open"} />
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setDetail({ offer, bookings: bkgs })}
                                                        id={`detail-btn-${i}`}
                                                        className="p-2 rounded-xl bg-muted/30 hover:bg-primary/10 hover:text-primary transition-all"
                                                        title="View Details"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => hideRide(offer._id, bkgs)}
                                                        className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
                                                        title="Remove from history"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
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
                                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${p === page ? "bg-primary text-white" : "border border-border hover:bg-muted/30"}`}>
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

            {/* Detail modal */}
            <AnimatePresence>
                {detail && <OfferDetail offer={detail.offer} bookings={detail.bookings} onClose={() => setDetail(null)} />}
            </AnimatePresence>
        </div>
    );
};

export default RideHistory;
