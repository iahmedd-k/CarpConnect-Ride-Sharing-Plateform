import { motion } from "framer-motion";
import { TrendingUp, Users, Leaf, MapPin } from "lucide-react";

const stats = [
  { icon: Users, value: "50,000+", label: "Active Community Members", suffix: "" },
  { icon: MapPin, value: "1.2M", label: "Rides Completed", suffix: "+" },
  { icon: Leaf, value: "2.1M", label: "kg CO₂ Saved", suffix: "" },
  { icon: TrendingUp, value: "68%", label: "Average Cost Savings", suffix: "" },
];

const Stats = () => {
  return (
    <section className="py-20 bg-gradient-dark relative overflow-hidden">
      {/* Subtle pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent rounded-full blur-[120px]" />
      </div>

      <div className="container relative z-10">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <stat.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-2">
                {stat.value}
              </div>
              <div className="text-sm text-primary-foreground/50">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
