const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const Match = require('../models/MatchModels');
const EmissionsReport = require('../models/EmissionReport');
const Booking = require('../models/Booking');
const { calculateRouteDistance, findNearestPointOnRoute, calculateRouteDeviation } = require('../utils/geospatial');
const { calculateFare, splitFare, calculateEmissionsSavings } = require('../utils/fareCalculator');
const asyncHandler = require('express-async-handler');
const { createAndEmitNotification } = require('../utils/notifications');
const { optimizeMatchRoute } = require('../services/routeOptimization');

const extractCoordinates = (value) => {
  const candidates = [
    value?.coordinates,
    value?.point?.coordinates
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length === 2) {
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

const getRequestedSeats = (request) => {
  const raw = request?.groupSize ?? request?.seatsNeeded ?? request?.seatCount ?? 1;
  const seats = Number(raw);
  return Number.isFinite(seats) && seats > 0 ? seats : 1;
};

const getRequestMaxPrice = (request) => {
  const raw = request?.maxPricePerSeat ?? request?.maxPrice ?? request?.maxFare ?? null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const isOfferCompatibleWithRequest = (offer, request) => {
  const availableSeats = Number(offer?.seatsAvailable || 0);
  if (availableSeats < getRequestedSeats(request)) {
    return { ok: false, message: 'Selected offer does not have enough seats for this request' };
  }

  const offerDeparture = new Date(offer?.departureTime);
  const earliest = new Date(request?.earliestDeparture);
  const latest = new Date(request?.latestDeparture);
  if (offerDeparture < earliest || offerDeparture > latest) {
    return { ok: false, message: 'Selected offer departure time is outside the rider request window' };
  }

  const riderMaxPrice = getRequestMaxPrice(request);
  if (riderMaxPrice != null && Number(offer?.pricePerSeat || 0) > riderMaxPrice) {
    return { ok: false, message: 'Selected offer fare exceeds the rider request limit' };
  }

  const offerOriginCoords = extractCoordinates(offer?.origin);
  const offerDestinationCoords = extractCoordinates(offer?.destination);
  const requestOriginCoords = extractCoordinates(request?.origin);
  const requestDestinationCoords = extractCoordinates(request?.destination);

  if (!offerOriginCoords || !offerDestinationCoords || !requestOriginCoords || !requestDestinationCoords) {
    return { ok: false, message: 'Offer or request location data is incomplete' };
  }

  const originDistance = calculateDistance(offerOriginCoords, requestOriginCoords);
  const destinationDistance = calculateDistance(offerDestinationCoords, requestDestinationCoords);
  if (originDistance > 5000 || destinationDistance > 5000) {
    return { ok: false, message: 'Selected offer route is not compatible with this rider request' };
  }

  const { deviation } = createOptimizedRoute(
    {
      ...offer.toObject(),
      origin: { ...offer.origin, coordinates: offerOriginCoords },
      destination: { ...offer.destination, coordinates: offerDestinationCoords }
    },
    {
      ...request.toObject(),
      origin: { ...request.origin, coordinates: requestOriginCoords },
      destination: { ...request.destination, coordinates: requestDestinationCoords }
    }
  );

  if (deviation > 0.2) {
    return { ok: false, message: 'Selected offer route deviates too far from the rider request' };
  }

  return { ok: true };
};

// @desc    Match ride offers and requests
// @route   POST /api/rides/match  (mounted at /api/match in server.js → /api/match/rides/match)
// @access  Private
const matchRides = asyncHandler(async (req, res) => {
  const { maxTimeDeviation = 30, maxRouteDeviation = 0.2, maxMatches = 5 } = req.body;
  const userId = req.user._id;
  
  let offers, requests;
  
  if (req.user.role === 'driver') {
    offers = await RideOffer.find({ 
      driverId: userId,
      status: 'open'
    }).sort({ departureTime: 1 });
    
    requests = await RideRequest.find({ status: 'open' });
  } else {
    requests = await RideRequest.find({
      riderId: userId,
      status: 'open'
    }).sort({ earliestDeparture: 1 });
    
    offers = await RideOffer.find({ status: 'open' });
  }
  
  if (offers.length === 0 || requests.length === 0) {
    return res.status(200).json({ 
      success: true, 
      data: { matches: [], message: 'No matching rides found' } 
    });
  }
  
  const matches = [];
  
  for (const offer of offers) {
    const matchingRequests = findMatchingRequests(offer, requests, {
      maxTimeDeviation,
      maxRouteDeviation
    });
    
    for (const request of matchingRequests) {
      const { optimizedRoute, pickupPoints, dropoffPoints, deviation } = 
        createOptimizedRoute(offer, request);

      if (deviation > maxRouteDeviation) continue;
      
      const distance        = calculateRouteDistance(optimizedRoute);
      const distanceKm      = Number((distance / 1000).toFixed(2));
      const fare            = calculateFare(distance);

      // FIX: calculateEmissionsSavings returns an object — extract .estimatedSavings
      const emissionsResult = calculateEmissionsSavings(distanceKm);
      
      const segments  = [{ riderId: request.riderId, distance }];
      const fareSplits = splitFare(fare, segments);
      
      matches.push({
        offerId:          offer._id,
        requestId:        request._id,
        riderIds:         [request.riderId],
        pickupPoints,
        dropoffPoints,
        optimizedRoute,
        fareSplits,
        totalFare:        fare,
        emissionsSavings: emissionsResult.estimatedSavings, // plain number
        matchScore:       calculateMatchScore(offer, request, deviation),
        status:           'pending',
        createdAt:        new Date(),
        updatedAt:        new Date()
      });
      
      if (matches.length >= maxMatches) break;
    }
    
    if (matches.length >= maxMatches) break;
  }
  
  res.status(200).json({ 
    success: true, 
    data: { matches, total: matches.length } 
  });
});

// @desc    Create a match between an offer and request
// @route   POST /api/match/matches
// @access  Private
const createMatch = asyncHandler(async (req, res) => {
  const { offerId, requestId } = req.body || {};

  if (!requestId || !offerId) {
    return res.status(400).json({ success: false, message: 'offerId and requestId are required' });
  }

  // 1. Load and validate the ride request
  const request = await RideRequest.findById(requestId);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Ride request not found' });
  }
  if (String(request.status || '') !== 'open') {
    return res.status(409).json({ success: false, message: 'Selected request is no longer open' });
  }

  // 2. Validate request coordinates
  const requestOriginCoords      = extractCoordinates(request.origin);
  const requestDestinationCoords = extractCoordinates(request.destination);
  if (!requestOriginCoords || !requestDestinationCoords) {
    return res.status(400).json({
      success: false,
      message: 'Request location data is incomplete; please create a fresh request and try again.'
    });
  }

  // 3. Resolve and validate the offer
  const offer = await RideOffer.findById(offerId);
  if (!offer) {
    return res.status(404).json({ success: false, message: 'Ride offer not found' });
  }
  if (String(offer.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Selected offer does not belong to the current driver' });
  }
  if (String(offer.status || '') !== 'open') {
    return res.status(409).json({ success: false, message: 'Selected offer is not available for matching' });
  }

  const requestedSeats = getRequestedSeats(request);
  if (Number(offer.seatsAvailable || 0) < requestedSeats) {
    return res.status(409).json({
      success: false,
      message: `Only ${Number(offer.seatsAvailable || 0)} seat(s) are available for this offer`
    });
  }

  const compatibility = isOfferCompatibleWithRequest(offer, request);
  if (!compatibility.ok) {
    return res.status(409).json({ success: false, message: compatibility.message });
  }

  // 4. Validate offer coordinates
  const offerOriginCoords      = extractCoordinates(offer.origin);
  const offerDestinationCoords = extractCoordinates(offer.destination);
  if (!offerOriginCoords || !offerDestinationCoords) {
    return res.status(400).json({
      success: false,
      message: 'Offer location data is incomplete; please try again.'
    });
  }

  // 5. Normalize objects for route calculation
  const normalizedOffer = {
    ...offer.toObject(),
    origin:      { ...offer.origin,      coordinates: offerOriginCoords },
    destination: { ...offer.destination, coordinates: offerDestinationCoords }
  };

  const normalizedRequest = {
    ...request.toObject(),
    origin:      { ...request.origin,      coordinates: requestOriginCoords },
    destination: { ...request.destination, coordinates: requestDestinationCoords }
  };

  // 6. Build optimized route
  const { optimizedRoute, pickupPoints, dropoffPoints, deviation } =
    createOptimizedRoute(normalizedOffer, normalizedRequest);

  // 7. Calculate route distance
  const distance = calculateRouteDistance(optimizedRoute);
  const distanceKm = Number((distance / 1000).toFixed(2));

  // 8. FIX: calculateEmissionsSavings returns an OBJECT, not a number.
  //    Destructure what we need; pass the plain number to the DB.
  const emissionsResult = calculateEmissionsSavings(distanceKm);
  const estimatedSavingsNumber = Number(emissionsResult.estimatedSavings); // plain Number

  // 9. Calculate fare
  const fare = calculateFare(distance);

  // 10. Split fare
  const segments   = [{ riderId: request.riderId, distance }];
  const fareSplits = splitFare(fare, segments);

  // 11. Create match
  const match = await Match.create({
    offerId:         offer._id,
    requestId,
    driverId:        offer.driverId,
    riderIds:        [request.riderId],
    pickupPoints,
    dropoffPoints,
    optimizedRoute,
    fareSplits,
    totalFare:       fare,
    emissionsSavings: estimatedSavingsNumber, // plain number
    matchScore:      calculateMatchScore(normalizedOffer, normalizedRequest, deviation),
    status:          'pending',
    createdAt:       new Date(),
    updatedAt:       new Date()
  });

  try {
    await optimizeMatchRoute(match._id);
  } catch (error) {
    console.error('[route-optimization] failed to optimize match route:', error.message);
  }

  // 12. Create booking first (so we have its _id for the emissions report)
  // Booking is created as 'pending' (not 'confirmed')
  const booking = await Booking.create({
    matchId:       match._id,
    userId:        request.riderId,
    offerId:       offer._id,
    driverId:      offer.driverId,
    status:        'pending',
    seatCount:     requestedSeats,
    fare:          fare, // Pass fare as Number
    currency:      offer.currency || 'PKR',
    paymentStatus: 'processed',
    paymentMethod: 'cash'
  });

  // 13. FIX: EmissionsReport.create — pass estimatedSavings as a plain Number
  //     and include bookingId (required by the model).
  await EmissionsReport.create({
    rideId:           match._id,
    bookingId:        booking._id,
    userId:           request.riderId,
    estimatedSavings: estimatedSavingsNumber,
    distance:         distanceKm,
    calculatedFrom:   'solo-drive', // or 'public-transport' as appropriate
  });

  // 14. Update request and offer status
  request.status = 'matched';
  request.matchId = match._id;
  request.bookingId = booking._id;
  await request.save();

  offer.seatsAvailable = Math.max(0, Number(offer.seatsAvailable || 0) - requestedSeats);
  offer.status = offer.seatsAvailable <= 0 ? 'matched' : 'open';
  offer.matchId = match._id;
  offer.bookingId = booking._id;
  await offer.save();

  // 15. Emit real-time events
  req.io?.to(`user:${request.riderId}`).emit('matchCreated', {
    matchId: match._id,
    offer,
    request,
    booking
  });
  req.io?.to(`user:${request.riderId}`).emit('requestMatched', {
    requestId: request._id,
    matchId: match._id,
    bookingId: booking._id,
    offerId: offer._id,
    originAddress: offer.originAddress || request.originAddress || '',
    destinationAddress: offer.destinationAddress || request.destinationAddress || '',
    departureTime: offer.departureTime,
    pricePerSeat: offer.pricePerSeat,
    currency: offer.currency || 'PKR'
  });

  await createAndEmitNotification(req, {
    userId: request.riderId,
    type: 'newMatch',
    title: 'New ride match found',
    body: `${offer.originAddress || 'Pickup'} to ${offer.destinationAddress || 'Dropoff'} is now matched for your request.`,
    relatedId: match._id,
    relatedType: 'match',
    category: 'booking',
    priority: 2
  });

  req.io?.to(`user:${offer.driverId}`).emit('matchAccepted', {
    matchId:  match._id,
    riderId:  request.riderId,
    booking
  });

  await createAndEmitNotification(req, {
    userId: offer.driverId,
    type: 'newMatch',
    title: 'Rider matched to your trip',
    body: 'A rider has been matched to your ride offer.',
    relatedId: match._id,
    relatedType: 'match',
    category: 'booking',
    priority: 2
  });

  res.status(201).json({ 
    success: true, 
    data: { 
      match,
      booking,
      emissionsSavings: estimatedSavingsNumber,
      message: 'Match created successfully'
    } 
  });
});

// @desc    Update match status
// @route   PUT /api/match/matches/:id/status
// @access  Private
const updateMatchStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const match = await Match.findById(req.params.id);
  
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  const validStatuses = ['pending', 'matched', 'booked', 'active', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const isDriver = String(match.driverId) === String(req.user._id);
  const isRider  = match.riderIds.some(id => String(id) === String(req.user._id));
  
  if (!isDriver && !isRider) {
    return res.status(403).json({ success: false, message: 'Not authorized to update this match' });
  }

  const validTransitions = {
    'pending':   ['matched',   'cancelled'],
    'matched':   ['booked',    'cancelled'],
    'booked':    ['active',    'cancelled'],
    'active':    ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };
  
  if (!validTransitions[match.status]?.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      message: `Cannot transition from ${match.status} to ${status}` 
    });
  }

  match.status    = status;
  match.updatedAt = new Date();
  await match.save();

  if (status === 'cancelled') {
    const booking = await Booking.findOne({ matchId: match._id });
    if (booking) {
      booking.status = 'cancelled';
      await booking.save();
    }
  }

  req.io?.to(`user:${match.driverId}`).emit('matchStatusUpdated', {
    matchId: match._id, status: match.status
  });

  match.riderIds.forEach(riderId => {
    req.io?.to(`user:${riderId}`).emit('matchStatusUpdated', {
      matchId: match._id, status: match.status
    });
  });

  res.status(200).json({ 
    success: true, 
    data: { match, message: `Match status updated to ${status}` } 
  });
});

