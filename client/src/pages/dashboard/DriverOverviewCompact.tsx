import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Car, Loader2, Map, Star, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { normalizeOfferStatus } from "@/lib/rideStatus";

type Props = {
  user: any;
  onSetActiveTab: (id: string) => void;
  setUser: (user: any) => void;
};

const DriverOverviewCompact = ({ user, onSetActiveTab, setUser }: Props) => {
  const [stats, setStats] = useState({
    completedRides: 0,
    todayEarnings: 0,
    totalEarnings: 0,
    totalBalance: 0,
    activeRiders: 0,
    openOffers: 0,
    co2SavedKg: 0,
    nextRide: null as any,
    activityTrend: [] as { month: string; rides: number }[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverviewData = async () => {
      try {
        const [profileRes, bookingsRes, earningsRes, emissionsRes, offersRes] = await Promise.all([
          api.get("/auth/me").catch(() => ({ data: { success: false, data: { user } } })),
          api.get("/bookings?role=driver").catch(() => ({ data: { success: true, data: { bookings: [] } } })),
          api.get("/bookings/summary/earnings").catch(() => ({ data: { success: true, data: { summary: {} } } })),
          api.get("/emissions/me").catch(() => ({ data: { success: true, data: { stats: {} } } })),
          api.get("/rides/offers/me").catch(() => ({ data: { success: true, data: { offers: [] } } })),
        ]);

        const refreshedUser = profileRes.data?.data?.user || user;
        if (refreshedUser) {
          setUser(refreshedUser);
          localStorage.setItem("carpconnect_user", JSON.stringify(refreshedUser));
        }

        let liveRide = null;
        try {
          const liveRes = await api.get("/rides/active");
          liveRide = liveRes.data?.data?.ride || liveRes.data?.data || null;
        } catch (liveErr: any) {
          if (liveErr?.response?.status !== 404) {
            console.error("Active ride fetch failed:", liveErr);
          }
        }

        const driverBookings = (bookingsRes.data?.data?.bookings || []).filter((b: any) => !b.hiddenForDriver);
        const earningsSummary = earningsRes.data?.data?.summary || {};
        const emissionsStats = emissionsRes.data?.data?.stats || {};
        const offers = (offersRes.data?.data?.offers || [])
          .filter((offer: any) => !offer.hiddenForDriver)
          .map((offer: any) => ({ ...offer, status: normalizeOfferStatus(offer.status) }));

        const completed = driverBookings.filter((b: any) => b.status === "completed" && b.paymentStatus === "processed").length;
        const activeRiders = driverBookings.filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || ""))).length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const earningsToday = driverBookings
          .filter((b: any) => new Date(b.updatedAt || b.createdAt) >= today && b.status === "completed" && b.paymentStatus === "processed")
          .reduce((sum: number, b: any) => sum + Number(b.fare?.totalAmount || 0), 0);

        let next = liveRide ? { offer: liveRide } : null;
        if (!next) {
          next =
            driverBookings
              .filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || "")) && new Date(b.offer?.departureTime || b.createdAt) >= new Date())
              .sort((a: any, b: any) => new Date(a.offer?.departureTime || a.createdAt).getTime() - new Date(b.offer?.departureTime || b.createdAt).getTime())[0] || null;
        }

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const trendMap = new window.Map<string, number>();
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          trendMap.set(months[d.getMonth()], 0);
        }

        driverBookings.forEach((b: any) => {
          if (b.status === "completed" && b.paymentStatus === "processed") {
            const m = months[new Date(b.updatedAt || b.createdAt).getMonth()];
            if (trendMap.has(m)) trendMap.set(m, (trendMap.get(m) || 0) + 1);
          }
        });

        setStats({
          completedRides: completed,
          todayEarnings: earningsToday,
          totalEarnings: Number(earningsSummary.totalEarnings || 0),
          totalBalance: Number(earningsSummary.totalBalance || 0),
          activeRiders,
          openOffers: offers.filter((offer: any) => ["open", "active"].includes(String(offer.status || ""))).length,
          co2SavedKg: Number(emissionsStats.totalCo2SavedKg || 0),
          nextRide: next,
          activityTrend: Array.from(trendMap, ([month, rides]) => ({ month, rides })),
        });
      } catch (err) {
        console.error("Dashboard overview fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOverviewData();
  }, [setUser, user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { icon: Map, label: "Completed Rides", value: stats.completedRides.toString(), meta: "Lifetime", color: "text-primary" },
    { icon: Wallet, label: "Today's Earnings", value: `PKR ${stats.todayEarnings.toLocaleString()}`, meta: "Today", color: "text-emerald" },
    { icon: Users, label: "Active Riders", value: stats.activeRiders.toString(), meta: `${stats.openOffers} active offers`, color: "text-blue-500" },
    { icon: Star, label: "Driver Rating", value: `${Number(user?.ratings?.average || 0).toFixed(1)} / 5`, meta: `${stats.co2SavedKg.toFixed(2)} kg CO2 saved`, color: "text-amber-500" },
  ];

  const departureLabel = stats.nextRide?.offer?.departureTime
    ? new Date(stats.nextRide.offer.departureTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Pending";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((stat, index) => (
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
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald">{stat.meta}</div>
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
              <h3 className="text-xl font-semibold text-foreground">Activity Trend</h3>
              <p className="text-sm text-muted-foreground">Monthly ride frequency</p>
            </div>
            <span className="rounded-full bg-emerald/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald">2026</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={stats.activityTrend.length ? stats.activityTrend : [{ month: "Now", rides: stats.completedRides || 0 }]}>
              <defs>
                <linearGradient id="compactRides" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "white" }} />
              <Area type="monotone" dataKey="rides" stroke="#10b981" strokeWidth={3} fill="url(#compactRides)" name="Rides" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="rounded-2xl border border-border/50 bg-card p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-foreground">Next Active Ride</h3>
              {stats.nextRide && <span className="rounded bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Ready</span>}
            </div>
            {stats.nextRide ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-white">
                    <Car className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">
                      {stats.nextRide.offer?.origin?.address?.split(",")[0] || "Origin"} to {stats.nextRide.offer?.destination?.address?.split(",")[0] || "Destination"}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{departureLabel} departure</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                  <span className="text-muted-foreground">
                    Passengers: <strong className="text-foreground">{((stats.nextRide.offer?.seatsTotal || 0) - (stats.nextRide.offer?.seatsAvailable || 0)) || 0}</strong>
                  </span>
                  <Button size="sm" className="h-8 bg-primary px-4 text-xs font-semibold text-white hover:bg-primary/90" onClick={() => onSetActiveTab("live")}>
                    Go Live
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/50 bg-muted/5 py-5 text-center">
                <p className="text-sm text-muted-foreground">No upcoming confirmed rides.</p>
                <Button variant="link" size="sm" className="mt-1 text-xs font-semibold uppercase text-primary" onClick={() => onSetActiveTab("offer")}>
                  Offer a Ride
                </Button>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border/50 bg-card p-5"
          >
            <h3 className="mb-3 text-xl font-semibold text-foreground">Live Overview</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-emerald/10 bg-emerald/5 p-3">
                <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Available Balance: PKR {stats.totalBalance.toLocaleString()}</div>
                  <p className="text-xs uppercase text-muted-foreground">Net after platform fees</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Gross Earnings: PKR {stats.totalEarnings.toLocaleString()}</div>
                  <p className="text-xs uppercase text-muted-foreground">Across all driver bookings</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DriverOverviewCompact;
