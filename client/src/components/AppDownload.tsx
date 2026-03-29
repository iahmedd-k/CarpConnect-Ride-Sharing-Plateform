import { motion } from "framer-motion";
import { Smartphone, ArrowRight, Star, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const AppDownload = () => {
    return (
        <section className="py-24 md:py-32 bg-gradient-dark overflow-hidden relative">
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />

            <div className="container relative z-10">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                        <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wider uppercase mb-6">
                            Mobile App
                        </span>
                        <h2 className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-6">
                            Your commute,{" "}
                            <span className="text-gradient-primary">in your pocket</span>
                        </h2>
                        <p className="text-primary-foreground/60 text-lg leading-relaxed mb-10">
                            Download the CarpConnect app for real-time matching, live tracking, in-app payments, and your personal carbon dashboard — all on the go.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 mb-10">
                            {[
                                { store: "App Store", sub: "Download on the", icon: "🍎" },
                                { store: "Google Play", sub: "Get it on", icon: "▶" },
                            ].map((app) => (
                                <motion.button
                                    key={app.store}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15 transition-all text-left"
                                >
                                    <span className="text-2xl">{app.icon}</span>
                                    <div>
                                        <div className="text-xs text-primary-foreground/50">{app.sub}</div>
                                        <div className="text-base font-display font-bold text-primary-foreground">{app.store}</div>
                                    </div>
                                </motion.button>
                            ))}
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className="w-4 h-4 fill-amber text-amber" />
                                ))}
                                <span className="text-sm text-primary-foreground/60 ml-2">4.9 (18K+ reviews)</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-primary-foreground/60">
                                <Download className="w-4 h-4" />
                                500K+ Downloads
                            </div>
                        </div>
                    </motion.div>

                    {/* Phone mockup */}
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7 }}
                        className="flex justify-center"
                    >
                        <div className="relative">
                            {/* Phone shell */}
                            <motion.div
                                animate={{ y: [0, -12, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="relative w-64 h-[520px] rounded-[3rem] bg-foreground border-4 border-white/20 shadow-2xl overflow-hidden"
                            >
                                {/* Screen */}
                                <div className="absolute inset-2 rounded-[2.5rem] bg-gradient-dark overflow-hidden">
                                    {/* Status bar */}
                                    <div className="flex items-center justify-between px-6 pt-4 pb-2">
                                        <span className="text-[10px] text-white/50">9:41 AM</span>
                                        <div className="flex items-center gap-1">
                                            <div className="w-4 h-2 border border-white/40 rounded-sm"><div className="h-full w-3/4 bg-primary rounded-sm" /></div>
                                        </div>
                                    </div>
                                    {/* App header */}
                                    <div className="px-5 py-3">
                                        <div className="text-xs text-white/40 mb-1">Good evening</div>
                                        <div className="text-lg font-display font-bold text-white">Find Your Ride 🚗</div>
                                    </div>

                                    {/* Search box */}
                                    <div className="mx-4 mb-3 p-3 rounded-2xl bg-white/10 border border-white/10 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-primary" /></div>
                                        <span className="text-xs text-white/60">Where to today?</span>
                                    </div>

                                    {/* Ride cards */}
                                    <div className="px-4 space-y-2">
                                        {["Downtown SF", "Airport T2", "Golden Gate"].map((dest, i) => (
                                            <motion.div
                                                key={dest}
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: 0.5 + i * 0.15 }}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                                                    <Smartphone className="w-3 h-3 text-white" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-xs font-medium text-white">{dest}</div>
                                                    <div className="text-[10px] text-white/40">{3 - i} seats · {8 + i * 3} min</div>
                                                </div>
                                                <div className="text-[10px] text-primary font-medium">${(2 + i * 1.5).toFixed(2)}</div>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Bottom nav */}
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-around px-6">
                                        {["🏠", "🗺️", "💬", "👤"].map((icon, i) => (
                                            <div key={i} className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${i === 0 ? "bg-primary/20" : ""}`}>{icon}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* Notch */}
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 w-24 h-6 bg-foreground rounded-full" />
                            </motion.div>

                            {/* Floating badges */}
                            <motion.div
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                                className="absolute -right-8 top-20 glass-dark rounded-2xl px-4 py-3 border border-white/10"
                            >
                                <div className="text-lg font-bold text-white">4.9★</div>
                                <div className="text-[10px] text-white/50">App Store</div>
                            </motion.div>

                            <motion.div
                                animate={{ y: [0, 8, 0] }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                className="absolute -left-10 bottom-32 glass-dark rounded-2xl px-4 py-3 border border-white/10"
                            >
                                <div className="text-sm font-bold text-primary">500K+</div>
                                <div className="text-[10px] text-white/50">Downloads</div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default AppDownload;
