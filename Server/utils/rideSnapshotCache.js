const snapshotStore = new Map();

const toPlainCoords = (value) => {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }

  if (value && Array.isArray(value.coordinates) && value.coordinates.length >= 2) {
    const lng = Number(value.coordinates[0]);
    const lat = Number(value.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }

  if (value && Array.isArray(value.point?.coordinates) && value.point.coordinates.length >= 2) {
    const lng = Number(value.point.coordinates[0]);
    const lat = Number(value.point.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }

  return null;
};

const normalizeRouteCoords = (routeGeoJson) => {
  const coords = routeGeoJson?.geometry?.coordinates || routeGeoJson?.coordinates;
  return Array.isArray(coords) ? coords.map((point) => toPlainCoords(point)).filter(Boolean) : null;
};

const buildRideSnapshot = (offer) => {
  if (!offer?._id) return null;

  return {
    _id: String(offer._id),
    originAddress: String(offer.originAddress || offer.origin?.address || '').trim(),
    destinationAddress: String(offer.destinationAddress || offer.destination?.address || '').trim(),
    originCoords: toPlainCoords(offer.origin),
    destinationCoords: toPlainCoords(offer.destination),
    routeCoords: normalizeRouteCoords(offer.routeGeoJson),
    departureTime: offer.departureTime || null,
    estimatedDistanceKm: Number(offer.estimatedDistanceKm || 0) || null,
    estimatedDurationMin: Number(offer.estimatedDurationMin || 0) || null,
  };
};

const setRideSnapshot = (offer) => {
  const snapshot = buildRideSnapshot(offer);
  if (!snapshot) return null;
  snapshotStore.set(snapshot._id, snapshot);
  return snapshot;
};

const getRideSnapshot = (offerId) => {
  const key = String(offerId || '');
  if (!key) return null;
  return snapshotStore.get(key) || null;
};

module.exports = {
  setRideSnapshot,
  getRideSnapshot,
};
