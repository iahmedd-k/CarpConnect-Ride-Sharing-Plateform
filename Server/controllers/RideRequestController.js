const RideRequest = require('../models/RideRequest');
const RideOffer = require('../models/RideOffer');
const Match = require('../models/MatchModels');
const Booking = require('../models/Booking');
const Payment = require('../models/PaymentModel');
const asyncHandler = require('express-async-handler');
const { createAndEmitNotification } = require('../utils/notifications');
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

const normalizeAddress = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const addressTokens = (value = '') =>
  normalizeAddress(value)
    .split(' ')
    .filter((token) => token.length >= 2);

const addressSimilarity = (a = '', b = '') => {
  const tokensA = new Set(addressTokens(a));
  const tokensB = new Set(addressTokens(b));
  if (!tokensA.size || !tokensB.size) return 0;
  let overlap = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) overlap += 1;
  });
  return overlap / Math.max(tokensA.size, tokensB.size);
};

const materializeNextRecurringRequest = async (template) => {
  if (!template?.isRecurring || template.recurringParentId) return null;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  if (!shouldOccurOnDate(template, tomorrow)) return null;

  const nextEarliest = buildOccurrenceDate(template.earliestDeparture, tomorrow);
  const nextLatest = buildOccurrenceDate(template.latestDeparture, tomorrow);
  const existing = await RideRequest.findOne({
    $or: [
      {
        recurringParentId: template._id,
        earliestDeparture: nextEarliest,
        latestDeparture: nextLatest
      },
      {
        _id: template._id,
        earliestDeparture: nextEarliest,
        latestDeparture: nextLatest
      }
    ]
  }).lean();

  if (existing) return existing;

  return RideRequest.create({
    riderId: template.riderId,
    origin: template.origin,
    destination: template.destination,
    originAddress: template.originAddress,
    destinationAddress: template.destinationAddress,
    earliestDeparture: nextEarliest,
    latestDeparture: nextLatest,
    groupSize: template.groupSize,
    maxPricePerSeat: template.maxPricePerSeat,
    currency: template.currency || 'PKR',
    notes: template.notes || '',
    isRecurring: true,
    recurrencePattern: template.recurrencePattern,
    recurrenceDays: template.recurrenceDays || [],
    recurringParentId: template._id,
    status: 'open'
  });
};

const buildStraightRoute = (originCoordinates, destinationCoordinates) => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [originCoordinates, destinationCoordinates]
  }
});

// @desc    Create a new ride request
// @route   POST /api/rides/requests
// @access  Private (Rider only)
const createRideRequest = asyncHandler(async (req, res) => {
  const {
    origin,
    destination,
    earliestDeparture,
    latestDeparture,
    groupSize,
    seatsNeeded,
    maxPricePerSeat,
    currency,
    notes,
    originAddress,
    destinationAddress,
    isRecurring,
    recurrencePattern,
    recurrenceDays
  } = req.body || {};

  // Get user ID from the authenticated request
  const userId = req.user._id;

  // Validate rider role
  if (!['rider', 'both'].includes(String(req.user.role || ''))) {
    res.status(403);
    throw new Error('Only riders can request rides');
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
    action: 'create_request'
  });
  if (!allowance.allowed) {
    return res.status(allowance.statusCode || 403).json({
      success: false,
      message: allowance.message,
      data: { usage: allowance.usageSummary }
    });
  }

  // Validate time window
  if (!earliestDeparture || !latestDeparture) {
    return res.status(400).json({
      success: false,
      message: 'earliestDeparture and latestDeparture are required'
    });
  }

  // Validate coordinates
  const originLat = Number(origin?.lat);
  const originLng = Number(origin?.lng);
  const destinationLat = Number(destination?.lat);
  const destinationLng = Number(destination?.lng);

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

  // Normalize inputs
  const normalizedGroupSize = Math.max(1, Number(seatsNeeded || groupSize || 1));
  const normalizedMaxPricePerSeat =
    maxPricePerSeat === null || maxPricePerSeat === undefined || maxPricePerSeat === ''
      ? null
      : Math.max(0, Number(maxPricePerSeat));

  const recurringConfig = normalizeRecurringConfig(recurrencePattern, recurrenceDays);

  // Create ride request
  const rideRequest = await RideRequest.create({
    riderId: userId,
    origin: {
      type: 'Point',
      coordinates: [originLng, originLat]
    },
    destination: {
      type: 'Point',
      coordinates: [destinationLng, destinationLat]
    },
    originAddress: String(originAddress || origin?.address || '').trim(),
    destinationAddress: String(destinationAddress || destination?.address || '').trim(),
    earliestDeparture,
    latestDeparture,
    groupSize: normalizedGroupSize,
    maxPricePerSeat: Number.isFinite(normalizedMaxPricePerSeat) ? normalizedMaxPricePerSeat : null,
    currency: String(currency || 'PKR').trim() || 'PKR',
    notes: String(notes || '').trim(),
    isRecurring,
    recurrencePattern: recurringConfig.recurrencePattern,
    recurrenceDays: recurringConfig.recurrenceDays,
    status: 'open'
  });

  await materializeNextRecurringRequest(rideRequest);

  // Emit event for real-time matching
  req.io?.to(`user:${userId}`).emit('requestCreated', rideRequest);

  res.status(201).json({ 
    success: true, 
    data: { 
      request: rideRequest,
      message: 'Request created. Matching in progress...' 
    } 
  });
});

