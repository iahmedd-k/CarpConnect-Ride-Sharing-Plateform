const Match = require('../models/MatchModels');
const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');

const GOOGLE_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const MAX_SINGLE_RIDER_DETOUR_SECONDS = 10 * 60;

const toCoordinatePair = (value) => {
  const candidates = [
    value?.coordinates,
    value?.point?.coordinates
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length >= 2) {
      const lng = Number(candidate[0]);
      const lat = Number(candidate[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }
  }

  const lng = Number(value?.lng ?? value?.longitude);
  const lat = Number(value?.lat ?? value?.latitude);
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    return [lng, lat];
  }

  return null;
};

const buildLineString = (coordinates) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates
  },
  properties: {}
});

const decodePolyline = (encoded = '') => {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    points.push([lng / 1e5, lat / 1e5]);
  }

  return points;
};

const serializeRoute = (route, fallbackCoordinates) => {
  const polyline = route?.overview_polyline?.points || '';
  const decodedCoordinates = polyline ? decodePolyline(polyline) : fallbackCoordinates;
  const coordinates = Array.isArray(decodedCoordinates) && decodedCoordinates.length >= 2
    ? decodedCoordinates
    : fallbackCoordinates;

  const legs = Array.isArray(route?.legs) ? route.legs : [];
  const distanceMeters = legs.reduce((sum, leg) => sum + Number(leg?.distance?.value || 0), 0);
  const durationSeconds = legs.reduce((sum, leg) => sum + Number(leg?.duration?.value || 0), 0);

  return {
    geometry: buildLineString(coordinates),
    polyline,
    distanceMeters,
    durationSeconds,
    durationMinutes: Math.round(durationSeconds / 60),
    coordinates
  };
};

const coordinateLabel = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return '';
  return `${Number(coords[1]).toFixed(5)}, ${Number(coords[0]).toFixed(5)}`;
};

const asLatLng = (coords) => `${coords[1]},${coords[0]}`;

const getGoogleMapsApiKey = () =>
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_SERVER_API_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  '';

