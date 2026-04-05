const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const Notification = require('../models/Notification');
const EmissionReport = require('../models/EmissionReport');
const { calculateRouteDistance, findNearestPointOnRoute, calculateRouteDeviation } = require('../utils/geospatial');
const { calculateEmissionsSavings } = require('../utils/fareCalculator');
const {
  mapOfferStatusFromApi,
  mapOfferStatusToApi,
  parsePoint,
  inferPointFromAddress,
  toOfferResponse
} = require('../utils/compatFormatters');
const {
  ensureSubscriptionOnUser,
  fetchUsageCounts,
  assertUsageAllowed
} = require('../utils/subscriptionUsage');
const { lockChatRoomForRide } = require('../utils/chatRooms');
const { ensureChatRoomForRide, getRideParticipants } = require('../utils/chatRooms');
const { materializeOfferOccurrence } = require('../utils/recurringJobs');
const { setRideSnapshot, getRideSnapshot } = require('../utils/rideSnapshotCache');

const PAKISTAN_VIEWBOX = '60.85,37.12,77.84,23.63';
const PAKISTAN_FALLBACK_SUGGESTIONS = [
  { address: 'Blue Area, Islamabad, Pakistan', coordinates: [73.0479, 33.7074] },
  { address: 'G-9, Islamabad, Pakistan', coordinates: [73.0138, 33.6844] },
  { address: 'F-7 Markaz, Islamabad, Pakistan', coordinates: [73.0511, 33.7205] },
  { address: 'DHA Phase 2, Islamabad, Pakistan', coordinates: [73.1485, 33.5169] },
  { address: 'Saddar, Rawalpindi, Pakistan', coordinates: [73.0478, 33.5973] },
  { address: 'Bahria Town Phase 4, Rawalpindi, Pakistan', coordinates: [73.1217, 33.5496] },
  { address: 'Johar Town, Lahore, Pakistan', coordinates: [74.2728, 31.4697] },
  { address: 'Model Town, Lahore, Pakistan', coordinates: [74.3168, 31.4831] },
  { address: 'Gulberg III, Lahore, Pakistan', coordinates: [74.3447, 31.5204] },
  { address: 'DHA Phase 5, Lahore, Pakistan', coordinates: [74.4194, 31.4692] },
  { address: 'Gulshan-e-Iqbal, Karachi, Pakistan', coordinates: [67.0822, 24.9257] },
  { address: 'Clifton Block 5, Karachi, Pakistan', coordinates: [67.0302, 24.8138] },
  { address: 'North Nazimabad, Karachi, Pakistan', coordinates: [67.0411, 24.9407] },
  { address: 'DHA Phase 6, Karachi, Pakistan', coordinates: [67.0652, 24.8015] }
];
const LOCATION_HINTS = [
  { pattern: /\bblue\s*area\b/i, expansions: ['Islamabad, Pakistan'] },
  { pattern: /\b(g|f|e|i|h)-?\d{1,2}\b/i, expansions: ['Islamabad, Pakistan'] },
  { pattern: /\b(johar\s*town|model\s*town|gulberg|wapda\s*town)\b/i, expansions: ['Lahore, Pakistan'] },
  { pattern: /\b(gulshan|clifton|nazimabad|saddar|north nazimabad)\b/i, expansions: ['Karachi, Pakistan'] },
  { pattern: /\b(satellite\s*town|bahria\s*town)\b/i, expansions: ['Rawalpindi, Pakistan', 'Islamabad, Pakistan'] },
  { pattern: /\bdha\b/i, expansions: ['Lahore, Pakistan', 'Karachi, Pakistan', 'Islamabad, Pakistan'] }
];
const SEARCH_MATCH_RADIUS_METERS = 3000;
const ACTIVE_BOOKING_STATUSES = ['confirmed', 'picked_up', 'live'];

const withEffectiveSeatAvailability = async (offers) => {
  const normalizedOffers = Array.isArray(offers) ? offers : [];
  if (!normalizedOffers.length) return [];

  const offerIds = normalizedOffers.map((offer) => offer?._id).filter(Boolean);
  const bookings = await Booking.find({
    offerId: { $in: offerIds },
    status: { $in: ACTIVE_BOOKING_STATUSES }
  })
    .select('offerId seatCount')
    .lean();

  const bookedSeatsByOffer = bookings.reduce((acc, booking) => {
    const offerId = String(booking.offerId || '');
    if (!offerId) return acc;
    acc[offerId] = (acc[offerId] || 0) + Math.max(1, Number(booking.seatCount || 1));
    return acc;
  }, {});

  return normalizedOffers.map((offer) => {
    const totalSeats = Math.max(
      1,
      Number(offer?.seatsTotal || offer?.seatsAvailable || 1)
    );
    const bookedSeats = Number(bookedSeatsByOffer[String(offer?._id || '')] || 0);
    const effectiveSeatsAvailable = Math.max(0, totalSeats - bookedSeats);

    return {
      ...offer,
      seatsTotal: totalSeats,
      seatsAvailable: effectiveSeatsAvailable
    };
  });
};

