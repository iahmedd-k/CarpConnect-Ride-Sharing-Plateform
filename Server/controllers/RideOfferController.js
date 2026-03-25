const RideOffer = require('../models/RideOffer');
const Match = require('../models/MatchModels');
const Booking = require('../models/Booking');
const Payment = require('../models/PaymentModel');
const RideRequest = require('../models/RideRequest');
const asyncHandler = require('express-async-handler');
const { createAndEmitNotification } = require('../utils/notifications');
const { calculateRouteDistance, calculateRouteDuration } = require('../utils/geospatial');

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'picked_up', 'live'];

const reconcileOfferStatus = async (offerLike) => {
  if (!offerLike?._id) return offerLike;

  const [activeBookings, completedBookings] = await Promise.all([
    Booking.countDocuments({
      offerId: offerLike._id,
      status: { $in: ACTIVE_BOOKING_STATUSES }
    }),
    Booking.countDocuments({
      offerId: offerLike._id,
      status: 'completed'
    })
  ]);

  if (activeBookings === 0 && completedBookings > 0 && offerLike.status !== 'completed') {
    await RideOffer.updateOne(
      { _id: offerLike._id },
      { $set: { status: 'completed', completedAt: offerLike.completedAt || new Date() } }
    );
    return {
      ...offerLike,
      status: 'completed',
      completedAt: offerLike.completedAt || new Date()
    };
  }

  if (activeBookings === 0 && completedBookings === 0 && ['active', 'booked'].includes(String(offerLike.status || ''))) {
    await RideOffer.updateOne(
      { _id: offerLike._id },
      { $set: { status: 'open' } }
    );
    return {
      ...offerLike,
      status: 'open'
    };
  }

  return offerLike;
};
const {
  normalizeRecurringConfig,
  shouldOccurOnDate,
  buildOccurrenceDate
} = require('../utils/recurring');
const {
  ensureSubscriptionOnUser,
  fetchUsageCounts,
  assertUsageAllowed
} = require('../utils/subscriptionUsage');

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

const enrichOfferMetrics = (offerLike) => {
  const offer = offerLike?.toObject ? offerLike.toObject() : { ...(offerLike || {}) };
  if (Number(offer.estimatedDistanceKm || 0) > 0 && Number(offer.estimatedDurationMin || 0) > 0) {
    return offer;
  }

  const routeCoordinates = offer.routeGeoJson?.coordinates || offer.routeGeoJson?.geometry?.coordinates;
  const hasRoute = Array.isArray(routeCoordinates) && routeCoordinates.length >= 2;
  let route = hasRoute ? offer.routeGeoJson : null;
  if (!route) {
    const originCoords = offer?.origin?.coordinates;
    const destinationCoords = offer?.destination?.coordinates;
    if (
      Array.isArray(originCoords) &&
      originCoords.length === 2 &&
      Array.isArray(destinationCoords) &&
      destinationCoords.length === 2
    ) {
      route = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [originCoords, destinationCoords] }
      };
    }
  }

  if (!route) return offer;

  const distanceMeters = calculateRouteDistance(route);
  const durationMin = calculateRouteDuration(route);
  if (Number(offer.estimatedDistanceKm || 0) <= 0 && Number.isFinite(distanceMeters) && distanceMeters > 0) {
    offer.estimatedDistanceKm = Number((distanceMeters / 1000).toFixed(2));
  }
  if (Number(offer.estimatedDurationMin || 0) <= 0 && Number.isFinite(durationMin) && durationMin > 0) {
    offer.estimatedDurationMin = Number(Math.round(durationMin));
  }
  return offer;
};