// @desc    Update rider's own ride request
// @route   PUT /api/rides/requests/:id
// @access  Private (Rider only)
const updateRideRequest = asyncHandler(async (req, res) => {
  const {
    origin,
    destination,
    earliestDeparture,
    latestDeparture,
    groupSize,
    seatsNeeded,
    maxPricePerSeat,
    currency,
    notes,
    originAddress,
    destinationAddress
  } = req.body || {};

  const request = await RideRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }

  // Authorization check
  if (String(request.riderId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Not authorized to update this request' });
  }

  // Status check - only open requests can be edited
  if (String(request.status) !== 'open') {
    return res.status(409).json({ 
      success: false, 
      message: 'Only open requests can be edited' 
    });
  }

  // Validate coordinates
  const nextOriginLat = Number(origin?.lat);
  const nextOriginLng = Number(origin?.lng);
  const nextDestinationLat = Number(destination?.lat);
  const nextDestinationLng = Number(destination?.lng);

  if (
    !Number.isFinite(nextOriginLat) ||
    !Number.isFinite(nextOriginLng) ||
    !Number.isFinite(nextDestinationLat) ||
    !Number.isFinite(nextDestinationLng)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Valid origin and destination coordinates are required'
    });
  }

  // Normalize inputs
  const normalizedGroupSize = Math.max(1, Number(seatsNeeded || groupSize || 1));
  const normalizedMaxPricePerSeat =
    maxPricePerSeat === null || maxPricePerSeat === undefined || maxPricePerSeat === ''
      ? null
      : Math.max(0, Number(maxPricePerSeat));

  // Update request data
  request.origin = {
    type: 'Point',
    coordinates: [nextOriginLng, nextOriginLat]
  };
  request.destination = {
    type: 'Point',
    coordinates: [nextDestinationLng, nextDestinationLat]
  };
  request.originAddress = String(originAddress || origin?.address || request.originAddress || '').trim();
  request.destinationAddress = String(destinationAddress || destination?.address || request.destinationAddress || '').trim();
  request.earliestDeparture = earliestDeparture;
  request.latestDeparture = latestDeparture;
  request.groupSize = normalizedGroupSize;
  request.maxPricePerSeat = Number.isFinite(normalizedMaxPricePerSeat) ? normalizedMaxPricePerSeat : null;
  request.currency = String(currency || request.currency || 'PKR').trim() || 'PKR';
  request.notes = String(notes || '').trim();
  request.status = 'open'; // Reset status when updating

  // Clear any stale negotiation state
  if (request.counterOffer) {
    request.counterOffer = null;
  }

  await request.save();

  // Emit event for real-time updates
  req.io?.to(`user:${req.user._id}`).emit('requestUpdated', request);

  res.status(200).json({ 
    success: true, 
    message: 'Ride request updated', 
    data: { 
      requestId: String(request._id),
      message: 'Request updated. Matching updated...' 
    } 
  });
});