// @desc    Create a new ride offer
// @route   POST /api/rides/offers
// @access  Private (Driver only)
const createRideOffer = asyncHandler(async (req, res) => {
  const {
    origin,
    destination,
    departureTime,
    seatsTotal,
    seatsAvailable,
    pricePerSeat,
    currency,
    preferences,
    isRecurring,
    recurrencePattern,
    routeGeoJson
  } = req.body || {};

  if (!origin || !destination || !departureTime) {
    return res.status(400).json({ 
      success: false, 
      message: 'origin, destination and departureTime are required' 
    });
  }

  const normalizedStatus = new Date(departureTime) > new Date() ? 'open' : 'active';
  const originAddress = String(origin.address || '').trim();
  const destinationAddress = String(destination.address || '').trim();
  const originCoords = await resolveAddressPoint(origin.point || origin, originAddress, 'origin');
  const destinationCoords = await resolveAddressPoint(destination.point || destination, destinationAddress, 'destination');

  if (!originCoords || !destinationCoords) {
    return res.status(400).json({
      success: false,
      message: 'Coordinates missing. Provide origin/destination point coordinates or include a recognizable city in address.'
    });
  }

  const totalSeats = Math.max(1, Number(seatsTotal || seatsAvailable || 1));
  const smokingPref = preferences?.smokingAllowed ?? preferences?.smoking ?? false;
  const petsPref = preferences?.petsAllowed ?? preferences?.pets ?? false;
  const musicPref = preferences?.musicAllowed ?? preferences?.music;

  // Create routeGeoJson for optimization if not provided
  const routeGeoJsonFinal = routeGeoJson || {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [originCoords[0], originCoords[1]],
        [destinationCoords[0], destinationCoords[1]]
      ]
    }
  };

  const offer = await RideOffer.create({
    driverId: req.user._id,
    origin: { type: 'Point', coordinates: originCoords },
    destination: { type: 'Point', coordinates: destinationCoords },
    originAddress,
    destinationAddress,
    departureTime,
    seatsTotal: totalSeats,
    seatsAvailable: totalSeats,
    pricePerSeat: Number(pricePerSeat) && Number(pricePerSeat) > 0 ? Number(pricePerSeat) : 1,
    currency: currency || 'PKR',
    preferences: {
      smoking: !!smokingPref,
      pets: !!petsPref,
      music: musicPref !== false,
      conversation: true
    },
    status: normalizedStatus,
    routeGeoJson: routeGeoJsonFinal,
    isRecurring,
    recurrencePattern,
    createdAt: new Date()
  });
  setRideSnapshot(offer);

  // Emit real-time event for matching
  req.io?.to(`driver:${req.user._id}`).emit('offerCreated', offer);

  const populated = toOfferResponse(offer, req.user);
  res.status(201).json({ 
    success: true, 
    data: { 
      offer: populated,
      message: 'Ride offer created successfully' 
    } 
  });
});