const materializeNextRecurringOffer = async (template) => {
  if (!template?.isRecurring || template.recurringParentId) return null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (!shouldOccurOnDate(template, tomorrow)) return null;

  const nextDepartureTime = buildOccurrenceDate(template.departureTime, tomorrow);
  const existing = await RideOffer.findOne({
    $or: [
      { recurringParentId: template._id, departureTime: nextDepartureTime },
      { _id: template._id, departureTime: nextDepartureTime }
    ]
  }).lean();

  if (existing) return existing;

  return RideOffer.create({
    driverId: template.driverId,
    origin: template.origin,
    originAddress: template.originAddress,
    destination: template.destination,
    destinationAddress: template.destinationAddress,
    routeGeoJson: template.routeGeoJson,
    departureTime: nextDepartureTime,
    seatsAvailable: template.seatsTotal || template.seatsAvailable,
    seatsTotal: template.seatsTotal || template.seatsAvailable,
    pricePerSeat: template.pricePerSeat,
    currency: template.currency || 'PKR',
    preferences: template.preferences,
    isRecurring: true,
    recurrencePattern: template.recurrencePattern,
    recurrenceDays: template.recurrenceDays || [],
    recurringParentId: template._id,
    status: 'open'
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
    seatsAvailable,
    pricePerSeat,
    preferences,
    isRecurring,
    recurrencePattern,
    recurrenceDays,
    routeGeoJson
  } = req.body;

  // Get user ID from the authenticated request
  const userId = req.user._id;

  // Validate driver role
  if (!['driver', 'both'].includes(String(req.user.role || ''))) {
    res.status(403);
    throw new Error('Only drivers can offer rides');
  }

  const subscription = await ensureSubscriptionOnUser(req.user);
  if (Boolean(isRecurring) && !['plus', 'pro'].includes(String(subscription?.plan || 'free'))) {
    return res.status(403).json({
      success: false,
      message: 'Recurring route setup requires Plus or Pro plan.'
    });
  }
  const usage = await fetchUsageCounts(userId);
  const allowance = assertUsageAllowed({
    subscription,
    usage,
    action: 'create_offer'
  });
  if (!allowance.allowed) {
    return res.status(allowance.statusCode || 403).json({
      success: false,
      message: allowance.message,
      data: { usage: allowance.usageSummary }
    });
  }

  // Validate required fields
  if (!origin || !destination || !departureTime || !seatsAvailable || !pricePerSeat) {
    return res.status(400).json({
      success: false,
      message: 'Origin, destination, departure time, seats available, and price per seat are required'
    });
  }

  // Validate coordinates
  const originLat = Number(origin.lat);
  const originLng = Number(origin.lng);
  const destinationLat = Number(destination.lat);
  const destinationLng = Number(destination.lng);

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destinationLat) ||
    !Number.isFinite(destinationLng)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Valid origin and destination coordinates are required'
    });
  }

  const recurringConfig = normalizeRecurringConfig(recurrencePattern, recurrenceDays);

  // Create ride offer with complete data
  const rideOffer = await RideOffer.create({
    driverId: userId,
    origin: {
      type: 'Point',
      coordinates: [originLng, originLat]
    },
    originAddress: String(origin.address || '').trim(),
    destination: {
      type: 'Point',
      coordinates: [destinationLng, destinationLat]
    },
    destinationAddress: String(destination.address || '').trim(),
    departureTime,
    seatsAvailable,
    pricePerSeat,
    preferences: {
      music: preferences?.music ?? true,
      smoking: preferences?.smoking ?? false,
      pets: preferences?.pets ?? false,
      conversation: preferences?.conversation ?? true
    },
    routeGeoJson: routeGeoJson || null,
    isRecurring,
    recurrencePattern: recurringConfig.recurrencePattern,
    recurrenceDays: recurringConfig.recurrenceDays,
    status: 'open',
    createdAt: new Date()
  });

  await materializeNextRecurringOffer(rideOffer);

  // Emit event for real-time matching
  req.io?.to(`user:${userId}`).emit('offerCreated', rideOffer);

  res.status(201).json({
    success: true,
    data: {
      offer: rideOffer,
      message: 'Ride offer created. Waiting for matching...'
    }
  });
});

// @desc    Update ride offer status
// @route   PUT /api/rides/offers/:id/status
// @access  Private (Driver only)
const updateOfferStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({
      success: false,
      message: 'Status is required'
    });
  }

  const rideOffer = await RideOffer.findById(req.params.id);
  
  if (!rideOffer) {
    return res.status(404).json({
      success: false,
      message: 'Ride offer not found'
    });
  }

  // Authorization check
  if (String(rideOffer.driverId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this offer'
    });
  }

  // Validate status transition
  const validStatuses = ['open', 'active', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status'
    });
  }

  // Update status
  rideOffer.status = status;
  await rideOffer.save();

  // Emit event for real-time updates
  req.io?.to(`user:${rideOffer.driverId}`).emit('offerStatusUpdated', {
    offerId: rideOffer._id,
    status: rideOffer.status
  });

  res.status(200).json({
    success: true,
    data: {
      offer: rideOffer,
      message: `Ride offer status updated to ${status}`
    }
  });
});

