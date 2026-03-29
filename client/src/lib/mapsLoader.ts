let googleMapsPromise: Promise<void> | null = null;

export const loadGoogleMaps = (apiKey: string): Promise<void> => {
    if (window.google?.maps) {
        return Promise.resolve();
    }

    if (googleMapsPromise) {
        return googleMapsPromise;
    }

    googleMapsPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-google-maps-loader="true"]') as HTMLScriptElement | null;
        if (existingScript) {
            existingScript.addEventListener("load", () => resolve(), { once: true });
            existingScript.addEventListener("error", (err) => reject(err), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.dataset.googleMapsLoader = "true";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry&language=en&region=PK&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = (err) => {
            googleMapsPromise = null;
            reject(err);
        };
        document.head.appendChild(script);
    });

    return googleMapsPromise;
};

export const decodePolyline = (encoded: string) => {
    if (!window.google) return [];
    return window.google.maps.geometry.encoding.decodePath(encoded);
};