// @desc    Get ride offers
// @route   GET /api/rides/offers
// @access  Public
const getRideOffers = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const maxDistance = Number(req.query.maxDistance);
  const hasLocationFilter = Number.isFinite(lat) && Number.isFinite(lng);
  const maxDistanceMeters =
    Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : Number.POSITIVE_INFINITY;
  const query = {};

  if (status) {
    query.status = mapOfferStatusFromApi(String(status));
  } else {
    // Search results should stay rider-facing by default: include any pre-start offer,
    // then reconcile stale status values after effective seat calculation.
    query.status = { $in: ['open', 'matched', 'booked', 'active'] };
    query.departureTime = { $gte: new Date() };
  }

  if (hasLocationFilter) {
    query.origin = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        ...(Number.isFinite(maxDistance) && maxDistance > 0 ? { $maxDistance: maxDistance } : {})
      }
    };
  }

  let offers;
  try {
    offers = await RideOffer.find(query).sort({ departureTime: 1 });
  } catch (error) {
    const needsGeoFallback =
      hasLocationFilter &&
      /unable to find index for \$geoNear query/i.test(String(error?.message || ''));

    if (!needsGeoFallback) {
      throw error;
    }

    const fallbackQuery = { ...query };
    delete fallbackQuery.origin;
    const unfiltered = await RideOffer.find(fallbackQuery).sort({ departureTime: 1 });
    offers = unfiltered.filter((offer) => {
      const coords = offer?.origin?.coordinates;
      if (!Array.isArray(coords) || coords.length !== 2) return false;
      const offerLng = Number(coords[0]);
      const offerLat = Number(coords[1]);
      if (!Number.isFinite(offerLat) || !Number.isFinite(offerLng)) return false;
      const distanceMeters = haversineDistanceMeters(lat, lng, offerLat, offerLng);
      return distanceMeters <= maxDistanceMeters;
    });
  }

  const offersWithEffectiveSeats = await withEffectiveSeatAvailability(offers);
  const normalizedOffers = offersWithEffectiveSeats.map((offer) => {
    const rawStatus = String(offer?.status || '').toLowerCase();
    const departure = offer?.departureTime ? new Date(offer.departureTime) : null;
    const hasFutureDeparture = departure && !Number.isNaN(departure.getTime()) && departure >= new Date();

    if (
      Number(offer?.seatsAvailable || 0) > 0 &&
      !offer?.startedAt &&
      !offer?.completedAt &&
      hasFutureDeparture &&
      ['active', 'matched', 'booked'].includes(rawStatus)
    ) {
      return { ...offer, status: 'open' };
    }

    return offer;
  });

  const drivers = await getDriverMap(normalizedOffers);
  const shaped = normalizedOffers
    .filter((offer) => {
      const rawStatus = String(offer?.status || '').toLowerCase();
      if (Number(offer?.seatsAvailable || 0) <= 0) return false;
      if (!status) {
        const departure = offer?.departureTime ? new Date(offer.departureTime) : null;
        if (!departure || Number.isNaN(departure.getTime()) || departure < new Date()) {
          return false;
        }
        if (offer?.completedAt) return false;
        if (!['open', 'matched', 'booked', 'active'].includes(rawStatus)) return false;
      }
      return true;
    })
    .map((offer) => toOfferResponse(offer, drivers.get(String(offer.driverId))));

  res.status(200).json({ 
    success: true, 
    data: { 
      offers: shaped,
      total: shaped.length
    } 
  });
});

// @desc    Update ride offer status
// @route   PUT /api/rides/offers/:id/status
// @access  Private (Driver only)
const updateRideOfferStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const offer = await RideOffer.findById(id);
  if (!offer) {
    return res.status(404).json({ 
      success: false, 
      message: 'Ride offer not found' 
    });
  }

  if (String(offer.driverId) !== String(req.user._id)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Not authorized to update this ride offer' 
    });
  }

  // Validate status transition
  const validTransitions = {
    'open': ['active', 'cancelled'],
    'active': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };
  
  if (!validTransitions[offer.status]?.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      message: `Cannot transition from ${offer.status} to ${status}` 
    });
  }

  offer.status = mapOfferStatusFromApi(status || mapOfferStatusToApi(offer.status));
  if (offer.status === 'active' && !offer.startedAt) {
    offer.startedAt = new Date();
  }
  if (offer.status === 'completed' && !offer.completedAt) {
    offer.completedAt = new Date();
  }

  await offer.save();
  const driver = await User.findById(offer.driverId).select('name profilePhoto ratings vehicle');

  // Emit real-time event for status change
  req.io?.to(`driver:${offer.driverId}`).emit('offerStatusUpdated', {
    offerId: offer._id,
    status: offer.status
  });

  res.status(200).json({ 
    success: true, 
    data: { 
      offer: toOfferResponse(offer, driver),
      message: `Ride offer status updated to ${offer.status}`
    } 
  });
});

// @desc    Start a ride
// @route   PUT /api/rides/offers/:id/start
// @access  Private (Driver only)
const startRide = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), status: 'active' };
  return updateRideOfferStatus(req, res);
});

