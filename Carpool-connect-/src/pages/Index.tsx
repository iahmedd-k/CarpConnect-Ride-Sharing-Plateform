import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import InfiniteMarquee from "@/components/InfiniteMarquee";
import HowItWorks from "@/components/HowItWorks";
import Features from "@/components/Features";
import Stats from "@/components/Stats";
import MetricsSection from "@/components/MetricsSection";
import Testimonials from "@/components/Testimonials";
import Sustainability from "@/components/Sustainability";
import Pricing from "@/components/Pricing";
import AppDownload from "@/components/AppDownload";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen scroll-smooth">
      <Navbar />
      <Hero />
      <InfiniteMarquee />
      <HowItWorks />
      <Features />
      <Stats />
      <MetricsSection />
      <Testimonials />
      <Sustainability />
      <Pricing />
      <AppDownload />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