// @desc    Get all ride requests
// @route   GET /api/rides/requests
// @access  Public
const getRideRequests = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const maxDistance = Number(req.query.maxDistance);
  const hasLocationFilter = Number.isFinite(lat) && Number.isFinite(lng);
  const maxDistanceMeters =
    Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : Number.POSITIVE_INFINITY;

  const query = {};
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
  query.status = 'open';

  let rideRequests;
  try {
    rideRequests = await RideRequest.find(query)
      .populate('riderId', 'name email role')
      .sort({ earliestDeparture: 1 });
  } catch (error) {
    const needsGeoFallback =
      hasLocationFilter && /unable to find index for \$geoNear query/i.test(String(error?.message || ''));
    if (!needsGeoFallback) {
      throw error;
    }

    const unfiltered = await RideRequest.find({ status: 'open' })
      .populate('riderId', 'name email role')
      .sort({ earliestDeparture: 1 });

    rideRequests = unfiltered.filter((request) => {
      const coords = request?.origin?.coordinates;
      if (!Array.isArray(coords) || coords.length !== 2) return false;

      const reqLng = Number(coords[0]);
      const reqLat = Number(coords[1]);
      if (!Number.isFinite(reqLat) || !Number.isFinite(reqLng)) return false;

      const distanceMeters = haversineDistanceMeters(lat, lng, reqLat, reqLng);
      return distanceMeters <= maxDistanceMeters;
    });
  }

  res.status(200).json({ 
    success: true, 
    data: { 
      requests: rideRequests,
      message: `Found ${rideRequests.length} matching requests` 
    } 
  });
});

// @desc    Get current rider's requests
// @route   GET /api/rides/requests/me
// @access  Private (Rider only)
const getMyRideRequests = asyncHandler(async (req, res) => {
  const requests = await RideRequest.find({ 
    riderId: req.user._id,
    status: { $in: ['open', 'matched', 'booked', 'cancelled'] }
  })
    .populate('counterOffer.driverId', 'name profilePhoto ratings')
    .sort({ createdAt: -1 })
    .lean();

  for (const request of requests) {
    await materializeNextRecurringRequest(request);
  }

  const refreshedRequests = await RideRequest.find({
    riderId: req.user._id,
    status: { $in: ['open', 'matched', 'booked', 'cancelled'] }
  })
    .populate('counterOffer.driverId', 'name profilePhoto ratings')
    .sort({ earliestDeparture: 1, createdAt: -1 })
    .lean();

  const shaped = refreshedRequests.map((request) => ({
    _id: String(request._id),
    originAddress: request.originAddress || 'Pickup',
    destinationAddress: request.destinationAddress || 'Dropoff',
    earliestDeparture: request.earliestDeparture,
    latestDeparture: request.latestDeparture,
    seatsNeeded: Number(request.groupSize || 1),
    maxPricePerSeat: request.maxPricePerSeat,
    currency: request.currency || 'PKR',
    status: request.status,
    notes: request.notes || '',
    counterOffer: request.counterOffer?.driverId
      ? {
          driver: {
            _id: String(request.counterOffer.driverId._id || ''),
            name: request.counterOffer.driverId.name || 'Driver',
            avatar: request.counterOffer.driverId.profilePhoto || null,
            ratings: request.counterOffer.driverId.ratings || null
          },
          offerId: request.counterOffer.offerId ? String(request.counterOffer.offerId) : null,
          pricePerSeat: request.counterOffer.pricePerSeat,
          currency: request.counterOffer.currency || request.currency || 'PKR',
          message: request.counterOffer.message || '',
          status: request.counterOffer.status || 'pending',
          createdAt: request.counterOffer.createdAt,
          respondedAt: request.counterOffer.respondedAt
        }
      : null
  }));

  res.status(200).json({ 
    success: true, 
    data: { 
      requests: shaped,
      total: shaped.length
    } 
  });
});

