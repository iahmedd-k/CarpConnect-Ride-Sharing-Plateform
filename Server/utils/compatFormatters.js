const { calculateRouteDistance, calculateRouteDuration } = require('./geospatial');
const { getRideSnapshot } = require('./rideSnapshotCache');

const CITY_CENTROIDS = [
  { pattern: /islamabad|rawalpindi|rwp/i, coords: [73.0479, 33.6844] },
  { pattern: /lahore/i, coords: [74.3587, 31.5204] },
  { pattern: /karachi/i, coords: [67.0011, 24.8607] },
  { pattern: /faisalabad/i, coords: [73.0845, 31.4504] },
  { pattern: /peshawar/i, coords: [71.5249, 34.0151] },
  { pattern: /quetta/i, coords: [66.975, 30.1798] },
  { pattern: /multan/i, coords: [71.5249, 30.1575] },
  { pattern: /hyderabad/i, coords: [68.3737, 25.396] },
  { pattern: /sialkot/i, coords: [74.5229, 32.4945] },
  { pattern: /gujranwala/i, coords: [74.1883, 32.1877] },
  { pattern: /bahawalpur/i, coords: [71.6833, 29.3956] }
];

const mapOfferStatusToApi = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['booked', 'matched'].includes(normalized)) return 'open';
  if (['active', 'live'].includes(normalized)) return 'active';
  if (normalized === 'completed') return 'completed';
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
  return 'open';
};

const mapOfferStatusFromApi = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['scheduled', 'open'].includes(normalized)) return 'open';
  if (['live', 'active', 'booked', 'matched'].includes(normalized)) return 'active';
  if (normalized === 'completed') return 'completed';
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
  return 'open';
};

const mapRideStatusToApi = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active' || normalized === 'in-ride') return 'live';
  if (normalized === 'picked-up') return 'picked_up';
  return normalized || 'pending';
};

const mapRideStatusFromApi = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'in-ride' || normalized === 'active') return 'live';
  if (normalized === 'picked-up') return 'picked_up';
  return normalized || 'pending';
};

const parsePoint = (point) => {
  // Handle case where point is null/undefined
  if (!point) return null;
  
  // Handle case where point is already in [lng, lat] format
  if (Array.isArray(point) && point.length === 2) {
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }
  
  // Handle case where point is object with coordinates array
  if (point.coordinates && Array.isArray(point.coordinates) && point.coordinates.length === 2) {
    const lng = Number(point.coordinates[0]);
    const lat = Number(point.coordinates[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  }
  
  // Handle case where point is object with lat/lng properties
  const lng = Number(point.lng ?? point.longitude ?? point.lon);
  const lat = Number(point.lat ?? point.latitude);
  
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    // Ensure correct order: [longitude, latitude]
    return [lng, lat];
  }
  
  return null;
};

const inferPointFromAddress = (address) => {
  const text = String(address || '').trim();
  if (!text) return null;

  // First, try to extract coordinates from address string
  const coordMatch = text.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (coordMatch) {
    const lat = Number(coordMatch[1]);
    const lng = Number(coordMatch[2]);
    
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // Validate coordinates are within reasonable ranges
      if ((Math.abs(lat) <= 90) && (Math.abs(lng) <= 180)) {
        return [lng, lat];
      }
      if ((Math.abs(lat) <= 180) && (Math.abs(lng) <= 90)) {
        return [lat, lng];
      }
    }
  }

  // Second, check for city names
  const matched = CITY_CENTROIDS.find(item => item.pattern.test(text));
  if (matched) {
    return matched.coords;
  }

  // Third, check for country names
  const countryMatch = text.match(/pakistan|pk/i);
  if (countryMatch) {
    return [74.3587, 31.5204]; // Lahore as fallback
  }

  return null;
};

const isCoordinateLikeAddress = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?$/.test(text);
};

const firstReadableAddress = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    if (isCoordinateLikeAddress(text)) continue;
    return text;
  }
  return '';
};

const haversineDistanceKm = (from, to) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || to.length < 2) {
    return 0;
  }

  const fromLng = Number(from[0]);
  const fromLat = Number(from[1]);
  const toLng = Number(to[0]);
  const toLat = Number(to[1]);
  if (![fromLng, fromLat, toLng, toLat].every(Number.isFinite)) return 0;

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;

  return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

