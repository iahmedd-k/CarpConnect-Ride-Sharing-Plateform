import { motion } from "framer-motion";
import { Car, Users, Leaf, Globe, Award, Heart, Zap, Shield } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const team = [
    { name: "Elena Rodriguez", role: "CEO & Co-Founder", avatar: "ER", bio: "Former mobility lead at Uber. Passionate about sustainable transit." },
    { name: "James Kim", role: "CTO & Co-Founder", avatar: "JK", bio: "Ex-Google engineer. Built systems serving 100M+ users." },
    { name: "Priya Patel", role: "Head of Product", avatar: "PP", bio: "Ex-Lyft product. Obsessed with delightful user experiences." },
    { name: "Marcus Webb", role: "Head of Safety", avatar: "MW", bio: "Former law enforcement. Champion of community trust." },
    { name: "Sophie Laurent", role: "Head of Sustainability", avatar: "SL", bio: "Climate scientist turned tech entrepreneur." },
    { name: "David Chen", role: "Head of Engineering", avatar: "DC", bio: "Full-stack generalist. Loves distributed systems and coffee." },
];

const values = [
    { icon: Heart, title: "Community First", desc: "Every decision we make starts with how it impacts our riders and drivers — real people with real lives." },
    { icon: Leaf, title: "Planet Positive", desc: "We measure our success not just in revenue, but in kilograms of CO₂ we help eliminate from the atmosphere." },
    { icon: Shield, title: "Trust & Safety", desc: "Verification, tracking, and community ratings ensure every ride feels as safe as it should." },
    { icon: Zap, title: "Radical Simplicity", desc: "Matching algorithms can be complex. Your experience doesn't have to be. We hide the hard stuff." },
];

const milestones = [
    { year: "2022", event: "Founded in San Francisco with a mission to decarbonize daily commutes" },
    { year: "2023", event: "Launched in 5 cities, surpassed 10,000 rides in first quarter" },
    { year: "2024", event: "Raised Series A, launched smart route AI, expanded to 25 cities" },
    { year: "2025", event: "50,000+ active users, 2M+ kg CO₂ saved, launched enterprise plans" },
    { year: "2026", event: "Going global — 50+ cities, real-time tracking & fleet partnerships" },
];

const About = () => {
    return (
        <div className="min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="pt-32 pb-24 bg-gradient-dark relative overflow-hidden">
                <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
                <div className="container relative z-10">
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto">
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wider uppercase mb-6">
                            <Car className="w-3 h-3" /> About CarpConnect
                        </span>
                        <h1 className="text-5xl md:text-6xl font-display font-bold text-primary-foreground mb-6">
                            Redefining how the world <span className="text-gradient-primary">moves together</span>
                        </h1>
                        <p className="text-lg text-primary-foreground/60 leading-relaxed">
                            We started CarpConnect because we believed millions of empty car seats were one of urban transport's biggest untapped opportunities — for savings, for community, and for the planet.
                        </p>
                    </motion.div>

                    {/* Stats strip */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16"
                    >
                        {[
                            { value: "50K+", label: "Active Riders" },
                            { value: "2.1M kg", label: "CO₂ Saved" },
                            { value: "25+", label: "Cities" },
                            { value: "4.9★", label: "Avg Rating" },
                        ].map((s) => (
                            <div key={s.label} className="glass-dark rounded-2xl p-6 text-center border border-white/10">
                                <div className="text-3xl font-display font-bold text-primary mb-1">{s.value}</div>
                                <div className="text-xs text-primary-foreground/50">{s.label}</div>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* Mission */}
            <section className="py-24">
                <div className="container">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                            <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">Our Mission</span>
                            <h2 className="text-4xl font-display font-bold text-foreground mb-6">
                                A world where every commute is <span className="text-gradient-primary">shared, affordable, and clean</span>
                            </h2>
                            <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                                Urban congestion, high commute costs, and vehicle emissions are solvable problems. By connecting drivers with empty seats to riders who need transport, we're building a peer-to-peer mobility layer the city needs.
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                                Our AI matches riders and drivers based on routes, schedules, preferences, and trust signals — making carpooling as easy as hailing a cab but far more rewarding.
                            </p>
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 30 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="grid grid-cols-2 gap-4"
                        >
                            {values.map((v, i) => (
                                <motion.div
                                    key={v.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                    className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-card transition-shadow"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                        <v.icon className="w-5 h-5 text-primary" />
                                    </div>
                                    <h3 className="text-sm font-display font-bold text-foreground mb-2">{v.title}</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">{v.desc}</p>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Timeline */}
            <section className="py-24 bg-muted/30">
                <div className="container">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">Our Story</span>
                        <h2 className="text-4xl font-display font-bold text-foreground">The journey so far</h2>
                    </motion.div>
                    <div className="max-w-2xl mx-auto">
                        {milestones.map((m, i) => (
                            <motion.div
                                key={m.year}
                                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="flex gap-6 mb-8 last:mb-0"
                            >
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center text-xs font-bold text-white shadow-glow shrink-0">
                                        {m.year.slice(2)}
                                    </div>
                                    {i < milestones.length - 1 && <div className="w-px flex-1 bg-border mt-2" />}
                                </div>
                                <div className="bg-card rounded-2xl p-5 border border-border/50 flex-1 mb-6">
                                    <div className="text-xs font-mono text-primary mb-1">{m.year}</div>
                                    <p className="text-sm text-foreground">{m.event}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Team */}
            <section className="py-24">
                <div className="container">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">Team</span>
                        <h2 className="text-4xl font-display font-bold text-foreground mb-4">
                            The people behind <span className="text-gradient-primary">the mission</span>
                        </h2>
                    </motion.div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {team.map((member, i) => (
                            <motion.div
                                key={member.name}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-card hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center text-white font-bold text-lg mb-4">{member.avatar}</div>
                                <h3 className="font-display font-bold text-foreground mb-1">{member.name}</h3>
                                <p className="text-xs text-primary font-medium mb-3">{member.role}</p>
                                <p className="text-sm text-muted-foreground leading-relaxed">{member.bio}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default About;
