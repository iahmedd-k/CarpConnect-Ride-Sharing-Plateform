import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Car,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Share2,
  User,
  Users,
} from "lucide-react";
import LiveTrackingMap from "@/components/LiveTrackingMap";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const shortAddress = (value?: string) => (value ? value.split(",")[0] : "—");

const fmtDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

type PublicRider = {
  _id: string;
  name: string;
  verified?: boolean;
  phone?: string;
  seatCount?: number;
  status?: string;
};

export default function PublicTrackingPage() {
  const { rideId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [ride, setRide] = useState<any>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  const fetchTrackingRide = async () => {
    if (!rideId) return;
    try {
      setLoading(true);
      const res = await api.get(`/rides/track/${rideId}`);
      setRide(res.data?.data?.ride || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Tracking link is unavailable.");
      setRide(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackingRide();
    const interval = window.setInterval(fetchTrackingRide, 15000);
    return () => window.clearInterval(interval);
  }, [rideId]);

  const origin = useMemo(() => {
    const coords = ride?.origin?.coordinates;
    return Array.isArray(coords) && coords.length === 2
      ? { lat: Number(coords[1]), lng: Number(coords[0]) }
      : undefined;
  }, [ride]);

  const destination = useMemo(() => {
    const coords = ride?.destination?.coordinates;
    return Array.isArray(coords) && coords.length === 2
      ? { lat: Number(coords[1]), lng: Number(coords[0]) }
      : undefined;
  }, [ride]);

  const riders: PublicRider[] = Array.isArray(ride?.riders) ? ride.riders : [];

  const handleShare = async () => {
    const url = `${window.location.origin}/track/${rideId}`;
    await navigator.clipboard.writeText(url);
    toast.success("Tracking link copied.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Tracking unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">This ride link is invalid or the trip is no longer available.</p>
        </div>
      </div>
    );
  }

  const isCompleted = ride.status === "completed";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#ecfdf5_0%,#f8fafc_45%,#eef2ff_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[30px] border border-emerald-100 bg-white/92 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.09)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-emerald-600">
                {isCompleted ? "Ride Summary" : "Live Ride Tracking"}
              </div>
              <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                {shortAddress(ride.origin?.address)} to {shortAddress(ride.destination?.address)}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${isCompleted ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                  {isCompleted ? "Completed" : "Active"}
                </span>
                {ride.driver?.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified Driver
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  <Users className="h-3.5 w-3.5" /> {Number(ride?.safety?.activeRiderCount || riders.length)} rider(s)
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleShare} className="rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600">
                <Share2 className="mr-2 h-4 w-4" /> Share Link
              </Button>
            </div>
          </div>
        </div>

        {isCompleted ? (
          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">This ride has been completed</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Live tracking is no longer active for this trip. The driver reached the destination and the shared ride has finished successfully.
                  </p>
                  <p className="mt-3 text-sm font-semibold text-slate-800">
                    Completed at: {fmtDateTime(ride.completedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Route</div>
                  <div className="mt-2 text-sm font-semibold text-slate-800">{ride.origin?.address || "Pickup"}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{ride.destination?.address || "Dropoff"}</div>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Safety Snapshot</div>
                  <div className="mt-2 text-sm text-slate-700">Driver: {ride.driver?.name || "Driver"}</div>
                  <div className="mt-1 text-sm text-slate-700">Riders completed: {Number(ride?.safety?.completedRiderCount || riders.length)}</div>
                  <div className="mt-1 text-sm text-slate-700">Seats booked: {Number(ride?.safety?.totalSeatsBooked || 0)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">People on Trip</div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                      <Car className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{ride.driver?.name || "Driver"}</div>
                      <div className="text-xs text-slate-500">
                        {ride.vehicle?.make || ride.vehicle?.model
                          ? [ride.vehicle?.make, ride.vehicle?.model, ride.vehicle?.year].filter(Boolean).join(" ")
                          : "Vehicle details unavailable"}
                      </div>
                    </div>
                  </div>
                </div>

                {riders.length > 0 && riders.map((rider) => (
                  <div key={rider._id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-slate-700">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{rider.name}</div>
                          <div className="text-xs text-slate-500">{Number(rider.seatCount || 1)} seat(s)</div>
                        </div>
                      </div>
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                        {rider.status || "completed"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.45fr,0.95fr]">
            <div className="h-[520px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
              <LiveTrackingMap rideId={rideId} origin={origin} destination={destination} onEtaChange={setEtaMinutes} />
            </div>

            <div className="space-y-4">
              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Trip Status</div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">ETA</div>
                    <div className="mt-2 text-xl font-bold text-slate-900">
                      {etaMinutes != null ? `${etaMinutes} min` : "Calculating"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Departure</div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{fmtDateTime(ride.departureTime)}</div>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Pickup</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">{ride.origin?.address || "Pickup pending"}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-start gap-3">
                      <Navigation className="mt-0.5 h-4 w-4 text-amber-500" />
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Drop-off</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">{ride.destination?.address || "Destination pending"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Driver Safety Details</div>
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{ride.driver?.name || "Driver"}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {ride.vehicle?.make || ride.vehicle?.model
                          ? [ride.vehicle?.make, ride.vehicle?.model, ride.vehicle?.year].filter(Boolean).join(" ")
                          : "Vehicle details unavailable"}
                      </div>
                    </div>
                    {ride.driver?.verified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    )}
                  </div>
                  {ride.driver?.phone && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-emerald-600" /> {ride.driver.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Rider Details</div>
                <div className="mt-4 space-y-3">
                  {riders.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                      Rider details are not available yet.
                    </div>
                  ) : riders.map((rider) => (
                    <div key={rider._id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-slate-700">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{rider.name}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {Number(rider.seatCount || 1)} seat(s) • {rider.status || "pending"}
                            </div>
                            {rider.phone && (
                              <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                                <Phone className="h-3 w-3" /> {rider.phone}
                              </div>
                            )}
                          </div>
                        </div>
                        {rider.verified && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                            Verified
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
