import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Wallet,
  XCircle,
  CheckCircle2,
  Clock,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { toast } from "sonner";
import { normalizeBookingStatus } from "@/lib/rideStatus";

const PAGE_SIZE = 8;

const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
  confirmed: { label: "Confirmed", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: CheckCircle2 },
  rejected: { label: "Declined", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
  cancelled: { label: "Cancelled", cls: "bg-muted/30 text-muted-foreground border-border", icon: XCircle },
  picked_up: { label: "En Route", cls: "bg-primary/10 text-primary border-primary/20", icon: Navigation },
  live: { label: "Live", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Navigation },
  completed: { label: "Completed", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
};

const fmt = {
  date: (d: any) => d ? new Date(d).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "-",
  time: (d: any) => d ? new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-",
  currency: (n: any) => {
    const v = Number(n);
    if (!v || Number.isNaN(v)) return "-";
    return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0 }).format(v);
  },
  addr: (s?: string) => s?.split(",")[0] || "-",
  car: (offer: any) => {
    const v = offer?.vehicle || offer?.driver?.vehicle;
    if (!v) return "Not provided";
    if (typeof v === "string") return v;
    return [v.make, v.model, v.year].filter(Boolean).join(" ") || "Not provided";
  },
};

const isCoordinateLikeText = (value?: string) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?$/.test(text);
};