// @desc    Get open rider requests for driver decisioning
// @route   GET /api/rides/requests/driver/open
// @access  Private (Driver only)
const getDriverOpenRequests = asyncHandler(async (req, res) => {
  // Get driver's active offers
  const driverOffers = await RideOffer.find({
    driverId: req.user._id,
    status: { $in: ['open', 'active'] }
  })
    .select('_id departureTime seatsAvailable pricePerSeat currency originAddress destinationAddress')
    .sort({ departureTime: 1 })
    .lean();

  // Get open ride requests
  const requests = await RideRequest.find({
    status: 'open',
    rejectedBy: { $ne: req.user._id }
  })
    .populate('riderId', 'name profilePhoto ratings')
    .sort({ createdAt: -1 })
    .lean();

  const shaped = requests
    .filter((request) => request?.riderId)
    .map((request) => {
      // Calculate compatibility score
      const resolvedMaxPricePerSeat =
        request.maxPricePerSeat ?? request.maxPrice ?? request.maxFare ?? null;
      const preferredMax = Number(resolvedMaxPricePerSeat || 0);
      
      // Find compatible offers
      const compatibleOffers = driverOffers
        .filter((offer) => {
          const offerSeats = Number(offer.seatsAvailable || 0);
          if (offerSeats < Number(request.groupSize || 1)) return false;

          const reqEarliest = new Date(request.earliestDeparture);
          const reqLatest = new Date(request.latestDeparture);
          const offerDeparture = new Date(offer.departureTime);
          if (offerDeparture < reqEarliest || offerDeparture > reqLatest) return false;

          if (preferredMax > 0 && Number(offer.pricePerSeat || 0) > preferredMax) return false;

          return true;
        })
        .map((offer) => {
          const originScore = addressSimilarity(request.originAddress, offer.originAddress);
          const destinationScore = addressSimilarity(request.destinationAddress, offer.destinationAddress);
          const sameArea = originScore >= 0.25 || destinationScore >= 0.25;
          const nearbyRoute = originScore >= 0.15 && destinationScore >= 0.15;

          return {
            _id: String(offer._id),
            departureTime: offer.departureTime,
            seatsAvailable: offer.seatsAvailable,
            pricePerSeat: offer.pricePerSeat,
            currency: offer.currency || request.currency || 'PKR',
            originAddress: offer.originAddress || '',
            destinationAddress: offer.destinationAddress || '',
            sameArea,
            nearbyRoute,
            originScore,
            destinationScore
          };
        })
        .filter((offer) => offer.sameArea || offer.nearbyRoute);

      return {
        _id: String(request._id),
        rider: {
          _id: String(request.riderId?._id || ''),
          name: request.riderId?.name || 'Rider',
          avatar: request.riderId?.profilePhoto || null,
          ratings: request.riderId?.ratings || null
        },
        originAddress: request.originAddress || 'Pickup',
        destinationAddress: request.destinationAddress || 'Dropoff',
        earliestDeparture: request.earliestDeparture,
        latestDeparture: request.latestDeparture,
        seatsNeeded: Number(request.groupSize || 1),
        maxPricePerSeat: resolvedMaxPricePerSeat,
        currency: request.currency || 'PKR',
        createdAt: request.createdAt,
        notes: request.notes || '',
        status: request.status,
        counterOffer: request.counterOffer?.driverId
          ? {
              driverId: String(request.counterOffer.driverId),
              offerId: request.counterOffer.offerId ? String(request.counterOffer.offerId) : null,
              pricePerSeat: request.counterOffer.pricePerSeat,
              currency: request.counterOffer.currency || request.currency || 'PKR',
              message: request.counterOffer.message || '',
              status: request.counterOffer.status || 'pending'
            }
          : null,
        compatibleOffers,
        // Calculate match score (0-1) based on compatibility
        matchScore: compatibleOffers.length > 0 ?
          calculateMatchScore(request, compatibleOffers[0]) : 0
      };
    });

  const compatibleOnly = shaped.filter((item) => Array.isArray(item.compatibleOffers) && item.compatibleOffers.length > 0);

  // Deduplicate effectively identical requests
  const dedupedBySignature = [];
  const seen = new Set();
  for (const item of compatibleOnly) {
    const signature = [
      item.rider?._id || '',
      item.originAddress || '',
      item.destinationAddress || '',
      item.earliestDeparture ? new Date(item.earliestDeparture).toISOString() : '',
      item.latestDeparture ? new Date(item.latestDeparture).toISOString() : '',
      String(item.seatsNeeded || ''),
      String(item.maxPricePerSeat ?? ''),
      item.currency || 'PKR'
    ].join('|');

    if (seen.has(signature)) continue;
    seen.add(signature);
    dedupedBySignature.push(item);
  }

  res.status(200).json({ 
    success: true, 
    data: { 
      requests: dedupedBySignature,
      total: dedupedBySignature.length
    } 
  });
});

