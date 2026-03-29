import { motion } from "framer-motion";
import { Route, Leaf, MessageSquare, Shield, Wallet, Clock, Star, Zap } from "lucide-react";
import ecoCity from "@/assets/eco-city.jpg";

const features = [
  { icon: Route, title: "Smart Route Matching", desc: "AI-powered matching based on routes, timing, and preferences for the most efficient carpools.", accent: true },
  { icon: Leaf, title: "Carbon Tracking", desc: "See your environmental impact with real-time CO₂ savings per ride." },
  { icon: MessageSquare, title: "In-Ride Chat", desc: "Coordinate pickups, share ETA, and chat with your carpool group in real-time." },
  { icon: Shield, title: "Safety First", desc: "Verified IDs, trip sharing, live tracking, and community ratings for every ride." },
  { icon: Wallet, title: "Split Fare Engine", desc: "Automated, transparent fare splitting. Everyone pays their fair share." },
  { icon: Clock, title: "Flexible Scheduling", desc: "Ride now, schedule ahead, or set up recurring commuter routes." },
  { icon: Star, title: "Trust Signals", desc: "Ratings, reviews, and verification badges to build community trust." },
  { icon: Zap, title: "Multi-Stop Routes", desc: "Riders can join segments of longer routes. Drivers get optimized stop suggestions." },
];

const Features = () => {
  return (
    <section id="features" className="py-24 md:py-32 overflow-hidden">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Image Side */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
          >
            <div className="relative rounded-3xl overflow-hidden shadow-xl">
              <img src={ecoCity} alt="Sustainable city with electric cars" className="w-full h-auto" />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 to-transparent" />
            </div>
            {/* Floating card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -right-6 bg-card rounded-2xl p-5 shadow-xl border border-border/50 max-w-[220px]"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-emerald-light flex items-center justify-center">
                  <Leaf className="w-4 h-4 text-emerald" />
                </div>
                <span className="text-sm font-semibold text-foreground">This Month</span>
              </div>
              <div className="text-2xl font-display font-bold text-foreground">127 kg</div>
              <div className="text-xs text-muted-foreground">CO₂ emissions saved</div>
            </motion.div>
          </motion.div>

          {/* Features Grid */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
                Features
              </span>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Everything you need for <span className="text-gradient-primary">smarter rides</span>
              </h2>
            </motion.div>

            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 cursor-default ${
                    feature.accent
                      ? "bg-gradient-primary border-primary/20 shadow-glow"
                      : "bg-card border-border/50 hover:shadow-card"
                  }`}
                >
                  <feature.icon className={`w-5 h-5 mb-3 ${feature.accent ? "text-primary-foreground" : "text-primary"}`} />
                  <h3 className={`text-sm font-display font-bold mb-1.5 ${feature.accent ? "text-primary-foreground" : "text-foreground"}`}>
                    {feature.title}
                  </h3>
                  <p className={`text-xs leading-relaxed ${feature.accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {feature.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
