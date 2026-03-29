import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  ArrowRight,
  Shield,
  Leaf,
  Search,
  Clock,
  Users,
  Star,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/hero-carpool.jpg";
import axios from "axios";

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
      // silently fail
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
    <section className="relative min-h-[100svh] overflow-hidden">

      {/* ── Background image — always full cover ── */}
      <div className="absolute inset-0">
        <img
          src={heroImg}
          alt="People carpooling"
          className="h-full w-full object-cover object-[center_30%]"
        />

        {/*
          Overlay strategy:
          - Mobile: diagonal split — top-left is darker for text legibility,
            bottom-right stays lighter so the car + people show through.
            Max opacity 0.72 so the image is ALWAYS visible.
          - Desktop: left-to-right, same idea.
        */}
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            background:
              "linear-gradient(160deg, rgba(10,14,10,0.78) 0%, rgba(10,14,10,0.72) 45%, rgba(10,14,10,0.35) 70%, rgba(10,14,10,0.15) 100%)",
          }}
        />
        <div
          className="absolute inset-0 hidden sm:block"
          style={{
            background:
              "linear-gradient(to right, rgba(10,14,10,0.82) 0%, rgba(10,14,10,0.60) 45%, rgba(10,14,10,0.15) 100%)",
          }}
        />
      </div>

      {/*
        ── Layout ──
        On mobile: flex-col with justify-between so content spreads
        naturally from top (after navbar) to ~60% of the viewport,
        leaving the bottom 40% for the car to breathe through.
      */}
      <div
        className="relative z-10 flex min-h-[100svh] flex-col"
        style={{ paddingTop: "var(--navbar-height, 72px)" }}
      >
        {/* Main content block */}
        <div className="flex flex-1 flex-col justify-center px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-[1400px]">
            <div className="w-full max-w-xl lg:max-w-2xl">

              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 backdrop-blur-sm sm:mb-5"
              >
                <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-300/90 sm:text-sm">
                  Smarter rides, greener planet
                </span>
              </motion.div>

              {/* Heading — restored primary-foreground color token */}
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.6 }}
                className="mb-4 text-[2.1rem] font-display font-bold leading-[1.08] tracking-tight text-primary-foreground sm:mb-5 sm:text-5xl md:text-6xl lg:text-7xl"
              >
                Share the ride.
                <br />
                <span className="text-primary-foreground/55">Share the future.</span>
              </motion.h1>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-6 text-sm leading-relaxed text-primary-foreground/75 sm:mb-8 sm:max-w-md sm:text-base md:text-lg"
              >
                Connect with drivers and riders on your route. Save money, reduce
                emissions, and build a commuting community — all with smart matching.
              </motion.p>

              {/* ── Search form ── */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                ref={containerRef}
                className="relative w-full max-w-lg"
              >
                <form
                  onSubmit={handleSubmit}
                  id="hero-search-form"
                  className="overflow-hidden rounded-2xl sm:flex sm:items-center sm:rounded-[1.75rem] sm:p-2"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {/* Input */}
                  <div className="flex flex-1 items-center gap-3 px-4 py-[14px]">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <input
                      id="hero-destination-input"
                      type="text"
                      value={query}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => results.length > 0 && setDropdownOpen(true)}
                      placeholder="Where are you going?"
                      className="w-full bg-transparent text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/38"
                      autoComplete="off"
                    />
                    {loading && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    )}
                  </div>

                  {/* Divider — mobile only */}
                  <div
                    className="mx-4 h-px sm:hidden"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  />

                  {/* CTA button */}
                  <Button
                    id="hero-search-button"
                    type="submit"
                    className="w-full rounded-none rounded-b-[14px] px-6 py-[14px] text-sm font-semibold shadow-glow transition-opacity hover:opacity-90 sm:w-auto sm:rounded-[14px] sm:px-7 sm:py-[11px]"
                    style={{ background: "var(--gradient-primary, #0d9488)" }}
                  >
                    Find Rides <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </form>

                {/* Dropdown */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute left-0 right-0 top-full z-50 mt-3 max-h-[55vh] overflow-hidden rounded-2xl shadow-2xl"
                      style={{
                        background: "rgba(10,12,10,0.96)",
                        backdropFilter: "blur(24px)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                      id="hero-search-dropdown"
                    >
                      {results.length === 0 ? (
                        <div className="px-5 py-6 text-center">
                          <Search className="mx-auto mb-2 h-8 w-8 text-white opacity-20" />
                          <p className="text-sm text-white/40">
                            No rides found. Try another location.
                          </p>
                        </div>
                      ) : (
                        <div className="max-h-[55vh] overflow-y-auto">
                          <div className="px-4 pb-1 pt-3">
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
                              className="group flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-all hover:bg-white/5 last:border-0"
                              id={`hero-ride-result-${i}`}
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-sm font-bold text-primary transition-transform group-hover:scale-105">
                                {ride.driver.name?.[0] || "D"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 text-sm font-semibold text-white">
                                  <span className="truncate text-xs text-white/50">
                                    {ride.origin.split(",")[0]}
                                  </span>
                                  <ChevronRight className="h-3 w-3 shrink-0 text-white/30" />
                                  <span className="truncate">
                                    {ride.destination.split(",")[0]}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                                  <span className="flex items-center gap-1 text-[10px] text-white/40">
                                    <Clock className="h-2.5 w-2.5" />
                                    {formatTime(ride.departureTime)}
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] text-white/40">
                                    <Users className="h-2.5 w-2.5" />
                                    {ride.seatsAvailable} seats
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] text-white/40">
                                    <Star className="h-2.5 w-2.5" />
                                    {ride.driver.rating || "N/A"}
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-bold text-emerald-400">
                                  PKR {ride.pricePerSeat?.toLocaleString()}
                                </div>
                                <div className="text-[10px] text-white/30">/seat</div>
                              </div>
                            </motion.button>
                          ))}

                          <button
                            onClick={handleSubmit}
                            className="flex w-full items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
                            id="hero-view-all-results"
                          >
                            View all results in dashboard{" "}
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Trust badges */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 sm:mt-8 sm:gap-x-6"
              >
                {[
                  { icon: Shield, text: "Verified Riders" },
                  { icon: Leaf, text: "Carbon Tracked" },
                  { icon: MapPin, text: "Smart Matching" },
                ].map((badge) => (
                  <div key={badge.text} className="flex items-center gap-1.5">
                    <badge.icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-xs font-medium text-primary-foreground/60">
                      {badge.text}
                    </span>
                  </div>
                ))}
              </motion.div>

            </div>
          </div>
        </div>
      </div>

      {/* Stats — desktop only */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.1, duration: 0.6 }}
        className="absolute bottom-24 right-12 hidden flex-col gap-4 lg:flex"
      >
        {[
          { value: "50K+", label: "Active Riders" },
          { value: "2.1M", label: "kg CO2 Saved" },
          { value: "4.9+", label: "Avg Rating" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 + i * 0.15 }}
            className="glass-dark min-w-[160px] rounded-2xl px-6 py-4"
          >
            <div className="text-2xl font-display font-bold text-primary-foreground">
              {stat.value}
            </div>
            <div className="text-xs text-primary-foreground/50">{stat.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};

export default Hero;