// @desc    Get match details
// @route   GET /api/match/matches/:id
// @access  Private
const getMatchDetails = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id)
    .populate('offerId',   'driverId origin destination')
    .populate('requestId', 'riderId origin destination')
    .populate('riderIds',  'name profilePhoto')
    .lean();

  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  const isDriver = String(match.driverId) === String(req.user._id);
  const isRider  = match.riderIds.some(rider => String(rider._id) === String(req.user._id));
  
  if (!isDriver && !isRider) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this match' });
  }

  res.status(200).json({ 
    success: true, 
    data: { match, message: 'Match details retrieved successfully' } 
  });
});

/* ------------------------------------------------------------------ */
/*  Helper functions                                                    */
/* ------------------------------------------------------------------ */

const findMatchingRequests = (offer, requests, options) => {
  return requests.filter(request => {
    const departureTime = new Date(offer.departureTime);
    const earliest      = new Date(request.earliestDeparture);
    const latest        = new Date(request.latestDeparture);
    
    if (departureTime < earliest || departureTime > latest) return false;
    
    const timeDiff = Math.abs(departureTime - earliest) / 60000;
    if (timeDiff > options.maxTimeDeviation) return false;
    
    const originDistance = calculateDistance(
      offer.origin.coordinates,
      request.origin.coordinates
    );
    const destinationDistance = calculateDistance(
      offer.destination.coordinates,
      request.destination.coordinates
    );
    
    if (originDistance > 5000 || destinationDistance > 5000) return false;
    
    return true;
  });
};