const requestDirections = async ({ origin, destination, waypoints = [], optimizeWaypoints = false }) => {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key is not configured on the server.');
  }

  const params = new URLSearchParams({
    origin: asLatLng(origin),
    destination: asLatLng(destination),
    mode: 'driving',
    key: apiKey
  });

  if (waypoints.length) {
    const serializedWaypoints = waypoints.map((point) => asLatLng(point)).join('|');
    params.set('waypoints', `${optimizeWaypoints ? 'optimize:true|' : ''}${serializedWaypoints}`);
  }

  const response = await fetch(`${GOOGLE_DIRECTIONS_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Google Directions API request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !Array.isArray(payload.routes) || !payload.routes.length) {
    throw new Error(payload.error_message || payload.status || 'No route returned from Google Directions API.');
  }

  return payload.routes[0];
};

const fetchOriginalRoute = async (origin, destination) => {
  const route = await requestDirections({ origin, destination });
  return serializeRoute(route, [origin, destination]);
};

const buildFallbackOptimization = ({
  origin,
  destination,
  pickupCandidates,
  totalExtraEarning
}) => {
  const baseCoordinates = [origin, destination];
  const orderedCandidates = [...pickupCandidates];
  const routeCoordinates = [origin, ...orderedCandidates.map((item) => item.pickupCoordinates), destination];

  return {
    source: 'fallback',
    status: orderedCandidates.length ? 'pending' : 'unavailable',
    pendingDecision: orderedCandidates.length > 0,
    selectedRoute: orderedCandidates.length ? 'suggested' : 'original',
    geometry: buildLineString(orderedCandidates.length ? routeCoordinates : baseCoordinates),
    polyline: '',
    totalDetourSeconds: 0,
    totalDetourMinutes: 0,
    totalExtraEarning,
    suggestedPickupOrder: orderedCandidates.map((candidate, index) => ({
      riderId: String(candidate.riderId),
      riderName: candidate.riderName,
      pickupLocation: candidate.pickupAddress,
      pickupPoint: candidate.pickupPoint,
      dropoffPoint: candidate.dropoffPoint,
      waypointIndex: index,
      addedDetourSeconds: 0,
      addedDetourMinutes: 0,
      extraEarning: candidate.extraEarning,
      currency: candidate.currency
    })),
    excludedRiders: [],
    originalRoute: {
      geometry: buildLineString(baseCoordinates),
      polyline: '',
      distanceMeters: 0,
      durationSeconds: 0,
      durationMinutes: 0
    },
    suggestedRoute: {
      geometry: buildLineString(orderedCandidates.length ? routeCoordinates : baseCoordinates),
      polyline: '',
      distanceMeters: 0,
      durationSeconds: 0,
      durationMinutes: 0
    }
  };
};

const buildOptimizationFromCandidates = async ({
  origin,
  destination,
  pickupCandidates,
  totalExtraEarning
}) => {
  const originalRoute = await fetchOriginalRoute(origin, destination);
  const candidateEvaluations = [];

  for (const candidate of pickupCandidates) {
    const singleWaypointRoute = await requestDirections({
      origin,
      destination,
      waypoints: [candidate.pickupCoordinates],
      optimizeWaypoints: false
    });

    const serialized = serializeRoute(singleWaypointRoute, [origin, candidate.pickupCoordinates, destination]);
    const addedDetourSeconds = Math.max(0, serialized.durationSeconds - originalRoute.durationSeconds);
    candidateEvaluations.push({
      ...candidate,
      addedDetourSeconds,
      addedDetourMinutes: Math.round(addedDetourSeconds / 60)
    });
  }

  const includedCandidates = candidateEvaluations.filter(
    (candidate) => candidate.addedDetourSeconds <= MAX_SINGLE_RIDER_DETOUR_SECONDS
  );
  const excludedRiders = candidateEvaluations
    .filter((candidate) => candidate.addedDetourSeconds > MAX_SINGLE_RIDER_DETOUR_SECONDS)
    .map((candidate) => ({
      riderId: String(candidate.riderId),
      riderName: candidate.riderName,
      pickupLocation: candidate.pickupAddress,
      addedDetourSeconds: candidate.addedDetourSeconds,
      addedDetourMinutes: candidate.addedDetourMinutes,
      reason: 'Detour exceeds 10 minutes'
    }));

  if (!includedCandidates.length) {
    return {
      source: 'google-directions',
      status: 'unavailable',
      pendingDecision: false,
      selectedRoute: 'original',
      geometry: originalRoute.geometry,
      polyline: originalRoute.polyline,
      totalDetourSeconds: 0,
      totalDetourMinutes: 0,
      totalExtraEarning: 0,
      suggestedPickupOrder: [],
      excludedRiders,
      originalRoute,
      suggestedRoute: originalRoute
    };
  }

  const optimizedRoute = await requestDirections({
    origin,
    destination,
    waypoints: includedCandidates.map((candidate) => candidate.pickupCoordinates),
    optimizeWaypoints: true
  });

  const waypointOrder = Array.isArray(optimizedRoute.waypoint_order) ? optimizedRoute.waypoint_order : [];
  const orderedCandidates = waypointOrder.length
    ? waypointOrder.map((index) => includedCandidates[index]).filter(Boolean)
    : includedCandidates;

  const suggestedRoute = serializeRoute(
    optimizedRoute,
    [origin, ...orderedCandidates.map((candidate) => candidate.pickupCoordinates), destination]
  );

  const totalDetourSeconds = Math.max(0, suggestedRoute.durationSeconds - originalRoute.durationSeconds);

  return {
    source: 'google-directions',
    status: 'pending',
    pendingDecision: true,
    selectedRoute: 'suggested',
    geometry: suggestedRoute.geometry,
    polyline: suggestedRoute.polyline,
    totalDetourSeconds,
    totalDetourMinutes: Math.round(totalDetourSeconds / 60),
    totalExtraEarning: orderedCandidates.reduce((sum, candidate) => sum + Number(candidate.extraEarning || 0), 0),
    suggestedPickupOrder: orderedCandidates.map((candidate, index) => ({
      riderId: String(candidate.riderId),
      riderName: candidate.riderName,
      pickupLocation: candidate.pickupAddress || coordinateLabel(candidate.pickupCoordinates),
      pickupPoint: candidate.pickupPoint,
      dropoffPoint: candidate.dropoffPoint,
      waypointIndex: index,
      addedDetourSeconds: candidate.addedDetourSeconds,
      addedDetourMinutes: candidate.addedDetourMinutes,
      extraEarning: candidate.extraEarning,
      currency: candidate.currency
    })),
    excludedRiders,
    originalRoute,
    suggestedRoute
  };
};

const buildPickupCandidates = async (match) => {
  const requestDoc = match.requestId
    ? await RideRequest.findById(match.requestId).lean()
    : null;
  const riderIds = Array.isArray(match.riderIds) ? match.riderIds.map(String) : [];
  const riders = riderIds.length
    ? await User.find({ _id: { $in: riderIds } }).select('name').lean()
    : [];
  const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

  return riderIds.map((riderId, index) => {
    const pickupPoint = match.pickupPoints?.[index] || requestDoc?.origin || null;
    const dropoffPoint = match.dropoffPoints?.[index] || requestDoc?.destination || null;
    const pickupCoordinates = toCoordinatePair(pickupPoint);
    const fareSplit = Array.isArray(match.fareSplits)
      ? match.fareSplits.find((item) => String(item.riderId) === riderId)
      : null;

    return {
      riderId,
      riderName: riderMap.get(riderId)?.name || 'Rider',
      pickupPoint: pickupPoint ? {
        type: pickupPoint.type || 'Point',
        coordinates: pickupCoordinates || toCoordinatePair(requestDoc?.origin) || []
      } : null,
      dropoffPoint: dropoffPoint ? {
        type: dropoffPoint.type || 'Point',
        coordinates: toCoordinatePair(dropoffPoint) || []
      } : null,
      pickupCoordinates,
      pickupAddress: requestDoc?.originAddress || coordinateLabel(pickupCoordinates),
      extraEarning: Number(fareSplit?.amount || 0),
      currency: fareSplit?.currency || 'PKR'
    };
  }).filter((candidate) => Array.isArray(candidate.pickupCoordinates));
};

const optimizeMatchRoute = async (matchId) => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  const offer = await RideOffer.findById(match.offerId).lean();
  if (!offer) {
    throw new Error('Ride offer not found for match');
  }

  const origin = toCoordinatePair(offer.origin);
  const destination = toCoordinatePair(offer.destination);
  if (!origin || !destination) {
    throw new Error('Driver route coordinates are incomplete');
  }

  const pickupCandidates = await buildPickupCandidates(match);
  const totalExtraEarning = Array.isArray(match.fareSplits)
    ? match.fareSplits.reduce((sum, split) => sum + Number(split?.amount || 0), 0)
    : Number(match.totalFare || 0);

  let optimizedRoute;
  try {
    optimizedRoute = await buildOptimizationFromCandidates({
      origin,
      destination,
      pickupCandidates,
      totalExtraEarning
    });
  } catch (error) {
    optimizedRoute = buildFallbackOptimization({
      origin,
      destination,
      pickupCandidates,
      totalExtraEarning
    });
    optimizedRoute.warning = error.message;
  }

  match.optimizedRoute = optimizedRoute;
  await match.save();
  return match.optimizedRoute;
};

const applyOptimizationDecision = async (matchId, decision) => {
  const match = await Match.findById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  const optimizedRoute = match.optimizedRoute || {};
  if (!['accept', 'reject'].includes(decision)) {
    throw new Error('Decision must be accept or reject');
  }

  const selectedRoute = decision === 'accept' ? 'suggested' : 'original';
  const chosen = selectedRoute === 'suggested'
    ? optimizedRoute.suggestedRoute || optimizedRoute.originalRoute
    : optimizedRoute.originalRoute || optimizedRoute.suggestedRoute;

  match.optimizedRoute = {
    ...optimizedRoute,
    status: decision === 'accept' ? 'accepted' : 'rejected',
    pendingDecision: false,
    selectedRoute,
    geometry: chosen?.geometry || optimizedRoute.geometry,
    polyline: chosen?.polyline || optimizedRoute.polyline || ''
  };

  await match.save();
  return match.optimizedRoute;
};

module.exports = {
  optimizeMatchRoute,
  applyOptimizationDecision
};
