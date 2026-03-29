import { motion } from "framer-motion";
import { ArrowRight, Car } from "lucide-react";
import { Button } from "@/components/ui/button";

const CTA = () => {
  return (
    <section className="py-24 md:py-32">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative bg-gradient-hero rounded-[2rem] p-12 md:p-20 overflow-hidden text-center"
        >
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary-foreground/5 rounded-full blur-[80px]" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-primary-foreground/5 rounded-full blur-[60px]" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary-foreground/10 flex items-center justify-center mx-auto mb-8">
              <Car className="w-7 h-7 text-primary-foreground" />
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-primary-foreground mb-6">
              Ready to share your next ride?
            </h2>
            <p className="text-lg text-primary-foreground/70 mb-10 max-w-lg mx-auto">
              Join thousands of riders and drivers building a smarter, 
              greener commuting community. Start in seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-primary-foreground text-primary font-semibold px-8 py-6 rounded-xl hover:bg-primary-foreground/90 transition-colors"
              >
                Offer a Ride <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground px-8 py-6 rounded-xl hover:bg-primary-foreground/10 transition-colors"
              >
                Find a Ride
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
