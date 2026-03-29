import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Leaf, TrendingDown, TreePine, Droplets, Award, Zap, Loader2, Lock } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from "recharts";
import api from "../../lib/api";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

const Emissions = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>({});
    const [reports, setReports] = useState<any[]>([]);
    const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week" | "month">("all");

    useEffect(() => {
        fetchEmissions();
    }, [timeFilter]);

    const fetchEmissions = async () => {
        try {
            setLoading(true);
            let url = "/emissions/me";
            const now = new Date();
            let startDate = "";

            if (timeFilter === "today") {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                startDate = today.toISOString();
            } else if (timeFilter === "week") {
                const weekAgo = new Date();
                weekAgo.setDate(now.getDate() - 7);
                startDate = weekAgo.toISOString();
            } else if (timeFilter === "month") {
                const monthAgo = new Date();
                monthAgo.setMonth(now.getMonth() - 1);
                startDate = monthAgo.toISOString();
            }

            if (startDate) {
                url += `?startDate=${startDate}`;
            }

            const res = await api.get(url);
            if (res.data.success) {
                const payload = res.data?.data || {};
                setStats(payload.stats || {});
                setReports(Array.isArray(payload.recentReports) ? payload.recentReports : []);
            }
        } catch (err) {
            console.error("Failed to fetch emissions:", err);
            setStats({});
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }
    const currentPlan = currentPlanFromStorage();
    const canUseDetailed = hasPlanAtLeast(currentPlan, "plus");
    const toDistanceKm = (value: any) => {
        const numeric = Number(value ?? 0);
        if (!Number.isFinite(numeric) || numeric <= 0) return 0;
        return numeric > 1000 ? numeric / 1000 : numeric;
    };

    const normalizedReports = (Array.isArray(reports) ? reports : []).map((report: any) => ({
        ...report,
        savedKg: Number(report?.savedEmissionsKg ?? report?.estimatedSavings ?? 0) || 0,
        distanceKm: toDistanceKm(report?.distanceKm ?? report?.distance ?? 0),
    }));

    const totalCo2Filtered = normalizedReports.reduce((sum, report) => sum + report.savedKg, 0);
    const totalFuelFiltered = normalizedReports.reduce((sum, report) => sum + (report.distanceKm * 0.08), 0);
    const avgSaved = normalizedReports.length > 0 ? totalCo2Filtered / normalizedReports.length : 0;
    const totalSavedFromStats = Number(stats?.totalCo2SavedKg ?? totalCo2Filtered) || 0;

    const monthlyData = Array.isArray(stats?.monthlyTrend) && stats.monthlyTrend.length > 0
        ? stats.monthlyTrend
        : normalizedReports.slice(0, 6).reverse().map((report) => ({
            month: new Date(report.createdAt).toLocaleString("default", { month: "short" }),
            co2: Number(report.savedKg.toFixed(2)),
            fuelSavedLiters: Number((report.distanceKm * 0.08).toFixed(2)),
        }));

    const breakdownData = [
        { name: "Shared seats", value: Number((totalCo2Filtered * 0.7).toFixed(2)), color: "hsl(168, 80%, 36%)" },
        { name: "Trip distance", value: Number((totalCo2Filtered * 0.2).toFixed(2)), color: "hsl(180, 70%, 30%)" },
        { name: "Efficient routing", value: Number((totalCo2Filtered * 0.1).toFixed(2)), color: "hsl(38, 92%, 55%)" },
    ];

    const cards = [
        { icon: TrendingDown, label: `CO2 Saved (${timeFilter === "all" ? "Total" : "Selected"})`, value: `${totalCo2Filtered.toFixed(1)} kg`, change: "Eco impact", color: "text-emerald", bg: "bg-emerald-light" },
        { icon: TreePine, label: "Trees Equivalent", value: `${(totalCo2Filtered / 21).toFixed(3)}`, change: "Calculated impact", color: "text-emerald", bg: "bg-emerald-light" },
        { icon: Droplets, label: "Fuel Saved", value: `${totalFuelFiltered.toFixed(1)} L`, change: "Estimated", color: "text-primary", bg: "bg-primary/10" },
        { icon: Award, label: "Avg Saved / Ride", value: `${avgSaved.toFixed(2)} kg`, change: "Period score", color: "text-amber", bg: "bg-amber-light" },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-display font-bold text-foreground">Emissions Tracker</h2>
                    <p className="text-sm text-muted-foreground mt-1">Completed-ride carbon savings and eco impact</p>
                </div>
                <div className="flex gap-1 p-1 bg-muted/20 rounded-xl border border-border/50">
                    {(["all", "today", "week", "month"] as const).map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setTimeFilter(tf)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${timeFilter === tf
                                ? "bg-card text-primary shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-card rounded-2xl p-5 border border-border/50"
                    >
                        <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                        <div className={`text-2xl font-display font-bold ${stat.color} mb-0.5`}>{stat.value}</div>
                        <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                        <div className="flex items-center gap-1 text-[10px] text-emerald font-medium">
                            <Zap className="w-3 h-3" />{stat.change}
                        </div>
                    </motion.div>
                ))}
            </div>

            {canUseDetailed ? (
            <div className="grid lg:grid-cols-3 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-2 bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Monthly CO2 Savings</h3>
                    <p className="text-xs text-muted-foreground mb-5">Real completed-ride savings by month</p>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={monthlyData}>
                            <defs>
                                <linearGradient id="co2Grad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 15%, 90%)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "white", border: "1px solid hsl(150,15%,90%)", borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v} kg`, "CO2 Saved"]} />
                            <Area type="monotone" dataKey="co2" stroke="hsl(168, 80%, 36%)" strokeWidth={2.5} fill="url(#co2Grad)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Savings Breakdown</h3>
                    <p className="text-xs text-muted-foreground mb-4">Estimated split of savings sources</p>
                    <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                            <Pie data={breakdownData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                                {breakdownData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                        {breakdownData.map((item) => (
                            <div key={item.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                                    <span className="text-muted-foreground">{item.name}</span>
                                </div>
                                <span className="font-medium text-foreground">{item.value.toFixed(2)} kg</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
            ) : (
            <div className="rounded-2xl border border-amber-300/60 bg-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                            <Lock className="w-4 h-4 text-amber-500" />
                            Detailed Emissions Analytics (Locked)
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Monthly trend graphs, savings breakdown, and detailed report list are available on Plus and Pro.
                        </p>
                    </div>
                    <button
                        onClick={() => (window.location.href = "/dashboard?tab=subscription")}
                        className="rounded-xl bg-primary text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:opacity-90"
                    >
                        Upgrade to Plus
                    </button>
                </div>
            </div>
            )}

            {canUseDetailed && <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="bg-card rounded-2xl p-6 border border-border/50"
            >
                <h3 className="font-display font-bold text-foreground mb-1">How It Is Calculated</h3>
                <p className="text-xs text-muted-foreground mb-4">Current methodology for completed rides</p>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="rounded-2xl bg-muted/20 border border-border/50 p-4">
                        <p className="font-semibold text-foreground mb-2">Formula</p>
                        <p className="text-muted-foreground">Savings = distanceKm x 0.171 x (1.5 - 1.0)</p>
                    </div>
                    <div className="rounded-2xl bg-muted/20 border border-border/50 p-4">
                        <p className="font-semibold text-foreground mb-2">Meaning</p>
                        <p className="text-muted-foreground">We compare the trip against a solo petrol city-car baseline at 0.171 kg CO2 per km and credit the avoided solo-driving emissions.</p>
                    </div>
                </div>
            </motion.div>}

            {canUseDetailed && <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="bg-card rounded-2xl p-6 border border-border/50"
            >
                <h3 className="font-display font-bold text-foreground mb-4 text-lg">Recent Eco Reports</h3>
                <div className="space-y-4">
                    {normalizedReports.length > 0 ? normalizedReports.map((report) => (
                        <div key={report._id} className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/50">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-emerald/10 flex items-center justify-center text-emerald">
                                    <Leaf className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-foreground">Ride CO2 Reduction</div>
                                    <div className="text-[11px] text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()} | Shared Journey</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-emerald">-{report.savedKg.toFixed(2)} kg</div>
                                <div className="text-[10px] text-muted-foreground">{report.distanceKm.toFixed(1)} km trip</div>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-8 text-muted-foreground italic text-sm border-2 border-dashed border-border rounded-2xl">
                            Complete your first ride to generate a report.
                        </div>
                    )}
                </div>
            </motion.div>}

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-card rounded-2xl p-6 border border-border/50"
            >
                <h3 className="font-display font-bold text-foreground mb-4">Eco Milestones</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { emoji: "Seed", label: "First Green Ride", desc: "1 kg CO2 saved", min: 1 },
                        { emoji: "Leaf", label: "Growing Greener", desc: "50 kg CO2 saved", min: 50 },
                        { emoji: "Tree", label: "Eco Warrior", desc: "200 kg CO2 saved", min: 200 },
                        { emoji: "Trophy", label: "Climate Champion", desc: "1000 kg CO2 saved", min: 1000 },
                    ].map((milestone, i) => {
                        const earned = totalSavedFromStats >= milestone.min;
                        return (
                            <div key={i} className={`p-4 rounded-2xl text-center border transition-all ${earned ? "bg-emerald-light/50 border-emerald/20" : "bg-muted/30 border-border opacity-50"}`}>
                                <div className="text-2xl mb-2">{milestone.emoji}</div>
                                <div className="text-sm font-bold text-foreground mb-1">{milestone.label}</div>
                                <div className="text-xs text-muted-foreground">{milestone.desc}</div>
                                {earned && <div className="mt-2 text-xs text-emerald font-medium flex items-center justify-center gap-1"><Zap className="w-3 h-3" /> Earned</div>}
                            </div>
                        );
                    })}
                </div>
            </motion.div>
        </div>
    );
};

export default Emissions;