// @desc    Complete a ride
// @route   PUT /api/rides/offers/:id/complete
// @access  Private (Driver only)
const completeRide = asyncHandler(async (req, res) => {
  const offer = await RideOffer.findById(req.params.id);
  if (!offer) {
    return res.status(404).json({ 
      success: false, 
      message: 'Ride offer not found' 
    });
  }
  if (String(offer.driverId) !== String(req.user._id)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Not authorized to complete this ride' 
    });
  }

  offer.status = 'completed';
  offer.completedAt = new Date();
  await offer.save();

  // Update related bookings
  await Booking.updateMany(
    { offerId: offer._id, status: { $in: ['confirmed', 'picked_up'] } },
    { $set: { status: 'completed', paymentStatus: 'processed' } }
  );

  // Calculate and store emissions data
  const routeDistanceMeters = calculateRouteDistance(offer.routeGeoJson);
  const routeDistanceKm = Number((routeDistanceMeters / 1000).toFixed(2));
  const emissionsResult = calculateEmissionsSavings(routeDistanceKm);
  const emissionsSavings = Number(emissionsResult?.estimatedSavings ?? emissionsResult ?? 0);
  const representativeBooking = await Booking.findOne({ offerId: offer._id }).sort({ createdAt: -1 });
  if (representativeBooking) {
    await EmissionsReport.create({
      rideId: offer._id,
      bookingId: representativeBooking._id,
      userId: offer.driverId,
      estimatedSavings: emissionsSavings,
      distance: routeDistanceKm
    });
  }

  // Emit real-time event
  req.io?.to(`driver:${offer.driverId}`).emit('rideCompleted', {
    offerId: offer._id,
    completionTime: new Date(),
    emissionsSavings
  });
  await lockChatRoomForRide(offer._id, req.io);

  res.status(200).json({ 
    success: true, 
    data: { 
      offerId: String(offer._id),
      status: 'completed',
      message: 'Ride completed successfully'
    } 
  });
});

// @desc    Search address suggestions
// @route   GET /api/rides/offers/suggestions
// @access  Public
const searchAddressSuggestions = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.max(1, Math.min(10, Number(req.query.limit || 8)));
  if (!q) {
    return res.status(200).json({ 
      success: true, 
      data: { 
        results: [] 
      } 
    });
  }

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const offers = await RideOffer.find({
    $or: [{ originAddress: regex }, { destinationAddress: regex }],
    status: { $in: ['open', 'active'] }
  })
    .sort({ createdAt: -1 })
    .limit(15);

  const localResults = [];
  for (const offer of offers) {
    const candidates = [
      { address: offer.originAddress, coordinates: offer.origin?.coordinates || null },
      { address: offer.destinationAddress, coordinates: offer.destination?.coordinates || null }
    ];
    for (const item of candidates) {
      if (item.address && regex.test(item.address)) {
        localResults.push(item);
      }
    }
  }

  const [osmResults, fallbackResults] = await Promise.all([
    fetchOsmSuggestions(q, limit),
    Promise.resolve(fallbackMatches(q, limit))
  ]);
  const results = dedupeAddressResults([...localResults, ...fallbackResults, ...osmResults]).slice(0, limit);

  res.status(200).json({ 
    success: true, 
    data: { 
      results,
      total: results.length
    } 
  });
});

// @desc    Resolve a single address to coordinates
// @route   GET /api/rides/address-resolve
// @access  Public
const resolveAddressSuggestion = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(200).json({ success: true, data: { result: null } });
  }

  const localExact = await RideOffer.findOne({
    $or: [{ originAddress: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, { destinationAddress: new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }]
  }).sort({ createdAt: -1 });

  if (localExact) {
    const exactMatch = [
      { address: localExact.originAddress, coordinates: localExact.origin?.coordinates || null },
      { address: localExact.destinationAddress, coordinates: localExact.destination?.coordinates || null }
    ].find((item) => item.address && item.address.toLowerCase() === q.toLowerCase() && Array.isArray(item.coordinates));

    if (exactMatch) {
      return res.status(200).json({ success: true, data: { result: exactMatch } });
    }
  }

  const results = dedupeAddressResults([
    ...fallbackMatches(q, 1),
    ...(await fetchOsmSuggestions(q, 1))
  ]);

  res.status(200).json({
    success: true,
    data: {
      result: results[0] || null
    }
  });
});

