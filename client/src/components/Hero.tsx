import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ArrowRight, Shield, Leaf, Search, Clock, Users, Star, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-carpool.jpg";
import axios from "axios";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface RideResult {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  pricePerSeat: number;
  seatsAvailable: number;
  driver: {
    name: string;
    rating: number;
    vehicle: string;
  };
}

const Hero = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RideResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchRides = useCallback(async (value: string) => {
    if (!value || value.trim().length < 2) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/rides/search-dest`, {
        params: { destination: value.trim() },
      });
      if (res.data.success) {
        setResults(res.data.data.rides || []);
        setDropdownOpen(true);
      }
    } catch {
      // silently fail on homepage — don't disrupt UX
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRides(value), 500);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setDropdownOpen(false);
    navigate(`/dashboard?destination=${encodeURIComponent(query.trim())}`);
  };

  const handleResultClick = (ride: RideResult) => {
    setDropdownOpen(false);
    setQuery(ride.destination);
    navigate(`/dashboard?destination=${encodeURIComponent(ride.destination)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") setDropdownOpen(false);
  };

  const formatTime = (iso: string) => {
    if (!iso) return "---";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "---" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
      {/* Background */}
      <div className="absolute inset-0">
        <img src={heroImg} alt="People carpooling in a modern city" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-foreground/30" />
      </div>

      <div className="container relative z-10">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm mb-6"
          >
            <Leaf className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-primary-foreground/90">Smarter rides, greener planet</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-5xl md:text-7xl font-display font-bold leading-[1.05] tracking-tight mb-6"
          >
            <span className="text-primary-foreground">Share the ride.</span>
            <br />
            <span className="text-primary-foreground/60">Share the future.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-lg md:text-xl text-primary-foreground/70 max-w-xl mb-10 leading-relaxed"
          >
            Connect with drivers and riders on your route. Save money, reduce emissions,
            and build a commuting community — all with smart matching technology.
          </motion.p>

          {/* Smart Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            ref={containerRef}
            className="relative max-w-xl"
          >
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3 p-2 rounded-2xl glass-dark"
              id="hero-search-form"
            >
              <div className="flex items-center gap-3 flex-1 px-4 py-3 rounded-xl bg-foreground/10 relative">
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <input
                  id="hero-destination-input"
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => results.length > 0 && setDropdownOpen(true)}
                  placeholder="Where are you going?"
                  className="bg-transparent border-none outline-none text-primary-foreground placeholder:text-primary-foreground/40 w-full text-sm"
                  autoComplete="off"
                />
                {loading && <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />}
              </div>
              <Button
                id="hero-search-button"
                type="submit"
                className="bg-gradient-primary text-primary-foreground px-8 py-6 rounded-xl text-sm font-semibold shadow-glow hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                Find Rides <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            {/* Live Results Dropdown */}
            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="absolute left-0 right-0 top-full mt-3 rounded-2xl overflow-hidden shadow-2xl z-50"
                  style={{
                    background: "rgba(10, 10, 14, 0.96)",
                    backdropFilter: "blur(24px)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  id="hero-search-dropdown"
                >
                  {results.length === 0 ? (
                    <div className="px-5 py-6 text-center">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-20 text-white" />
                      <p className="text-sm text-white/40">No rides found. Try another location.</p>
                    </div>
                  ) : (
                    <>
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                          {results.length} ride{results.length !== 1 ? "s" : ""} found
                        </span>
                      </div>
                      {results.map((ride, i) => (
                        <motion.button
                          key={ride.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => handleResultClick(ride)}
                          className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-all group border-b border-white/5 last:border-0"
                          id={`hero-ride-result-${i}`}
                        >
                          {/* Driver avatar placeholder */}
                          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm group-hover:scale-105 transition-transform">
                            {ride.driver.name?.[0] || "D"}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-sm font-semibold text-white truncate">
                              <span className="text-white/50 text-xs">{ride.origin.split(",")[0]}</span>
                              <ChevronRight className="w-3 h-3 text-white/30 shrink-0" />
                              <span>{ride.destination.split(",")[0]}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="flex items-center gap-1 text-[10px] text-white/40">
                                <Clock className="w-2.5 h-2.5" />
                                {formatTime(ride.departureTime)}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-white/40">
                                <Users className="w-2.5 h-2.5" />
                                {ride.seatsAvailable} seats
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-white/40">
                                <Star className="w-2.5 h-2.5" />
                                {ride.driver.rating || "N/A"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-emerald-400">
                              PKR {ride.pricePerSeat?.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-white/30">/seat</div>
                          </div>
                        </motion.button>
                      ))}

                      {/* View all in dashboard CTA */}
                      <button
                        onClick={handleSubmit}
                        className="w-full px-4 py-3 flex items-center justify-center gap-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                        id="hero-view-all-results"
                      >
                        View all results in dashboard <ArrowRight className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex flex-wrap items-center gap-6 mt-10"
          >
            {[
              { icon: Shield, text: "Verified Riders" },
              { icon: Leaf, text: "Carbon Tracked" },
              { icon: MapPin, text: "Smart Matching" },
            ].map((badge) => (
              <div key={badge.text} className="flex items-center gap-2">
                <badge.icon className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-primary-foreground/60">{badge.text}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Floating Stats */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="hidden lg:flex absolute right-12 bottom-24 flex-col gap-4"
      >
        {[
          { value: "50K+", label: "Active Riders" },
          { value: "2.1M", label: "kg CO₂ Saved" },
          { value: "4.9★", label: "Avg Rating" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 + i * 0.15 }}
            className="glass-dark rounded-2xl px-6 py-4 min-w-[160px]"
          >
            <div className="text-2xl font-display font-bold text-primary-foreground">{stat.value}</div>
            <div className="text-xs text-primary-foreground/50">{stat.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};

export default Hero;
