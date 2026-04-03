import api from "@/lib/api";

export interface AddressSuggestion {
  address: string;
  coordinates?: [number, number] | null;
  placeId?: string;
  source?: "osm";
}

const asSuggestions = (value: unknown): AddressSuggestion[] =>
  Array.isArray(value) ? (value as AddressSuggestion[]) : [];

export const fetchOsmSuggestions = async (query: string, limit = 8): Promise<AddressSuggestion[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await api.get("/rides/address-suggestions", {
      params: { q: trimmed, limit },
    });
    return asSuggestions(res.data?.data?.results);
  } catch {
    return [];
  }
};

export const fetchGoogleSuggestions = async (): Promise<AddressSuggestion[]> => {
  return [];
};

export const fetchAddressSuggestions = async (query: string, _apiKey?: string, limit = 8): Promise<AddressSuggestion[]> => {
  return fetchOsmSuggestions(query, limit);
};

export const resolveAddressCoordinates = async (
  address: string,
  _apiKey?: string,
  _placeId?: string
): Promise<[number, number] | null> => {
  const trimmed = String(address || "").trim();
  if (!trimmed) return null;

  try {
    const res = await api.get("/rides/address-resolve", {
      params: { q: trimmed },
    });
    const result = res.data?.data?.result;
    if (Array.isArray(result?.coordinates) && result.coordinates.length >= 2) {
      const lng = Number(result.coordinates[0]);
      const lat = Number(result.coordinates[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    }
  } catch {
    return null;
  }

  return null;
};
