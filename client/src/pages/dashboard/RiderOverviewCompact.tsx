import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUp, Car, Globe, Loader2, Navigation, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Props = {
  user: any;
  onBookRide: () => void;
};

const RiderOverviewCompact = ({ user, onBookRide }: Props) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRides: 0,
    activeRides: 0,
    totalSpent: 0,
    averagePerRide: 0,
    co2Saved: 0,
    rideHistory: [] as any[],
    recentBookings: [] as any[],
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [meRes, bookingsRes, spendingRes, emissionsRes] = await Promise.all([
          api.get("/auth/me").catch(() => ({ data: { data: { user } } })),
          api.get("/bookings?role=rider").catch(() => ({ data: { data: { bookings: [] } } })),
          api.get("/bookings/summary/spending").catch(() => ({ data: { data: { summary: {} } } })),
          api.get("/emissions/me").catch(() => ({ data: { data: { stats: {} } } })),
        ]);

        const refreshedUser = meRes.data?.data?.user || user;
        if (refreshedUser) {
          localStorage.setItem("carpconnect_user", JSON.stringify(refreshedUser));
        }

        const bookings = (bookingsRes.data?.data?.bookings || []).filter((booking: any) => !booking.hiddenForRider);
        const spendingSummary = spendingRes.data?.data?.summary || {};
        const emissionsStats = emissionsRes.data?.data?.stats || {};
        const completedBookings = bookings.filter((b: any) => b.status === "completed" && b.paymentStatus === "processed");
        const liveBookings = bookings.filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || "")));

        const monthMap: Record<string, { rides: number; saved: number }> = {};
        bookings.forEach((b: any) => {
          const d = new Date(b.updatedAt || b.createdAt);
          const mon = MONTHS[d.getMonth()];
          if (!monthMap[mon]) monthMap[mon] = { rides: 0, saved: 0 };
          monthMap[mon].rides += b.status === "completed" && b.paymentStatus === "processed" ? 1 : 0;
          monthMap[mon].saved += b.status === "completed" && b.paymentStatus === "processed" ? (b.fare?.totalAmount || 0) : 0;
        });

        const now = new Date();
        const last6Months = Array.from({ length: 6 }, (_, index) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
          const mon = MONTHS[d.getMonth()];
          return { month: mon, rides: monthMap[mon]?.rides || 0, saved: monthMap[mon]?.saved || 0 };
        });

        const recent = bookings
          .filter((b: any) => !["cancelled", "rejected"].includes(String(b.status || "")))
          .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
          .slice(0, 5);

        setStats({
          totalRides: Number(spendingSummary.totalRides || completedBookings.length || 0),
          activeRides: liveBookings.length,
          totalSpent: Number(spendingSummary.totalSpent || 0),
          averagePerRide: Number(spendingSummary.averagePerRide || 0),
          co2Saved: Number(emissionsStats.totalCo2SavedKg || spendingSummary.totalEmissionsSaved || 0),
          rideHistory: last6Months,
          recentBookings: recent,
        });
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { icon: Car, label: "Completed Rides", value: String(stats.totalRides), meta: "Lifetime", color: "text-primary" },
    { icon: Navigation, label: "Active Rides", value: String(stats.activeRides), meta: "In progress", color: "text-blue-500" },
    { icon: Wallet, label: "Total Spent", value: `PKR ${stats.totalSpent.toLocaleString()}`, meta: `Avg PKR ${stats.averagePerRide.toFixed(0)}/ride`, color: "text-foreground" },
    { icon: Globe, label: "CO2 Saved", value: `${stats.co2Saved.toFixed(1)} kg`, meta: "Environmental impact", color: "text-emerald" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="rounded-2xl border border-border/50 bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald">
                <ArrowUp className="h-3 w-3" /> {stat.meta}
              </div>
            </div>
            <div className={`mb-1 text-2xl font-semibold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-muted-foreground">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl border border-border/50 bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Rides & Savings</h3>
              <p className="text-sm text-muted-foreground">Monthly overview</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">2026</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={stats.rideHistory}>
              <defs>
                <linearGradient id="riderOverviewRides" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "white" }} />
              <Area type="monotone" dataKey="rides" stroke="hsl(168, 80%, 36%)" strokeWidth={3} fill="url(#riderOverviewRides)" name="Rides" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="rounded-2xl border border-border/50 bg-card p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-foreground">Recent Bookings</h3>
            <Button size="sm" className="h-8 bg-primary px-4 text-xs font-semibold text-white hover:bg-primary/90" onClick={onBookRide}>
              Find Rides
            </Button>
          </div>
          <div className="max-h-[190px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {stats.recentBookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 bg-muted/5 py-8 text-center text-sm text-muted-foreground">
                No recent bookings yet.
              </div>
            ) : (
              stats.recentBookings.map((booking: any, i: number) => (
                <div key={booking._id || i} className="rounded-xl border border-border/40 bg-muted/10 p-3">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {booking.offer?.origin?.address?.split(",")[0] || "Pickup"} to {booking.offer?.destination?.address?.split(",")[0] || "Dropoff"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {booking.driver?.name || "Driver"} • PKR {booking.fare?.totalAmount || 0}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RiderOverviewCompact;