// @desc    Search rides by destination
// @route   GET /api/rides/offers/search
// @access  Public
const searchByDestination = asyncHandler(async (req, res) => {
  const destination = String(req.query.destination || '').trim();
  const origin = String(req.query.origin || '').trim();
  const date = String(req.query.date || '').trim();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const maxDistance = Number(req.query.maxDistance);
  const originLat = Number(req.query.originLat);
  const originLng = Number(req.query.originLng);
  const destinationLat = Number(req.query.destinationLat);
  const destinationLng = Number(req.query.destinationLng);
  const originRadiusMeters = SEARCH_MATCH_RADIUS_METERS;
  const destinationRadiusMeters = SEARCH_MATCH_RADIUS_METERS;
  const resolvedOriginCoords =
    Number.isFinite(originLat) && Number.isFinite(originLng)
      ? [originLng, originLat]
      : await resolveAddressPoint(null, origin, 'origin');
  const resolvedDestinationCoords =
    Number.isFinite(destinationLat) && Number.isFinite(destinationLng)
      ? [destinationLng, destinationLat]
      : await resolveAddressPoint(null, destination, 'destination');
  const hasResolvedOriginCoords =
    Array.isArray(resolvedOriginCoords) &&
    resolvedOriginCoords.length === 2 &&
    Number.isFinite(Number(resolvedOriginCoords[0])) &&
    Number.isFinite(Number(resolvedOriginCoords[1]));
  const hasResolvedDestinationCoords =
    Array.isArray(resolvedDestinationCoords) &&
    resolvedDestinationCoords.length === 2 &&
    Number.isFinite(Number(resolvedDestinationCoords[0])) &&
    Number.isFinite(Number(resolvedDestinationCoords[1]));

  const now = new Date();
  const query = {
    status: 'open',
    seatsAvailable: { $gt: 0 },
    departureTime: { $gte: now }
  };

  if (destination && !hasResolvedDestinationCoords) {
    query.destinationAddress = new RegExp(destination, 'i');
  }

  if (origin && !hasResolvedOriginCoords) {
    query.originAddress = new RegExp(origin, 'i');
  }

  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      query.departureTime = { $gte: start, $lte: end };

      const recurringTemplates = await RideOffer.find({
        isRecurring: true,
        recurringParentId: null,
        status: 'open'
      }).lean();

      for (const template of recurringTemplates) {
        await materializeOfferOccurrence(template, start);
      }
    }
  }

  if (lat && lng && maxDistance) {
    query.origin = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)]
        },
        $maxDistance: Number(maxDistance)
      }
    };
  }

  let offers = await RideOffer.find(query).sort({ departureTime: 1 }).limit(150);
  offers = offers.filter((offer) => !offer.startedAt && !offer.completedAt);

  if (hasResolvedOriginCoords || hasResolvedDestinationCoords) {
    offers = offers.filter((offer) => {
      let matchesOrigin = true;
      let matchesDestination = true;

      const offerOriginCoords = offer?.origin?.coordinates;
      const offerDestinationCoords = offer?.destination?.coordinates;

      if (hasResolvedOriginCoords && Array.isArray(offerOriginCoords) && offerOriginCoords.length === 2) {
        const distanceFromOrigin = haversineDistanceMeters(
          Number(resolvedOriginCoords[1]),
          Number(resolvedOriginCoords[0]),
          Number(offerOriginCoords[1]),
          Number(offerOriginCoords[0])
        );
        matchesOrigin = distanceFromOrigin <= originRadiusMeters;
      }

      if (hasResolvedDestinationCoords && Array.isArray(offerDestinationCoords) && offerDestinationCoords.length === 2) {
        const distanceFromDestination = haversineDistanceMeters(
          Number(resolvedDestinationCoords[1]),
          Number(resolvedDestinationCoords[0]),
          Number(offerDestinationCoords[1]),
          Number(offerDestinationCoords[0])
        );
        matchesDestination = distanceFromDestination <= destinationRadiusMeters;
      }

      return matchesOrigin && matchesDestination;
    });
  }

  offers = offers.sort((a, b) => {
    const aOriginCoords = a?.origin?.coordinates;
    const bOriginCoords = b?.origin?.coordinates;
    const aDestinationCoords = a?.destination?.coordinates;
    const bDestinationCoords = b?.destination?.coordinates;

    const scoreOffer = (offerOrigin, offerDestination, departureTime) => {
      let score = 0;
      if (hasResolvedOriginCoords && Array.isArray(offerOrigin) && offerOrigin.length === 2) {
        const distance = haversineDistanceMeters(
          Number(resolvedOriginCoords[1]),
          Number(resolvedOriginCoords[0]),
          Number(offerOrigin[1]),
          Number(offerOrigin[0])
        );
        score += Math.min(distance, originRadiusMeters * 2);
      }
      if (hasResolvedDestinationCoords && Array.isArray(offerDestination) && offerDestination.length === 2) {
        const distance = haversineDistanceMeters(
          Number(resolvedDestinationCoords[1]),
          Number(resolvedDestinationCoords[0]),
          Number(offerDestination[1]),
          Number(offerDestination[0])
        );
        score += Math.min(distance, destinationRadiusMeters * 2);
      }
      score += Math.max(0, new Date(departureTime).getTime() - Date.now()) / (60 * 1000);
      return score;
    };

    return scoreOffer(aOriginCoords, aDestinationCoords, a.departureTime) - scoreOffer(bOriginCoords, bDestinationCoords, b.departureTime);
  });
  const offersWithEffectiveSeats = await withEffectiveSeatAvailability(offers);
  const drivers = await getDriverMap(offersWithEffectiveSeats);
  const rides = offersWithEffectiveSeats.map((offer) => {
    const snapshot = getRideSnapshot(offer._id);
    const shaped = toOfferResponse(offer, drivers.get(String(offer.driverId)));
    return {
      _id: shaped._id,
      id: shaped._id,
      origin: shaped.origin.address,
      destination: shaped.destination.address,
      originCoords: shaped.origin.point.coordinates || snapshot?.originCoords || null,
      destinationCoords: shaped.destination.point.coordinates || snapshot?.destinationCoords || null,
      routeCoords: offer.routeGeoJson?.geometry?.coordinates || offer.routeGeoJson?.coordinates || snapshot?.routeCoords || null,
      departureTime: shaped.departureTime || snapshot?.departureTime || null,
      pricePerSeat: shaped.pricePerSeat,
      currency: shaped.currency,
      seatsAvailable: shaped.seatsAvailable,
      seatsTotal: shaped.seatsTotal,
      status: shaped.status,
      estimatedDistanceKm: shaped.estimatedDistanceKm,
      estimatedDurationMin: shaped.estimatedDurationMin,
      driver: shaped.driver || { name: 'Driver', ratings: { average: 0, count: 0 }, vehicle: null }
    };
  });

  res.status(200).json({ 
    success: true, 
    data: { 
      rides,
      total: rides.length
    } 
  });
});

