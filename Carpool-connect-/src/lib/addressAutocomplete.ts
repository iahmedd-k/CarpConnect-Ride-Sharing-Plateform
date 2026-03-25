export interface AddressSuggestion {
  address: string;
  coordinates?: [number, number] | null;
  placeId?: string;
  source?: "osm";
}

const dedupeSuggestions = (items: AddressSuggestion[]) => {
  const seen = new Set<string>();
  const unique: AddressSuggestion[] = [];

  for (const item of items) {
    const key = String(item.address || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
};

export const fetchOsmSuggestions = async (query: string, limit = 6): Promise<AddressSuggestion[]> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((item: any) => {
        const lng = Number(item?.lon);
        const lat = Number(item?.lat);

        return {
          address: String(item?.display_name || "").trim(),
          coordinates: Number.isFinite(lng) && Number.isFinite(lat) ? ([lng, lat] as [number, number]) : null,
          placeId: String(item?.place_id || ""),
          source: "osm" as const,
        };
      })
      .filter((item: AddressSuggestion) => !!item.address);
  } catch {
    return [];
  }
};

export const fetchGoogleSuggestions = async (): Promise<AddressSuggestion[]> => {
  return [];
};

export const fetchAddressSuggestions = async (query: string, _apiKey?: string, limit = 6): Promise<AddressSuggestion[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const osmItems = await fetchOsmSuggestions(trimmed, limit);
  return dedupeSuggestions(osmItems).slice(0, limit);
};

export const resolveAddressCoordinates = async (
  address: string,
  _apiKey?: string,
  _placeId?: string
): Promise<[number, number] | null> => {
  const osmResults = await fetchOsmSuggestions(address, 1);
  const first = osmResults[0];

  if (Array.isArray(first?.coordinates) && first.coordinates.length >= 2) {
    const lng = Number(first.coordinates[0]);
    const lat = Number(first.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }

  return null;
};
