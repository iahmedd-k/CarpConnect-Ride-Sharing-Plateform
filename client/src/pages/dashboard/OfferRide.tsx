import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import debounce from "lodash/debounce";
import {
  MapPin,
  Calendar,
  Users,
  DollarSign,
  ArrowRight,
  Car,
  AlertCircle,
  CheckCircle,
  X,
  RefreshCw,
  Navigation,
  Lock,
} from "lucide-react";
import { fetchAddressSuggestions, resolveAddressCoordinates } from "@/lib/addressAutocomplete";
import api from "../../lib/api";
import { useNavigate } from "react-router-dom";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

/* ---------------- Address Input Component ---------------- */
function AddressInput({ value, placeholder, icon, suggestions, loading, onChange, onSelect, onClear }: any) {
  return (
    <div className="relative">
      <div
        className={`
          flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all duration-200 bg-white
          ${value ? "border-emerald-400 shadow-sm shadow-emerald-100" : "border-gray-200"}
          focus-within:border-emerald-500 focus-within:shadow-md focus-within:shadow-emerald-100
        `}
      >
        <span className="text-emerald-500 flex-shrink-0">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
        />
        <AnimatePresence>
          {value && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={onClear}
              type="button"
              className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
            >
              <X size={10} className="text-gray-600" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-4 top-full mt-1 text-xs text-gray-400 flex items-center gap-1"
          >
            <RefreshCw size={10} className="animate-spin" />
            Searching...
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl shadow-gray-100 overflow-hidden"
          >
            {suggestions.slice(0, 5).map((s: any, i: number) => (
              <div
                key={i}
                onClick={() => onSelect(s)}
                className="flex items-start gap-3 px-4 py-3 hover:bg-emerald-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
              >
                <Navigation size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 leading-snug">{s.address}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Preference Toggle ---------------- */
function PrefToggle({
  label,
  emoji,
  checked,
  onChange,
}: {
  label: string;
  emoji: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200
        ${
          checked
            ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200"
            : "bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600"
        }
      `}
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}

/* ---------------- Section Label ---------------- */
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-emerald-500">{icon}</span>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

/* ---------------- Main Component ---------------- */
function OfferRide() {
  const navigate = useNavigate();
  const [currentPlan, setCurrentPlan] = useState(currentPlanFromStorage());
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [originCoords, setOriginCoords] = useState<[number, number] | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [originSugg, setOriginSugg] = useState<any[]>([]);
  const [destinationSugg, setDestinationSugg] = useState<any[]>([]);
  const [loadingOrigin, setLoadingOrigin] = useState(false);
  const [loadingDestination, setLoadingDestination] = useState(false);
  const [earliestDeparture, setEarliestDeparture] = useState("");
  const [latestDeparture, setLatestDeparture] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState("");
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [pricePerSeat, setPricePerSeat] = useState("");
  const [preferences, setPreferences] = useState({ smoking: false, pets: false, music: true });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [publishDialog, setPublishDialog] = useState<null | {
    origin: string;
    destination: string;
    departure: string;
    seats: number;
    fare: number;
  }>(null);

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const canUseRecurring = hasPlanAtLeast(currentPlan, "plus");

  useEffect(() => {
    setCurrentPlan(currentPlanFromStorage());
  }, []);

  /* ----
     FIX 1: Load Maps script once on mount.
     AutocompleteSuggestion is invoked via importLibrary("places") on demand —
     no AutocompleteService / AutocompleteSessionToken needed.
  ---- */
  const fetchSuggestions = async (q: string, type: "origin" | "destination") => {
    if (q.length < 2) return;
    type === "origin" ? setLoadingOrigin(true) : setLoadingDestination(true);

    try {
      const combined = await fetchAddressSuggestions(q, googleMapsApiKey, 6);
      type === "origin" ? setOriginSugg(combined) : setDestinationSugg(combined);
    } catch (err) {
      console.error(err);
    } finally {
      type === "origin" ? setLoadingOrigin(false) : setLoadingDestination(false);
    }
  };

  const debouncedOrigin = useCallback(debounce((q) => fetchSuggestions(q, "origin"), 300), []);
  const debouncedDestination = useCallback(debounce((q) => fetchSuggestions(q, "destination"), 300), []);

  /* ----
     FIX 3: Send correctly-shaped payload that matches the backend schema.
     - seatsTotal / pricePerSeat as Numbers (not strings)
     - origin / destination as objects with address + coordinates
     - preferences included
     - dates as ISO strings
     - surface backend error messages instead of generic fallback
  ---- */
  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!origin || !destination)
      return setErrorMsg("Please enter both pickup and drop-off locations.");
    if (!earliestDeparture)
      return setErrorMsg("Please set an earliest departure time.");
    if (!pricePerSeat || Number(pricePerSeat) < 0)
      return setErrorMsg("Please enter a valid price per seat.");
    if (!seatsTotal || Number(seatsTotal) <= 0)
      return setErrorMsg("Please enter a valid seat count.");

    setLoading(true);
    try {
      await api.post("/rides/offers", {
        origin: {
          address: origin,
          lat: originCoords ? originCoords[1] : undefined,
          lng: originCoords ? originCoords[0] : undefined,
        },
        destination: {
          address: destination,
          lat: destinationCoords ? destinationCoords[1] : undefined,
          lng: destinationCoords ? destinationCoords[0] : undefined,
        },
        departureTime: new Date(earliestDeparture).toISOString(),
        seatsAvailable: Number(seatsTotal),
        pricePerSeat: Number(pricePerSeat),
        preferences,
        isRecurring,
        ...(isRecurring && recurrencePattern && { recurrencePattern }),
      });

      setSuccessMsg("Your ride has been published successfully!");
      setPublishDialog({
        origin,
        destination,
        departure: earliestDeparture,
        seats: Number(seatsTotal),
        fare: Number(pricePerSeat || 0),
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Something went wrong. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  /* ---- UI ---- */
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-xl"
      >
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-200">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Offer a Ride</h1>
            <p className="text-sm text-gray-400">Share your journey, earn on the way</p>
          </div>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-2xl"
            >
              <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{errorMsg}</p>
            </motion.div>
          )}
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-start gap-3 p-4 mb-4 bg-emerald-50 border border-emerald-200 rounded-2xl"
            >
              <CheckCircle size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-emerald-700">{successMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm shadow-gray-100 overflow-hidden">
          <form onSubmit={handleCreateOffer}>

            {/* Route */}
            <div className="p-6 border-b border-gray-100">
              <SectionLabel icon={<MapPin size={14} />} label="Route" />
              <div className="flex flex-col gap-2">
                <AddressInput
                  value={origin}
                  placeholder="Pickup location"
                  icon={<MapPin size={15} />}
                  suggestions={originSugg}
                  loading={loadingOrigin}
                  onChange={(v: string) => {
                    setOrigin(v);
                    debouncedOrigin(v);
                    if (!v) setOriginSugg([]);
                  }}
                  onSelect={async (s: any) => {
                    setOrigin(s.address);
                    const coords = s.coordinates || await resolveAddressCoordinates(s.address, googleMapsApiKey, s.placeId);
                    if (coords) setOriginCoords(coords);
                    setOriginSugg([]);
                  }}
                  onClear={() => {
                    setOrigin("");
                    setOriginCoords(null);
                    setOriginSugg([]);
                  }}
                />
                <div className="pl-[22px]">
                  <div className="w-px h-3 bg-emerald-200" />
                </div>
                <AddressInput
                  value={destination}
                  placeholder="Drop-off location"
                  icon={<Navigation size={15} />}
                  suggestions={destinationSugg}
                  loading={loadingDestination}
                  onChange={(v: string) => {
                    setDestination(v);
                    debouncedDestination(v);
                    if (!v) setDestinationSugg([]);
                  }}
                  onSelect={async (s: any) => {
                    setDestination(s.address);
                    const coords = s.coordinates || await resolveAddressCoordinates(s.address, googleMapsApiKey, s.placeId);
                    if (coords) setDestinationCoords(coords);
                    setDestinationSugg([]);
                  }}
                  onClear={() => {
                    setDestination("");
                    setDestinationCoords(null);
                    setDestinationSugg([]);
                  }}
                />
              </div>
            </div>

            {/* Schedule */}
            <div className="p-6 border-b border-gray-100">
              <SectionLabel icon={<Calendar size={14} />} label="Schedule" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">Earliest departure</label>
                  <input
                    type="datetime-local"
                    value={earliestDeparture}
                    onChange={(e) => setEarliestDeparture(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400 transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">Latest departure</label>
                  <input
                    type="datetime-local"
                    value={latestDeparture}
                    onChange={(e) => setLatestDeparture(e.target.value)}
                    className="w-full border border-gray-200 rounded-2xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400 transition-all bg-white"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label
                  className={`flex items-center gap-3 ${canUseRecurring ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                  onClick={() => {
                    if (!canUseRecurring) return;
                    setIsRecurring((v) => !v);
                  }}
                >
                  <div className="relative pointer-events-none">
                    <div
                      className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                        isRecurring ? "bg-emerald-500" : "bg-gray-200"
                      }`}
                    />
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                        isRecurring ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Recurring ride setup</span>
                  {!canUseRecurring && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      <Lock size={10} /> Plus+
                    </span>
                  )}
                </label>
                {!canUseRecurring && (
                  <div className="mt-2 text-xs text-gray-500 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <span>Recurring routes are available on Plus and Pro plans.</span>
                    <button
                      type="button"
                      className="text-emerald-700 font-bold hover:underline"
                      onClick={() => navigate("/driver-dashboard?tab=subscription")}
                    >
                      Upgrade
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {isRecurring && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <input
                        type="text"
                        value={recurrencePattern}
                        onChange={(e) => setRecurrencePattern(e.target.value)}
                        placeholder="e.g. Mon / Wed / Fri, Weekly"
                        disabled={!canUseRecurring}
                        className="mt-3 w-full border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400 transition-all"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Seats & Price */}
            <div className="p-6 border-b border-gray-100">
              <SectionLabel icon={<Users size={14} />} label="Seats & Price" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">Available seats</label>
                  <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden focus-within:border-emerald-400 transition-all bg-white">
                    <span className="pl-3 text-emerald-500">
                      <Users size={14} />
                    </span>
                    <input
                      type="number"
                      value={seatsTotal}
                      onChange={(e) => setSeatsTotal(Number(e.target.value || 0))}
                      className="flex-1 px-3 py-2.5 text-sm text-gray-700 outline-none bg-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5">Price per seat (PKR)</label>
                  <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden focus-within:border-emerald-400 transition-all bg-white">
                    <span className="pl-3 text-emerald-500">
                      <DollarSign size={14} />
                    </span>
                    <input
                      type="number"
                      value={pricePerSeat}
                      onChange={(e) => setPricePerSeat(e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2.5 text-sm text-gray-700 outline-none bg-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="p-6 border-b border-gray-100">
              <SectionLabel icon={<CheckCircle size={14} />} label="Ride Preferences" />
              <div className="flex flex-wrap gap-2">
                <PrefToggle
                  label="Music"
                  emoji="🎵"
                  checked={preferences.music}
                  onChange={(v) => setPreferences((p) => ({ ...p, music: v }))}
                />
                <PrefToggle
                  label="Smoking"
                  emoji="🚬"
                  checked={preferences.smoking}
                  onChange={(v) => setPreferences((p) => ({ ...p, smoking: v }))}
                />
                <PrefToggle
                  label="Pets"
                  emoji="🐾"
                  checked={preferences.pets}
                  onChange={(v) => setPreferences((p) => ({ ...p, pets: v }))}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="p-6">
              <button
                type="submit"
                disabled={loading}
                className={`
                  w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-semibold text-sm
                  transition-all duration-200
                  ${
                    loading
                      ? "bg-emerald-300 text-white cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:shadow-lg active:scale-[0.98]"
                  }
                `}
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    Publishing ride...
                  </>
                ) : (
                  <>
                    <Car size={15} />
                    Publish Ride
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          By publishing, you agree to CarpConnect's ride-sharing guidelines.
        </p>

        <AnimatePresence>
          {publishDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={(e) => e.target === e.currentTarget && setPublishDialog(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className="w-full max-w-md rounded-3xl bg-white border border-gray-200 shadow-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Ride Published</h3>
                    <p className="text-xs text-gray-500">Your offer is now visible to riders.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                  <p className="text-gray-700">
                    <span className="font-semibold">Route:</span> {publishDialog.origin} {" -> "} {publishDialog.destination}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-semibold">Departure:</span> {new Date(publishDialog.departure).toLocaleString("en-PK")}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-semibold">Seats / Fare:</span> {publishDialog.seats} seat(s), PKR {publishDialog.fare}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/driver-dashboard?tab=bookings")}
                    className="h-11 rounded-2xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
                  >
                    Manage Requests
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/driver-dashboard?tab=offers")}
                    className="h-11 rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600"
                  >
                    Open My Offers
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default OfferRide;
