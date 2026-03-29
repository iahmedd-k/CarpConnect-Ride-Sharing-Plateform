import { useMemo, useState } from "react";
import { Star, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../lib/api";

export const RateRideModal = ({ booking, targetUser, subjectLabel = "ride partner", onClose, onSuccess }: any) => {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const resolvedTargetUser = useMemo(() => {
        if (targetUser) return targetUser;
        return booking?.driver || booking?.rider || null;
    }, [booking, targetUser]);

    const availableTags = ["Smooth Ride", "On Time", "Clean Car", "Great Chat"];

    const toggleTag = (tag: string) => {
        setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) return alert("Please select a rating.");
        
        setSubmitting(true);
        try {
            await api.post("/reviews", {
                bookingId: booking._id,
                userId: resolvedTargetUser?._id || resolvedTargetUser,
                rating,
                comment,
                tags
            });
            onSuccess();
        } catch (err: any) {
            console.error("Failed to submit review:", err);
            alert(err.response?.data?.message || "Failed to submit review.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md border border-border/50 rounded-3xl p-6 shadow-xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted/50 transition-colors">
                    <X className="w-5 h-5 text-muted-foreground" />
                </button>
                <h3 className="text-xl font-display font-bold mb-2">Rate your journey</h3>
                <p className="text-sm text-muted-foreground mb-6">How was your {subjectLabel} with {resolvedTargetUser?.name || "your ride partner"}?</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex justify-center gap-2 mb-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                type="button"
                                key={star}
                                className={`p-2 transition-transform ${star <= (hover || rating) ? "scale-110" : "scale-100"}`}
                                onMouseEnter={() => setHover(star)}
                                onMouseLeave={() => setHover(rating)}
                                onClick={() => setRating(star)}
                            >
                                <Star 
                                    className={`w-10 h-10 ${star <= (hover || rating) ? "fill-amber-500 text-amber-500 shadow-glow" : "text-muted-foreground opacity-30 fill-transparent"}`} 
                                 />
                            </button>
                        ))}
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Add Compliments</label>
                        <div className="flex flex-wrap gap-2">
                            {availableTags.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleTag(tag)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                        tags.includes(tag) 
                                        ? "bg-primary/10 border-primary text-primary" 
                                        : "bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/50"
                                    }`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <textarea
                            placeholder="Share some optional feedback..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm focus:border-primary outline-none transition-all resize-none h-24"
                        />
                    </div>

                    <Button type="submit" disabled={submitting || rating === 0} className="w-full bg-gradient-primary text-white h-12 rounded-xl font-bold shadow-glow">
                        {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Review"}
                    </Button>
                </form>
            </div>
        </div>
    );
};
