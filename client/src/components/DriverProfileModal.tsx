import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Shield, Car, Calendar, MapPin, MessageSquare, Award, ThumbsUp } from "lucide-react";
import { Button } from "./ui/button";

interface DriverProfileModalProps {
    driver: any;
    isOpen: boolean;
    onClose: () => void;
    onMessage: (driverId: string) => void;
}

export const DriverProfileModal = ({ driver, isOpen, onClose, onMessage }: DriverProfileModalProps) => {
    if (!driver) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-lg bg-card border border-border/50 rounded-3xl shadow-xl overflow-hidden"
                    >
                        {/* Header Image/Pattern */}
                        <div className="h-24 bg-gradient-primary opacity-20" />
                        
                        <button 
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full bg-background/50 backdrop-blur-md hover:bg-background/80 transition-colors z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="px-6 pb-8 -mt-12 relative">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-3xl bg-gradient-primary p-1 shadow-glow mb-4">
                                    <div className="w-full h-full rounded-[20px] bg-card overflow-hidden">
                                        {driver.profilePhoto ? (
                                            <img src={driver.profilePhoto} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary">
                                                {driver.name[0]}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <h3 className="text-2xl font-display font-bold text-foreground">{driver.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald/10 text-emerald text-[10px] font-bold uppercase tracking-wider border border-emerald/20">
                                        <Shield className="w-3 h-3" /> Verified Driver
                                    </span>
                                    {driver.ratings?.average > 4.7 && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                                            <Award className="w-3 h-3" /> Top Rated
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mt-8">
                                <div className="bg-muted/30 p-4 rounded-2xl text-center">
                                    <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
                                        <Star className="w-4 h-4 fill-current" />
                                        <span className="font-bold">{driver.ratings?.average?.toFixed(1) || "5.0"}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Rating</div>
                                </div>
                                <div className="bg-muted/30 p-4 rounded-2xl text-center">
                                    <div className="font-bold text-foreground mb-1">{driver.ratings?.count || 0}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Reviews</div>
                                </div>
                                <div className="bg-muted/30 p-4 rounded-2xl text-center">
                                    <div className="font-bold text-foreground mb-1">
                                        {new Date(driver.joinedAt).getFullYear()}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Since</div>
                                </div>
                            </div>

                            <div className="mt-8 space-y-6">
                                <div>
                                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Vehicle Details</h4>
                                    <div className="flex items-center gap-4 bg-muted/20 p-4 rounded-2xl border border-border/50">
                                        <div className="p-3 rounded-xl bg-background border border-border/50">
                                            <Car className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-foreground capitalize">{driver.vehicle?.make} {driver.vehicle?.model || 'Standard Vehicle'}</div>
                                            <div className="text-xs text-muted-foreground uppercase tracking-tighter">{driver.vehicle?.plateNumber} · {driver.vehicle?.fuelType}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <Button 
                                        onClick={() => onMessage(driver._id)}
                                        className="flex-1 h-14 rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 transition-all font-bold"
                                    >
                                        <MessageSquare className="w-5 h-5 mr-2" /> Message
                                    </Button>
                                    <Button 
                                        className="flex-1 h-14 rounded-2xl bg-gradient-primary text-white shadow-glow font-bold"
                                    >
                                        Book a Ride
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