const estimateMinutesFromDistance = (distanceKm, averageSpeedKmH = 35) => {
  const normalizedDistance = Number(distanceKm || 0);
  if (!(normalizedDistance > 0)) return 0;
  return Math.max(1, Math.round((normalizedDistance / averageSpeedKmH) * 60));
};

const toOfferResponse = (offer, driver, options = {}) => {
  const { includeEmissions = true } = options;
  const snapshot = getRideSnapshot(offer?._id);
  const originAddress =
    firstReadableAddress(
      offer.originAddress,
      offer.origin?.address,
      offer.origin?.location?.address,
      snapshot?.originAddress
    ) || 'Unknown origin';
  const destinationAddress =
    firstReadableAddress(
      offer.destinationAddress,
      offer.destination?.address,
      offer.destination?.location?.address,
      snapshot?.destinationAddress
    ) || 'Unknown destination';
  const originCoordinates =
    offer.origin?.coordinates ||
    offer.origin?.point?.coordinates ||
    snapshot?.originCoords ||
    [];
  const destinationCoordinates =
    offer.destination?.coordinates ||
    offer.destination?.point?.coordinates ||
    snapshot?.destinationCoords ||
    [];
  const routeCoordinates = offer.routeGeoJson?.coordinates || offer.routeGeoJson?.geometry?.coordinates || snapshot?.routeCoords;
  const hasDetailedRoute = Array.isArray(routeCoordinates) && routeCoordinates.length > 2;
  const directDistanceKm = haversineDistanceKm(originCoordinates, destinationCoordinates);
  const fallbackDistanceKm = hasDetailedRoute
    ? Number((calculateRouteDistance(offer.routeGeoJson) / 1000).toFixed(2))
    : directDistanceKm;
  const fallbackDurationMin = hasDetailedRoute
    ? Number(Math.round(calculateRouteDuration(offer.routeGeoJson)))
    : estimateMinutesFromDistance(directDistanceKm);
  const estimatedDistanceKm =
    Number(offer.estimatedDistanceKm || snapshot?.estimatedDistanceKm || 0) > 0
      ? Number(offer.estimatedDistanceKm || snapshot?.estimatedDistanceKm)
      : fallbackDistanceKm;
  const estimatedDurationMin =
    Number(offer.estimatedDurationMin || snapshot?.estimatedDurationMin || 0) > 0
      ? Number(offer.estimatedDurationMin || snapshot?.estimatedDurationMin)
      : fallbackDurationMin;
  
  return {
    _id: String(offer._id),
    id: String(offer._id),
    origin: {
      address: originAddress,
      point: {
        coordinates: originCoordinates
      },
      coordinates: originCoordinates
    },
    destination: {
      address: destinationAddress,
      point: {
        coordinates: destinationCoordinates
      },
      coordinates: destinationCoordinates
    },
    departureTime: offer.departureTime || snapshot?.departureTime || null,
    pricePerSeat: offer.pricePerSeat,
    currency: offer.currency || 'PKR',
    seatsAvailable: offer.seatsAvailable,
    seatsTotal: offer.seatsTotal || offer.seatsAvailable,
    preferences: {
      music: offer.preferences?.music !== false,
      smoking: !!offer.preferences?.smoking,
      pets: !!offer.preferences?.pets,
      conversation: offer.preferences?.conversation !== false,
      notifications: offer.preferences?.notifications || {
        email: true,
        push: true,
        sms: false
      }
    },
    estimatedDistanceKm,
    estimatedDurationMin,
    status: mapOfferStatusToApi(offer.status),
    hiddenForDriver: !!offer.hiddenForDriver,
    startedAt: offer.startedAt || null,
    completedAt: offer.completedAt || null,
    currentStopIndex: offer.currentStopIndex || 0,
    stops: offer.stops || [],
    routePolyline: offer.routePolyline || [],
    driver: driver
      ? {
          _id: String(driver._id),
          id: String(driver._id),
          name: driver.name,
          avatar: driver.profilePhoto || '',
          ratings: {
            average: typeof driver.ratings?.average === 'number' ? driver.ratings.average : 0,
            count: driver.ratings?.count || 0,
            recent: driver.ratings?.recent || []
          },
          vehicle: driver.vehicle || null,
          socialTrustScore: driver.socialTrustScore || 0,
          isVerified: driver.verified,
          totalCompletedRides: driver.totalCompletedRides || 0,
          totalCo2SavedKg: driver.totalCo2SavedKg || 0
        }
      : undefined,
    ...(includeEmissions && {
      emissionsData: {
        totalDistanceKm: offer.totalDistanceKm || 0,
        emissionsSavingsKg: offer.emissionsSavingsKg || 0,
        treesEquivalent: Number((offer.emissionsSavingsKg || 0 / 21).toFixed(3))
      }
    })
  };
};