// @desc    Reject showing a rider request for current driver
// @route   POST /api/rides/requests/:id/reject
// @access  Private (Driver only)
const rejectRideRequest = asyncHandler(async (req, res) => {
  const request = await RideRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }

  // Add driver to rejectedBy array
  if (!request.rejectedBy?.some((id) => String(id) === String(req.user._id))) {
    request.rejectedBy = [...(request.rejectedBy || []), req.user._id];
    await request.save();
  }

  // Emit event for real-time updates
  req.io?.to(`user:${request.riderId}`).emit('requestRejected', {
    requestId: request._id,
    driverId: req.user._id
  });

  await createAndEmitNotification(req, {
    userId: request.riderId,
    type: 'rideUpdated',
    title: 'Request skipped by a driver',
    body: 'A driver passed on your request. We will keep looking for other matches.',
    relatedId: request._id,
    relatedType: 'ride',
    category: 'communication'
  });

  res.status(200).json({ 
    success: true, 
    message: 'Request rejected for this driver',
    data: {
      requestId: request._id,
      driverId: req.user._id
    }
  });
});

// @desc    Driver sends a counter offer for rider request
// @route   POST /api/rides/requests/:id/counter
// @access  Private (Driver only)
const counterRideRequest = asyncHandler(async (req, res) => {
  const { offerId, pricePerSeat, currency, message } = req.body || {};

  if (!offerId || !pricePerSeat) {
    return res.status(400).json({ 
      success: false, 
      message: 'offerId and pricePerSeat are required' 
    });
  }

  const request = await RideRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }

  // Validate offer ownership
  const offer = await RideOffer.findById(offerId);
  if (!offer || String(offer.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Offer not found for current driver' });
  }

  // Update counter offer
  request.counterOffer = {
    driverId: req.user._id,
    offerId: offer._id,
    pricePerSeat: Math.max(0, Number(pricePerSeat)),
    currency: String(currency || offer.currency || request.currency || 'PKR').trim() || 'PKR',
    message: String(message || '').trim(),
    status: 'pending',
    createdAt: new Date(),
    respondedAt: null
  };

  // Remove from rejectedBy if previously rejected
  if (request.rejectedBy?.some((id) => String(id) === String(req.user._id))) {
    request.rejectedBy = request.rejectedBy.filter((id) => String(id) !== String(req.user._id));
  }

  await request.save();

  // Emit event for real-time updates
  req.io?.to(`user:${request.riderId}`).emit('counterOfferReceived', {
    requestId: request._id,
    counterOffer: request.counterOffer
  });

  await createAndEmitNotification(req, {
    userId: request.riderId,
    type: 'newMatch',
    title: 'Driver sent a counter offer',
    body: 'A driver proposed a revised fare for your ride request.',
    relatedId: request._id,
    relatedType: 'ride',
    category: 'booking',
    priority: 2
  });

  res.status(200).json({ 
    success: true, 
    message: 'Counter offer sent',
    data: { 
      requestId: String(request._id),
      counterOffer: request.counterOffer
    }
  });
});