// @desc    Book a ride directly
// @route   POST /api/rides/book-direct
// @access  Private (Rider only)
const bookDirectRide = asyncHandler(async (req, res) => {
  const { offerId, seatsNeeded = 1, origin, destination } = req.body;

  if (!offerId) {
    return res.status(400).json({ 
      success: false, 
      message: 'offerId is required' 
    });
  }

  const offer = await RideOffer.findById(offerId);
  if (!offer) {
    return res.status(404).json({ 
      success: false, 
      message: 'Ride offer not found' 
    });
  }

  const normalizedOfferStatus = String(offer?.status || '').toLowerCase();
  if (
    !offer ||
    ['cancelled', 'completed'].includes(normalizedOfferStatus) ||
    offer.startedAt ||
    offer.completedAt
  ) {
    return res.status(409).json({
      success: false,
      message: 'This ride is no longer available for new bookings'
    });
  }

  const seats = Math.max(1, Number(seatsNeeded || 1));
  const subscription = await ensureSubscriptionOnUser(req.user);
  const usage = await fetchUsageCounts(req.user._id);
  const allowance = assertUsageAllowed({
    subscription,
    usage,
    action: 'create_booking'
  });
  if (!allowance.allowed) {
    return res.status(allowance.statusCode || 403).json({
      success: false,
      message: allowance.message,
      data: { usage: allowance.usageSummary }
    });
  }

  const existing = await Booking.findOne({
    userId: req.user._id,
    offerId: offer._id,
    status: { $in: ['pending', 'confirmed', 'picked_up', 'completed'] }
  });

  if (existing) {
    return res.status(400).json({ 
      success: false, 
      message: 'You already have a booking for this ride' 
    });
  }

  const totalFare = Number((offer.pricePerSeat || 0) * seats);
  const pickupCoordinates = Array.isArray(origin?.coordinates) ? origin.coordinates : [];
  const dropoffCoordinates = Array.isArray(destination?.coordinates) ? destination.coordinates : [];
  const pickupTime = offer.departureTime ? new Date(offer.departureTime) : new Date();
  const dropoffTime = new Date(pickupTime.getTime() + 30 * 60 * 1000);

  if (pickupCoordinates.length !== 2 || dropoffCoordinates.length !== 2) {
    return res.status(400).json({
      success: false,
      message: 'Pickup and drop-off are required before booking this ride'
    });
  }

  let match;
  let booking;
  let rideRequest;
  try {
    rideRequest = await RideRequest.create({
      riderId: req.user._id,
      origin: {
        type: 'Point',
        coordinates: pickupCoordinates
      },
      destination: {
        type: 'Point',
        coordinates: dropoffCoordinates
      },
      originAddress: String(origin?.address || '').trim(),
      destinationAddress: String(destination?.address || '').trim(),
      earliestDeparture: pickupTime,
      latestDeparture: pickupTime,
      groupSize: seats,
      maxPricePerSeat: Number(offer.pricePerSeat || 0),
      currency: offer.currency || 'PKR',
      status: 'matched'
    });

    match = await Match.create({
      offerId: offer._id,
      requestId: rideRequest._id,
      driverId: offer.driverId,
      riderIds: [req.user._id],
      pickupPoints: [{
        type: 'Point',
        coordinates: pickupCoordinates,
        time: pickupTime
      }],
      dropoffPoints: [{
        type: 'Point',
        coordinates: dropoffCoordinates,
        time: dropoffTime
      }],
      optimizedRoute: offer.routeGeoJson || buildStraightRoute(pickupCoordinates, dropoffCoordinates),
      fareSplits: [{
        riderId: req.user._id,
        amount: totalFare,
        currency: offer.currency || 'PKR',
        pickupPoint: {
          type: 'Point',
          coordinates: pickupCoordinates
        },
        dropoffPoint: {
          type: 'Point',
          coordinates: dropoffCoordinates
        }
      }],
      totalFare: totalFare,
      matchScore: 1.0,
      status: 'matched'
    });

    booking = await Booking.create({
      matchId: match._id,
      offerId: offer._id,
      userId: req.user._id,
      driverId: offer.driverId,
      seatCount: seats,
      fare: totalFare,
      currency: offer.currency || 'PKR',
      status: 'pending',
      paymentStatus: 'processed',
      paymentMethod: 'cash'
    });

    match.bookingId = booking._id;
    await match.save();

    rideRequest.matchId = match._id;
    rideRequest.bookingId = booking._id;
    await rideRequest.save();

    // Keep the offer open and seat count unchanged until the driver manually accepts.
    offer.status = 'open';
    await offer.save();
  } catch (error) {
    console.error('[bookDirectRide] failed', {
      offerId: String(offer._id),
      riderId: String(req.user._id),
      seats,
      message: error?.message,
      errors: error?.errors,
    });
    return res.status(500).json({
      success: false,
      message: error?.message || 'Direct booking failed on the server'
    });
  }

  // Emit real-time notification
  req.io?.to(`driver:${offer.driverId}`).emit('newBooking', {
    bookingId: booking._id,
    riderId: req.user._id,
    seats: seats,
    totalFare: totalFare
  });

  res.status(201).json({
    success: true,
    data: {
      bookingId: String(booking._id),
      booking: {
        _id: String(booking._id),
        status: booking.status,
        fare: {
          totalAmount: booking.fare,
          currency: booking.currency || 'PKR'
        }
      },
      totalFare,
      message: 'Booking request submitted successfully'
    }
  });
});

