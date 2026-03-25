import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wallet, ArrowUp, ArrowDown, CreditCard, TrendingUp, Download, Plus, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from "recharts";
import api from "../../lib/api";
import { toast } from "sonner";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

const typeColors: Record<string, string> = {
    ride: "bg-primary/10 text-primary",
    refund: "bg-emerald-light text-emerald",
    topup: "bg-amber-light text-amber",
};

const isSuccessfulRidePayment = (booking: any) =>
    booking?.status === "completed" && booking?.paymentStatus === "processed";

const WalletPage = () => {
    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('carpconnect_user') || '{}');
        setUser(storedUser);
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [meRes, bookingsRes] = await Promise.all([
                api.get("/auth/me").catch(() => ({ data: { success: false, data: { user: null } } })),
                api.get("/bookings?role=rider").catch(() => ({ data: { success: false, data: { bookings: [] } } })),
            ]);
            const refreshedUser = meRes.data?.data?.user || null;
            if (refreshedUser) {
                setUser(refreshedUser);
                localStorage.setItem('carpconnect_user', JSON.stringify(refreshedUser));
            }
            if (bookingsRes.data.success) {
                setBookings(bookingsRes.data.data.bookings || []);
            }
        } catch (err) {
            console.error("Failed to fetch wallet data:", err);
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

    // Process data for UI
    const riderBookings = bookings.filter(b =>
        (b.rider?._id || b.rider || b.userId) === user?._id
    );
    const totalSpent = riderBookings
        .filter(isSuccessfulRidePayment)
        .reduce((sum, b) => sum + (b.fare?.totalAmount || 0), 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    const spentThisMonth = riderBookings
        .filter(b => new Date(b.createdAt) >= monthStart && isSuccessfulRidePayment(b))
        .reduce((sum, b) => sum + (b.fare?.totalAmount || 0), 0);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const chartSeed = monthNames.map((month) => ({ month, spent: 0, saved: 0 }));

    riderBookings.filter(isSuccessfulRidePayment).forEach((b) => {
        const amount = b.fare?.totalAmount || 0;
        const date = new Date(b.createdAt);
        if (Number.isNaN(date.getTime())) return;
        const idx = date.getMonth();
        chartSeed[idx].spent += amount;
        chartSeed[idx].saved += Math.round(amount * 0.15);
    });

    const activeMonths = chartSeed.filter((m) => m.spent > 0 || m.saved > 0);
    const chartData = activeMonths.length > 0 ? activeMonths : chartSeed.slice(new Date().getMonth() - 2 < 0 ? 0 : new Date().getMonth() - 2, new Date().getMonth() + 1);

    const weeklySpend = [1, 2, 3, 4].map((weekNum) => {
        const startDay = (weekNum - 1) * 7 + 1;
        const endDay = weekNum === 4 ? 31 : weekNum * 7;
        const amount = riderBookings
            .filter((b) => {
                const d = new Date(b.createdAt);
                const sameMonth = d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear();
                return sameMonth && d.getDate() >= startDay && d.getDate() <= endDay && isSuccessfulRidePayment(b);
            })
            .reduce((sum, b) => sum + (b.fare?.totalAmount || 0), 0);

        return { week: `W${weekNum}`, amount };
    });

    const co2ImpactKg = riderBookings.filter(isSuccessfulRidePayment).reduce((sum, b) => {
        const distanceKm = Number(b?.offer?.estimatedDistanceKm ?? 0) || 0;
        const seats = Number(b?.seatsRequested ?? 1) || 1;
        return sum + (distanceKm * 0.192 * seats);
    }, 0);

    const exportTransactions = () => {
        const successfulBookings = riderBookings.filter(isSuccessfulRidePayment);

        if (successfulBookings.length === 0) {
            toast.info("No transactions to export");
            return;
        }

        const rows = successfulBookings.map((tx) => ({
            date: new Date(tx.createdAt).toISOString(),
            from: tx.offer?.origin?.address || "",
            to: tx.offer?.destination?.address || "",
            driver: tx.driver?.name || "",
            status: tx.status || "",
            currency: tx.fare?.currency || "PKR",
            amount: tx.fare?.totalAmount || 0,
        }));

        const header = Object.keys(rows[0]).join(",");
        const csv = [
            header,
            ...rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Transactions exported");
    };

    const handleAddFunds = () => {
        fetchData();
        toast.success("Wallet refreshed");
    };

    return (
        <div className="space-y-6">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground">Wallet</h2>
                    <p className="text-sm text-muted-foreground mt-1">Manage your balance, spending, and savings</p>
                </div>
                <div className="flex gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
                    <Button onClick={exportTransactions} variant="outline" className="gap-2 w-full sm:w-auto"><Download className="w-4 h-4" /> Export</Button>
                    <Button onClick={handleAddFunds} className="bg-gradient-primary text-white shadow-glow hover:opacity-90 gap-2 w-full sm:w-auto"><Plus className="w-4 h-4" /> Refresh Wallet</Button>
                </div>
            </div>

            {/* Balance card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-primary rounded-3xl p-5 sm:p-8 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[80px]" />
                <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-white/5 rounded-full blur-[60px]" />
                <div className="relative z-10">
                    <div className="flex items-start sm:items-center justify-between mb-6 sm:mb-8 gap-3">
                        <div>
                            <p className="text-white/60 text-sm mb-1">Total Lifetime Spent</p>
                            <div className="text-2xl sm:text-4xl lg:text-5xl font-display font-bold text-white break-words">
                                {riderBookings[0]?.fare?.currency || 'PKR'} {totalSpent.toLocaleString()}
                            </div>
                        </div>
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                            <Wallet className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        {[
                            { label: "Total Spent", value: `${riderBookings[0]?.fare?.currency || 'PKR'} ${totalSpent.toLocaleString()}`, icon: ArrowDown },
                            { label: "Co2 Impact", value: `${co2ImpactKg.toFixed(1)} kg`, icon: TrendingUp },
                            { label: "This Month", value: `${riderBookings[0]?.fare?.currency || 'PKR'} ${spentThisMonth.toLocaleString()}`, icon: CreditCard },
                        ].map((item) => (
                            <div key={item.label} className="bg-white/10 rounded-2xl p-4">
                                <item.icon className="w-4 h-4 text-white/60 mb-2" />
                                <div className="text-lg font-display font-bold text-white">{item.value}</div>
                                <div className="text-xs text-white/50">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Charts */}
            {canUseDetailed ? (
            <div className="grid lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Savings vs Spend</h3>
                    <p className="text-xs text-muted-foreground mb-5">Monthly comparison</p>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="savedGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(168,80%,36%)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(168,80%,36%)" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(38,92%,55%)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(38,92%,55%)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150,15%,90%)" />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(200,10%,45%)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(200,10%,45%)" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "white", border: "1px solid hsl(150,15%,90%)", borderRadius: 12, fontSize: 12 }} />
                            <Area type="monotone" dataKey="saved" stroke="hsl(168,80%,36%)" strokeWidth={2} fill="url(#savedGrad)" name="Saved" />
                            <Area type="monotone" dataKey="spent" stroke="hsl(38,92%,55%)" strokeWidth={2} fill="url(#spentGrad)" name="Spent" />
                        </AreaChart>
                    </ResponsiveContainer>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-foreground mb-1">Weekly Spend</h3>
                    <p className="text-xs text-muted-foreground mb-5">This month by week</p>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={weeklySpend} barSize={36}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(150,15%,90%)" />
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(200,10%,45%)" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(200,10%,45%)" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "white", border: "1px solid hsl(150,15%,90%)", borderRadius: 12, fontSize: 12 }} />
                            <Bar dataKey="amount" radius={[8, 8, 0, 0]} fill="hsl(38,92%,55%)" name="Spent" />
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>
            </div>
            ) : (
            <div className="rounded-2xl border border-amber-300/60 bg-card p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                            <Lock className="w-4 h-4 text-amber-500" />
                            Detailed Spending View (Locked)
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Monthly savings vs spend charts and weekly breakdown are available on Plus and Pro.
                        </p>
                    </div>
                    <Button onClick={() => (window.location.href = "/dashboard?tab=subscription")} className="bg-primary text-white">
                        Upgrade to Plus
                    </Button>
                </div>
            </div>
            )}

            {/* Transaction History */}
            {canUseDetailed ? (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-card rounded-2xl border border-border/50 overflow-hidden"
            >
                <div className="px-6 py-5 border-b border-border text-foreground font-bold font-display">
                    Recent Trips & Transactions
                </div>
                <div className="divide-y divide-border">
                    {riderBookings.length > 0 ? riderBookings.map((tx, i) => (
                        <motion.div
                            key={tx._id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.05 }}
                            className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${typeColors.ride}`}>
                                <ArrowDown className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-foreground truncate">{tx.offer?.origin?.address.split(',')[0]} → {tx.offer?.destination?.address.split(',')[0]}</div>
                                <div className="text-[11px] text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()} · {tx.driver?.name}</div>
                            </div>
                            <div className={`text-sm font-display font-bold text-foreground`}>
                                -{tx.fare?.currency || 'PKR'} {tx.fare?.totalAmount?.toLocaleString()}
                            </div>
                        </motion.div>
                    )) : (
                        <div className="p-10 text-center text-muted-foreground italic text-sm">No transactions found.</div>
                    )}
                </div>
            </motion.div>
            ) : (
            <div className="rounded-2xl border border-border/50 bg-card p-6">
                <p className="text-sm font-semibold text-foreground">Recent Trips & Transactions</p>
                <p className="text-xs text-muted-foreground mt-1">
                    Locked on Free. Upgrade to Plus for booking history and detailed transaction tracking.
                </p>
            </div>
            )}
        </div>
    );
};

export default WalletPage;

