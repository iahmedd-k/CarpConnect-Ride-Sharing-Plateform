import { motion } from "framer-motion";
import { Star } from "lucide-react";
import communityImg from "@/assets/community.jpg";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Daily Commuter",
    text: "CarpConnect cut my commute costs by 60%. The matching is incredibly accurate — I get paired with people on my exact route every single day.",
    rating: 5,
    avatar: "SC",
  },
  {
    name: "Marcus Johnson",
    role: "Driver",
    text: "I earn enough to cover my gas and parking. Plus, the company during long commutes is a nice bonus. The app feels premium.",
    rating: 5,
    avatar: "MJ",
  },
  {
    name: "Priya Sharma",
    role: "Student",
    text: "As a student, every dollar counts. CarpConnect makes getting to campus affordable and I've made actual friends through it!",
    rating: 5,
    avatar: "PS",
  },
];

const Testimonials = () => {
  return (
    <section id="community" className="py-24 md:py-32 bg-muted/30">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12"
            >
              <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold tracking-wider uppercase mb-4">
                Community
              </span>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
                Loved by <span className="text-gradient-primary">riders everywhere</span>
              </h2>
              <p className="text-muted-foreground text-lg">
                Join thousands of commuters who've made carpooling their daily habit.
              </p>
            </motion.div>

            <div className="space-y-5">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.name}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="bg-card rounded-2xl p-6 shadow-card border border-border/50 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center gap-1 mb-3">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-amber text-amber" />
                    ))}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed mb-4">"{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {t.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative hidden lg:block"
          >
            <div className="rounded-3xl overflow-hidden shadow-xl">
              <img src={communityImg} alt="CarpConnect community" className="w-full h-auto object-cover" />
            </div>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-foreground/20 to-transparent" />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
