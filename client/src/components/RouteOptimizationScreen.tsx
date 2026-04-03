import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/lib/mapsLoader";
import { Clock3, MapPin, Route, Wallet } from "lucide-react";

type Coordinates = [number, number];

type OptimizationItem = {
  riderId: string;
  riderName: string;
  pickupLocation: string;
  addedDetourMinutes: number;
  pickupPoint?: { coordinates?: Coordinates };
  extraEarning?: number;
  currency?: string;
};

type RouteOptimization = {
  polyline?: string;
  geometry?: { coordinates?: Coordinates[] };
  totalDetourMinutes?: number;
  totalExtraEarning?: number;
  selectedRoute?: string;
  suggestedPickupOrder?: OptimizationItem[];
  excludedRiders?: Array<{
    riderId: string;
    riderName: string;
    pickupLocation: string;
    addedDetourMinutes: number;
  }>;
};

type BookingLike = {
  rider?: { _id?: string; name?: string };
  request?: { origin?: { address?: string; coordinates?: Coordinates } };
  fare?: { totalAmount?: number; currency?: string };
};

type RouteOptimizationScreenProps = {
  origin?: { address?: string; coordinates?: Coordinates };
  destination?: { address?: string; coordinates?: Coordinates };
  optimization: RouteOptimization;
  bookings: BookingLike[];
  submitting: boolean;
  onAccept: () => void;
  onReject: () => void;
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const toLatLng = (coords?: Coordinates | null) =>
  Array.isArray(coords) && coords.length >= 2
    ? { lat: Number(coords[1]), lng: Number(coords[0]) }
    : null;

const formatMoney = (value: number, currency = "PKR") => {
  const rounded = Math.round(Number(value || 0));
  return `${currency === "PKR" ? "Rs." : currency} ${rounded.toLocaleString()}`;
};

export default function RouteOptimizationScreen({
  origin,
  destination,
  optimization,
  bookings,
  submitting,
  onAccept,
  onReject,
}: RouteOptimizationScreenProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  const pickupOrder = useMemo(() => {
    const bookingMap = new Map(
      bookings.map((booking) => [String(booking.rider?._id || ""), booking])
    );

    return (optimization?.suggestedPickupOrder || []).map((item, index) => {
      const booking = bookingMap.get(String(item.riderId));
      return {
        ...item,
        riderName: item.riderName || booking?.rider?.name || `Rider ${index + 1}`,
        pickupLocation:
          item.pickupLocation ||
          booking?.request?.origin?.address ||
          "Pickup point",
        extraEarning:
          Number(item.extraEarning || booking?.fare?.totalAmount || 0),
        currency: item.currency || booking?.fare?.currency || "PKR",
      };
    });
  }, [bookings, optimization?.suggestedPickupOrder]);

  useEffect(() => {
    let mounted = true;
    let routePolyline: google.maps.Polyline | null = null;
    const markers: google.maps.Marker[] = [];

    loadGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then(() => {
        if (!mounted || !mapRef.current) return;

        const map = new google.maps.Map(mapRef.current, {
          center: toLatLng(origin?.coordinates) || { lat: 33.6844, lng: 73.0479 },
          zoom: 11,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        const bounds = new google.maps.LatLngBounds();
        const routeCoordinates = optimization?.geometry?.coordinates || [];

        const originLatLng = toLatLng(origin?.coordinates);
        const destinationLatLng = toLatLng(destination?.coordinates);

        if (originLatLng) {
          markers.push(new google.maps.Marker({
            map,
            position: originLatLng,
            title: origin?.address || "Origin",
            label: "S",
          }));
          bounds.extend(originLatLng);
        }

        pickupOrder.forEach((item, index) => {
          const point = toLatLng(item.pickupPoint?.coordinates);
          if (!point) return;
          markers.push(new google.maps.Marker({
            map,
            position: point,
            title: item.pickupLocation,
            label: String(index + 1),
          }));
          bounds.extend(point);
        });

        if (destinationLatLng) {
          markers.push(new google.maps.Marker({
            map,
            position: destinationLatLng,
            title: destination?.address || "Destination",
            label: "D",
          }));
          bounds.extend(destinationLatLng);
        }

        if (optimization?.polyline) {
          routePolyline = new google.maps.Polyline({
            map,
            path: google.maps.geometry.encoding.decodePath(optimization.polyline),
            geodesic: true,
            strokeColor: "#0f766e",
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
        } else if (routeCoordinates.length > 1) {
          routePolyline = new google.maps.Polyline({
            map,
            path: routeCoordinates.map((coords) => ({ lat: Number(coords[1]), lng: Number(coords[0]) })),
            geodesic: true,
            strokeColor: "#0f766e",
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          routePolyline.setMap(map);
        }

        routeCoordinates.forEach((coords) => {
          const point = toLatLng(coords);
          if (point) bounds.extend(point);
        });

        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 60);
        }
      })
      .catch((error) => {
        console.error("[route-optimization] failed to load Google Maps:", error);
      });

    return () => {
      mounted = false;
      routePolyline?.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [destination?.address, destination?.coordinates, optimization?.geometry?.coordinates, optimization?.polyline, origin?.address, origin?.coordinates, pickupOrder]);

  const currency = pickupOrder[0]?.currency || "PKR";
  const totalExtraEarning = Number(
    optimization?.totalExtraEarning ||
      pickupOrder.reduce((sum, item) => sum + Number(item.extraEarning || 0), 0)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-teal-200 bg-[linear-gradient(135deg,#ecfeff_0%,#f8fafc_55%,#ffffff_100%)] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-600">
              Route Suggestion
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              Suggested pickup order before you start
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Google Maps reordered the pickup stops for the shortest practical detour. Accept to use the suggested route, or reject to continue with your original path.
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3">
            <div className="rounded-2xl border border-teal-200 bg-white/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Total Detour</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-bold text-slate-900">
                <Clock3 size={16} className="text-teal-600" />
                {Number(optimization?.totalDetourMinutes || 0)} mins
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-white/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Extra Earning</p>
              <p className="mt-2 flex items-center gap-2 text-lg font-bold text-emerald-700">
                <Wallet size={16} />
                {formatMoney(totalExtraEarning, currency)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
              Suggested Route Map
            </h3>
          </div>
          <div ref={mapRef} className="h-[360px] w-full bg-slate-100" />
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Route size={16} className="text-teal-600" />
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-500">
                Suggested Pickup Order
              </h3>
            </div>
            <div className="space-y-3">
              {pickupOrder.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No pickup reordering was needed for this match.
                </div>
              ) : (
                pickupOrder.map((item, index) => (
                  <div key={`${item.riderId}_${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-600 text-sm font-bold text-white">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {item.riderName}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                            <MapPin size={13} />
                            {item.pickupLocation}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        +{Number(item.addedDetourMinutes || 0)} mins
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {(optimization?.excludedRiders || []).length > 0 && (
            <div className="rounded-[28px] border border-amber-200 bg-amber-50/80 p-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.22em] text-amber-700">
                Excluded From Suggestion
              </h3>
              <div className="mt-3 space-y-2">
                {optimization.excludedRiders?.map((rider) => (
                  <div key={rider.riderId} className="rounded-2xl border border-amber-100 bg-white/70 px-4 py-3 text-sm text-amber-900">
                    {rider.riderName} at {rider.pickupLocation} exceeds the 10-minute detour limit by adding {rider.addedDetourMinutes} mins.
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={onAccept}
              disabled={submitting}
              className="h-12 flex-1 rounded-2xl bg-teal-600 text-white hover:bg-teal-700"
            >
              Accept
            </Button>
            <Button
              onClick={onReject}
              disabled={submitting}
              variant="outline"
              className="h-12 flex-1 rounded-2xl border-slate-300"
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
