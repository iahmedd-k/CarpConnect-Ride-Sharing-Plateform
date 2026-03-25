import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Phone, MapPin, Clock, ArrowRight, MessageSquare, Twitter, Linkedin, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const faqs = [
    { q: "How does CarpConnect work?", a: "Set your route, get matched with verified drivers or riders, book your seat, and enjoy the shared commute. Fare is split automatically." },
    { q: "Is it safe to ride with strangers?", a: "All users are ID-verified, we offer live trip tracking, and every rider/driver has a public rating and review history." },
    { q: "How are fares calculated?", a: "Fares are based on distance, number of passengers, and fuel costs. Our algorithm ensures fair, transparent splits every time." },
    { q: "Can I schedule recurring rides?", a: "Yes! You can set up recurring daily commute routes so you always have a match ready for your regular schedule." },
];

const Contact = () => {
    const [submitted, setSubmitted] = useState(false);
    const [sending, setSending] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        setTimeout(() => {
            setSending(false);
            setSubmitted(true);
        }, 1500);
    };

    return (
        <div className="min-h-screen">
            <Navbar />

            {/* Hero */}
            <section className="pt-32 pb-16 bg-gradient-dark relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px]" />
                <div className="container relative z-10 text-center">
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
                        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wider uppercase mb-6">
                            <MessageSquare className="w-3 h-3" /> Contact Us
                        </span>
                        <h1 className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-4">
                            We'd love to <span className="text-gradient-primary">hear from you</span>
                        </h1>
                        <p className="text-primary-foreground/60 max-w-xl mx-auto">
                            Got a question, feedback, or partnership inquiry? Our team typically responds within 24 hours.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Contact Cards */}
            <section className="py-16">
                <div className="container">
                    <div className="grid md:grid-cols-3 gap-6 mb-16">
                        {[
                            { icon: Mail, label: "Email Us", value: "hello@carpconnect.com", sub: "For general inquiries" },
                            { icon: Phone, label: "Call Us", value: "+1 (888) 277-2665", sub: "Mon–Fri, 9am–6pm PST" },
                            { icon: MapPin, label: "Visit Us", value: "San Francisco, CA", sub: "123 Green Street, Suite 400" },
                        ].map((item, i) => (
                            <motion.div
                                key={item.label}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-card rounded-2xl p-8 border border-border/50 text-center hover:shadow-card hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                    <item.icon className="w-6 h-6 text-primary" />
                                </div>
                                <h3 className="font-display font-bold text-foreground mb-2">{item.label}</h3>
                                <p className="text-primary font-medium text-sm mb-1">{item.value}</p>
                                <p className="text-xs text-muted-foreground">{item.sub}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="grid lg:grid-cols-2 gap-12">
                        {/* Form */}
                        <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                            <h2 className="text-3xl font-display font-bold text-foreground mb-2">Send us a message</h2>
                            <p className="text-muted-foreground mb-8">Fill out the form and our team will get back to you soon.</p>

                            {submitted ? (
                                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-secondary rounded-2xl p-12 text-center">
                                    <div className="text-5xl mb-4">✅</div>
                                    <h3 className="text-xl font-display font-bold text-foreground mb-2">Message Sent!</h3>
                                    <p className="text-muted-foreground text-sm">We'll get back to you within 24 hours.</p>
                                </motion.div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">First Name</label>
                                            <input type="text" className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" placeholder="John" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Last Name</label>
                                            <input type="text" className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" placeholder="Doe" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Email</label>
                                        <input type="email" className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" placeholder="john@example.com" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Subject</label>
                                        <select className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
                                            <option>General Inquiry</option>
                                            <option>Partnership</option>
                                            <option>Safety Issue</option>
                                            <option>Billing</option>
                                            <option>Feature Request</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-2">Message</label>
                                        <textarea rows={5} className="w-full bg-card border border-border rounded-xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none" placeholder="Tell us how we can help..." />
                                    </div>
                                    <Button type="submit" disabled={sending} className="w-full bg-gradient-primary text-white py-6 rounded-xl text-sm font-semibold shadow-glow hover:opacity-90 transition-all">
                                        {sending ? (
                                            <span className="flex items-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Sending...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">Send Message <ArrowRight className="w-4 h-4" /></span>
                                        )}
                                    </Button>
                                </form>
                            )}
                        </motion.div>

                        {/* FAQs */}
                        <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                            <h2 className="text-3xl font-display font-bold text-foreground mb-2">FAQs</h2>
                            <p className="text-muted-foreground mb-8">Quick answers to common questions.</p>
                            <div className="space-y-4">
                                {faqs.map((faq, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="bg-card rounded-2xl p-6 border border-border/50">
                                        <h3 className="font-semibold text-foreground mb-2 text-sm">{faq.q}</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="mt-8 bg-muted/50 rounded-2xl p-6 border border-border/50">
                                <div className="flex items-center gap-2 mb-3">
                                    <Clock className="w-4 h-4 text-primary" />
                                    <span className="font-semibold text-sm text-foreground">Support Hours</span>
                                </div>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <div className="flex justify-between"><span>Monday – Friday</span><span>9:00 AM – 6:00 PM PST</span></div>
                                    <div className="flex justify-between"><span>Saturday</span><span>10:00 AM – 4:00 PM PST</span></div>
                                    <div className="flex justify-between"><span>Sunday</span><span>Closed</span></div>
                                </div>
                                <div className="flex gap-3 mt-5">
                                    {[Twitter, Linkedin, Github].map((Icon, i) => (
                                        <a key={i} href="#" className="w-9 h-9 rounded-lg bg-card flex items-center justify-center border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors">
                                            <Icon className="w-4 h-4 text-muted-foreground" />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Contact;
