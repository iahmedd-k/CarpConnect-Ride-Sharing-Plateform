import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, MessageSquareQuote, ShieldCheck, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../lib/api";

const DriverRatings = () => {
    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState<any[]>([]);
    const [userData, setUserData] = useState<any>(null);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('carpconnect_user') || '{}');
        setUserData(user);
        if (user._id) {
            fetchData(user._id);
        }
    }, []);

    const fetchData = async (userId: string) => {
        setLoading(true);
        try {
            // Fetch reviews and profile in parallel
            const [reviewsRes, profileRes] = await Promise.all([
                api.get(`/reviews/user/${userId}`),
                api.get('/auth/me')
            ]);

            if (reviewsRes.data.success) {
                setReviews(reviewsRes.data.data.reviews || []);
            }
            if (profileRes.data.success) {
                const refreshedUser = profileRes.data.data.user;
                setUserData(refreshedUser);
                localStorage.setItem('carpconnect_user', JSON.stringify(refreshedUser));
            }
        } catch (err) {
            console.error("Failed to fetch ratings data:", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    const averageRating = userData?.ratings?.average || 0;
    const totalReviews = userData?.ratings?.count || 0;

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Stats Recap */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full md:w-1/3 bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-4"
                >
                    <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                        <Star className="w-10 h-10 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="text-5xl font-display font-black text-foreground">{averageRating}</div>
                    <div className="flex gap-1 text-amber-500 text-lg">
                        {[1, 2, 3, 4, 5].map(star => (
                            <Star key={star} className={star <= Math.round(averageRating) ? "fill-current" : "fill-muted opacity-30"} size={20} />
                        ))}
                    </div>
                    <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Based on {totalReviews} Reviews</p>
                </motion.div>

                {/* Badges / Honors */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="w-full md:w-2/3 bg-card border border-border/50 rounded-3xl p-6 shadow-sm flex flex-col"
                >
                    <h3 className="font-display font-bold text-xl mb-6">Driver Compliments</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
                        {(() => {
                            const badges = [
                                { emoji: "🚗", label: "Smooth Ride", color: "emerald" },
                                { emoji: "⏱️", label: "On Time", color: "primary" },
                                { emoji: "✨", label: "Clean Car", color: "blue" },
                                { emoji: "💬", label: "Great Chat", color: "purple" }
                            ];
                            
                            return badges.map(badge => {
                                const count = reviews.reduce((acc, rev) => {
                                    if (rev.tags && (rev.tags.includes(badge.label) || rev.tags.includes(badge.label.toLowerCase()))) return acc + 1;
                                    return acc;
                                }, 0);

                                return (
                                    <div key={badge.label} className={`bg-${badge.color}-500/10 border border-${badge.color}-500/20 rounded-2xl p-4 flex flex-col justify-center text-center hover:bg-${badge.color}-500/20 transition-all cursor-default`}>
                                        <span className="text-3xl mb-2">{badge.emoji}</span>
                                        <span className={`font-bold text-${badge.color}-500 text-[10px] uppercase tracking-wider mb-1`}>{badge.label}</span>
                                        <span className="font-black text-xl text-foreground">{count}</span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </motion.div>
            </div>

            {/* Individual Reviews */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-card border border-border/50 rounded-3xl p-6 shadow-sm"
            >
                <div className="flex items-center justify-between mb-8">
                    <h3 className="font-display font-bold text-xl">Recent Reviews</h3>
                </div>

                <div className="space-y-6">
                    {reviews.length > 0 ? reviews.map((rev, idx) => (
                        <div key={rev._id} className={`flex gap-4 ${idx !== reviews.length - 1 ? 'border-b border-border/50 pb-6' : ''}`}>
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-primary font-bold text-lg shrink-0 overflow-hidden">
                                {rev.from?.avatar ? <img src={rev.from.avatar} className="w-full h-full object-cover" /> : rev.from?.name?.charAt(0)}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-bold text-sm">{rev.from?.name}</div>
                                        <div className="flex gap-1 text-amber-500">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <Star key={star} className={`w-3 h-3 ${star <= rev.rating ? "fill-current" : "fill-muted opacity-30"}`} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">{new Date(rev.createdAt).toLocaleDateString()}</div>
                                </div>
                                <p className="text-sm text-foreground/80 leading-relaxed italic mb-3">
                                    "{rev.comment}"
                                </p>
                                {rev.tags && rev.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {rev.tags.map((tag: string) => (
                                            <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-tighter">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-10 opacity-50 italic">No reviews yet. Complete more rides to get feedback!</div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default DriverRatings;
