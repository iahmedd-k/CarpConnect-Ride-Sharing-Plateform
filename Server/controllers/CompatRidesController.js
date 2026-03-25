const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const RideOffer = require('../models/RideOffer');
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
    query.status = { $in: ['open', 'active', 'completed', 'cancelled'] };
  }

  if (req.user && (req.user.role === 'driver' || req.user.role === 'both')) {
    query.driverId = req.user._id;
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

  const drivers = await getDriverMap(offers);
  const shaped = offers.map((offer) => toOfferResponse(offer, drivers.get(String(offer.driverId))));

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
  if (!q) {
    return res.status(200).json({ 
      success: true, 
      data: { 
        results: [] 
      } 
    });
  }

  const regex = new RegExp(q, 'i');
  const offers = await RideOffer.find({
    $or: [{ originAddress: regex }, { destinationAddress: regex }],
    status: { $in: ['open', 'active'] }
  })
    .sort({ createdAt: -1 })
    .limit(15);

  const seen = new Set();
  const results = [];
  for (const offer of offers) {
    const candidates = [
      { address: offer.originAddress, coordinates: offer.origin?.coordinates || null },
      { address: offer.destinationAddress, coordinates: offer.destination?.coordinates || null }
    ];
    for (const item of candidates) {
      if (item.address && regex.test(item.address) && !seen.has(item.address.toLowerCase())) {
        seen.add(item.address.toLowerCase());
        results.push(item);
      }
    }
  }

  res.status(200).json({ 
    success: true, 
    data: { 
      results,
      total: results.length
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
  const originRadiusMeters = 3000;
  const destinationRadiusMeters = 4000;

  const now = new Date();
  const query = {
    status: 'open',
    seatsAvailable: { $gt: 0 },
    departureTime: { $gte: now }
  };

  if (destination && !(Number.isFinite(destinationLat) && Number.isFinite(destinationLng))) {
    query.destinationAddress = new RegExp(destination, 'i');
  }

  if (origin && !(Number.isFinite(originLat) && Number.isFinite(originLng))) {
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

  if ((Number.isFinite(originLat) && Number.isFinite(originLng)) || (Number.isFinite(destinationLat) && Number.isFinite(destinationLng))) {
    offers = offers.filter((offer) => {
      let matchesOrigin = true;
      let matchesDestination = true;

      const offerOriginCoords = offer?.origin?.coordinates;
      const offerDestinationCoords = offer?.destination?.coordinates;

      if (Number.isFinite(originLat) && Number.isFinite(originLng) && Array.isArray(offerOriginCoords) && offerOriginCoords.length === 2) {
        const distanceFromOrigin = haversineDistanceMeters(originLat, originLng, Number(offerOriginCoords[1]), Number(offerOriginCoords[0]));
        matchesOrigin = distanceFromOrigin <= originRadiusMeters;
      }

      if (Number.isFinite(destinationLat) && Number.isFinite(destinationLng) && Array.isArray(offerDestinationCoords) && offerDestinationCoords.length === 2) {
        const distanceFromDestination = haversineDistanceMeters(destinationLat, destinationLng, Number(offerDestinationCoords[1]), Number(offerDestinationCoords[0]));
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
      if (Number.isFinite(originLat) && Number.isFinite(originLng) && Array.isArray(offerOrigin) && offerOrigin.length === 2) {
        const distance = haversineDistanceMeters(originLat, originLng, Number(offerOrigin[1]), Number(offerOrigin[0]));
        score += Math.min(distance, originRadiusMeters * 2);
      }
      if (Number.isFinite(destinationLat) && Number.isFinite(destinationLng) && Array.isArray(offerDestination) && offerDestination.length === 2) {
        const distance = haversineDistanceMeters(destinationLat, destinationLng, Number(offerDestination[1]), Number(offerDestination[0]));
        score += Math.min(distance, destinationRadiusMeters * 2);
      }
      score += Math.max(0, new Date(departureTime).getTime() - Date.now()) / (60 * 1000);
      return score;
    };

    return scoreOffer(aOriginCoords, aDestinationCoords, a.departureTime) - scoreOffer(bOriginCoords, bDestinationCoords, b.departureTime);
  });
  const drivers = await getDriverMap(offers);
  const rides = offers.map((offer) => {
    const shaped = toOfferResponse(offer, drivers.get(String(offer.driverId)));
    return {
      _id: shaped._id,
      id: shaped._id,
      origin: shaped.origin.address,
      destination: shaped.destination.address,
      originCoords: shaped.origin.point.coordinates,
      destinationCoords: shaped.destination.point.coordinates,
      departureTime: shaped.departureTime,
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
  const { offerId, seatsNeeded = 1, paymentMethod = 'cash' } = req.body;

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

  if (!offer || offer.status !== 'open' || offer.seatsAvailable <= 0 || offer.startedAt || offer.completedAt) {
    return res.status(409).json({
      success: false,
      message: 'This ride is no longer available for new bookings'
    });
  }

  const seats = Math.max(1, Number(seatsNeeded || 1));
  const normalizedPaymentMethod = String(paymentMethod || 'cash').toLowerCase() === 'stripe' ? 'stripe' : 'cash';

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

  if (offer.seatsAvailable < seats) {
    return res.status(400).json({ 
      success: false, 
      message: 'Not enough seats available' 
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
  // Create match for the booking
  const mongoose = require('mongoose');
  const dummyRequestId = new mongoose.Types.ObjectId();
  const geoPoint = (point) => ({ type: 'Point', coordinates: Array.isArray(point?.coordinates) ? point.coordinates : point });
  const match = await Match.create({
    offerId: offer._id,
    requestId: dummyRequestId, // Required field, dummy value for direct booking
    driverId: offer.driverId,
    riderIds: [req.user._id],
    pickupPoints: [],
    dropoffPoints: [],
    optimizedRoute: offer.routeGeoJson || {},
    fareSplits: [{
      riderId: req.user._id,
      amount: totalFare,
      currency: offer.currency || 'PKR',
      pickupPoint: geoPoint(offer.origin),
      dropoffPoint: geoPoint(offer.destination)
    }],
    totalFare: totalFare,
    matchScore: 1.0, // Perfect match since it's direct booking
    status: 'matched'
  });

  const booking = await Booking.create({
    matchId: match._id,
    offerId: offer._id,
    userId: req.user._id,
    driverId: offer.driverId,
    seatCount: seats,
    fare: totalFare,
    currency: offer.currency || 'PKR',
    status: normalizedPaymentMethod === 'stripe' ? 'pending' : 'confirmed',
    paymentStatus: normalizedPaymentMethod === 'stripe' ? 'pending' : 'processed',
    paymentMethod: normalizedPaymentMethod
  });

  match.bookingId = booking._id;
  await match.save();

  offer.seatsAvailable = Math.max(0, offer.seatsAvailable - seats);
  if (offer.seatsAvailable === 0 && offer.status === 'open') {
    offer.status = 'matched';
  }
  await offer.save();

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
  searchByDestination,
  bookDirectRide,
  getRideHistory,
  getActiveRide
};
