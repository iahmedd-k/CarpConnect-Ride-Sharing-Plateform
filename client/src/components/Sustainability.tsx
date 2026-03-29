import { motion } from "framer-motion";
import { Leaf, TrendingDown, TreePine, Droplets } from "lucide-react";

const metrics = [
  { icon: TrendingDown, value: "2.1M kg", label: "CO₂ reduced", color: "bg-emerald-light text-emerald" },
  { icon: TreePine, value: "95,000", label: "Trees equivalent", color: "bg-emerald-light text-emerald" },
  { icon: Droplets, value: "840K L", label: "Fuel saved", color: "bg-amber-light text-amber" },
];

const Sustainability = () => {
  return (
    <section id="sustainability" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
      
      <div className="container relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="w-16 h-16 rounded-3xl bg-emerald-light flex items-center justify-center mx-auto mb-6">
              <Leaf className="w-7 h-7 text-emerald" />
            </div>
            <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
              Sustainability
            </span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
              Every shared ride <span className="text-gradient-primary">makes a difference</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-16">
              Track your environmental impact in real-time. Every carpool reduces emissions, 
              saves fuel, and helps build a greener future for everyone.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-8">
            {metrics.map((metric, i) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="bg-card rounded-2xl p-8 shadow-card border border-border/50"
              >
                <div className={`w-14 h-14 rounded-2xl ${metric.color} flex items-center justify-center mx-auto mb-5`}>
                  <metric.icon className="w-6 h-6" />
                </div>
                <div className="text-3xl md:text-4xl font-display font-bold text-foreground mb-2">{metric.value}</div>
                <div className="text-sm text-muted-foreground">{metric.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Sustainability;
