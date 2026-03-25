import { motion } from "framer-motion";
import { MapPin, Users, CreditCard, Navigation } from "lucide-react";

const steps = [
  {
    icon: MapPin,
    step: "01",
    title: "Set Your Route",
    description: "Enter your origin and destination. Our smart engine finds optimal matches based on your route and schedule.",
    color: "bg-emerald-light text-emerald",
  },
  {
    icon: Users,
    step: "02",
    title: "Get Matched",
    description: "Our AI matches you with verified riders or drivers on similar routes. Review profiles, ratings, and preferences.",
    color: "bg-amber-light text-amber",
  },
  {
    icon: CreditCard,
    step: "03",
    title: "Book & Split",
    description: "Confirm your seat and split the fare automatically. Transparent pricing with no hidden fees.",
    color: "bg-secondary text-secondary-foreground",
  },
  {
    icon: Navigation,
    step: "04",
    title: "Ride Together",
    description: "Get real-time updates, chat with your co-riders, and track your carbon savings. Rate and repeat!",
    color: "bg-emerald-light text-emerald",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 md:py-32 bg-muted/50">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
            How It Works
          </span>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
            Four steps to your <span className="text-gradient-primary">perfect ride</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            From setting your route to sharing the journey — it's ridiculously simple.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
              className="relative group"
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] h-[2px] bg-border" />
              )}
              <div className="relative bg-card rounded-2xl p-8 shadow-card hover:shadow-lg transition-all duration-300 border border-border/50 group-hover:-translate-y-1">
                <div className={`w-14 h-14 rounded-2xl ${step.color} flex items-center justify-center mb-6`}>
                  <step.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-mono text-muted-foreground tracking-widest">{step.step}</span>
                <h3 className="text-xl font-display font-bold text-foreground mt-2 mb-3">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