// @desc    Get ride history for current user
// @route   GET /api/rides/history
// @access  Private
const getRideHistory = asyncHandler(async (req, res) => {
  const query = { driverId: req.user._id };
  const offers = await RideOffer.find(query).sort({ departureTime: -1 });
  const driver = await User.findById(req.user._id).select('name profilePhoto ratings vehicle');

  const shaped = offers.map((offer) => toOfferResponse(offer, driver));
  res.status(200).json({ 
    success: true, 
    data: { 
      offers: shaped,
      total: shaped.length
    } 
  });
});

// @desc    Get active ride for current user
// @route   GET /api/rides/active
// @access  Private
const getActiveRide = asyncHandler(async (req, res) => {
  // Find the user's active ride (as driver or rider)
  const userId = req.user._id;
  
  // Try to find as a booking (rider)
  const booking = await Booking.findOne({
    userId,
    status: { $in: ['confirmed', 'picked_up', 'live'] }
  })
  .populate('offerId')
  .populate('matchId');
  
  if (booking && booking.offerId) {
    return res.status(200).json({ 
      success: true, 
      data: { 
        ride: booking.offerId, 
        booking,
        message: 'Active ride found'
      } 
    });
  }
  
  // Try to find as a driver
  const offer = await RideOffer.findOne({
    driverId: userId,
    status: { $in: ['active', 'live'] }
  });
  
  if (offer) {
    return res.status(200).json({ 
      success: true, 
      data: { 
        ride: offer, 
        message: 'Active ride found'
      } 
    });
  }
  
  // No active ride found
  res.status(200).json({ 
    success: true, 
    data: { 
      ride: null, 
      booking: null, 
      message: 'No active ride found'
    } 
  });
});

