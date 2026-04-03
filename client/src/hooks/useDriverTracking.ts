import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ref, remove, set } from "firebase/database";
import { db, firebaseEnabled } from "@/lib/firebase";

type DriverCoords = {
  lat: number;
  lng: number;
  updatedAt: number;
  speedKmh: number;
};

type UseDriverTrackingOptions = {
  rideId?: string | null;
  enabled?: boolean;
  cleanupOnComplete?: boolean;
  onLocation?: (location: DriverCoords) => void;
};

const WRITE_INTERVAL_MS = 10_000;

export function useDriverTracking({
  rideId,
  enabled = false,
  cleanupOnComplete = false,
  onLocation,
}: UseDriverTrackingOptions) {
  const [currentLocation, setCurrentLocation] = useState<DriverCoords | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteAtRef = useRef(0);
  const currentRideIdRef = useRef<string | null>(null);

  const locationPath = useMemo(
    () => (rideId ? `rides/${rideId}/location` : null),
    [rideId]
  );

  const writeLocation = useCallback(async (location: DriverCoords, force = false) => {
    if (!firebaseEnabled || !db || !locationPath) return;

    const now = Date.now();
    if (!force && now - lastWriteAtRef.current < WRITE_INTERVAL_MS) return;

    await set(ref(db, locationPath), {
      lat: location.lat,
      lng: location.lng,
      updatedAt: location.updatedAt,
    });
    lastWriteAtRef.current = now;
  }, [locationPath]);

  const publishLocation = useCallback(async (coords: { lat: number; lng: number; speedKmh?: number }, force = true) => {
    const nextLocation: DriverCoords = {
      lat: coords.lat,
      lng: coords.lng,
      updatedAt: Date.now(),
      speedKmh: Number(coords.speedKmh || 0),
    };

    setCurrentLocation(nextLocation);
    onLocation?.(nextLocation);
    await writeLocation(nextLocation, force);
  }, [onLocation, writeLocation]);

  useEffect(() => {
    currentRideIdRef.current = rideId || null;
  }, [rideId]);

  useEffect(() => {
    if (!cleanupOnComplete || !firebaseEnabled || !db || !currentRideIdRef.current) return;

    const completedPath = `rides/${currentRideIdRef.current}`;
    remove(ref(db, completedPath)).catch((cleanupError) => {
      console.error("[driver-tracking] failed to remove completed ride tracking:", cleanupError);
    });
  }, [cleanupOnComplete]);

  useEffect(() => {
    if (!enabled || !rideId) {
      setIsTracking(false);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }

    setError(null);
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const nextLocation: DriverCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          updatedAt: Date.now(),
          speedKmh: Math.max(0, Number(position.coords.speed || 0) * 3.6),
        };

        setCurrentLocation(nextLocation);
        onLocation?.(nextLocation);

        try {
          await writeLocation(nextLocation);
        } catch (writeError) {
          console.error("[driver-tracking] failed to write location:", writeError);
        }
      },
      (geoError) => {
        setError(geoError.message || "Failed to access driver location.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
    };
  }, [enabled, onLocation, rideId, writeLocation]);

  return {
    currentLocation,
    isTracking,
    error,
    publishLocation,
  };
}
