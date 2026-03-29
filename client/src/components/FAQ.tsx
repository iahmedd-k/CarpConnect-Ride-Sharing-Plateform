import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
    {
        q: "How does the route matching work?",
        a: "Our AI analyzes your origin, destination, timing, and preferences to find the best possible matches. We prioritize routes with the highest overlap to minimize detours for drivers.",
    },
    {
        q: "Is my personal information safe?",
        a: "Absolutely. We encrypt all personal data, never share it with third parties without consent, and give you full data control in settings. Phone numbers are masked in chat.",
    },
    {
        q: "What happens if a driver cancels?",
        a: "You'll receive instant notifications and our system will immediately search for alternative matches. Frequent cancellers are flagged and removed from the platform.",
    },
    {
        q: "How is the fare split calculated?",
        a: "Fares are based on distance, fuel price, and number of passengers. The split is transparent and automated — no awkward money conversations needed.",
    },
    {
        q: "Can I use CarpConnect for airport trips?",
        a: "Yes! You can book one-off rides for trips like airport runs. Just input your destination and time, and we'll find drivers heading your way.",
    },
    {
        q: "What if I have an emergency mid-ride?",
        a: "The app includes a discreet SOS button that shares your live location with emergency contacts and our safety team. You can also share your trip link with anyone.",
    },
    {
        q: "Are there any peak-hour surge prices?",
        a: "No. Unlike ride-hailing apps, CarpConnect doesn't surge price. Our fares are based on fixed cost-splitting, not demand — so rush hour won't surprise your wallet.",
    },
    {
        q: "Can drivers set their own preferences?",
        a: "Yes. Drivers can set preferences for gender, conversation style, music, and more. Matching respects both driver and rider preferences.",
    },
];

const FAQ = () => {
    const [open, setOpen] = useState<number | null>(0);

    return (
        <section id="faq" className="py-24 md:py-32">
            <div className="container">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
                        FAQ
                    </span>
                    <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                        Questions? We've got <span className="text-gradient-primary">answers</span>
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                        Everything you need to know about CarpConnect.
                    </p>
                </motion.div>

                <div className="max-w-2xl mx-auto space-y-3">
                    {faqs.map((faq, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-card rounded-2xl border border-border/50 overflow-hidden"
                        >
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                className="w-full flex items-center justify-between p-6 text-left hover:bg-muted/30 transition-colors"
                            >
                                <span className="font-display font-semibold text-foreground text-sm pr-4">{faq.q}</span>
                                <motion.div
                                    animate={{ rotate: open === i ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="shrink-0"
                                >
                                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                </motion.div>
                            </button>
                            <AnimatePresence>
                                {open === i && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                    >
                                        <div className="px-6 pb-6">
                                            <div className="h-px bg-border mb-4" />
                                            <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
