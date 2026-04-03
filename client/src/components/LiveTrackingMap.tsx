import { useEffect, useMemo, useRef, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db, firebaseEnabled } from "@/lib/firebase";
import { loadGoogleMaps } from "@/lib/mapsLoader";

type Point = { lat: number; lng: number };

type LiveTrackingMapProps = {
  rideId: string;
  origin?: Point;
  destination?: Point;
  className?: string;
  onEtaChange?: (etaMinutes: number | null) => void;
};

const DEFAULT_CENTER = { lat: 33.6844, lng: 73.0479 };
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

const haversineKm = (a: Point, b: Point) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const animateMarker = (
  marker: google.maps.Marker,
  from: Point,
  to: Point,
  duration = 900
) => {
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    marker.setPosition({
      lat: from.lat + (to.lat - from.lat) * eased,
      lng: from.lng + (to.lng - from.lng) * eased,
    });
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

export default function LiveTrackingMap({
  rideId,
  origin,
  destination,
  className,
  onEtaChange,
}: LiveTrackingMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const lastDriverPositionRef = useRef<Point | null>(null);
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  const boundsPoints = useMemo(
    () => [origin, destination].filter(Boolean) as Point[],
    [origin, destination]
  );

  useEffect(() => {
    let mounted = true;
    loadGoogleMaps(GOOGLE_MAPS_API_KEY).then(() => {
      if (!mounted || !mapElRef.current) return;

      const map = new google.maps.Map(mapElRef.current, {
        center: origin || destination || DEFAULT_CENTER,
        zoom: 12,
        disableDefaultUI: false,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });

      mapRef.current = map;

      if (origin) {
        new google.maps.Marker({
          map,
          position: origin,
          title: "Origin",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#10b981",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      }

      if (destination) {
        new google.maps.Marker({
          map,
          position: destination,
          title: "Destination",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#f59e0b",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
      }

      if (origin && destination) {
        new google.maps.Polyline({
          map,
          path: [origin, destination],
          geodesic: true,
          strokeColor: "#14b8a6",
          strokeOpacity: 0.85,
          strokeWeight: 4,
        });
      }

      if (boundsPoints.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        boundsPoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 60);
      }

      driverMarkerRef.current = new google.maps.Marker({
        map,
        title: "Driver",
        visible: false,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    }).catch((error) => {
      console.error("[live-tracking-map] failed to load Google Maps:", error);
    });

    return () => {
      mounted = false;
    };
  }, [boundsPoints, destination, origin]);

  useEffect(() => {
    if (!firebaseEnabled || !db || !rideId) {
      setLocationUnavailable(true);
      onEtaChange?.(null);
      return;
    }

    const locationRef = ref(db, `rides/${rideId}/location`);
    const unsubscribe = onValue(locationRef, (snapshot) => {
      const value = snapshot.val();
      if (!value || !Number.isFinite(Number(value.lat)) || !Number.isFinite(Number(value.lng))) {
        setLocationUnavailable(true);
        onEtaChange?.(null);
        if (driverMarkerRef.current) {
          driverMarkerRef.current.setVisible(false);
        }
        return;
      }

      const nextPoint = { lat: Number(value.lat), lng: Number(value.lng) };
      const map = mapRef.current;
      const marker = driverMarkerRef.current;

      setLocationUnavailable(false);

      if (marker) {
        if (!marker.getVisible()) {
          marker.setPosition(nextPoint);
          marker.setVisible(true);
        } else if (lastDriverPositionRef.current) {
          animateMarker(marker, lastDriverPositionRef.current, nextPoint);
        } else {
          marker.setPosition(nextPoint);
        }
      }

      if (map) {
        map.panTo(nextPoint);
      }

      lastDriverPositionRef.current = nextPoint;

      if (destination) {
        const remainingKm = haversineKm(nextPoint, destination);
        const fallbackSpeedKmh = 35;
        const etaMinutes = Math.max(1, Math.round((remainingKm / fallbackSpeedKmh) * 60));
        onEtaChange?.(etaMinutes);
      } else {
        onEtaChange?.(null);
      }
    });

    return () => unsubscribe();
  }, [destination, onEtaChange, rideId]);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-3xl ${className || ""}`}>
      <div ref={mapElRef} className="h-full w-full" />
      {locationUnavailable && (
        <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-lg backdrop-blur">
          Waiting for the driver's live location...
        </div>
      )}
    </div>
  );
}