const readableRouteAddress = (primary?: string, fallback?: string) => {
  const first = String(primary || "").trim();
  if (first && !isCoordinateLikeText(first)) return first;
  const second = String(fallback || "").trim();
  if (second && !isCoordinateLikeText(second)) return second;
  return "";
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS[status] || STATUS.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

const RiderHistory = () => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [detailBooking, setDetailBooking] = useState<any>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const bookingRes = await api.get("/bookings?role=rider");
      const nextBookings = (bookingRes.data?.data?.bookings || bookingRes.data?.bookings || [])
        .map((booking: any) => ({
          ...booking,
          status: normalizeBookingStatus(booking?.status),
        }))
        .filter((booking: any) => !booking.hiddenForRider)
        .filter((booking: any) => ["completed", "cancelled", "rejected"].includes(booking.status));

      setBookings(nextBookings);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load rider history.");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const clearHistory = async () => {
    try {
      await api.patch("/history/bookings/clear");
      setBookings([]);
      toast.success("Rider history cleared from view.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to clear booking history.");
    }
  };

  const hideHistoryItem = async (id: string) => {
    try {
      await api.patch(`/history/bookings/${id}/hide`);
      setBookings((prev) => prev.filter((booking) => booking._id !== id));
      toast.success("Booking removed from history view.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to remove booking from history.");
    }
  };

  const filtered = bookings
    .filter((booking) => filter === "all" || booking.status === filter)
    .filter((booking) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        readableRouteAddress(booking.offer?.origin?.address, booking.request?.originAddress).toLowerCase().includes(q) ||
        readableRouteAddress(booking.offer?.destination?.address, booking.request?.destinationAddress).toLowerCase().includes(q) ||
        booking.driver?.name?.toLowerCase().includes(q) ||
        booking._id?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const da = new Date(a.offer?.departureTime || a.createdAt).getTime();
      const db = new Date(b.offer?.departureTime || b.createdAt).getTime();
      return sortAsc ? da - db : db - da;
    });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const totalCompleted = bookings.filter((b) => b.status === "completed").length;
  const totalCancelled = bookings.filter((b) => ["cancelled", "rejected"].includes(b.status)).length;
  const totalSpent = bookings
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + Number(b.fare?.totalAmount || 0), 0);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Ride History</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{bookings.length} past booking{bookings.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={clearHistory} className="h-10 rounded-xl gap-2 text-red-400 border-red-500/20 hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Clear History
          </Button>
          <Button variant="outline" size="sm" onClick={fetchHistory} className="h-10 rounded-xl gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Completed</p>
          <p className="text-2xl font-semibold text-foreground">{totalCompleted}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cancelled</p>
          <p className="text-2xl font-semibold text-foreground">{totalCancelled}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Spent</p>
          <p className="text-2xl font-semibold text-emerald-400">{fmt.currency(totalSpent)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by route, driver or booking ID..."
            className="w-full rounded-xl border border-border bg-muted/20 py-3 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", "completed", "cancelled", "rejected"].map((item) => (
            <button
              key={item}
              onClick={() => { setFilter(item); setPage(1); }}
              className={`whitespace-nowrap rounded-xl border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${filter === item ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {paged.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border-2 border-dashed border-border/40 bg-card py-20 text-center">
          <AlertCircle className="mx-auto mb-4 h-14 w-14 opacity-15" />
          <h3 className="mb-1 text-lg font-bold">No rider history found</h3>
          <p className="text-sm text-muted-foreground">{search || filter !== "all" ? "No bookings match your filters." : "Completed and cancelled rides will appear here."}</p>
        </motion.div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  {["Booking ID", "Driver", "Route", "Date", "Vehicle", "Seats", "Fare", "Status", "Actions"].map((header) => (
                    <th key={header} className="whitespace-nowrap px-5 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {header === "Date" ? (
                        <button onClick={() => setSortAsc((prev) => !prev)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                          Date {sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      ) : header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((booking, index) => (
                  (() => {
                    const originLabel = readableRouteAddress(booking.offer?.origin?.address, booking.request?.originAddress);
                    const destinationLabel = readableRouteAddress(booking.offer?.destination?.address, booking.request?.destinationAddress);
                    return (
                  <motion.tr
                    key={booking._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-bold text-muted-foreground">#{booking._id?.slice(-8).toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-primary/10 shrink-0">
                          {booking.driver?.avatar
                            ? <img src={booking.driver.avatar} alt="avatar" className="h-full w-full object-cover" />
                            : <span className="text-xs font-bold text-primary">{booking.driver?.name?.[0] || "?"}</span>}
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{booking.driver?.name || "-"}</p>
                          <div className="flex items-center gap-0.5 text-[10px] text-amber-400">
                            <Star className="h-2.5 w-2.5 fill-amber-400" />
                            {booking.driver?.ratings?.average?.toFixed(1) || "N/A"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        <span className="max-w-[90px] truncate font-medium" title={originLabel}>{fmt.addr(originLabel)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="max-w-[90px] truncate font-medium text-primary" title={destinationLabel}>{fmt.addr(destinationLabel)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="text-xs font-semibold">{fmt.date(booking.offer?.departureTime || booking.createdAt)}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt.time(booking.offer?.departureTime || booking.createdAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-semibold">{fmt.car(booking.offer)}</p>
                    </td>
                    <td className="px-5 py-4 text-center text-xs font-semibold">{booking.seatsRequested || 1}</td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-black text-emerald-400">{fmt.currency(booking.fare?.totalAmount)}</td>
                    <td className="px-5 py-4"><StatusBadge status={booking.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => setDetailBooking(booking)} className="rounded-xl bg-muted/30 p-2 transition-all hover:bg-primary/10 hover:text-primary" title="View Details">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => hideHistoryItem(booking._id)} className="rounded-xl bg-red-500/10 p-2 text-red-400 transition-all hover:bg-red-500/20" title="Remove from history">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/30 bg-muted/10 px-6 py-4">
              <span className="text-xs text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage((prev) => prev - 1)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold transition-all hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-30">Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((item) => (
                  <button key={item} onClick={() => setPage(item)} className={`h-8 w-8 rounded-xl text-xs font-bold transition-all ${item === page ? "bg-primary text-white" : "border border-border hover:bg-muted/30"}`}>{item}</button>
                ))}
                <button disabled={page === totalPages} onClick={() => setPage((prev) => prev + 1)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold transition-all hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-30">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {detailBooking && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setDetailBooking(null)}>
          <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-md overflow-hidden rounded-3xl border border-border/50 bg-card shadow-2xl">
            <div className="border-b border-border px-6 py-4">
              <h3 className="font-bold">Booking Details</h3>
            </div>
            <div className="space-y-3 p-6 text-sm">
              <div className="rounded-2xl border border-border/40 bg-muted/10 p-4">
                <div className="font-semibold">{readableRouteAddress(detailBooking.offer?.origin?.address, detailBooking.request?.originAddress) || "-"}</div>
                <div className="my-1 text-xs text-muted-foreground">to</div>
                <div className="font-semibold text-primary">{readableRouteAddress(detailBooking.offer?.destination?.address, detailBooking.request?.destinationAddress) || "-"}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/20 p-3"><div className="text-[10px] uppercase text-muted-foreground">Driver</div><div className="mt-1 font-semibold">{detailBooking.driver?.name || "-"}</div></div>
                <div className="rounded-xl bg-muted/20 p-3"><div className="text-[10px] uppercase text-muted-foreground">Fare</div><div className="mt-1 font-semibold">{fmt.currency(detailBooking.fare?.totalAmount)}</div></div>
                <div className="rounded-xl bg-muted/20 p-3"><div className="text-[10px] uppercase text-muted-foreground">Date</div><div className="mt-1 font-semibold">{fmt.date(detailBooking.offer?.departureTime || detailBooking.createdAt)}</div></div>
                <div className="rounded-xl bg-muted/20 p-3"><div className="text-[10px] uppercase text-muted-foreground">Status</div><div className="mt-1"><StatusBadge status={detailBooking.status} /></div></div>
              </div>
            </div>
            <div className="border-t border-border px-6 py-4">
              <Button variant="outline" className="w-full rounded-2xl" onClick={() => setDetailBooking(null)}>Close</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default RiderHistory;
