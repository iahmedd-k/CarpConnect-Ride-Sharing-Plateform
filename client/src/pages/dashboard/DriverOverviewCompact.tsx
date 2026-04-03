import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, CartesianGrid, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Car, Globe, Loader2, Map, Star, Users, Wallet } from "lucide-react";
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

        const next =
          liveRide && ["active", "live", "picked_up", "confirmed"].includes(String(liveRide?.status || "").toLowerCase())
            ? { offer: liveRide }
            : driverBookings.find((b: any) => ["picked_up", "live"].includes(String(b.status || "").toLowerCase())) || null;

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
  const co2Goal = 200;
  const co2Pct = Math.min(100, Math.round((stats.co2SavedKg / co2Goal) * 100));
  const chartYearLabel = new Date().getFullYear();
  const emissionsData = [
    { name: "CO2 Saved", value: co2Pct, color: "#10b981" },
    { name: "Remaining", value: 100 - co2Pct, color: "#dbe4e7" },
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
            className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="max-w-full break-words text-right text-[10px] font-semibold uppercase tracking-wide text-emerald sm:text-[11px]">{stat.meta}</div>
            </div>
            <div className={`mb-1 break-words text-xl font-semibold leading-tight sm:text-2xl ${stat.color}`}>{stat.value}</div>
            <div className="text-sm leading-snug text-muted-foreground">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.95fr)]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground sm:text-xl">Activity Trend</h3>
              <p className="text-sm text-muted-foreground">Monthly ride frequency</p>
            </div>
            <span className="rounded-full bg-emerald/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald">{chartYearLabel}</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
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
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Sustainability</h3>
                <p className="text-sm text-muted-foreground">Your shared ride impact</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald/10">
                <Globe className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
              <div className="mx-auto w-full max-w-[160px] sm:mx-0">
                <ResponsiveContainer width="100%" height={132}>
                  <PieChart>
                    <Pie data={emissionsData} cx="50%" cy="50%" innerRadius={42} outerRadius={58} paddingAngle={4} dataKey="value">
                      {emissionsData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="break-words text-xl font-semibold text-foreground sm:text-2xl">{stats.co2SavedKg.toFixed(1)} kg</div>
                <div className="text-sm leading-snug text-muted-foreground">{co2Pct}% of {co2Goal} kg goal</div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${co2Pct}%` }} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 h-auto w-full rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-wide leading-tight whitespace-normal text-center sm:text-[10px]"
                  onClick={() => onSetActiveTab("sustainability")}
                >
                  Open Sustainability
                </Button>
              </div>
            </div>
          </motion.div>

          {stats.nextRide && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
              className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-foreground sm:text-xl">Next Active Ride</h3>
                <span className="rounded bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Ready</span>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-white">
                    <Car className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold leading-snug sm:text-base">
                      {stats.nextRide.offer?.origin?.address?.split(",")[0] || "Active ride"} to {stats.nextRide.offer?.destination?.address?.split(",")[0] || "Destination"}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{departureLabel} departure</div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 text-xs font-semibold uppercase tracking-wide sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-muted-foreground">
                    Riders: <strong className="text-foreground">{((stats.nextRide.offer?.seatsTotal || 0) - (stats.nextRide.offer?.seatsAvailable || 0)) || 0}</strong>
                  </span>
                  <Button size="sm" className="h-9 w-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary/90 sm:h-8 sm:w-auto" onClick={() => onSetActiveTab("live")}>
                    Open Live Ride
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl border border-border/50 bg-card p-4 sm:p-5"
          >
            <h3 className="mb-3 text-lg font-semibold text-foreground sm:text-xl">Live Overview</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-emerald/10 bg-emerald/5 p-3">
                <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                <div>
                  <div className="break-words text-sm font-semibold text-foreground">Available Balance: PKR {stats.totalBalance.toLocaleString()}</div>
                  <p className="text-xs uppercase text-muted-foreground">Subscription-based balance</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-blue-500/10 bg-blue-500/5 p-3">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <div className="break-words text-sm font-semibold text-foreground">Gross Earnings: PKR {stats.totalEarnings.toLocaleString()}</div>
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
