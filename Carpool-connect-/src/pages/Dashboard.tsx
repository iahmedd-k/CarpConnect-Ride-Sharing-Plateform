import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Car, Leaf, Wallet, Bell, Settings, LogOut,
    TrendingUp, Users, ArrowUp, MessageSquare, Navigation, Globe,
    CheckCircle, Calendar, Zap, Star, MapPin, Search, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

// Inner pages
import MyRides from "./dashboard/MyRides";
import Emissions from "./dashboard/Emissions";
import WalletPage from "./dashboard/WalletPage";
import FindRide from "./dashboard/FindRide";
import Messages from "./dashboard/Messages";
import Community from "./dashboard/Community";
import AccountSettings from "./dashboard/AccountSettings";
import DriverProfile from "./dashboard/DriverProfile";
import RiderRatings from "./dashboard/RiderRatings";
import SubscriptionPage from "./dashboard/SubscriptionPage";
import NotificationsPanel from "@/components/NotificationsPanel";
import { AnimatePresence } from "framer-motion";

/* ──────────── fallback chart data (used when API returns empty) ──────────── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const navItems = [
    { id: "overview", icon: TrendingUp, label: "Overview" },
    { id: "find", icon: Search, label: "Find Rides" },
    { id: "rides", icon: Car, label: "My Rides" },
    { id: "community", icon: Users, label: "Community" },
    { id: "ratings", icon: Star, label: "Ratings" },
    { id: "emissions", icon: Leaf, label: "Emissions" },
    { id: "wallet", icon: Wallet, label: "Wallet" },
    { id: "subscription", icon: Calendar, label: "Plans & Usage" },
    { id: "messages", icon: MessageSquare, label: "Messages" },
];
const mobileNavItems = [...navItems, { id: "settings", icon: Settings, label: "Settings" }];

/* ──────────── Overview component (API-driven) ──────────── */
const Overview = ({ user, onBookRide }: { user: any; onBookRide: () => void }) => {
    const [loading, setLoading] = useState(true);
    const [, setProfile] = useState<any>(user);
    const [totalRides, setTotalRides] = useState(0);
    const [activeRides, setActiveRides] = useState(0);
    const [totalSpent, setTotalSpent] = useState(0);
    const [averagePerRide, setAveragePerRide] = useState(0);
    const [co2Saved, setCo2Saved] = useState(0);
    const [rideHistory, setRideHistory] = useState<any[]>([]);
    const [weeklyData, setWeeklyData] = useState<any[]>(DAYS.map(d => ({ day: d, rides: 0 })));
    const [recentBookings, setRecentBookings] = useState<any[]>([]);
    const [usage, setUsage] = useState<any>(null);
    const [subscription, setSubscription] = useState<any>(null);

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
                setUsage(meRes.data?.data?.usage || null);
                setSubscription(meRes.data?.data?.subscription || refreshedUser?.subscription || null);
                setProfile(refreshedUser);
                if (refreshedUser) {
                    localStorage.setItem("carpconnect_user", JSON.stringify(refreshedUser));
                }

                const bookings = (bookingsRes.data?.data?.bookings || []).filter((booking: any) => !booking.hiddenForRider);
                const spendingSummary = spendingRes.data?.data?.summary || {};
                const emissionsStats = emissionsRes.data?.data?.stats || {};
                const completedBookings = bookings.filter((b: any) => b.status === 'completed' && b.paymentStatus === 'processed');
                const liveBookings = bookings.filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || "")));

                // KPI cards
                setTotalRides(Number(spendingSummary.totalRides || completedBookings.length || 0));
                setActiveRides(liveBookings.length);
                setTotalSpent(Number(spendingSummary.totalSpent || 0));
                setAveragePerRide(Number(spendingSummary.averagePerRide || 0));
                setCo2Saved(Number(emissionsStats.totalCo2SavedKg || spendingSummary.totalEmissionsSaved || 0));

                // Build monthly history from real bookings
                const monthMap: Record<string, { rides: number; saved: number }> = {};
                bookings.forEach((b: any) => {
                    const d = new Date(b.updatedAt || b.createdAt);
                    const mon = MONTHS[d.getMonth()];
                    if (!monthMap[mon]) monthMap[mon] = { rides: 0, saved: 0 };
                    monthMap[mon].rides += b.status === 'completed' && b.paymentStatus === 'processed' ? 1 : 0;
                    monthMap[mon].saved += b.status === 'completed' && b.paymentStatus === 'processed' ? (b.fare?.totalAmount || 0) : 0;
                });
                const now = new Date();
                const last6Months = Array.from({ length: 6 }, (_, index) => {
                    const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
                    const mon = MONTHS[d.getMonth()];
                    return { month: mon, rides: monthMap[mon]?.rides || 0, saved: monthMap[mon]?.saved || 0 };
                });
                setRideHistory(last6Months);

                // Build weekly from bookings this week
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay() + 1);
                startOfWeek.setHours(0, 0, 0, 0);
                const dayMap: Record<string, number> = {};
                bookings.forEach((b: any) => {
                    const d = new Date(b.updatedAt || b.createdAt);
                    if (d >= startOfWeek) {
                        const day = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
                        dayMap[day] = (dayMap[day] || 0) + 1;
                    }
                });
                setWeeklyData(DAYS.map(d => ({ day: d, rides: dayMap[d] || 0 })));

                // Recent active bookings for matched rides section
                const recent = bookings
                    .filter((b: any) => !["cancelled", "rejected"].includes(String(b.status || "")))
                    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
                    .slice(0, 5);
                setRecentBookings(recent);
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading dashboard...</span>
                </div>
            </div>
        );
    }

    const co2Goal = 200;
    const co2Pct = Math.min(100, Math.round((co2Saved / co2Goal) * 100));
    const emissionsData = [
        { name: "CO₂ Saved", value: co2Pct, color: "#10b981" },
        { name: "Remaining", value: 100 - co2Pct, color: "#1e3a3a" },
    ];

    return (
    <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
                { icon: Car, label: "Completed Rides", value: String(totalRides), change: "Lifetime", color: "text-primary" },
                { icon: Navigation, label: "Active Rides", value: String(activeRides), change: "In progress", color: "text-blue-500" },
                { icon: Wallet, label: "Total Spent", value: `PKR ${totalSpent.toLocaleString()}`, change: `Avg PKR ${averagePerRide.toFixed(0)}/ride`, color: "text-white" },
                { icon: Globe, label: "CO2 Saved", value: `${co2Saved.toFixed(2)} kg`, change: "Environmental impact", color: "text-emerald" },
            ].map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="bg-card rounded-2xl p-5 border border-border/50 hover:shadow-card transition-shadow"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <stat.icon className="w-5 h-5 text-primary" />
                        </div>
                        {stat.change && (
                            <div className="flex items-center gap-1 text-xs text-emerald font-medium">
                                <ArrowUp className="w-3 h-3" /> {stat.change}
                            </div>
                        )}
                    </div>
                    <div className={`text-xl md:text-2xl font-display font-bold ${stat.color} mb-1`}>{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                </motion.div>
            ))}
        </div>

        {usage && (
            <div className="bg-card rounded-2xl p-5 border border-border/50">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <div>
                        <h3 className="font-display font-bold text-foreground">Plan Usage</h3>
                        <p className="text-xs text-muted-foreground">
                            Plan: {String(subscription?.plan || "free").toUpperCase()} · Monthly limits
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                        { label: "Bookings", used: usage.bookingsUsed, limit: usage.bookingsLimit },
                        { label: "Ride Requests", used: usage.rideRequestsUsed, limit: usage.rideRequestsLimit },
                    ].map((item) => {
                        const used = Number(item.used || 0);
                        const limit = Math.max(1, Number(item.limit || 0));
                        const pct = Math.min(100, Math.round((used / limit) * 100));
                        return (
                            <div key={item.label} className="rounded-xl bg-muted/20 border border-border/40 p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.label}</p>
                                    <p className="text-xs font-semibold text-foreground">{used}/{limit}</p>
                                </div>
                                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-2 bg-card rounded-2xl p-6 border border-border/50"
            >
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="font-display font-bold text-foreground">Rides & Savings</h3>
                        <p className="text-xs text-muted-foreground">Monthly overview (PKR)</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">2026</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={rideHistory}>
                        <defs>
                            <linearGradient id="colorRides" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#666" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#666" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: 'white' }} />
                        <Area type="monotone" dataKey="rides" stroke="hsl(168, 80%, 36%)" strokeWidth={2} fill="url(#colorRides)" name="Rides" />
                        <Area type="monotone" dataKey="saved" stroke="#10b981" strokeWidth={2} fill="url(#colorSaved)" name="PKR Saved" />
                    </AreaChart>
                </ResponsiveContainer>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card rounded-2xl p-6 border border-border/50"
            >
                <h3 className="font-display font-bold text-foreground mb-1">Monthly CO₂</h3>
                <p className="text-xs text-muted-foreground mb-4">Goal: {co2Goal} kg saved</p>
                <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                        <Pie data={emissionsData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                            {emissionsData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="text-center -mt-4">
                    <div className="text-2xl font-display font-bold text-foreground">{co2Saved} kg</div>
                    <div className="text-xs text-muted-foreground">{co2Pct}% of monthly goal</div>
                </div>
                <div className="mt-6 flex items-center justify-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-emerald" />
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Saved</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-muted" />
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target</span>
                    </div>
                </div>
            </motion.div>
        </div>

        {/* Weekly Bars + Upcoming */}
        <div className="grid lg:grid-cols-3 gap-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-card rounded-2xl p-6 border border-border/50"
            >
                <h3 className="font-display font-bold text-foreground mb-1">Weekly Activity</h3>
                <p className="text-xs text-muted-foreground mb-4">Daily ride count</p>
                <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={weeklyData} barSize={24}>
                        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#666" }} axisLine={false} tickLine={false} />
                        <Bar dataKey="rides" radius={[6, 6, 0, 0]} fill="url(#colorRides)" />
                    </BarChart>
                </ResponsiveContainer>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="lg:col-span-2 bg-card rounded-2xl p-6 border border-border/50"
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display font-bold text-foreground">Recent Bookings</h3>
                    <Button onClick={onBookRide} size="sm" className="bg-primary text-white text-xs shadow-glow hover:bg-primary/90 rounded-xl">+ Book Ride</Button>
                </div>
                <div className="space-y-3 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
                    {recentBookings.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">No recent bookings yet. Start a ride!</div>
                    ) : recentBookings.map((booking: any, i: number) => (
                        <div key={booking._id || i} className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 border border-white/5 hover:bg-muted/30 transition-all cursor-pointer group">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                <Navigation className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                    <span>{booking.offer?.origin?.address || "Pickup"}</span>
                                    <ArrowUp className="w-3 h-3 rotate-90 text-muted-foreground" />
                                    <span>{booking.offer?.destination?.address || "Dropoff"}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {booking.driver?.name || "Driver"} · PKR {booking.fare?.totalAmount || 0}
                                </div>
                            </div>
                            <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${booking.status === 'confirmed' ? 'text-emerald bg-emerald/10' : 'text-primary bg-primary/10'}`}>
                                {booking.status?.toUpperCase()}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    </div>
    );
};

const Dashboard = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab");
    const [activeTab, setActiveTab] = useState(tabParam || "overview");
    const [initialQuery, setInitialQuery] = useState("");
    const [user, setUser] = useState<any>(null);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    useEffect(() => {
        if (tabParam && tabParam !== activeTab) {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    useEffect(() => {
        const storedUser = localStorage.getItem("carpconnect_user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        // Auto-navigate to Find Rides tab if destination param is present (from homepage search)
        const dest = searchParams.get("destination");
        if (dest && dest.trim().length >= 2) {
            setInitialQuery(dest.trim());
            setActiveTab("find");
        }
    }, []);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", tab);
            return next;
        });
    };

    const renderContent = () => {
        switch (activeTab) {
            case "find": return <FindRide initialQuery={initialQuery} onViewProfile={(id) => handleTabChange(`profile:${id}`)} />;
            case "rides": return <MyRides />;
            case "emissions": return <Emissions />;
            case "wallet": return <WalletPage />;
            case "subscription": return <SubscriptionPage />;
            case "messages": return <Messages />;
            case "community": return <Community />;
            case "ratings": return <RiderRatings />;
            case "settings": return <AccountSettings />;
            default:
                if (activeTab.startsWith("profile:")) {
                    const driverId = activeTab.split("profile:")[1];
                    return <DriverProfile driverId={driverId} onBack={() => handleTabChange("find")} />;
                }
                return <Overview user={user} onBookRide={() => handleTabChange("find")} />;
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("carpconnect_token");
        localStorage.removeItem("carpconnect_user");
        window.location.href = "/";
    };

    const initials = user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "CC";

    return (
        <div className="min-h-screen bg-muted/10 overflow-x-hidden">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0a0a0c] flex flex-col z-40 hidden lg:flex border-r border-white/5">
                <div className="p-6 border-b border-white/5">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                            <Car className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-display font-bold text-white text-xl tracking-tight">CarpConnect</span>
                    </Link>
                </div>

                {/* User info */}
                <div className="px-4 py-6 border-b border-white/5">
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold overflow-hidden shadow-inner uppercase">
                            {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : initials}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{user?.name || "Rider"}</div>
                            <div className="text-[10px] text-emerald font-bold tracking-widest uppercase opacity-80 flex items-center gap-1">
                                <CheckCircle className="w-2 h-2" /> Platinum
                            </div>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleTabChange(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all group ${activeTab === item.id
                                ? "bg-primary text-white shadow-glow-primary"
                                : "text-muted-foreground hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <item.icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${activeTab === item.id ? "text-white" : "text-muted-foreground/60"}`} />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/5 space-y-1">
                    <button
                        onClick={() => handleTabChange('settings')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}
                    >
                        <Settings className="w-4 h-4" /> Settings
                    </button>
                    <button onClick={handleLogout} className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all">
                        <LogOut className="w-4 h-4" /> Log Out
                    </button>
                </div>
            </aside>

            {/* Mobile bottom nav */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0c]/90 backdrop-blur-xl border-t border-white/10 px-2 py-2">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {mobileNavItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`flex shrink-0 flex-col items-center gap-1 min-w-[74px] px-3 py-2 rounded-xl transition-all ${activeTab === item.id ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
                    >
                        <item.icon className="w-4 h-4" />
                        <span className="text-[10px] font-bold leading-tight text-center">{item.label}</span>
                    </button>
                ))}
                </div>
            </div>

            {/* Main */}
            <main className="lg:ml-64 min-h-screen pb-28 lg:pb-0">
                {/* Header */}
                <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-xl font-display font-bold text-foreground uppercase tracking-tight truncate">
                            {navItems.find((n) => n.id === activeTab)?.label ?? "Dashboard"}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button
                                onClick={() => setNotificationsOpen(!notificationsOpen)}
                                className="relative w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center hover:border-primary/50 transition-colors"
                            >
                                <Bell className="w-4 h-4 text-muted-foreground" />
                                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-card" />
                            </button>
                            <AnimatePresence>
                                {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
                            </AnimatePresence>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center text-white text-sm font-bold shadow-inner uppercase">
                            {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : initials}
                        </div>
                    </div>
                </div>

                <div className="p-3 sm:p-4 md:p-6 lg:p-10 max-w-7xl mx-auto">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {renderContent()}
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default Dashboard;
