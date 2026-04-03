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
  Music,
  Wind,
  PawPrint,
} from "lucide-react";
import { DateField } from "@/components/DateField";
import { TimeField } from "@/components/TimeField";
import { fetchAddressSuggestions, resolveAddressCoordinates } from "@/lib/addressAutocomplete";
import api from "../../lib/api";
import { useNavigate } from "react-router-dom";
import { currentPlanFromStorage, hasPlanAtLeast } from "@/lib/planAccess";

const todayLocal = () => new Date().toISOString().split("T")[0];
const WEEKDAY_OPTIONS = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
] as const;
const RECURRENCE_PRESETS = [
  { value: "weekdays", label: "Monday-Friday" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Weekly" },
  { value: "weekends", label: "Weekends" },
  { value: "custom", label: "Choose days" },
] as const;

const combineDateAndTime = (date: string, time: string) => {
  if (!date || !time) return "";
  return `${date}T${time}`;
};

const getDriverSeatLimitFromStorage = () => {
  try {
    const rawUser = localStorage.getItem("carpconnect_user");
    if (!rawUser) return 4;
    const parsedUser = JSON.parse(rawUser);
    const seats = Number(parsedUser?.vehicle?.seats);
    if (Number.isFinite(seats) && seats > 0) {
      return Math.floor(seats);
    }
  } catch {
    // fall back to default seat limit
  }
  return 4;
};

/* ─── Address Input ─────────────────────────────────────────────────────── */
function AddressInput({ value, placeholder, icon, suggestions, loading, onChange, onSelect, onClear }: any) {
  return (
    <div className="relative">
      <div
        className={`
          flex items-center gap-2 px-3.5 py-2.5 rounded-[22px] border transition-all duration-200 bg-white
          ${value ? "border-emerald-400 shadow-sm shadow-emerald-100" : "border-gray-200"}
          focus-within:border-emerald-500 focus-within:shadow-md focus-within:shadow-emerald-100
        `}
      >
        <span className="text-emerald-500 flex-shrink-0">{icon}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
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
            className="absolute left-4 top-full mt-1 text-xs text-gray-400 flex items-center gap-1 z-10"
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

/* ─── Pref Toggle ────────────────────────────────────────────────────────── */
function PrefToggle({
  label,
  icon,
  checked,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200
        ${
          checked
            ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200"
            : "bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600"
        }
      `}
    >
      <span className="flex-shrink-0">{icon}</span>
      {label}
    </button>
  );
}

/* ─── Section Label ──────────────────────────────────────────────────────── */
function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <span className="text-emerald-500">{icon}</span>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.18em]">{label}</span>
    </div>
  );
}

/* ─── Divider ────────────────────────────────────────────────────────────── */
function Divider({ vertical = false }: { vertical?: boolean }) {
  if (vertical) return <div className="hidden lg:block w-px bg-gray-100 self-stretch" />;
  return <div className="h-px bg-gray-100 w-full" />;
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
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
  const [departureDate, setDepartureDate] = useState(todayLocal());
  const [earliestTime, setEarliestTime] = useState("08:00");
  const [latestTime, setLatestTime] = useState("08:30");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState("weekdays");
  const [recurrenceDays, setRecurrenceDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [seatsTotal, setSeatsTotal] = useState(4);
  const [seatLimit, setSeatLimit] = useState(4);
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
  const parsedFare = Number(pricePerSeat) || 0;
  const estimatedEarnings = parsedFare * seatsTotal;
  const departurePreview = combineDateAndTime(departureDate, earliestTime);
  const selectedRecurrenceLabel =
    recurrencePattern === "custom"
      ? recurrenceDays.length > 0
        ? recurrenceDays
            .map((day) => WEEKDAY_OPTIONS.find((option) => option.code === day)?.label || day)
            .join(", ")
        : "Select at least one day"
      : RECURRENCE_PRESETS.find((option) => option.value === recurrencePattern)?.label || "Repeats";

  useEffect(() => {
    setCurrentPlan(currentPlanFromStorage());
    const limit = getDriverSeatLimitFromStorage();
    setSeatLimit(limit);
  }, []);

  useEffect(() => {
    const rawDraft = localStorage.getItem("carpconnect_offer_draft");
    if (!rawDraft) return;
    try {
      const draft = JSON.parse(rawDraft);
      if (draft?.origin) setOrigin(String(draft.origin));
      if (draft?.destination) setDestination(String(draft.destination));
      if (draft?.departureDate) setDepartureDate(String(draft.departureDate));
      if (draft?.earliestTime) setEarliestTime(String(draft.earliestTime));
      if (draft?.latestTime) setLatestTime(String(draft.latestTime));
      if (draft?.seatsTotal != null) {
        const draftSeats = Number(draft.seatsTotal) || 1;
        const limit = getDriverSeatLimitFromStorage();
        setSeatLimit(limit);
        setSeatsTotal(draftSeats);
      }
      if (draft?.pricePerSeat != null) setPricePerSeat(String(draft.pricePerSeat));
    } catch {
      // ignore malformed draft
    } finally {
      localStorage.removeItem("carpconnect_offer_draft");
    }
  }, []);

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

  const toggleRecurrenceDay = (dayCode: string) => {
    setRecurrenceDays((current) =>
      current.includes(dayCode)
        ? current.filter((day) => day !== dayCode)
        : [...current, dayCode]
    );
  };

  useEffect(() => {
    if (!isRecurring || recurrencePattern !== "custom" || recurrenceDays.length > 0) return;
    setRecurrenceDays(["mon"]);
  }, [isRecurring, recurrencePattern, recurrenceDays.length]);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!origin || !destination)
      return setErrorMsg("Please enter both pickup and drop-off locations.");
    const earliestDeparture = combineDateAndTime(departureDate, earliestTime);
    if (!earliestDeparture)
      return setErrorMsg("Please set a departure date and time.");
    if (departureDate && earliestTime && latestTime && latestTime < earliestTime)
      return setErrorMsg("Latest departure should be after earliest departure.");
    if (isRecurring && recurrencePattern === "custom" && recurrenceDays.length === 0)
      return setErrorMsg("Please select at least one recurring day.");
    if (!pricePerSeat || Number(pricePerSeat) < 0)
      return setErrorMsg("Please enter a valid price per seat.");
    if (!seatsTotal || Number(seatsTotal) <= 0)
      return setErrorMsg("Please enter a valid seat count.");
    if (Number(seatsTotal) > seatLimit)
      return setErrorMsg(`You can offer up to ${seatLimit} seat(s) based on your vehicle profile.`);

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
        seatsTotal: Number(seatsTotal),
        seatsAvailable: Number(seatsTotal),
        pricePerSeat: Number(pricePerSeat),
        preferences,
        isRecurring,
        ...(isRecurring && {
          recurrencePattern,
          recurrenceDays: recurrencePattern === "custom" ? recurrenceDays : undefined,
        }),
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

  return (
    <div className="min-h-screen bg-gray-50 px-3 pt-1 pb-4 sm:px-4 sm:pt-2 sm:pb-6 lg:px-6 lg:pt-3 lg:pb-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mx-auto w-full max-w-[1320px]"
      >
        {/* Page Header */}
        <div className="mb-4 sm:mb-5 flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-200 flex-shrink-0">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Offer a Ride</h1>
            <p className="text-xs sm:text-sm text-gray-400">Share your journey, earn on the way</p>
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

        <form onSubmit={handleCreateOffer}>
          {/* ── Single unified card ─────────────────────────────────────── */}
          <div className="bg-white rounded-[28px] border border-gray-200 shadow-sm shadow-gray-100 overflow-hidden">

            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-emerald-50/60 to-white">
              <div className="flex items-center gap-2">
                <Car size={15} className="text-emerald-500" />
                <span className="text-sm font-semibold text-gray-800">Publish ride</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Estimated</span>
                <span className="text-sm font-black text-emerald-600">PKR {estimatedEarnings || 0}</span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider">
                  Ready to publish
                </span>
              </div>
            </div>

            {/*
              Body grid:
              - mobile:  single column stack
              - lg+:     2-column grid with route | schedule on top, seats+price | preferences on bottom
            */}
            <div className="grid grid-cols-1 lg:grid-cols-2">

              {/* ── Route ─────────────────────────────────────────────── */}
              <div className="p-4 sm:p-5 border-b border-gray-100 lg:border-b-0 lg:border-r">
                <SectionLabel icon={<MapPin size={13} />} label="Route" />
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
                    onClear={() => { setOrigin(""); setOriginCoords(null); setOriginSugg([]); }}
                  />
                  {/* connector dot */}
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
                    onClear={() => { setDestination(""); setDestinationCoords(null); setDestinationSugg([]); }}
                  />
                </div>
              </div>

              {/* ── Schedule ──────────────────────────────────────────── */}
              <div className="p-4 sm:p-5 border-b border-gray-100">
                <SectionLabel icon={<Calendar size={13} />} label="Schedule" />
                <div className="rounded-[20px] border border-gray-100 bg-gray-50/60 p-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr] md:grid-cols-[1.1fr_0.95fr_0.95fr]">
                    <div className="rounded-[18px] border border-gray-200 bg-white px-3.5 py-2.5 shadow-sm sm:col-span-2 md:col-span-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                        Travel date
                      </label>
                      <DateField
                        value={departureDate}
                        min={todayLocal()}
                        onChange={setDepartureDate}
                        placeholder="Select travel date"
                        className="border-0 bg-transparent p-0 shadow-none hover:border-0"
                      />
                    </div>
                    <TimeField
                      value={earliestTime}
                      onChange={setEarliestTime}
                      label="Earliest"
                      className="border border-gray-200 bg-white shadow-sm text-gray-800"
                    />
                    <TimeField
                      value={latestTime}
                      onChange={setLatestTime}
                      label="Latest"
                      className="border border-gray-200 bg-white shadow-sm text-gray-800"
                    />
                  </div>
                </div>

                {/* Recurring toggle */}
                <div className="mt-3">
                  <label
                    className={`flex items-center gap-3 rounded-xl px-1 py-1 ${canUseRecurring ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                    onClick={() => { if (!canUseRecurring) return; setIsRecurring((v) => !v); }}
                  >
                    <div className="relative pointer-events-none flex-shrink-0">
                      <div className={`w-9 h-5 rounded-full transition-colors duration-200 ${isRecurring ? "bg-emerald-500" : "bg-gray-200"}`} />
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${isRecurring ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-xs font-medium text-gray-600">Recurring ride setup</span>
                    {!canUseRecurring && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                        <Lock size={9} /> Plus+
                      </span>
                    )}
                  </label>

                  {!canUseRecurring && (
                    <div className="mt-2 text-xs text-gray-500 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <span>Recurring routes are available on Plus and Pro plans.</span>
                      <button
                        type="button"
                        className="text-emerald-700 font-bold hover:underline flex-shrink-0"
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
                        <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-3">
                          <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                            Repeat
                          </label>
                          <select
                            value={recurrencePattern}
                            onChange={(e) => {
                              const nextPattern = e.target.value;
                              setRecurrencePattern(nextPattern);
                              if (nextPattern === "weekdays") {
                                setRecurrenceDays(["mon", "tue", "wed", "thu", "fri"]);
                              } else if (nextPattern === "weekends") {
                                setRecurrenceDays(["sat", "sun"]);
                              } else if (nextPattern === "weekly" && departureDate) {
                                const weekdayIndex = new Date(`${departureDate}T00:00:00`).getDay();
                                const weekdayCode = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekdayIndex];
                                setRecurrenceDays([weekdayCode]);
                              }
                            }}
                            disabled={!canUseRecurring}
                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700 outline-none focus:border-emerald-400"
                          >
                            {RECURRENCE_PRESETS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          {recurrencePattern === "custom" && (
                            <div className="mt-3">
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                                Select days
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {WEEKDAY_OPTIONS.map((day) => {
                                  const active = recurrenceDays.includes(day.code);
                                  return (
                                    <button
                                      key={day.code}
                                      type="button"
                                      onClick={() => toggleRecurrenceDay(day.code)}
                                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                                        active
                                          ? "border-emerald-500 bg-emerald-500 text-white"
                                          : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-600"
                                      }`}
                                    >
                                      {day.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <p className="mt-3 text-xs text-gray-500">
                            Matching offers for the selected recurring day will appear automatically when that day is searched.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Seats & Price ──────────────────────────────────────── */}
              <div className="p-4 sm:p-5 border-b border-gray-100 lg:border-b-0 lg:border-r lg:border-t">
                <SectionLabel icon={<Users size={13} />} label="Seats & Price" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Available seats
                    </label>
                    <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden focus-within:border-emerald-400 transition-all bg-white">
                      <span className="pl-3 text-emerald-500 flex-shrink-0">
                        <Users size={13} />
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(seatsTotal)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          const nextSeats = Number(raw || 0);
                          setSeatsTotal(nextSeats);
                        }}
                        className="flex-1 min-w-0 px-3 py-2.5 text-sm text-gray-700 outline-none bg-transparent"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 leading-tight">Driver not counted. Max {seatLimit} seat(s) from your profile.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Price / seat (PKR)
                    </label>
                    <div className="flex items-center border border-gray-200 rounded-2xl overflow-hidden focus-within:border-emerald-400 transition-all bg-white">
                      <span className="pl-3 text-emerald-500 flex-shrink-0">
                        <DollarSign size={13} />
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pricePerSeat}
                        onChange={(e) => setPricePerSeat(e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0"
                        className="flex-1 min-w-0 px-3 py-2.5 text-sm text-gray-700 outline-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Mini summary row: seats × fare */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Rider seats</div>
                    <div className="mt-1 text-xl font-black text-gray-900">{seatsTotal || 0}</div>
                  </div>
                  <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Per seat</div>
                    <div className="mt-1 text-xl font-black text-gray-900 break-all">PKR {parsedFare || 0}</div>
                  </div>
                </div>
              </div>

              {/* ── Ride Preferences ──────────────────────────────────── */}
              <div className="p-4 sm:p-5 border-b border-gray-100 lg:border-t">
                <SectionLabel icon={<CheckCircle size={13} />} label="Ride Preferences" />
                <div className="flex flex-wrap gap-2 mb-4">
                  <PrefToggle
                    label="Music"
                    icon={<Music size={12} />}
                    checked={preferences.music}
                    onChange={(v) => setPreferences((p) => ({ ...p, music: v }))}
                  />
                  <PrefToggle
                    label="Smoking"
                    icon={<Wind size={12} />}
                    checked={preferences.smoking}
                    onChange={(v) => setPreferences((p) => ({ ...p, smoking: v }))}
                  />
                  <PrefToggle
                    label="Pets"
                    icon={<PawPrint size={12} />}
                    checked={preferences.pets}
                    onChange={(v) => setPreferences((p) => ({ ...p, pets: v }))}
                  />
                </div>

                {/* Route + timing mini-summary */}
                <div className="rounded-[18px] border border-gray-100 bg-gray-50 p-3 space-y-2 text-xs">
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                    <span className="text-gray-400 font-semibold uppercase tracking-wider text-[10px] pt-0.5">From</span>
                    <span className="text-gray-700 font-medium break-words">{origin || "Pickup location"}</span>
                    <span className="text-gray-400 font-semibold uppercase tracking-wider text-[10px] pt-0.5">To</span>
                    <span className="text-gray-700 font-medium break-words">{destination || "Drop-off location"}</span>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex items-center justify-between text-[11px] text-gray-500">
                    <span>
                      {departureDate ? new Date(departureDate).toLocaleDateString("en-PK", { dateStyle: "medium" }) : "Date TBD"}
                    </span>
                    <span className="font-semibold text-gray-700">{earliestTime} – {latestTime}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer: submit ──────────────────────────────────────── */}
            <div className="px-4 sm:px-5 py-4 border-t border-gray-100 bg-gradient-to-r from-white to-emerald-50/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-gray-400 text-center sm:text-left order-2 sm:order-1">
                By publishing, you agree to CarpConnect's ride-sharing guidelines.
              </p>
              <button
                type="submit"
                disabled={loading}
                className={`
                  order-1 sm:order-2 flex items-center justify-center gap-2 py-2.5 px-6 rounded-[18px] font-semibold text-sm
                  transition-all duration-200 min-w-[160px]
                  ${
                    loading
                      ? "bg-emerald-300 text-white cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:shadow-lg active:scale-[0.98]"
                  }
                `}
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <Car size={14} />
                    Publish Ride
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* ── Success Dialog ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {publishDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
              onClick={(e) => e.target === e.currentTarget && setPublishDialog(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 32, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                className="w-full max-w-md rounded-3xl bg-white border border-gray-200 shadow-2xl p-5 sm:p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Ride Published</h3>
                    <p className="text-xs text-gray-500">Your offer is now visible to riders.</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
                  <p className="text-gray-700 break-words">
                    <span className="font-semibold">Route:</span> {publishDialog.origin} {" → "} {publishDialog.destination}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-semibold">Departure:</span>{" "}
                    {new Date(publishDialog.departure).toLocaleString("en-PK")}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-semibold">Seats / Fare:</span> {publishDialog.seats} seat(s), PKR {publishDialog.fare}
                  </p>
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => navigate("/driver-dashboard?tab=bookings")}
                    className="h-11 w-full rounded-2xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
                  >
                    Manage Requests
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
