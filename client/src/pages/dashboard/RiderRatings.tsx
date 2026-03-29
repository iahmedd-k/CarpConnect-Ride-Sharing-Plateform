import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Star, MessageSquareQuote, BadgeCheck, Leaf } from "lucide-react";
import api from "../../lib/api";

const RiderRatings = () => {
    const [loading, setLoading] = useState(true);
    const [received, setReceived] = useState<any[]>([]);
    const [given, setGiven] = useState<any[]>([]);
    const [userData, setUserData] = useState<any>(null);

    useEffect(() => {
        const bootstrap = async () => {
            try {
                const [historyRes, meRes] = await Promise.all([
                    api.get("/reviews/history"),
                    api.get("/auth/me").catch(() => ({ data: { success: false, data: { user: null } } }))
                ]);

                setReceived(historyRes.data?.data?.received || []);
                setGiven(historyRes.data?.data?.given || []);

                const refreshedUser = meRes.data?.data?.user || null;
                if (refreshedUser) {
                    setUserData(refreshedUser);
                    localStorage.setItem("carpconnect_user", JSON.stringify(refreshedUser));
                }
            } catch (err) {
                console.error("Failed to load rider ratings:", err);
            } finally {
                setLoading(false);
            }
        };

        bootstrap();
    }, []);

    const complimentCounts = useMemo(() => {
        const counts: Record<string, number> = {
            punctual: 0,
            friendly: 0,
            reliable: 0,
            eco: 0,
        };
        received.forEach((review) => {
            const tags = Array.isArray(review.tags) ? review.tags.map((tag: string) => String(tag).toLowerCase()) : [];
            if (tags.some((tag: string) => tag.includes("time") || tag.includes("punctual"))) counts.punctual += 1;
            if (tags.some((tag: string) => tag.includes("friendly") || tag.includes("polite"))) counts.friendly += 1;
            if (tags.some((tag: string) => tag.includes("reliable") || tag.includes("smooth"))) counts.reliable += 1;
            if (Number(review.emissionsContext?.estimatedSavings || 0) > 0) counts.eco += 1;
        });
        return counts;
    }, [received]);

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    const averageRating = Number(userData?.ratings?.average || 0);
    const totalReviews = Number(userData?.ratings?.count || received.length || 0);

    const receivedPreview = received.slice(0, 4);
    const givenPreview = given.slice(0, 4);

    return (
        <div className="max-w-5xl mx-auto space-y-3">
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm flex flex-col items-center justify-center text-center"
                >
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
                        <Star className="w-8 h-8 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="text-4xl font-semibold text-foreground">{averageRating.toFixed(1)}</div>
                    <p className="text-sm text-muted-foreground mt-2">{totalReviews} reviews</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm"
                >
                    <h3 className="text-lg font-semibold mb-4">Rider Reputation</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[
                            { label: "On Time", value: complimentCounts.punctual, icon: BadgeCheck },
                            { label: "Friendly", value: complimentCounts.friendly, icon: MessageSquareQuote },
                            { label: "Reliable", value: complimentCounts.reliable, icon: BadgeCheck },
                            { label: "Eco Trips", value: complimentCounts.eco, icon: Leaf },
                        ].map((item) => (
                            <div key={item.label} className="rounded-2xl border border-border/50 bg-muted/20 p-3">
                                <item.icon className="w-5 h-5 text-primary mb-3" />
                                <div className="text-2xl font-semibold text-foreground">{item.value}</div>
                                <div className="text-sm text-muted-foreground">{item.label}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Reviews You Received</h3>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{received.length} total</span>
                    </div>
                    <div className="space-y-3">
                        {receivedPreview.length > 0 ? receivedPreview.map((rev) => (
                            <div key={rev._id} className="rounded-2xl border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">{rev.from?.name || "Driver"}</div>
                                        <div className="flex gap-1 mt-1 text-amber-500">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className={`w-3 h-3 ${star <= rev.rating ? "fill-current" : "opacity-30"}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                                        {new Date(rev.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                {rev.comment ? <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{rev.comment}</p> : null}
                            </div>
                        )) : (
                            <div className="text-center py-8 text-muted-foreground italic">No driver reviews yet.</div>
                        )}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Reviews You Gave</h3>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{given.length} total</span>
                    </div>
                    <div className="space-y-3">
                        {givenPreview.length > 0 ? givenPreview.map((rev) => (
                            <div key={rev._id} className="rounded-2xl border border-border/50 bg-muted/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">{rev.to?.name || "Driver"}</div>
                                        <div className="flex gap-1 mt-1 text-amber-500">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <Star key={star} className={`w-3 h-3 ${star <= rev.rating ? "fill-current" : "opacity-30"}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                                        {new Date(rev.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                {rev.comment ? <p className="mt-2 text-sm text-foreground/80 line-clamp-3">{rev.comment}</p> : null}
                            </div>
                        )) : (
                            <div className="text-center py-8 text-muted-foreground italic">You have not submitted any reviews yet.</div>
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default RiderRatings;