// @desc    Update ride offer details
// @route   PUT /api/rides/offers/:id
// @access  Private (Driver only)
const updateRideOffer = asyncHandler(async (req, res) => {
  const {
    origin,
    destination,
    departureTime,
    seatsAvailable,
    pricePerSeat,
    preferences,
    isRecurring,
    recurrencePattern,
    routeGeoJson
  } = req.body;

  const rideOffer = await RideOffer.findById(req.params.id);
  
  if (!rideOffer) {
    return res.status(404).json({
      success: false,
      message: 'Ride offer not found'
    });
  }

  // Authorization check
  if (String(rideOffer.driverId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this offer'
    });
  }

  // Validate status (only open offers can be edited)
  if (rideOffer.status !== 'open') {
    return res.status(409).json({
      success: false,
      message: 'Only open offers can be edited'
    });
  }

  // Update fields if provided
  if (origin) {
    rideOffer.origin = {
      type: 'Point',
      coordinates: [origin.lng, origin.lat]
    };
  }
  
  if (destination) {
    rideOffer.destination = {
      type: 'Point',
      coordinates: [destination.lng, destination.lat]
    };
  }
  
  if (departureTime) {
    rideOffer.departureTime = departureTime;
  }
  
  if (seatsAvailable !== undefined) {
    rideOffer.seatsAvailable = seatsAvailable;
  }
  
  if (pricePerSeat !== undefined) {
    rideOffer.pricePerSeat = pricePerSeat;
  }
  
  if (preferences) {
    rideOffer.preferences = {
      ...rideOffer.preferences,
      ...preferences
    };
  }
  
  if (isRecurring !== undefined) {
    rideOffer.isRecurring = isRecurring;
  }
  
  if (recurrencePattern) {
    rideOffer.recurrencePattern = recurrencePattern;
  }
  
  if (routeGeoJson) {
    rideOffer.routeGeoJson = routeGeoJson;
  }

  await rideOffer.save();

  // Emit event for real-time updates
  req.io?.to(`user:${rideOffer.driverId}`).emit('offerUpdated', rideOffer);

  res.status(200).json({
    success: true,
    data: {
      offer: rideOffer,
      message: 'Ride offer updated'
    }
  });
});

// @desc    Get all ride offers
// @route   GET /api/rides/offers
// @access  Public
const getRideOffers = asyncHandler(async (req, res) => {
  const { lat, lng, maxDistance } = req.query;
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const parsedMaxDistance = Number(maxDistance);
  const hasLocationFilter = Number.isFinite(parsedLat) && Number.isFinite(parsedLng) && Number.isFinite(parsedMaxDistance) && parsedMaxDistance > 0;
  const maxDistanceMeters = hasLocationFilter ? parsedMaxDistance : Number.POSITIVE_INFINITY;
  let query = {};
  
  // If location parameters are provided, find nearby offers
  if (hasLocationFilter) {
    query = {
      origin: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parsedLng, parsedLat]
          },
          $maxDistance: parsedMaxDistance
        }
      }
    };
  }
  
  // Only return bookable offers to riders/search pages.
  query.status = 'open';
  query.seatsAvailable = { $gt: 0 };
  query.departureTime = { $gte: new Date() };
  
  let rideOffers;
  try {
    rideOffers = await RideOffer.find(query)
      .populate('driverId', 'name email role')
      .sort({ departureTime: 1 });
  } catch (error) {
    const needsGeoFallback =
      hasLocationFilter &&
      /unable to find index for \$geoNear query/i.test(String(error?.message || ''));

    if (!needsGeoFallback) {
      throw error;
    }

    const fallbackQuery = { ...query };
    delete fallbackQuery.origin;

    const unfilteredOffers = await RideOffer.find(fallbackQuery)
      .populate('driverId', 'name email role')
      .sort({ departureTime: 1 });

    rideOffers = unfilteredOffers.filter((offer) => {
      const coords = offer?.origin?.coordinates;
      if (!Array.isArray(coords) || coords.length !== 2) return false;
      const offerLng = Number(coords[0]);
      const offerLat = Number(coords[1]);
      if (!Number.isFinite(offerLat) || !Number.isFinite(offerLng)) return false;
      const distanceMeters = haversineDistanceMeters(parsedLat, parsedLng, offerLat, offerLng);
      return distanceMeters <= maxDistanceMeters;
    });
  }

  const reconciledOffers = [];
  for (const offer of rideOffers) {
    const reconciled = await reconcileOfferStatus(offer.toObject ? offer.toObject() : offer);
    if (
      String(reconciled?.status || '') === 'open' &&
      Number(reconciled?.seatsAvailable || 0) > 0 &&
      !reconciled?.startedAt &&
      !reconciled?.completedAt
    ) {
      reconciledOffers.push(enrichOfferMetrics(reconciled));
    }
  }
  
  res.status(200).json({
    success: true,
    data: {
      offers: reconciledOffers,
      total: reconciledOffers.length
    }
  });
});

