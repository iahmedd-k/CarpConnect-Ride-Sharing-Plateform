import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, MapPin, Car, Shield, MessageSquare, Calendar, Award, Leaf, ArrowLeft, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import LeafletMap from "@/components/LeafletMap";
import api from "../../lib/api";
import { toast } from "sonner";

interface DriverProfileProps {
    driverId: string;
    onBack: () => void;
}

const DriverProfile = ({ driverId, onBack }: DriverProfileProps) => {
    const [loading, setLoading] = useState(true);
    const [driver, setDriver] = useState<any>(null);
    const [reviews, setReviews] = useState<any[]>([]);
    const [completedRides, setCompletedRides] = useState<any[]>([]);

    useEffect(() => {
        fetchProfile();
    }, [driverId]);

    const fetchProfile = async () => {
        try {
            const [userRes, reviewsRes] = await Promise.all([
                api.get(`/users/${driverId}/profile`).catch(() => null),
                api.get(`/reviews/user/${driverId}`).catch(() => ({ data: { data: { reviews: [] } } })),
            ]);

            if (userRes?.data?.data?.user) {
                setDriver(userRes.data.data.user);
                setCompletedRides(userRes.data.data.recentRides || []);
            }
            setReviews(reviewsRes?.data?.data?.reviews || []);
        } catch (err) {
            console.error("Failed to fetch driver profile:", err);
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

    if (!driver) {
        return (
            <div className="text-center py-20">
                <p className="text-muted-foreground">Driver profile not found.</p>
                <Button onClick={onBack} variant="outline" className="mt-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
                </Button>
            </div>
        );
    }

    const rideRouteCoords: [number, number][][] = completedRides
        .filter((r: any) => r.origin?.point?.coordinates && r.destination?.point?.coordinates)
        .map((r: any) => [
            [r.origin.point.coordinates[1], r.origin.point.coordinates[0]],
            [r.destination.point.coordinates[1], r.destination.point.coordinates[0]],
        ]);

    // Build map markers from completed ride origins/destinations
    const mapMarkers = completedRides
        .filter((r: any) => r.origin?.point?.coordinates)
        .flatMap((r: any) => [
            { lat: r.origin.point.coordinates[1], lng: r.origin.point.coordinates[0], label: "Frequent pickup", color: "#10b981" },
            ...(r.destination?.point?.coordinates ? [{ lat: r.destination.point.coordinates[1], lng: r.destination.point.coordinates[0], label: "Frequent dropoff", color: "#f59e0b" }] : []),
        ]);

    const stats = [
        { icon: Car, label: "Total Rides", value: driver.totalCompletedRides || completedRides.length || 0, color: "text-primary" },
        { icon: Star, label: "Rating", value: `${driver.ratings?.average?.toFixed(1) || 0}★`, color: "text-amber-500" },
        { icon: Award, label: "Reviews", value: reviews.length, color: "text-emerald" },
        { icon: Leaf, label: "CO₂ Saved", value: `${driver.totalCo2SavedKg?.toFixed(0) || 0} kg`, color: "text-emerald" },
    ];

    const handleMessageClick = () => {
        toast.info("Open Messages from dashboard", {
            description: "Chat is available when you and this driver share a booking.",
        });
        onBack();
    };

    const handleContactClick = () => {
        if (driver?.phone) {
            window.location.href = `tel:${driver.phone}`;
            return;
        }
        toast.info("Phone number unavailable", {
            description: "This driver has not shared a contact number.",
        });
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Back button */}
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to search
            </button>

            {/* Profile Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-3xl p-8 border border-border/50 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-primary flex items-center justify-center text-white text-3xl font-bold shadow-glow overflow-hidden">
                        {driver.profilePhoto || driver.avatar
                            ? <img src={driver.profilePhoto || driver.avatar} className="w-full h-full object-cover" alt="Driver" />
                            : driver.name?.[0]?.toUpperCase() || "D"
                        }
                    </div>
                    <div className="flex-1 space-y-2">
                        <h2 className="text-3xl font-display font-bold text-foreground">{driver.name}</h2>
                        <div className="flex flex-wrap gap-2">
                            {driver.verified && (
                                <span className="px-3 py-1 rounded-full bg-emerald/10 text-emerald text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Shield className="w-3 h-3" /> Verified
                                </span>
                            )}
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                                {driver.role}
                            </span>
                            {driver.vehicle?.make && (
                                <span className="px-3 py-1 rounded-full bg-muted text-foreground text-xs font-semibold flex items-center gap-1">
                                    <Car className="w-3 h-3" /> {driver.vehicle.make} {driver.vehicle.model}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Member since {driver.joinedAt ? new Date(driver.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button onClick={handleMessageClick} variant="outline" className="rounded-xl gap-2">
                            <MessageSquare className="w-4 h-4" /> Message
                        </Button>
                        <Button onClick={handleContactClick} className="bg-gradient-primary text-white rounded-xl shadow-glow gap-2">
                            <Phone className="w-4 h-4" /> Contact
                        </Button>
                    </div>
                </div>
            </motion.div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-card rounded-2xl p-5 border border-border/50"
                    >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                        <div className={`text-2xl font-display font-bold ${stat.color} mb-0.5`}>{stat.value}</div>
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                    </motion.div>
                ))}
            </div>

            {/* Map + Reviews */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Map of recent routes */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-card rounded-2xl border border-border/50 overflow-hidden"
                >
                    <div className="p-4 border-b border-border">
                        <h3 className="font-display font-bold">Frequent Routes</h3>
                        <p className="text-xs text-muted-foreground">Recent ride origins & destinations</p>
                    </div>
                    <div className="h-[300px]">
                        <LeafletMap markers={mapMarkers} zoom={11} />
                    </div>
                </motion.div>

                {/* Reviews */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-card rounded-2xl border border-border/50 overflow-hidden"
                >
                    <div className="p-4 border-b border-border flex items-center justify-between">
                        <div>
                            <h3 className="font-display font-bold">Reviews</h3>
                            <p className="text-xs text-muted-foreground">{reviews.length} reviews</p>
                        </div>
                        <div className="flex items-center gap-1 text-amber-500">
                            <Star className="w-5 h-5 fill-amber-500" />
                            <span className="font-display font-bold text-lg">{driver.ratings?.average?.toFixed(1) || 0}</span>
                        </div>
                    </div>
                    <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {reviews.length > 0 ? reviews.map((review) => (
                            <div key={review._id} className="flex gap-4 p-3 rounded-xl bg-muted/20 border border-border/50">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                                    {review.from?.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-semibold">{review.from?.name || 'User'}</span>
                                        <div className="flex items-center gap-0.5">
                                            {[1, 2, 3, 4, 5].map(s => (
                                                <Star key={s} className={`w-3 h-3 ${s <= review.rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`} />
                                            ))}
                                        </div>
                                    </div>
                                    {review.comment && <p className="text-xs text-muted-foreground line-clamp-2">{review.comment}</p>}
                                    <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(review.createdAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center text-muted-foreground text-sm py-8">No reviews yet</p>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Vehicle Details */}
            {driver.vehicle && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-card rounded-2xl p-6 border border-border/50"
                >
                    <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                        <Car className="w-5 h-5 text-primary" /> Vehicle Details
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: "Make", value: driver.vehicle.make || "—" },
                            { label: "Model", value: driver.vehicle.model || "—" },
                            { label: "Year", value: driver.vehicle.year || "—" },
                            { label: "Plate", value: driver.vehicle.plateNumber || "—" },
                            { label: "Fuel", value: driver.vehicle.fuelType || "Petrol" },
                        ].map((item) => (
                            <div key={item.label} className="text-center p-3 rounded-xl bg-muted/20 border border-border/50">
                                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">{item.label}</div>
                                <div className="text-sm font-bold text-foreground">{item.value}</div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default DriverProfile;