const toBookingResponse = (booking, rider, driver, offer, options = {}) => {
  const { includeEmissions = true } = options;
  
  return {
    _id: String(booking._id),
    id: String(booking._id),
    status: mapRideStatusToApi(booking.status),
    rider: rider
      ? {
          _id: String(rider._id),
          name: rider.name,
          phone: rider.phone || "",
          avatar: rider.profilePhoto || '',
          ratings: {
            average: typeof rider.ratings?.average === 'number' ? rider.ratings.average : 0,
            count: rider.ratings?.count || 0,
            recent: rider.ratings?.recent || []
          },
          socialTrustScore: rider.socialTrustScore || 0,
          isVerified: rider.verified,
          totalCompletedRides: rider.totalCompletedRides || 0,
          totalCo2SavedKg: rider.totalCo2SavedKg || 0
        }
      : undefined,
    driver: driver
      ? {
          _id: String(driver._id),
          name: driver.name,
          phone: driver.phone || "",
          avatar: driver.profilePhoto || '',
          ratings: {
            average: typeof driver.ratings?.average === 'number' ? driver.ratings.average : 0,
            count: driver.ratings?.count || 0,
            recent: driver.ratings?.recent || []
          },
          vehicle: driver.vehicle || null,
          socialTrustScore: driver.socialTrustScore || 0,
          isVerified: driver.verified,
          totalCompletedRides: driver.totalCompletedRides || 0,
          totalCo2SavedKg: driver.totalCo2SavedKg || 0
        }
      : undefined,
    offer: offer ? toOfferResponse(offer, driver, { includeEmissions: false }) : null,
    seatsRequested: booking.seatCount || 1,
    fare: {
      totalAmount: booking.fare || 0,
      currency: booking.currency || 'PKR'
    },
    paymentStatus: booking.paymentStatus,
    arrivedAt: booking.arrivedAt || null,
    hiddenForRider: !!booking.hiddenForRider,
    hiddenForDriver: !!booking.hiddenForDriver,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    statusHistory: booking.statusHistory || [],
    ...(includeEmissions && {
      emissionsData: {
        totalDistanceKm: booking.totalDistanceKm || 0,
        emissionsSavingsKg: booking.emissionsSavingsKg || 0,
        treesEquivalent: Number((booking.emissionsSavingsKg || 0 / 21).toFixed(3))
      }
    })
  };
};

// Add utility functions for response formatting
const formatLocation = (coordinates, address) => {
  return {
    address: address || 'Location',
    coordinates: coordinates,
    timestamp: new Date()
  };
};

const formatRideStatus = (status) => {
  return {
    status: status,
    timestamp: new Date()
  };
};

const formatEmissionsData = (emissionsReport) => {
  return {
    totalDistanceKm: emissionsReport.distance || 0,
    emissionsSavingsKg: emissionsReport.estimatedSavings || 0,
    treesEquivalent: Number((emissionsReport.estimatedSavings || 0 / 21).toFixed(3))
  };
};

module.exports = {
  mapOfferStatusToApi,
  mapOfferStatusFromApi,
  mapRideStatusToApi,
  mapRideStatusFromApi,
  parsePoint,
  inferPointFromAddress,
  toOfferResponse,
  toBookingResponse,
  formatLocation,
  formatRideStatus,
  formatEmissionsData
};
