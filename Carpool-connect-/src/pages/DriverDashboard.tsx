import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Car, Leaf, Wallet, Bell, Settings, LogOut,
    TrendingUp, Users, ArrowUp, MessageSquare, Navigation,
    CheckCircle, Calendar, Zap, Star, MapPin, PlusCircle,
    Map, Clock, DollarSign, Activity, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "react-router-dom";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { Loader2 } from "lucide-react";
import api from "../lib/api";
import { normalizeOfferStatus } from "@/lib/rideStatus";


// Implemented components
import OfferRide from "./dashboard/OfferRide";
import DriverBookings from "./dashboard/DriverBookings";
import LiveRide from "./dashboard/LiveRide";
import DriverRatings from "./dashboard/DriverRatings";
import DriverEarnings from "./dashboard/DriverEarnings";
import AccountSettings from "./dashboard/AccountSettings";
import MyOffers from "./dashboard/MyOffers";
import NotificationsPanel from "@/components/NotificationsPanel";

// Rider components reused
import MyRides from "./dashboard/MyRides";
import Messages from "./dashboard/Messages";
import Emissions from "./dashboard/Emissions";
import RideHistory from "./dashboard/RideHistory";
import SubscriptionPage from "./dashboard/SubscriptionPage";

const navItems = [
    { id: "overview", icon: TrendingUp, label: "Dashboard" },
    { id: "offer", icon: PlusCircle, label: "Offer Ride" },
    { id: "my-offers", icon: Car, label: "My Offers" },
    { id: "bookings", icon: FileText, label: "Manage Requests" },
    { id: "live", icon: MapPin, label: "Live Ride" },
    { id: "messages", icon: MessageSquare, label: "Messages" },
    { id: "earnings", icon: Wallet, label: "Earnings" },
    { id: "ratings", icon: Star, label: "Ratings" },
    { id: "subscription", icon: Calendar, label: "Plans & Usage" },
    { id: "sustainability", icon: Leaf, label: "Sustainability" },
    { id: "history", icon: Clock, label: "Ride History" },
];
const mobileNavItems = [...navItems, { id: "settings", icon: Settings, label: "Settings" }];

