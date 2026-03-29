import { motion } from "framer-motion";
import { Car, Globe, Zap, TreePine, Target, TrendingUp, Users, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const goals2030 = [
    { icon: Users, value: "10M+", label: "Active Users Globally", progress: 5 },
    { icon: Globe, value: "500+", label: "Cities Covered", progress: 5 },
    { icon: Leaf, value: "100M kg", label: "CO₂ Saved Annually", progress: 2 },
    { icon: TrendingUp, value: "$2B+", label: "Rider Savings per Year", progress: 3 },
];

const pillars = [
    {
        icon: Target,
        title: "Universal Access",
        desc: "Make shared mobility available to every commuter, regardless of city, income, or tech literacy. Bridge the public transport gap.",
        color: "bg-primary/10 text-primary",
    },
    {
        icon: Leaf,
        title: "Carbon Neutral Network",
        desc: "Every ride on CarpConnect is tracked for emissions impact. Our goal: offset 100% of remaining carbon by 2030 through verified programs.",
        color: "bg-emerald-light text-emerald",
    },
    {
        icon: Zap,
        title: "AI-Powered Matching",
        desc: "Build the world's most intelligent route-matching engine — one that learns from community behavior to serve hyper-accurate suggestions.",
        color: "bg-amber-light text-amber",
    },
    {
        icon: Globe,
        title: "Global Community",
        desc: "Foster a trusted, globally-connected community of commuters who share values: efficiency, sustainability, and camaraderie.",
        color: "bg-secondary text-secondary-foreground",
    },
];

const roadmap = [
    { phase: "Phase 1", period: "2022–2023", title: "Launch & Learn", items: ["Core matching engine", "ID verification", "Basic in-app chat", "5 pilot cities"] },
    { phase: "Phase 2", period: "2024–2025", title: "Scale & Refine", items: ["AI route optimization", "CO₂ tracking", "Enterprise plans", "25+ cities"] },
    { phase: "Phase 3", period: "2026–2028", title: "Global Expansion", items: ["EV incentive partnerships", "Multimodal transport", "50+ countries", "Real-time fleet API"] },
    { phase: "Phase 4", period: "2029–2030", title: "Vision Realized", items: ["10M+ active users", "Carbon-neutral network", "Platform IPO", "Industry standard"] },
];

const Vision = () => {
    return (
        <div className="min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="pt-32 pb-24 bg-gradient-dark relative overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px]" />
                    <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
                </div>
                <div className="container relative z-10 text-center max-w-4xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wider uppercase mb-6">
                            <TreePine className="w-3 h-3" /> Our Vision
                        </span>
                        <h1 className="text-5xl md:text-7xl font-display font-bold text-primary-foreground mb-6 leading-tight">
                            A planet where no one{" "}
                            <span className="text-gradient-primary">drives alone</span>
                        </h1>
                        <p className="text-lg md:text-xl text-primary-foreground/60 leading-relaxed max-w-2xl mx-auto mb-10">
                            We envision a future where shared commuting is the default — not a novelty. Where cities are quieter, cleaner, and more connected. CarpConnect is our vehicle to get there.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link to="/signup">
                                <Button className="bg-gradient-primary text-white px-8 py-6 rounded-xl shadow-glow hover:opacity-90">
                                    Join the Movement
                                </Button>
                            </Link>
                            <Link to="/about">
                                <Button variant="outline" className="px-8 py-6 rounded-xl border-white/20 text-primary-foreground hover:bg-white/10">
                                    Learn About Us
                                </Button>
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* 2030 Goals */}
            <section className="py-24">
                <div className="container">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">2030 Goals</span>
                        <h2 className="text-4xl font-display font-bold text-foreground mb-4">
                            Ambitious targets, <span className="text-gradient-primary">backed by action</span>
                        </h2>
                    </motion.div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {goals2030.map((goal, i) => (
                            <motion.div
                                key={goal.label}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-card rounded-2xl p-8 border border-border/50 hover:shadow-card transition-shadow text-center"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                    <goal.icon className="w-6 h-6 text-primary" />
                                </div>
                                <div className="text-3xl font-display font-bold text-foreground mb-1">{goal.value}</div>
                                <div className="text-sm text-muted-foreground mb-5">{goal.label}</div>
                                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        whileInView={{ width: `${goal.progress}%` }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 1, delay: 0.3 + i * 0.1 }}
                                        className="h-full bg-gradient-primary rounded-full"
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{goal.progress}% to goal</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pillars */}
            <section className="py-24 bg-muted/30">
                <div className="container">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">Strategy</span>
                        <h2 className="text-4xl font-display font-bold text-foreground">Four pillars of our future</h2>
                    </motion.div>
                    <div className="grid md:grid-cols-2 gap-6">
                        {pillars.map((p, i) => (
                            <motion.div
                                key={p.title}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-card rounded-2xl p-8 border border-border/50 hover:shadow-card hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className={`w-14 h-14 rounded-2xl ${p.color} flex items-center justify-center mb-5`}>
                                    <p.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-display font-bold text-foreground mb-3">{p.title}</h3>
                                <p className="text-muted-foreground leading-relaxed">{p.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Roadmap */}
            <section className="py-24">
                <div className="container">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">Roadmap</span>
                        <h2 className="text-4xl font-display font-bold text-foreground mb-4">
                            The path to <span className="text-gradient-primary">2030</span>
                        </h2>
                    </motion.div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {roadmap.map((phase, i) => (
                            <motion.div
                                key={phase.phase}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className={`rounded-2xl p-6 border transition-all duration-300 ${i === 1 ? "bg-gradient-primary border-primary/20 shadow-glow" : "bg-card border-border/50 hover:shadow-card"}`}
                            >
                                <div className={`text-xs font-mono tracking-widest mb-1 ${i === 1 ? "text-white/60" : "text-primary"}`}>{phase.phase}</div>
                                <div className={`text-xs mb-3 ${i === 1 ? "text-white/50" : "text-muted-foreground"}`}>{phase.period}</div>
                                <h3 className={`text-lg font-display font-bold mb-4 ${i === 1 ? "text-white" : "text-foreground"}`}>{phase.title}</h3>
                                <ul className="space-y-2">
                                    {phase.items.map((item) => (
                                        <li key={item} className={`flex items-center gap-2 text-xs ${i === 1 ? "text-white/70" : "text-muted-foreground"}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${i === 1 ? "bg-white/60" : "bg-primary"}`} />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                                {i <= 1 && (
                                    <div className={`mt-4 px-3 py-1 rounded-full text-xs font-medium inline-block ${i === 1 ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>
                                        {i === 0 ? "✓ Complete" : "🔥 In Progress"}
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 bg-gradient-dark">
                <div className="container text-center">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
                        <div className="w-16 h-16 rounded-3xl bg-primary/20 flex items-center justify-center mx-auto mb-6">
                            <Car className="w-7 h-7 text-primary" />
                        </div>
                        <h2 className="text-4xl font-display font-bold text-primary-foreground mb-4">Be part of the future</h2>
                        <p className="text-primary-foreground/60 text-lg mb-10 max-w-lg mx-auto">
                            Every ride you share brings us closer to the world we're building. Join the movement today.
                        </p>
                        <Link to="/signup">
                            <Button className="bg-gradient-primary text-white px-12 py-6 rounded-xl shadow-glow hover:opacity-90 text-base">
                                Start Carpooling
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Vision;