// @desc    Rider responds to a counter offer
// @route   POST /api/rides/requests/:id/counter/respond
// @access  Private (Rider only)
const respondCounterOffer = asyncHandler(async (req, res) => {
  const { action } = req.body || {};
  if (!['accept', 'decline'].includes(String(action || ''))) {
    return res.status(400).json({ 
      success: false, 
      message: 'action must be accept or decline' 
    });
  }

  const request = await RideRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }

  // Authorization check
  if (String(request.riderId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Not authorized to respond to this request' });
  }

  // Validate counter offer exists
  if (!request.counterOffer?.driverId || request.counterOffer.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'No pending counter offer found' });
  }

  // Process response
  let booking = null;
  let match = null;

  if (action === 'accept') {
    const offer = await RideOffer.findById(request.counterOffer.offerId);
    if (!offer) {
      return res.status(404).json({ success: false, message: 'Linked offer not found' });
    }

    const seatsNeeded = Math.max(1, Number(request.groupSize || 1));
    if (Number(offer.seatsAvailable || 0) < seatsNeeded) {
      return res.status(409).json({
        success: false,
        message: 'Not enough seats are available for this counter offer anymore'
      });
    }

    const pickupCoordinates = request.origin?.coordinates || [];
    const dropoffCoordinates = request.destination?.coordinates || [];
    const pickupTime = new Date(request.earliestDeparture);
    const dropoffTime = new Date(request.latestDeparture || request.earliestDeparture);
    const totalFare = Number(request.counterOffer.pricePerSeat || 0) * seatsNeeded;

    request.maxPricePerSeat = Number(request.counterOffer.pricePerSeat || request.maxPricePerSeat || 0);
    request.currency = request.counterOffer.currency || request.currency || 'PKR';
    request.counterOffer.status = 'accepted';
    request.counterOffer.respondedAt = new Date();

    match = await Match.create({
      requestId: request._id,
      offerId: request.counterOffer.offerId,
      driverId: request.counterOffer.driverId,
      riderIds: [request.riderId],
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
      optimizedRoute: buildStraightRoute(pickupCoordinates, dropoffCoordinates),
      fareSplits: [{
        riderId: request.riderId,
        amount: totalFare,
        currency: request.currency || 'PKR',
        pickupPoint: {
          type: 'Point',
          coordinates: pickupCoordinates
        },
        dropoffPoint: {
          type: 'Point',
          coordinates: dropoffCoordinates
        }
      }],
      totalFare,
      matchScore: 0.8,
      status: 'booked'
    });

    const acceptedPaymentMethod = String(req.body?.paymentMethod || 'cash').toLowerCase();
    const useStripe = acceptedPaymentMethod === 'stripe';
    booking = await Booking.create({
      matchId: match._id,
      userId: request.riderId,
      offerId: offer._id,
      driverId: offer.driverId,
      status: 'confirmed',
      seatCount: seatsNeeded,
      fare: totalFare,
      currency: request.currency || offer.currency || 'PKR',
      paymentStatus: useStripe ? 'pending' : 'processed',
      paymentMethod: useStripe ? 'stripe' : 'cash'
    });

    match.bookingId = booking._id;
    await match.save();

    if (useStripe) {
      await Payment.create({
        bookingId: booking._id,
        riderId: request.riderId,
        driverId: offer.driverId,
        amount: totalFare,
        currency: request.currency || offer.currency || 'PKR',
        status: 'pending',
        paymentMethod: 'stripe',
        platformFee: totalFare * 0.1
      });
    }

    request.status = 'booked';
    offer.seatsAvailable = Math.max(0, Number(offer.seatsAvailable || 0) - seatsNeeded);
    if (offer.seatsAvailable <= 0) {
      offer.status = 'active';
    }
    await offer.save();
    await request.save();

    req.io?.to(`user:${request.counterOffer.driverId}`).emit('matchCreated', {
      matchId: match._id,
      requestId: request._id,
      riderId: request.riderId,
      bookingId: booking._id
    });

    await createAndEmitNotification(req, {
      userId: request.counterOffer.driverId,
      type: 'bookingConfirmed',
      title: 'Counter offer accepted',
      body: 'The rider accepted your counter offer and the ride is ready for payment.',
      relatedId: booking._id,
      relatedType: 'booking',
      category: 'booking',
      priority: 2
    });
  } else {
    request.counterOffer.status = 'declined';
    request.counterOffer.respondedAt = new Date();
    request.rejectedBy = [...(request.rejectedBy || []), request.counterOffer.driverId];
    request.status = 'open';
    
    // Emit event for real-time updates
    req.io?.to(`user:${request.counterOffer.driverId}`).emit('counterOfferDeclined', {
      requestId: request._id
    });

    await createAndEmitNotification(req, {
      userId: request.counterOffer.driverId,
      type: 'rideUpdated',
      title: 'Counter offer declined',
      body: 'The rider declined your counter offer.',
      relatedId: request._id,
      relatedType: 'ride',
      category: 'communication'
    });
  }

  await request.save();

  res.status(200).json({ 
    success: true, 
    message: `Counter offer ${action}ed`,
    data: {
      requestId: request._id,
      action,
      status: action === 'accept' ? 'booked' : 'open',
      bookingId: booking?._id || null,
      paymentAmount: booking?.fare || null
    }
  });
});