// Helper functions
const normalizeAddress = (value) => String(value || '').trim().toLowerCase();
const normalizeSearchText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const dedupeAddressResults = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.address || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildQueryVariants = (query) => {
  const trimmed = String(query || '').trim();
  const variants = new Set();
  if (!trimmed) return [];
  variants.add(trimmed);
  if (!/\bpaks?itan\b/i.test(trimmed)) {
    variants.add(`${trimmed}, Pakistan`);
  }
  for (const hint of LOCATION_HINTS) {
    if (!hint.pattern.test(trimmed)) continue;
    for (const expansion of hint.expansions) variants.add(`${trimmed}, ${expansion}`);
  }
  return Array.from(variants).slice(0, 4);
};

const fallbackMatches = (query, limit = 8) => {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const tokens = normalized.split(' ').filter(Boolean);
  return PAKISTAN_FALLBACK_SUGGESTIONS
    .map((item) => {
      const haystack = normalizeSearchText(item.address);
      let score = 0;
      if (haystack.startsWith(normalized)) score += 8;
      if (haystack.includes(normalized)) score += 5;
      for (const token of tokens) {
        if (haystack.includes(token)) score += token.length <= 2 ? 0.75 : 1.5;
      }
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, limit);
};

const fetchOsmVariant = async (query, limit = 5) => {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'pk',
    dedupe: '1',
    limit: String(limit),
    'accept-language': 'en',
    viewbox: PAKISTAN_VIEWBOX,
    q: String(query || '').trim()
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CarpoolConnect/1.0 (address search)'
    }
  });

  if (!response.ok) return [];
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];

  return rows.map((row) => {
    const lng = Number(row?.lon);
    const lat = Number(row?.lat);
    return {
      address: String(row?.display_name || '').trim(),
      coordinates: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null,
      placeId: String(row?.place_id || ''),
      source: 'osm'
    };
  }).filter((item) => item.address);
};

const fetchOsmSuggestions = async (query, limit = 8) => {
  const variants = buildQueryVariants(query);
  if (variants.length === 0) return [];
  const perVariantLimit = Math.max(3, Math.min(limit, 5));
  const results = await Promise.allSettled(variants.map((variant) => fetchOsmVariant(variant, perVariantLimit)));
  return dedupeAddressResults(results.flatMap((entry) => entry.status === 'fulfilled' ? entry.value : [])).slice(0, limit);
};

const haversineDistanceMeters = (fromLat, fromLng, toLat, toLng) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
};

const buildStraightRoute = (originCoordinates, destinationCoordinates) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [originCoordinates, destinationCoordinates]
  },
  properties: {}
});

const toValidObjectIdString = (value) => {
  if (!value) return null;
  const raw = value?._id || value;
  const id = String(raw);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
};

const geocodeWithOsm = async (address) => {
  const query = String(address || '').trim();
  if (!query) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CarpoolConnect/1.0 (geocoding fallback)'
      }
    });

    if (!response.ok) return null;
    const rows = await response.json();
    const first = Array.isArray(rows) ? rows[0] : null;
    const lng = Number(first?.lon);
    const lat = Number(first?.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      return [lng, lat];
    }
  } catch (_) {
    return null;
  }

  return null;
};

const resolveAddressPoint = async (input, address, field) => {
  const direct = parsePoint(input);
  if (direct) return direct;

  const normalized = normalizeAddress(address);
  if (normalized) {
    const candidates = [
      { [`${field}Address`]: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { [`${field}Address`]: new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    ];

    for (const query of candidates) {
      const existing = await RideOffer.findOne(query).select(field).sort({ createdAt: -1 });
      const coords = existing?.[field]?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
      }
    }
  }

  const inferred = inferPointFromAddress(address);
  if (inferred) return inferred;

  // Final fallback for exact addresses not covered by city-centroid inference.
  return geocodeWithOsm(address);
};

const getDriverMap = async (offers) => {
  const ids = [
    ...new Set(offers.map((o) => toValidObjectIdString(o.driverId)).filter(Boolean))
  ];
  if (ids.length === 0) {
    return new Map();
  }

  const drivers = await User.find({ _id: { $in: ids } }).select('name profilePhoto ratings vehicle');
  return new Map(drivers.map((d) => [String(d._id), d]));
};

module.exports = {
  createRideOffer,
  getRideOffers,
  updateRideOfferStatus,
  startRide,
  completeRide,
  searchAddressSuggestions,
  resolveAddressSuggestion,
  searchByDestination,
  bookDirectRide,
  getRideHistory,
  getActiveRide
};