const calculateDistance = (point1, point2) => {
  const R  = 6371e3;
  const φ1 = point1[1] * Math.PI / 180;
  const φ2 = point2[1] * Math.PI / 180;
  const Δφ = (point2[1] - point1[1]) * Math.PI / 180;
  const Δλ = (point2[0] - point1[0]) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1)   * Math.cos(φ2)   *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const createOptimizedRoute = (offer, request) => {
  const routeCoords = offer.routeGeoJson?.coordinates || [
    [offer.origin.coordinates[0],      offer.origin.coordinates[1]],
    [offer.destination.coordinates[0], offer.destination.coordinates[1]]
  ];

  const pickupPoint  = findNearestPointOnRoute(routeCoords, request.origin.coordinates);
  const dropoffPoint = findNearestPointOnRoute(routeCoords, request.destination.coordinates);

  const originalRoute = {
    coordinates: [
      [offer.origin.coordinates[0],      offer.origin.coordinates[1]],
      [offer.destination.coordinates[0], offer.destination.coordinates[1]]
    ]
  };

  const safePickupCoords  = pickupPoint?.coordinates  || request.origin.coordinates;
  const safeDropoffCoords = dropoffPoint?.coordinates || request.destination.coordinates;

  const newRoute = {
    coordinates: [
      [offer.origin.coordinates[0],      offer.origin.coordinates[1]],
      [safePickupCoords[0],              safePickupCoords[1]],
      [safeDropoffCoords[0],             safeDropoffCoords[1]],
      [offer.destination.coordinates[0], offer.destination.coordinates[1]]
    ]
  };

  const deviation     = calculateRouteDeviation(originalRoute, newRoute);
  const departureMs   = new Date(offer.departureTime).getTime();
  const pickupDist    = Number(pickupPoint?.distance  || 0);
  const dropoffDist   = Number(dropoffPoint?.distance || 0);
  const pickupTime    = new Date(departureMs + Math.max(0, pickupDist)               * 60000);
  const dropoffTime   = new Date(departureMs + Math.max(0, pickupDist + dropoffDist) * 60000);

  return {
    optimizedRoute: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: newRoute.coordinates }
    },
    pickupPoints: [{
      type: 'Point',
      coordinates: safePickupCoords,
      time: pickupTime
    }],
    dropoffPoints: [{
      type: 'Point',
      coordinates: safeDropoffCoords,
      time: dropoffTime
    }],
    deviation
  };
};

const calculateMatchScore = (offer, request, routeDeviation) => {
  let score = 1.0;
  
  const departureTime = new Date(offer.departureTime);
  const earliest      = new Date(request.earliestDeparture);
  const latest        = new Date(request.latestDeparture);
  
  const timeDiff = Math.min(
    Math.abs(departureTime - earliest),
    Math.abs(departureTime - latest)
  ) / (60 * 60 * 1000);
  
  score -= Math.min(timeDiff * 0.1, 0.3);
  score -= Math.min(routeDeviation * 1.5, 0.3);
  
  return Math.max(0, Math.min(1, score));
};

module.exports = {
  matchRides,
  createMatch,
  updateMatchStatus,
  getMatchDetails
};
