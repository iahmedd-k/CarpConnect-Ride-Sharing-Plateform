import { motion } from "framer-motion";
import { Car, Leaf, Star, Users, Shield, Zap, MapPin, TrendingUp, Award, Clock } from "lucide-react";

const items = [
    { icon: Car, text: "50,000+ Active Riders" },
    { icon: Leaf, text: "2.1M kg CO₂ Saved" },
    { icon: Star, text: "4.9★ Average Rating" },
    { icon: Users, text: "Verified Community" },
    { icon: Shield, text: "Safety First" },
    { icon: Zap, text: "Instant Match AI" },
    { icon: MapPin, text: "25+ Cities" },
    { icon: TrendingUp, text: "68% Cost Savings" },
    { icon: Award, text: "#1 Carpool App" },
    { icon: Clock, text: "5-Min Avg Match Time" },
];

// Duplicate for seamless loop
const allItems = [...items, ...items];

const InfiniteMarquee = () => {
    return (
        <section className="py-8 bg-gradient-dark overflow-hidden border-y border-white/5">
            <div className="relative flex">
                <motion.div
                    className="flex gap-8 shrink-0"
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                >
                    {allItems.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-3 px-6 py-3 rounded-full bg-white/5 border border-white/10 shrink-0"
                        >
                            <item.icon className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-sm font-medium text-primary-foreground/70 whitespace-nowrap">{item.text}</span>
                        </div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default InfiniteMarquee;
