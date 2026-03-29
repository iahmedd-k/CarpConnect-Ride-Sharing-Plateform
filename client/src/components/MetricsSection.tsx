import { motion } from "framer-motion";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, BarChart, Bar
} from "recharts";
import { TrendingUp, Users, Car, Leaf } from "lucide-react";

const matchRates = [
    { month: "Oct", rate: 72 },
    { month: "Nov", rate: 76 },
    { month: "Dec", rate: 79 },
    { month: "Jan", rate: 82 },
    { month: "Feb", rate: 85 },
    { month: "Mar", rate: 89 },
];

const cityData = [
    { city: "SF", users: 18000 },
    { city: "NYC", users: 14000 },
    { city: "LA", users: 9000 },
    { city: "CHI", users: 6500 },
    { city: "SEA", users: 4200 },
];

const MetricsSection = () => {
    return (
        <section className="py-24 md:py-32 bg-muted/20">
            <div className="container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
                        Live Metrics
                    </span>
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                        Numbers that <span className="text-gradient-primary">tell our story</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                        Real-time data on how CarpConnect is changing commuting globally.
                    </p>
                </motion.div>

                {/* Metric Cards */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
                    {[
                        { icon: Users, label: "Daily Active Users", value: "12,400", change: "+8.2%", color: "text-primary" },
                        { icon: Car, label: "Completed Ride Ratio", value: "94.3%", change: "+1.1%", color: "text-emerald" },
                        { icon: Leaf, label: "Avg CO₂ Per Rider", value: "2.4 kg", change: "-12%", color: "text-emerald" },
                        { icon: TrendingUp, label: "Repeat Usage Rate", value: "78%", change: "+5.3%", color: "text-amber" },
                    ].map((m, i) => (
                        <motion.div
                            key={m.label}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-card transition-shadow"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <m.icon className="w-5 h-5 text-primary" />
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.change.startsWith("-") ? "bg-emerald-light text-emerald" : "bg-emerald-light text-emerald"
                                    }`}>{m.change}</span>
                            </div>
                            <div className={`text-3xl font-display font-bold ${m.color} mb-1`}>{m.value}</div>
                            <div className="text-xs text-muted-foreground">{m.label}</div>
                        </motion.div>
                    ))}
                </div>

                {/* Charts */}
                <div className="grid lg:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-card rounded-2xl p-6 border border-border/50"
                    >
                        <h3 className="font-display font-bold text-foreground mb-1">Match Success Rate</h3>
                        <p className="text-xs text-muted-foreground mb-5">% of rides successfully matched by month</p>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={matchRates}>
                                <defs>
                                    <linearGradient id="matchGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="hsl(168, 80%, 36%)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 15%, 90%)" />
                                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                                <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: "white", border: "1px solid hsl(150, 15%, 90%)", borderRadius: 12, fontSize: 12 }}
                                    formatter={(v) => [`${v}%`, "Match Rate"]}
                                />
                                <Area type="monotone" dataKey="rate" stroke="hsl(168, 80%, 36%)" strokeWidth={2.5} fill="url(#matchGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-card rounded-2xl p-6 border border-border/50"
                    >
                        <h3 className="font-display font-bold text-foreground mb-1">Top Cities</h3>
                        <p className="text-xs text-muted-foreground mb-5">Active users by city</p>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={cityData} barSize={36}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150, 15%, 90%)" />
                                <XAxis dataKey="city" tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: "hsl(200, 10%, 45%)" }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: "white", border: "1px solid hsl(150, 15%, 90%)", borderRadius: 12, fontSize: 12 }}
                                    formatter={(v) => [v.toLocaleString(), "Users"]}
                                />
                                <Bar dataKey="users" radius={[8, 8, 0, 0]} fill="hsl(168, 80%, 36%)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </motion.div>
                </div>

                {/* Success metrics list */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                    {[
                        { label: "Match Success Rate", value: "89%", bg: "bg-emerald-light", text: "text-emerald" },
                        { label: "Avg Cost Saved / Rider", value: "$127/mo", bg: "bg-amber-light", text: "text-amber" },
                        { label: "Emissions Reduced", value: "2.1M kg CO₂", bg: "bg-secondary", text: "text-secondary-foreground" },
                        { label: "Daily Active Users", value: "12.4K", bg: "bg-primary/10", text: "text-primary" },
                        { label: "Ratings & Trust Score", value: "4.9 / 5.0", bg: "bg-amber-light", text: "text-amber" },
                        { label: "Repeat Usage Rate", value: "78%", bg: "bg-emerald-light", text: "text-emerald" },
                    ].map((item, i) => (
                        <motion.div
                            key={item.label}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.07 }}
                            className={`${item.bg} rounded-2xl p-5 flex items-center justify-between`}
                        >
                            <span className="text-sm font-medium text-foreground">{item.label}</span>
                            <span className={`text-sm font-display font-bold ${item.text}`}>{item.value}</span>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default MetricsSection;