// @desc    Get current driver's ride offers
// @route   GET /api/rides/offers/me
// @access  Private (Driver only)
const getMyRideOffers = asyncHandler(async (req, res) => {
  const rideOffers = await RideOffer.find({ driverId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  for (const offer of rideOffers) {
    await materializeNextRecurringOffer(offer);
    await reconcileOfferStatus(offer);
  }

  const refreshedOffers = await RideOffer.find({ driverId: req.user._id })
    .sort({ departureTime: 1, createdAt: -1 })
    .lean();
  const enrichedOffers = refreshedOffers.map((offer) => enrichOfferMetrics(offer));
  
  res.status(200).json({
    success: true,
    data: {
      offers: enrichedOffers,
      total: enrichedOffers.length
    }
  });
});

// @desc    Cancel a ride offer
// @route   POST /api/rides/offers/:id/cancel
// @access  Private (Driver only)
const cancelRideOffer = asyncHandler(async (req, res) => {
  const rideOffer = await RideOffer.findById(req.params.id);
  
  if (!rideOffer) {
    return res.status(404).json({
      success: false,
      message: 'Ride offer not found'
    });
  }

  // Authorization check
  if (String(rideOffer.driverId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this offer'
    });
  }

  // Status check
  if (rideOffer.status === 'cancelled') {
    return res.status(409).json({
      success: false,
      message: 'Offer is already cancelled'
    });
  }

  // Update status
  rideOffer.status = 'cancelled';
  await rideOffer.save();

  const [matches, bookings] = await Promise.all([
    Match.find({ offerId: rideOffer._id, status: { $ne: 'completed' } }),
    Booking.find({ offerId: rideOffer._id, status: { $in: ['pending', 'confirmed', 'picked_up', 'live'] } })
  ]);

  for (const match of matches) {
    match.status = 'cancelled';
    await match.save();

    if (match.requestId) {
      const rideRequest = await RideRequest.findById(match.requestId);
      if (rideRequest && rideRequest.status !== 'cancelled') {
        rideRequest.status = 'open';
        await rideRequest.save();
      }
    }
  }

  for (const booking of bookings) {
    booking.status = 'cancelled';
    booking.cancellationReason = 'Driver cancelled the ride offer';
    booking.cancellationTime = new Date();
    if (booking.paymentStatus === 'pending') {
      booking.paymentStatus = 'cancelled';
    } else if (booking.paymentStatus === 'processed') {
      booking.paymentStatus = 'refunded';
    }
    await booking.save();

    const payment = await Payment.findOne({ bookingId: booking._id });
    if (payment) {
      if (payment.status === 'pending') {
        payment.status = 'canceled';
      } else if (payment.status === 'succeeded') {
        payment.status = 'refunded';
      }
      payment.updatedAt = new Date();
      await payment.save();
    }

    req.io?.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
      bookingId: booking._id,
      status: 'cancelled',
      timestamp: new Date()
    });

    await createAndEmitNotification(req, {
      userId: booking.userId,
      type: 'bookingCancelled',
      title: 'Ride cancelled by driver',
      body: 'Your driver cancelled the ride before pickup.',
      relatedId: booking._id,
      relatedType: 'booking',
      category: 'booking',
      priority: 2
    });
  }

  // Emit event for real-time updates
  req.io?.to(`user:${rideOffer.driverId}`).emit('offerCancelled', {
    offerId: rideOffer._id,
    status: 'cancelled'
  });

  res.status(200).json({
    success: true,
    data: {
      offer: rideOffer,
      message: 'Ride offer cancelled'
    }
  });
});

// @desc    Get ride offer details
// @route   GET /api/rides/offers/:id
// @access  Public
const getRideOfferDetails = asyncHandler(async (req, res) => {
  const rideOffer = await RideOffer.findById(req.params.id)
    .populate('driverId', 'name email role')
    .lean();
  
  if (!rideOffer) {
    return res.status(404).json({
      success: false,
      message: 'Ride offer not found'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      offer: enrichOfferMetrics(rideOffer)
    }
  });
});

module.exports = {
  createRideOffer,
  updateOfferStatus,
  updateRideOffer,
  getRideOffers,
  getMyRideOffers,
  cancelRideOffer,
  getRideOfferDetails
};