const DriverOverview = ({ user, onSetActiveTab, setUser }: { user: any, onSetActiveTab: (id: string) => void, setUser: (u: any) => void }) => {
    const [stats, setStats] = useState({
        completedRides: 0,
        todayEarnings: 0,
        totalEarnings: 0,
        totalBalance: 0,
        activeRiders: 0,
        openOffers: 0,
        co2SavedKg: 0,
        nextRide: null as any,
        activityTrend: [] as { month: string, rides: number }[]
    });
    const [loading, setLoading] = useState(true);
    const [usage, setUsage] = useState<any>(null);
    const [subscription, setSubscription] = useState<any>(null);

    useEffect(() => {
        fetchOverviewData();
    }, []);

    const fetchOverviewData = async () => {
        try {
            const [profileRes, bookingsRes, earningsRes, emissionsRes, offersRes] = await Promise.all([
                api.get('/auth/me').catch(() => ({ data: { success: false, data: { user } } })),
                api.get("/bookings?role=driver").catch(() => ({ data: { success: true, data: { bookings: [] } } })),
                api.get("/bookings/summary/earnings").catch(() => ({ data: { success: true, data: { summary: {} } } })),
                api.get("/emissions/me").catch(() => ({ data: { success: true, data: { stats: {} } } })),
                api.get("/rides/offers/me").catch(() => ({ data: { success: true, data: { offers: [] } } })),
            ]);

            const refreshedUser = profileRes.data?.data?.user || user;
            setUsage(profileRes.data?.data?.usage || null);
            setSubscription(profileRes.data?.data?.subscription || refreshedUser?.subscription || null);
            if (refreshedUser) {
                setUser(refreshedUser);
                localStorage.setItem('carpconnect_user', JSON.stringify(refreshedUser));
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

            const completed = driverBookings.filter((b: any) => b.status === 'completed' && b.paymentStatus === 'processed').length;
            const activeRiders = driverBookings.filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || ""))).length;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const earningsToday = driverBookings
                .filter((b: any) => new Date(b.updatedAt || b.createdAt) >= today && b.status === 'completed' && b.paymentStatus === 'processed')
                .reduce((sum: number, b: any) => sum + Number(b.fare?.totalAmount || 0), 0);

            let next = liveRide ? { offer: liveRide } : null;
            if (!next) {
                next = driverBookings
                    .filter((b: any) => ["confirmed", "picked_up", "live"].includes(String(b.status || "")) && new Date(b.offer?.departureTime || b.createdAt) >= new Date())
                    .sort((a: any, b: any) => new Date(a.offer?.departureTime || a.createdAt).getTime() - new Date(b.offer?.departureTime || b.createdAt).getTime())[0] || null;
            }

            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const trendMap = new window.Map<string, number>();
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                trendMap.set(months[d.getMonth()], 0);
            }

            driverBookings.forEach((b: any) => {
                if (b.status === 'completed' && b.paymentStatus === 'processed') {
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
                activityTrend: Array.from(trendMap, ([month, rides]) => ({ month, rides }))
            });
        } catch (err) {
            console.error("Dashboard overview fetch failed:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    const kpis = [
        { icon: Map, label: "Completed Rides", value: stats.completedRides.toString(), change: "Lifetime", color: "text-primary" },
        { icon: Wallet, label: "Today's Earnings", value: `PKR ${stats.todayEarnings.toLocaleString()}`, change: "Today", color: "text-emerald" },
        { icon: Users, label: "Active Riders", value: stats.activeRiders.toString(), change: `${stats.openOffers} active offers`, color: "text-blue-500" },
        { icon: Star, label: "Driver Rating", value: `${Number(user?.ratings?.average || 0).toFixed(1)} / 5`, change: `${stats.co2SavedKg.toFixed(2)} kg CO2 saved`, color: "text-amber" },
    ];

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((stat, i) => (
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
                            <div className="flex items-center gap-1 text-[10px] text-emerald font-bold uppercase tracking-wider">
                                {stat.change}
                            </div>
                        </div>
                        <div className={`text-xl md:text-2xl font-display font-black ${stat.color} mb-1`}>{stat.value}</div>
                        <div className="text-xs text-muted-foreground font-medium">{stat.label}</div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            { label: "Ride Offers", used: usage.rideOffersUsed, limit: usage.rideOffersLimit },
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

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Earnings Area Chart (Derived conceptually) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-2 bg-card rounded-2xl p-6 border border-border/50"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="font-display font-bold text-foreground">Activity Trend</h3>
                            <p className="text-xs text-muted-foreground">Monthly ride frequency</p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-emerald/10 text-emerald text-[10px] font-bold uppercase tracking-widest">2026</span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={stats.activityTrend.length ? stats.activityTrend : [
                            { month: "Prev", rides: 0 },
                            { month: "Cur", rides: stats.completedRides || 0 },
                        ]}>
                            <defs>
                                <linearGradient id="colorRides" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 15%, 20%)" opacity={0.1} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: 'white' }} />
                            <Area type="monotone" dataKey="rides" stroke="#10b981" strokeWidth={3} fill="url(#colorRides)" name="Rides" />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>

                {/* Impending Rides & Matches */}
                <div className="space-y-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-card rounded-2xl p-6 border border-border/50"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-bold text-foreground">Next Active Ride</h3>
                            {stats.nextRide && <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-1 rounded">Ready</span>}
                        </div>
                        {stats.nextRide ? (
                            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center text-white"><Car className="w-4 h-4" /></div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-bold truncate">
                                            {typeof stats.nextRide.offer?.origin?.address === 'string' && stats.nextRide.offer?.origin?.address ?
                                                stats.nextRide.offer.origin.address.split(',')[0] : 'Origin'}
                                            {' '}→{' '}
                                            {typeof stats.nextRide.offer?.destination?.address === 'string' && stats.nextRide.offer?.destination?.address ?
                                                stats.nextRide.offer.destination.address.split(',')[0] : 'Destination'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground uppercase">{new Date(stats.nextRide.offer?.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} Departure</div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-[10px] uppercase font-bold">
                                    <span className="text-muted-foreground">Passengers: <strong className="text-foreground">{((stats.nextRide.offer?.seatsTotal || 0) - (stats.nextRide.offer?.seatsAvailable || 0)) || 0}</strong></span>
                                    <Button 
                                        onClick={() => onSetActiveTab('live')}
                                        size="sm" 
                                        className="h-7 text-[10px] font-bold bg-primary hover:bg-primary/90 text-white shadow-glow px-4"
                                    >
                                        Go Live
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-muted/5 rounded-xl border border-dashed border-border/50">
                                <p className="text-xs text-muted-foreground">No upcoming confirmed rides.</p>
                                <Button variant="link" size="sm" className="text-primary text-[10px] font-bold uppercase mt-1" onClick={() => onSetActiveTab('offer')}>Offer a Ride</Button>
                            </div>
                        )}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-card rounded-2xl p-6 border border-border/50"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-bold text-foreground">Live Overview</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-emerald/5 border border-emerald/10 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
                                <div>
                                    <div className="text-xs font-bold text-foreground">Available Balance: PKR {stats.totalBalance.toLocaleString()}</div>
                                    <p className="text-[10px] text-muted-foreground uppercase">Net after platform fees</p>
                                </div>
                            </div>
                            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <div>
                                    <div className="text-xs font-bold text-foreground">Gross Earnings: PKR {stats.totalEarnings.toLocaleString()}</div>
                                    <p className="text-[10px] text-muted-foreground uppercase">Across all driver bookings</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

const DriverDashboard = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab");
    
    const [activeTab, setActiveTab] = useState(tabParam || "overview");
    const [user, setUser] = useState<any>(null);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    useEffect(() => {
        if (tabParam && tabParam !== activeTab) {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    useEffect(() => {
        const storedUser = localStorage.getItem("carpconnect_user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const renderContent = () => {
        switch (activeTab) {
            case "overview": return <DriverOverview user={user} onSetActiveTab={handleTabChange} setUser={setUser} />;
            case "offer": return <OfferRide />;
            case "my-offers": return <MyOffers />;
            case "bookings": return <DriverBookings />;
            case "live": return <LiveRide />;
            case "messages": return <Messages />;
            case "earnings": return <DriverEarnings />;
            case "ratings": return <DriverRatings />;
            case "subscription": return <SubscriptionPage />;
            case "sustainability": return <Emissions />;
            case "history": return <RideHistory />;
            case "settings": return <AccountSettings />;
            default: return <DriverOverview user={user} onSetActiveTab={handleTabChange} setUser={setUser} />;
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("carpconnect_token");
        localStorage.removeItem("carpconnect_user");
        window.location.href = "/";
    };

    const initials = user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : "CC";

    return (
        <div className="min-h-screen bg-muted/10 text-foreground overflow-x-hidden">
            {/* Sidebar */}
            <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0a0a0c] flex flex-col z-40 hidden lg:flex border-r border-white/5">
                <div className="p-6 border-b border-white/5">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-primary to-primary-light flex items-center justify-center shadow-glow">
                            <Car className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-display font-bold text-white text-xl tracking-tight">CarpConnect</span>
                    </Link>
                </div>

                {/* User info */}
                <div className="px-4 py-6 border-b border-white/5">
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold overflow-hidden shadow-inner">
                            {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : initials}
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{user?.name || "Driver"}</div>
                            <div className="text-[10px] text-emerald font-bold tracking-widest uppercase opacity-80 flex items-center gap-1">
                                <CheckCircle className="w-2 h-2" /> Verified
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
                        <Settings className="w-4 h-4" /> Account Settings
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

            {/* Main Content Area */}
            <main className="lg:ml-64 min-h-screen pb-28 lg:pb-0">
                {/* Header */}
                <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-xl font-display font-bold text-foreground truncate">
                            {navItems.find((n) => n.id === activeTab)?.label ?? (activeTab === 'settings' ? 'Settings' : 'Dashboard')}
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
                        <Button className="hidden md:flex gap-2 shadow-glow bg-primary hover:bg-primary/90 text-white" onClick={() => handleTabChange('offer')}>
                            <PlusCircle className="w-4 h-4" /> Offer Ride
                        </Button>
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

export default DriverDashboard;
