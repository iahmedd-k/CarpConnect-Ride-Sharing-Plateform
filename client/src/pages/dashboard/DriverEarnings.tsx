import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Calendar, CreditCard, Download, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../lib/api";
import { toast } from "sonner";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

const DriverEarnings = () => {
    const [loading, setLoading] = useState(true);
    const [earnings, setEarnings] = useState<any>(null);
    const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week" | "month">("all");
    const [usage, setUsage] = useState<any>(null);

    useEffect(() => {
        fetchEarnings();
    }, [timeFilter]);

    const fetchEarnings = async () => {
        try {
            setLoading(true);
            let url = "/bookings/summary/earnings";
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

            const [summaryRes, meRes] = await Promise.all([
                api.get(url),
                api.get("/auth/me").catch(() => ({ data: { success: false, data: {} } })),
            ]);

            setEarnings(summaryRes.data.data?.summary || {});
            setUsage(meRes.data?.data?.usage || null);
        } catch (err) {
            console.error("Failed to fetch earnings:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    const currentPlan = currentPlanFromStorage();
    const canUseDetailed = hasPlanAtLeast(currentPlan, "plus");

    const data = earnings || { totalBalance: 0, totalRides: 0, transactions: [], totalEarnings: 0, platformFees: 0, averagePerRide: 0 };

    const exportTransactions = () => {
        if (!data.transactions?.length) {
            toast.info("No earnings to export");
            return;
        }

        const rows = data.transactions.map((trx: any) => ({
            date: new Date(trx.date).toISOString(),
            rider: trx.riderName || "",
            status: trx.status || "",
            amount: trx.amount || 0,
            currency: trx.currency || "PKR"
        }));

        const header = Object.keys(rows[0]).join(",");
        const csv = [
            header,
            ...rows.map((r: any) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `driver-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Earnings exported");
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header & Filter */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-2xl font-display font-bold text-foreground">Earnings</h2>
                <div className="flex items-center gap-3 flex-wrap">
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
                    <Button onClick={exportTransactions} variant="outline" className="gap-2" disabled={!canUseDetailed}>
                        <Download className="w-4 h-4" /> Export
                    </Button>
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
                    <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                            <Wallet className="w-6 h-6 text-white" />
                        </div>
                        <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md">Net Balance</span>
                    </div>
                    <div className="relative z-10">
                        <div className="text-4xl font-display font-black mb-1">PKR {data.totalBalance.toLocaleString()}</div>
                        <div className="text-emerald-100 text-xs font-medium">Platform Fee (10%): PKR {(data.platformFees || 0).toLocaleString()}</div>
                    </div>

                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1 capitalize">
                            <Calendar className="w-3 h-3" /> {timeFilter}
                        </span>
                    </div>
                    <div>
                        <div className="text-3xl font-display font-black text-foreground mb-1">{data.totalRides}</div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Completed Rides</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <span className="text-xs text-muted-foreground font-semibold">Payout Summary</span>
                    </div>
                    <div>
                        <div className="text-lg font-bold text-foreground mb-1">Gross PKR {Number(data.totalEarnings || 0).toLocaleString()}</div>
                        <div className="flex items-center gap-2 text-sm text-emerald">
                            <span className="flex items-center gap-1 text-xs font-bold"><CheckCircleIcon className="w-3 h-3" /> Avg PKR {Number(data.averagePerRide || 0).toFixed(0)} / ride</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm"
            >
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                        <h3 className="font-display font-bold text-xl">Subscription Usage Limits</h3>
                        <p className="text-xs text-muted-foreground">Monthly platform usage by your active plan</p>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary">
                        {usage?.monthKey || "Current Month"}
                    </span>
                </div>

                <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-2xl border border-border/50 p-4 bg-muted/20">
                        <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Ride Offers</p>
                        <p className="text-base font-bold text-foreground">{usage?.rideOffersUsed || 0} / {usage?.rideOffersLimit ?? "—"}</p>
                        <p className="text-muted-foreground mt-1">{usage?.rideOffersRemaining ?? 0} remaining</p>
                    </div>
                    <div className="rounded-2xl border border-border/50 p-4 bg-muted/20">
                        <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Bookings</p>
                        <p className="text-base font-bold text-foreground">{usage?.bookingsUsed || 0} / {usage?.bookingsLimit ?? "—"}</p>
                        <p className="text-muted-foreground mt-1">{usage?.bookingsRemaining ?? 0} remaining</p>
                    </div>
                    <div className="rounded-2xl border border-border/50 p-4 bg-muted/20">
                        <p className="font-bold text-muted-foreground uppercase tracking-wider mb-1">Ride Requests</p>
                        <p className="text-base font-bold text-foreground">{usage?.rideRequestsUsed || 0} / {usage?.rideRequestsLimit ?? "—"}</p>
                        <p className="text-muted-foreground mt-1">{usage?.rideRequestsRemaining ?? 0} remaining</p>
                    </div>
                </div>
            </motion.div>

            {/* Transactions Table */}
            {canUseDetailed ? (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card border border-border/50 rounded-3xl overflow-hidden shadow-sm flex flex-col"
            >
                <div className="p-6 border-b border-border/50">
                    <h3 className="font-display font-bold text-xl">Recent Earnings</h3>
                    <p className="text-xs text-muted-foreground">History of completed rides and fares.</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border/50 bg-muted/20">
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Status</th>
                                <th className="p-4 text-xs font-bold uppercase tracking-wider text-muted-foreground text-right">Net Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.transactions.length > 0 ? data.transactions.map((trx: any, i: number) => (
                                <tr key={i} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                                    <td className="p-4">
                                        <div className="text-sm font-semibold">{new Date(trx.date).toLocaleDateString()}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase">{trx.riderName} • {new Date(trx.date).toLocaleTimeString()}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald/10 text-emerald">
                                            {trx.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <span className="text-sm font-bold text-emerald">
                                            +PKR {trx.amount.toLocaleString()}
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} className="p-10 text-center text-muted-foreground italic text-sm">No transactions found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
            ) : (
            <div className="bg-card border border-amber-300/60 rounded-3xl p-6 shadow-sm">
                <h3 className="font-display font-bold text-xl flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    Detailed Earnings Ledger (Locked)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                    Transaction-level earnings history and export are available on Plus and Pro.
                </p>
                <Button className="mt-4 bg-primary text-white" onClick={() => (window.location.href = "/driver-dashboard?tab=subscription")}>
                    Upgrade to Plus
                </Button>
            </div>
            )}
        </div>
    );
};

const CheckCircleIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
);

export default DriverEarnings;
