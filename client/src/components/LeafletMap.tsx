import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon paths for bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

// Custom marker icons
const createIcon = (color: string) =>
    L.divIcon({
        className: "custom-leaflet-icon",
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });

const originIcon = createIcon("#10b981"); // emerald
const destinationIcon = createIcon("#f59e0b"); // amber
const driverIcon = L.divIcon({
    className: "driver-leaflet-icon",
    html: `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:3px solid white;box-shadow:0 2px 12px rgba(99,102,241,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;">🚗</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Light tile layer URL
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const LIGHT_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

interface LeafletMapProps {
    origin?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
    routeCoords?: [number, number][]; // [[lat, lng], ...]
    driverLocation?: { lat: number; lng: number } | null;
    markers?: Array<{ lat: number; lng: number; label?: string; color?: string }>;
    className?: string;
    zoom?: number;
    interactive?: boolean;
}

const LeafletMap = ({
    origin,
    destination,
    routeCoords,
    driverLocation,
    markers,
    className = "",
    zoom = 12,
    interactive = true,
}: LeafletMapProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const driverMarkerRef = useRef<L.Marker | null>(null);
    const markersLayerRef = useRef<L.LayerGroup | null>(null);
    const polylineRef = useRef<L.Polyline | null>(null);
    const originMarkerRef = useRef<L.Marker | null>(null);
    const destMarkerRef = useRef<L.Marker | null>(null);

    // Initial Map Setup
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const center: L.LatLngExpression = origin
            ? [origin.lat, origin.lng]
            : [33.6844, 73.0479];

        const map = L.map(containerRef.current, {
            center,
            zoom,
            zoomControl: false,
            attributionControl: false,
            dragging: interactive,
            scrollWheelZoom: interactive,
            doubleClickZoom: interactive,
            touchZoom: interactive,
        });

        L.tileLayer(LIGHT_TILES, { attribution: LIGHT_ATTR, maxZoom: 19 }).addTo(map);
        if (interactive) L.control.zoom({ position: "bottomright" }).addTo(map);

        markersLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []); // Only once

    // Update markers and route
    useEffect(() => {
        if (!mapRef.current || !markersLayerRef.current) return;

        // Clear previous volatile layers
        markersLayerRef.current.clearLayers();
        if (originMarkerRef.current) originMarkerRef.current.remove();
        if (destMarkerRef.current) destMarkerRef.current.remove();
        if (polylineRef.current) polylineRef.current.remove();

        const bounds = L.latLngBounds([]);

        if (origin) {
            originMarkerRef.current = L.marker([origin.lat, origin.lng], { icon: originIcon })
                .addTo(mapRef.current)
                .bindPopup("<b>Pickup</b>");
            bounds.extend([origin.lat, origin.lng]);
        }

        if (destination) {
            destMarkerRef.current = L.marker([destination.lat, destination.lng], { icon: destinationIcon })
                .addTo(mapRef.current)
                .bindPopup("<b>Dropoff</b>");
            bounds.extend([destination.lat, destination.lng]);
        }

        if (routeCoords && routeCoords.length > 1) {
            polylineRef.current = L.polyline(routeCoords, {
                color: "#10b981",
                weight: 4,
                opacity: 0.85,
                smoothFactor: 1.5,
            }).addTo(mapRef.current);
            bounds.extend(polylineRef.current.getBounds());
        }

        if (markers && markers.length > 0) {
            markers.forEach((m) => {
                const icon = createIcon(m.color || "#6366f1");
                const marker = L.marker([m.lat, m.lng], { icon }).addTo(markersLayerRef.current!);
                if (m.label) marker.bindPopup(`<b>${m.label}</b>`);
                bounds.extend([m.lat, m.lng]);
            });
        }

        if (driverLocation) bounds.extend([driverLocation.lat, driverLocation.lng]);

        if (bounds.isValid() && interactive) {
            mapRef.current.fitBounds(bounds, { padding: [40, 40], animate: true });
        }
    }, [origin, destination, routeCoords, markers]);

    // Update driver position smoothly
    useEffect(() => {
        if (!driverLocation || !mapRef.current) return;

        if (driverMarkerRef.current) {
            driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
        } else {
            driverMarkerRef.current = L.marker(
                [driverLocation.lat, driverLocation.lng],
                { icon: driverIcon }
            ).addTo(mapRef.current);
        }
    }, [driverLocation]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full rounded-3xl overflow-hidden ${className}`}
            style={{ minHeight: 200 }}
        />
    );
};

export default LeafletMap;
