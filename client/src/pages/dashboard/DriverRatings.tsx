import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, Loader2, TrendingUp, Award } from "lucide-react";
import api from "../../lib/api";

const BADGES = [
  { emoji: "🛣️", label: "Smooth Ride",  key: "smooth ride",  gradient: "from-emerald-500/15 to-teal-500/10",    border: "border-emerald-500/20", accent: "text-emerald-500",  dot: "bg-emerald-500" },
  { emoji: "⏱️", label: "On Time",      key: "on time",       gradient: "from-blue-500/15 to-indigo-500/10",     border: "border-blue-500/20",    accent: "text-blue-500",     dot: "bg-blue-500" },
  { emoji: "✨", label: "Clean Car",    key: "clean car",     gradient: "from-amber-500/15 to-orange-500/10",   border: "border-amber-500/20",   accent: "text-amber-500",    dot: "bg-amber-500" },
  { emoji: "💬", label: "Great Chat",   key: "great chat",    gradient: "from-violet-500/15 to-purple-500/10",  border: "border-violet-500/20",  accent: "text-violet-500",   dot: "bg-violet-500" },
];

const StarRow = ({ rating, size = 14 }: { rating: number; size?: number }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(s => (
      <Star
        key={s}
        width={size}
        height={size}
        className={s <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-300 fill-gray-200 dark:text-gray-600 dark:fill-gray-700"}
      />
    ))}
  </div>
);

const Avatar = ({ user }: { user: any }) => {
  const initials = user?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500", "bg-amber-500"];
  const color = colors[(initials.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden ring-2 ring-white dark:ring-gray-800`}>
      {user?.avatar
        ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
        : initials}
    </div>
  );
};

const RatingBar = ({ label, count, total }: { label: string; count: number; total: number }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="text-muted-foreground w-3 font-medium">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          className="h-full bg-amber-400 rounded-full"
        />
      </div>
      <span className="text-muted-foreground w-5 text-right">{count}</span>
    </div>
  );
};

const DriverRatings = () => {
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("carpconnect_user") || "{}");
    setUserData(user);
    if (user._id) fetchData(user._id);
  }, []);

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      const [reviewsRes, profileRes] = await Promise.all([
        api.get(`/reviews/user/${userId}`),
        api.get("/auth/me"),
      ]);
      if (reviewsRes.data.success) setReviews(reviewsRes.data.data.reviews || []);
      if (profileRes.data.success) {
        const u = profileRes.data.data.user;
        setUserData(u);
        localStorage.setItem("carpconnect_user", JSON.stringify(u));
      }
    } catch (err) {
      console.error("Failed to fetch ratings data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <Loader2 className="w-7 h-7 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground font-medium">Loading your ratings…</p>
    </div>
  );

  const avg = userData?.ratings?.average || 0;
  const total = userData?.ratings?.count || 0;

  // Build star distribution
  const starDist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) starDist[Math.round(r.rating)]++; });

  const badgeCounts = BADGES.map(b => ({
    ...b,
    count: reviews.reduce((acc, r) => {
      const tags = (r.tags || []).map((t: string) => t.toLowerCase());
      return acc + (tags.includes(b.key) ? 1 : 0);
    }, 0),
  }));

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } } };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-4 pb-24"
    >
      {/* ── Header ── */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Your Ratings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Based on {total} completed ride{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-full px-3 py-1.5">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{avg.toFixed(1)}</span>
        </div>
      </motion.div>

      {/* ── Score Card ── */}
      <motion.div
        variants={item}
        className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm"
      >
        <div className="p-5">
          <div className="flex items-center gap-5">
            {/* Big Score */}
            <div className="flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/5 border border-amber-100 dark:border-amber-500/20 rounded-2xl w-24 h-24 shrink-0">
              <span className="text-4xl font-black text-foreground leading-none">{avg.toFixed(1)}</span>
              <div className="flex gap-0.5 mt-1.5">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} width={9} height={9} className={s <= Math.round(avg) ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium mt-1">{total} reviews</span>
            </div>

            {/* Bar Distribution */}
            <div className="flex-1 space-y-1.5 min-w-0">
              {[5, 4, 3, 2, 1].map(s => (
                <RatingBar key={s} label={String(s)} count={starDist[s]} total={total} />
              ))}
            </div>
          </div>
        </div>

        {/* Divider + trend hint */}
        <div className="border-t border-border/50 px-5 py-3 flex items-center gap-2 bg-muted/30">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {avg >= 4.7 ? "Exceptional — you're in the top tier of drivers." : avg >= 4.0 ? "Great standing. Keep up the consistent service." : "Room to grow. Focus on punctuality and comfort."}
          </p>
        </div>
      </motion.div>

      {/* ── Compliment Badges ── */}
      <motion.div variants={item} className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-foreground">Compliments from Riders</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {badgeCounts.map(b => (
            <div
              key={b.label}
              className={`relative bg-gradient-to-br ${b.gradient} border ${b.border} rounded-2xl p-3.5 flex flex-col items-center text-center gap-1.5`}
            >
              <span className="text-2xl leading-none">{b.emoji}</span>
              <span className={`text-[10px] font-bold uppercase tracking-wide ${b.accent}`}>{b.label}</span>
              <span className="text-xl font-black text-foreground leading-none">{b.count}</span>
              {b.count > 0 && (
                <span className={`absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full ${b.dot}`} />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Reviews ── */}
      <motion.div variants={item} className="bg-card border border-border/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-border/50 flex items-center justify-between">
          <h2 className="font-bold text-sm text-foreground">Recent Reviews</h2>
          {reviews.length > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{reviews.length}</span>
          )}
        </div>

        {reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-2xl">⭐</div>
            <p className="text-sm font-semibold text-foreground">No reviews yet</p>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">Complete more rides to start collecting rider feedback.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {reviews.map((rev, idx) => (
              <motion.div
                key={rev._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + idx * 0.05 }}
                className="px-5 py-4 flex gap-3"
              >
                <Avatar user={rev.from} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{rev.from?.name || "Rider"}</p>
                      <StarRow rating={rev.rating} size={11} />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0 mt-0.5">
                      {new Date(rev.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {rev.comment && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mt-1 mb-2">
                      "{rev.comment}"
                    </p>
                  )}
                  {rev.tags && rev.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rev.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15 uppercase tracking-wide"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default DriverRatings;