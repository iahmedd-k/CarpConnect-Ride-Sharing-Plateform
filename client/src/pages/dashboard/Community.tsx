import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Star, MapPin, MessageSquare, UserCheck, TrendingUp, Shield, Award, Loader2, Car } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import api from "../../lib/api";
import { DriverProfileModal } from "@/components/DriverProfileModal";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const Community = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [selectedDriver, setSelectedDriver] = useState<any>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchCommunityData();
    }, []);

    const fetchCommunityData = async () => {
        try {
            const res = await api.get("/users/community");
            if (res.data.success) {
                setData(res.data.data);
            }
        } catch (err) {
            console.error("Failed to fetch community data:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleMessage = async (driverId: string) => {
        try {
            // Check if we have an existing booking/chat with this driver
            const res = await api.get("/bookings");
            const bookings = res.data.data.bookings || [];
            const existingBooking = bookings.find((b: any) => (b.driver?._id || b.driver) === driverId);
            
            if (existingBooking) {
                navigate("/driver-dashboard?tab=messages");
            } else {
                toast.info("Start a journey first!", {
                    description: "You can chat with this driver once you book a ride together."
                });
            }
        } catch (err) {
            toast.error("Failed to check conversations");
        }
    };

    const scrollToDrivers = () => {
        const el = document.getElementById("top-drivers-section");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
    if (!data) return <div className="text-center py-20 text-muted-foreground">Failed to load community data</div>;

    const avgCommunityRating = data.leaderboard?.length > 0
        ? (data.leaderboard.reduce((acc: number, curr: any) => acc + curr.rating, 0) / data.leaderboard.length).toFixed(1)
        : "4.8";

    const stats = [
        { icon: Users, label: "Community Members", value: data.totalUsers?.toString() || "0", color: "text-primary" },
        { icon: UserCheck, label: "Top Drivers", value: data.topDrivers?.length?.toString() || "0", color: "text-emerald" },
        { icon: Star, label: "Avg Member Rating", value: `${avgCommunityRating}★`, color: "text-amber" },
        { icon: Shield, label: "Safety Score", value: "98%", color: "text-primary" },
    ];

    const radarData = [
        { subject: "Punctuality", A: 92 },
        { subject: "Cleanliness", A: 88 },
        { subject: "Friendliness", A: 95 },
        { subject: "Safety", A: 100 },
        { subject: "Value", A: 85 },
        { subject: "Communication", A: 90 },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-display font-bold text-foreground">Community</h2>
                    <p className="text-sm text-muted-foreground mt-1">Your network of verified drivers and co-riders</p>
                </div>
                <div className="flex -space-x-3 overflow-hidden">
                   {data.topDrivers?.slice(0, 5).map((d: any) => (
                       <img key={d._id} className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover" src={d.profilePhoto || `https://ui-avatars.com/api/?name=${d.name}&background=random`} alt={d.name} />
                   ))}
                </div>
            </div>

            {/* Community stats */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-card rounded-2xl p-5 border border-border/50"
                    >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                            <s.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Community Leaderboard</h3>
                    <p className="text-xs text-muted-foreground mb-5">Top rated members this month</p>
                    <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={data.leaderboard || []} layout="vertical" barSize={12}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150,15%,20%)" opacity={0.05} horizontal={false} />
                            <XAxis type="number" domain={[0, 5]} hide />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "hsl(200,10%,45%)" }} width={80} axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 10, color: 'white' }} />
                            <Bar dataKey="rating" radius={[0, 4, 4, 0]} fill="url(#leaderboardGradient)" name="Rating" />
                            <defs>
                                <linearGradient id="leaderboardGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop offset="100%" stopColor="#34d399" />
                                </linearGradient>
                            </defs>
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Community DNA</h3>
                    <p className="text-xs text-muted-foreground mb-4">Core values as rated by members</p>
                    <ResponsiveContainer width="100%" height={210}>
                        <RadarChart data={radarData}>
                            <PolarGrid stroke="hsl(150,15%,20%)" opacity={0.1} />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(200,10%,45%)" }} />
                            <Radar name="Community" dataKey="A" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} />
                        </RadarChart>
                    </ResponsiveContainer>
                </motion.div>
            </div>

            {/* Top Drivers */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display font-bold text-foreground">Top Rated Drivers</h3>
                    <button onClick={scrollToDrivers} className="text-xs font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors">View All members</button>
                </div>
                <div id="top-drivers-section" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {data.topDrivers?.map((driver: any, i: number) => (
                        <motion.div
                            key={driver._id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 + i * 0.05 }}
                            className="bg-card rounded-2xl p-5 border border-border/50 hover:border-primary/30 hover:shadow-glow transition-all duration-300"
                        >
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center text-white font-bold text-lg shadow-glow overflow-hidden">
                                    {driver.profilePhoto ? <img src={driver.profilePhoto} className="w-full h-full object-cover" /> : driver.name[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-foreground truncate">{driver.name}</div>
                                    <div className="flex items-center gap-1 text-[10px] text-emerald font-bold uppercase tracking-widest mt-0.5">
                                        <Shield className="w-3 h-3" /> Verified
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between mb-4 bg-muted/20 p-3 rounded-xl">
                                <div className="flex items-center gap-1">
                                    <Star className="w-3.5 h-3.5 fill-amber text-amber" />
                                    <span className="text-sm font-black text-foreground">{driver.ratings?.average?.toFixed(1) || "5.0"}</span>
                                    <span className="text-[10px] text-muted-foreground">({driver.ratings?.count || 0})</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-bold">
                                    <Car className="w-3 h-3" /> {driver.vehicle?.model || "Standard"}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleMessage(driver._id)}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/20 transition-colors"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" /> Message
                                </button>
                                <button 
                                    onClick={() => { setSelectedDriver(driver); setIsProfileOpen(true); }}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-primary text-white text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-glow"
                                >
                                    Profile
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            <DriverProfileModal 
                driver={selectedDriver} 
                isOpen={isProfileOpen} 
                onClose={() => setIsProfileOpen(false)} 
                onMessage={(id) => {
                    setIsProfileOpen(false);
                    handleMessage(id);
                }}
            />
        </div>
    );
};

export default Community;
