import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/mapsLoader";

interface GoogleMapProps {
    polyline?: string;
    origin?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
}

const GoogleMap = ({ polyline, origin, destination }: GoogleMapProps) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const googleMapRef = useRef<google.maps.Map | null>(null);

    const apiKey = "AIzaSyAOVYRIgupAurZup5y1PRh8Ismb1A3lLao"; // Extracted from your env

    useEffect(() => {
        loadGoogleMaps(apiKey).then(() => {
            if (!mapRef.current) return;

            const map = new google.maps.Map(mapRef.current, {
                center: origin || { lat: 33.6844, lng: 73.0479 }, // Default Islamabad
                zoom: 12,
                styles: mapDarkStyle,
                disableDefaultUI: true,
            });

            googleMapRef.current = map;

            if (polyline) {
                const path = google.maps.geometry.encoding.decodePath(polyline);
                const poly = new google.maps.Polyline({
                    path: path,
                    geodesic: true,
                    strokeColor: "#10b981",
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                });
                poly.setMap(map);

                // Fit bounds
                const bounds = new google.maps.LatLngBounds();
                path.forEach((p) => bounds.extend(p));
                map.fitBounds(bounds);
            }
        });
    }, [polyline, origin, destination]);

    return (
        <div ref={mapRef} className="w-full h-full rounded-3xl overflow-hidden grayscale-[0.5] contrast-[1.1]" />
    );
};

// Sleek dark theme for the map
const mapDarkStyle = [
    { elementType: "geometry", stylers: [{ color: "#212121" }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
    { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
    { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2c2c2c" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3c3c3c" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#000000" }] },
];

export default GoogleMap;