// @desc    Cancel a ride request
// @route   POST /api/rides/requests/:id/cancel
// @access  Private (Rider only)
const cancelRideRequest = asyncHandler(async (req, res) => {
  const request = await RideRequest.findById(req.params.id);
 
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }
 
  // Authorization check
  if (String(request.riderId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Not authorized to cancel this request' });
  }
 
  // Status check
  if (request.status === 'cancelled') {
    return res.status(409).json({ success: false, message: 'Request is already cancelled' });
  }
  
  // Update request status
  request.status = 'cancelled';
  await request.save();
  
  // Emit event for real-time updates
  req.io?.to(`user:${request.riderId}`).emit('requestCancelled', {
    requestId: request._id,
    status: 'cancelled'
  });

  res.status(200).json({ 
    success: true, 
    message: 'Ride request cancelled',
    data: {
      requestId: request._id,
      status: 'cancelled'
    }
  });
});

// @desc    Calculate match score based on compatibility
// @access  Internal
const calculateMatchScore = (request, offer) => {
  let score = 1.0;
  
  // Time compatibility (0.3 weight)
  const reqTime = new Date(request.earliestDeparture);
  const offerTime = new Date(offer.departureTime);
  const timeDiff = Math.abs(reqTime - offerTime) / (60 * 60 * 1000); // in hours
  score -= Math.min(timeDiff * 0.3, 0.3);
  
  // Route compatibility (0.4 weight)
  const routeOverlap = calculateRouteOverlap(request, offer);
  score -= Math.min((1 - routeOverlap) * 0.4, 0.4);
  
  // Price compatibility (0.3 weight)
  if (request.maxPricePerSeat && offer.pricePerSeat > request.maxPricePerSeat) {
    const priceRatio = (offer.pricePerSeat - request.maxPricePerSeat) / request.maxPricePerSeat;
    score -= Math.min(priceRatio * 0.3, 0.3);
  }
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
};

// @desc    Calculate route overlap between request and offer
// @access  Internal
const calculateRouteOverlap = (request, offer) => {
  // This would use a geospatial library like Turf.js in production
  // For now, we'll simulate a basic overlap calculation
  return 0.7; // 70% overlap
};

module.exports = {
  createRideRequest,
  updateRideRequest,
  cancelRideRequest,
  getRideRequests,
  getMyRideRequests,
  getDriverOpenRequests,
  rejectRideRequest,
  counterRideRequest,
  respondCounterOffer
};
