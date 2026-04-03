const asyncHandler = require('express-async-handler');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const RideRequest = require('../models/RideRequest');
const RideOffer = require('../models/RideOffer');
const User = require('../models/User');
const EmissionsReport = require('../models/EmissionReport');
const { toOfferResponse, toBookingResponse } = require('../utils/compatFormatters');
const { createAndEmitNotification } = require('../utils/notifications');
const {
  ensureSubscriptionOnUser,
  fetchUsageCounts,
  assertUsageAllowed
} = require('../utils/subscriptionUsage');
const {
  ensureChatRoomForRide,
  getRideParticipants,
  lockChatRoomForRide
} = require('../utils/chatRooms');

/* ====================================================================
   INTERNAL HELPERS
   ==================================================================== */

/**
 * Haversine distance between two [lng, lat] GeoJSON coordinate pairs.
 * Returns distance in kilometres.
 */
const haversineKm = (coords1, coords2) => {
  if (!coords1 || !coords2) return 0;
  const [lng1, lat1] = coords1;
  const [lng2, lat2] = coords2;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Estimate route distance in km from a GeoJSON LineString or a pair of
 * GeoJSON Points.  Falls back to a sensible default of 10 km if nothing
 * useful is available.
 */
const calculateRouteDistance = (routeGeoJson, originPoint, destinationPoint) => {
  // Try to walk the LineString coordinates
  if (routeGeoJson?.geometry?.coordinates?.length >= 2) {
    const coords = routeGeoJson.geometry.coordinates;
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      total += haversineKm(coords[i], coords[i + 1]);
    }
    if (total > 0) return total;
  }

  // Straight-line fallback using origin / destination GeoJSON points
  const c1 = originPoint?.coordinates;
  const c2 = destinationPoint?.coordinates;
  if (c1 && c2) {
    const d = haversineKm(c1, c2);
    if (d > 0) return d;
  }

  return 10; // absolute fallback
};

/**
 * Estimate CO₂ savings (kg) for a shared trip vs solo driving.
 * Uses the same factor as fareCalculator.js (city petrol car).
 */
const calculateEmissionsSavings = (distanceKm) => {
  const SOLO_PASSENGERS = 1.5;
  const EMISSIONS_PER_KM = 0.171; // city / petrol / car
  const solo = distanceKm * EMISSIONS_PER_KM * SOLO_PASSENGERS;
  const carpool = distanceKm * EMISSIONS_PER_KM;
  const estimatedSavings = parseFloat((solo - carpool).toFixed(2));
  return {
    estimatedSavings,
    soloEmissions: parseFloat(solo.toFixed(2)),
    carpoolEmissions: parseFloat(carpool.toFixed(2)),
  };
};

/**
 * Safely resolve the fare value whether it is stored as a plain number
 * or as { totalAmount, currency }.
 */
const resolveFare = (fare) => {
  if (typeof fare === 'number') return fare;
  if (fare && typeof fare === 'object' && fare.totalAmount != null)
    return Number(fare.totalAmount);
  return 0;
};

/**
 * Bulk-load all related documents for a list of raw Booking documents
 * and return them as shaped response objects.
 */
const hydrateBookings = async (bookings) => {
  if (!bookings.length) return [];

  // Gather IDs
  const matchIds = [...new Set(bookings.map((b) => String(b.matchId)).filter(Boolean))];
  const matches  = await Match.find({ _id: { $in: matchIds } }).lean();
  const matchMap = new Map(matches.map((m) => [String(m._id), m]));

  const offerIds = [
    ...new Set(
      bookings
        .map((b) => {
          const m = matchMap.get(String(b.matchId));
          return String(b.offerId || m?.offerId || '');
        })
        .filter(Boolean)
    ),
  ];
  const riderIds = [...new Set(bookings.map((b) => String(b.userId)).filter(Boolean))];
  const driverIds = [
    ...new Set(
      bookings
        .map((b) => {
          const m = matchMap.get(String(b.matchId));
          return String(b.driverId || m?.driverId || '');
        })
        .filter(Boolean)
    ),
  ];

  const [offers, riders, drivers] = await Promise.all([
    RideOffer.find({ _id: { $in: offerIds } }).lean(),
    User.find({ _id: { $in: riderIds } }).select('name email phone profilePhoto ratings vehicle').lean(),
    User.find({ _id: { $in: driverIds } }).select('name email phone profilePhoto ratings vehicle').lean(),
  ]);

  const offerMap  = new Map(offers.map((o)  => [String(o._id), o]));
  const riderMap  = new Map(riders.map((u)  => [String(u._id), u]));
  const driverMap = new Map(drivers.map((u) => [String(u._id), u]));

  return bookings.map((booking) => {
    const matchDoc  = matchMap.get(String(booking.matchId));
    const offerDoc  = offerMap.get(String(booking.offerId || matchDoc?.offerId));
    const driverDoc = driverMap.get(String(booking.driverId || offerDoc?.driverId));
    const riderDoc  = riderMap.get(String(booking.userId));
    const offer     = offerDoc ? toOfferResponse(offerDoc, driverDoc) : null;

    // Normalise fare so the frontend always gets { totalAmount, currency }
    const rawFare     = booking.fare;
    const fareAmount  = resolveFare(rawFare);
    const fareCurrency =
      (typeof rawFare === 'object' && rawFare?.currency) ||
      offerDoc?.currency ||
      'PKR';

    const shaped = toBookingResponse(booking, riderDoc, driverDoc, offer);
    return {
      ...shaped,
      // Always expose fare as an object so frontend can safely read .totalAmount
      fare: { totalAmount: fareAmount, currency: fareCurrency },
      matchId: booking.matchId ? String(booking.matchId) : null,
      match: matchDoc
        ? {
            _id: String(matchDoc._id),
            status: matchDoc.status,
            offerId: String(matchDoc.offerId),
            requestId: String(matchDoc.requestId),
            matchScore: matchDoc.matchScore,
            optimizedRoute: matchDoc.optimizedRoute,
          }
        : undefined,
    };
  });
};

/* ====================================================================
   ROUTE HANDLERS
   ==================================================================== */

// ── Create a new booking ────────────────────────────────────────────
// @route   POST /api/bookings
// @access  Private
const createBooking = asyncHandler(async (req, res) => {
  const { matchId, seatCount = 1 } = req.body;

  if (!matchId) {
    return res.status(400).json({ success: false, message: 'matchId is required' });
  }

  const match = await Match.findById(matchId);
  if (!match) {
    return res.status(404).json({ success: false, message: 'Match not found' });
  }

  const offer = await RideOffer.findById(match.offerId);
  if (!offer) {
    return res.status(404).json({ success: false, message: 'Ride offer not found' });
  }

  const seats = Math.max(1, Number(seatCount));
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

  if (seats > offer.seatsAvailable) {
    return res.status(400).json({ success: false, message: 'Not enough seats available' });
  }

  const existing = await Booking.findOne({ matchId, userId: req.user._id });
  if (existing) {
    return res.status(400).json({ success: false, message: 'You already booked this match' });
  }

  const riderCount = Math.max(1, match.riderIds?.length || 1);
  const fareAmount = ((match.totalFare || offer.pricePerSeat || 0) / riderCount) * seats;
  const currency   = offer.currency || 'PKR';

  const booking = await Booking.create({
    matchId,
    userId:    req.user._id,
    offerId:   offer._id,
    driverId:  offer.driverId,
    seatCount: seats,
    // Store a numeric fare in Mongo; hydrateBookings normalizes the response shape.
    fare: fareAmount,
    currency,
    status: 'confirmed',
    paymentStatus: 'processed',
    paymentMethod: 'cash'
  });

  // Update match
  match.status = 'booked';
  if (!match.riderIds.some((id) => String(id) === String(req.user._id))) {
    match.riderIds.push(req.user._id);
  }
  await match.save();

  // Update offer
  offer.seatsAvailable -= seats;
  if (offer.seatsAvailable <= 0) offer.status = 'active';
  await offer.save();

  // Update request
  const request = await RideRequest.findById(match.requestId);
  if (request) { request.status = 'booked'; await request.save(); }

  req.io?.to(`driver:${offer.driverId}`).emit('newBooking', {
    bookingId: booking._id,
    riderId:   req.user._id,
    seats,
    fare:      fareAmount,
    matchId:   match._id,
  });

  await createAndEmitNotification(req, {
    userId: offer.driverId,
    type: 'bookingUpdated',
    title: 'New booking request',
    body: 'A rider requested seats on your trip.',
    relatedId: booking._id,
    relatedType: 'booking',
    category: 'booking',
    priority: 2
  });

  if (booking.status === 'confirmed') {
    const rideParticipants = await getRideParticipants(offer._id);
    await ensureChatRoomForRide(offer._id, {
      driverId: rideParticipants.driverId || offer.driverId,
      riderIds: rideParticipants.riderIds
    });
  }

  const [shaped] = await hydrateBookings([booking]);
  return res.status(201).json({
    success: true,
    data: {
      booking: shaped,
      message: 'Booking created successfully',
    },
  });
});

// ── Cancel a booking ────────────────────────────────────────────────
// @route   DELETE /api/bookings/:id
// @access  Private
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  const isOwner  = String(booking.userId)   === String(req.user._id);
  const isDriver = String(booking.driverId) === String(req.user._id);
  if (!isOwner && !isDriver) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (['cancelled', 'completed'].includes(booking.status)) {
    return res.status(400).json({ success: false, message: 'Booking cannot be cancelled' });
  }

  booking.status             = 'cancelled';
  booking.paymentStatus      = 'cancelled';
  booking.cancellationReason = req.body.reason || 'Changed plans';
  booking.cancellationTime   = new Date();
  await booking.save();

  const match = await Match.findById(booking.matchId);
  if (match) {
    match.status   = 'pending';
    match.riderIds = match.riderIds.filter((id) => String(id) !== String(booking.userId));
    await match.save();
  }

  const offer = await RideOffer.findById(booking.offerId);
  if (offer) {
    offer.seatsAvailable += booking.seatCount || 1;
    if (offer.status === 'active' && offer.seatsAvailable > 0) offer.status = 'open';
    await offer.save();
  }

  const request = await RideRequest.findById(match?.requestId);
  if (request && request.status === 'booked') {
    request.status = 'matched';
    await request.save();
  }

  req.io?.to(`driver:${booking.driverId}`).emit('bookingCancelled', {
    bookingId:        booking._id,
    riderId:          booking.userId,
    cancellationTime: new Date(),
  });

  await createAndEmitNotification(req, {
    userId: booking.driverId,
    type: 'bookingCancelled',
    title: 'Booking cancelled',
    body: 'A rider cancelled their booking.',
    relatedId: booking._id,
    relatedType: 'booking',
    category: 'booking',
    priority: 2
  });

  const [shaped] = await hydrateBookings([booking]);
  return res.status(200).json({
    success: true,
    data: { booking: shaped, message: 'Booking cancelled successfully' },
  });
});

// ── Get user's bookings ─────────────────────────────────────────────
// @route   GET /api/bookings
// @access  Private
//
// Query params:
//   ?status=<status>       filter by booking status
//   ?offerId=<id>          filter by ride offer  ← FIX: was silently ignored
//   ?role=driver|rider     return only driver-side or rider-side bookings
const getUserBookings = asyncHandler(async (req, res) => {
  const { status, offerId, role } = req.query;

  // Build the base ownership filter
  let ownerFilter;
  if (role === 'driver') {
    ownerFilter = { driverId: req.user._id };
  } else if (role === 'rider') {
    ownerFilter = { userId: req.user._id };
  } else {
    ownerFilter = { $or: [{ userId: req.user._id }, { driverId: req.user._id }] };
  }

  const query = { ...ownerFilter };
  if (status)  query.status  = status;

  // ── FIX: offerId filter ──────────────────────────────────────────
  // Previously this param was never applied so ALL bookings were returned
  // regardless of which offer was requested.  The BookingDetailsModal
  // passes ?offerId=<offerId> to load only riders for a specific offer.
  if (offerId) {
    query.offerId = offerId;
  }
  // ────────────────────────────────────────────────────────────────

  let bookings = await Booking.find(query).sort({ createdAt: -1 });

  // Fallback: some bookings created by older code paths may not have
  // offerId stored directly on the document (they only have matchId).
  // Resolve them via their Match documents.
  if (offerId && bookings.length === 0) {
    const relatedMatches = await Match.find({ offerId }).select('_id').lean();
    if (relatedMatches.length) {
      const matchIds = relatedMatches.map((m) => m._id);
      const fallbackQuery = { matchId: { $in: matchIds }, ...ownerFilter };
      if (status) fallbackQuery.status = status;
      bookings = await Booking.find(fallbackQuery).sort({ createdAt: -1 });
    }
  }

  const shaped = await hydrateBookings(bookings);
  return res.status(200).json({
    success: true,
    data: { bookings: shaped, total: shaped.length },
  });
});

// ── Get booking details ─────────────────────────────────────────────
// @route   GET /api/bookings/:id
// @access  Private
const getBookingDetails = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  const isParticipant =
    String(booking.userId)   === String(req.user._id) ||
    String(booking.driverId) === String(req.user._id);
  if (!isParticipant) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const [shaped] = await hydrateBookings([booking]);
  return res.status(200).json({
    success: true,
    data: { booking: shaped, message: 'Booking details retrieved successfully' },
  });
});

// ── Update booking status ───────────────────────────────────────────
// @route   PATCH /api/bookings/:id/status   (also accepts PUT for legacy routes)
// @access  Private
const updateBookingStatus = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, message: 'status is required' });
  }

  const isDriver = String(booking.driverId) === String(req.user._id);
  const isRider  = String(booking.userId)   === String(req.user._id);
  if (!isDriver && !isRider) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  // Valid transitions map
  const validTransitions = {
    pending:    ['confirmed', 'cancelled'],
    confirmed:  ['picked_up', 'cancelled'],
    picked_up:  ['live',      'cancelled'],
    live:       ['completed', 'cancelled'],
    completed:  [],
    cancelled:  [],
  };

  if (!validTransitions[booking.status]?.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot transition from '${booking.status}' to '${status}'`,
    });
  }

  // Apply timestamps
  booking.status = status;
  if (status === 'picked_up' && !booking.pickedUpAt)  booking.pickedUpAt  = new Date();
  if (status === 'live'      && !booking.liveAt)       booking.liveAt      = new Date();
  if (status === 'completed' && !booking.completedAt)  booking.completedAt = new Date();
  await booking.save();

  // Side-effects on completion
  if (status === 'completed') {
    if (booking.paymentStatus !== 'refunded' && booking.paymentStatus !== 'cancelled') {
      booking.paymentStatus = 'processed';
      await booking.save();
    }

    const match = await Match.findById(booking.matchId);
    const offer = match ? await RideOffer.findById(match.offerId) : null;

    if (match && match.status !== 'completed') {
      match.status = 'completed';
      await match.save();
    }

    if (offer) {
      const remainingActiveBookings = await Booking.countDocuments({
        offerId: offer._id,
        status: { $in: ['pending', 'confirmed', 'picked_up', 'live'] }
      });
      if (remainingActiveBookings === 0 && offer.status !== 'completed') {
        offer.status = 'completed';
        offer.completedAt = offer.completedAt || new Date();
        await offer.save();
        await lockChatRoomForRide(offer._id, req.io);
      }
    }

    if (offer) {
      const distanceKm   = calculateRouteDistance(offer.routeGeoJson, offer.origin, offer.destination);
      const emissionsResult = calculateEmissionsSavings(distanceKm);
      const emissionsSaved = Number(emissionsResult?.estimatedSavings || 0);
      const soloDriveEmissions = Number(emissionsResult?.soloEmissions || 0);
      const sharedRideEmissions = Number(emissionsResult?.carpoolEmissions || 0);

      // Only create if not already exists for this booking
      const existingReport = await EmissionsReport.findOne({
        rideId:   booking.matchId,
        userId:   booking.userId,
        bookingId: booking._id,
      });
      if (!existingReport) {
        await EmissionsReport.create({
          rideId:           booking.matchId,
          bookingId:        booking._id,          // required field
          userId:           booking.userId,
          estimatedSavings: emissionsSaved,       // plain Number, not object
          distance:         distanceKm,
          calculatedFrom:   'solo-drive',
          calculationMethod: 'average',
          carbonFactor: 0.171,
          calculationDetails: {
            soloDriveEmissions,
            sharedRideEmissions,
            percentageSaved: Number(((emissionsSaved / Math.max(soloDriveEmissions, 1)) * 100).toFixed(1)),
            methodology: 'average'
          }
        });
      }

      // Drivers should also see sustainability data for completed rides.
      // Aggregate the ride impact on a single driver report per match.
      const existingDriverReport = await EmissionsReport.findOne({
        rideId: booking.matchId,
        userId: booking.driverId,
      });

      if (!existingDriverReport) {
        await EmissionsReport.create({
          rideId: booking.matchId,
          bookingId: booking._id,
          userId: booking.driverId,
          estimatedSavings: emissionsSaved,
          distance: distanceKm,
          calculatedFrom: 'solo-drive',
          calculationMethod: 'average',
          carbonFactor: 0.171,
          calculationDetails: {
            soloDriveEmissions,
            sharedRideEmissions,
            percentageSaved: Number(((emissionsSaved / Math.max(soloDriveEmissions, 1)) * 100).toFixed(1)),
            methodology: 'average'
          }
        });
      } else if (String(existingDriverReport.bookingId) !== String(booking._id)) {
        existingDriverReport.bookingId = existingDriverReport.bookingId || booking._id;
        existingDriverReport.estimatedSavings = Number((Number(existingDriverReport.estimatedSavings || 0) + emissionsSaved).toFixed(2));
        existingDriverReport.distance = Math.max(Number(existingDriverReport.distance || 0), Number(distanceKm || 0));
        existingDriverReport.calculatedFrom = 'solo-drive';
        existingDriverReport.calculationMethod = 'average';
        existingDriverReport.carbonFactor = 0.171;

        const nextSolo = Number((Number(existingDriverReport.calculationDetails?.soloDriveEmissions || 0) + soloDriveEmissions).toFixed(2));
        const nextShared = Number((Number(existingDriverReport.calculationDetails?.sharedRideEmissions || 0) + sharedRideEmissions).toFixed(2));
        existingDriverReport.calculationDetails = {
          soloDriveEmissions: nextSolo,
          sharedRideEmissions: nextShared,
          percentageSaved: Number(((existingDriverReport.estimatedSavings / Math.max(nextSolo, 1)) * 100).toFixed(1)),
          methodology: 'average'
        };

        await existingDriverReport.save();
      }
    }

  }

  // Real-time events
  req.io?.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });
  req.io?.to(`driver:${booking.driverId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });

  if (status !== 'completed') {
    await createAndEmitNotification(req, {
      userId: booking.userId,
      type: 'bookingUpdated',
      title: 'Booking updated',
      body: `Your ride status is now ${booking.status}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      category: 'booking'
    });
  } else {
    await createAndEmitNotification(req, {
      userId: booking.userId,
      type: 'bookingUpdated',
      title: 'Ride completed',
      body: 'Your ride has been marked as completed.',
      relatedId: booking._id,
      relatedType: 'booking',
      category: 'booking',
      priority: 2
    });
  }

  if (status === 'confirmed') {
    const rideParticipants = await getRideParticipants(booking.offerId);
    await ensureChatRoomForRide(booking.offerId, {
      driverId: rideParticipants.driverId || booking.driverId,
      riderIds: rideParticipants.riderIds
    });
  }

  const [shaped] = await hydrateBookings([booking]);
  return res.status(200).json({
    success: true,
    data: { booking: shaped, message: `Booking status updated to ${status}` },
  });
});

// ── Shorthand status setters ────────────────────────────────────────
// @route   PUT /api/bookings/:id/picked-up
const markBookingArrived = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (String(booking.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the driver can mark arrival for this booking' });
  }

  if (booking.status !== 'confirmed') {
    return res.status(400).json({ success: false, message: 'Arrival can only be marked for confirmed bookings' });
  }

  if (!booking.arrivedAt) {
    booking.arrivedAt = new Date();
    booking.statusHistory.push({
      status: booking.status,
      timestamp: booking.arrivedAt,
      userId: req.user._id,
      reason: 'driver_arrived'
    });
    await booking.save();
  }

  await createAndEmitNotification(req, {
    userId: booking.userId,
    type: 'bookingUpdated',
    title: 'Driver arrived',
    body: 'Your driver has arrived at the pickup point.',
    relatedId: booking._id,
    relatedType: 'booking',
    category: 'booking',
    priority: 2
  });

  req.io?.to(`user:${booking.userId}`).emit('bookingArrived', {
    bookingId: booking._id,
    arrivedAt: booking.arrivedAt,
    timestamp: new Date(),
  });
  req.io?.to(`driver:${booking.driverId}`).emit('bookingArrived', {
    bookingId: booking._id,
    arrivedAt: booking.arrivedAt,
    timestamp: new Date(),
  });

  const [shaped] = await hydrateBookings([booking]);
  return res.status(200).json({
    success: true,
    data: { booking: shaped, message: 'Driver arrival marked' },
  });
});

const pickupBooking = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), status: 'picked_up' };
  return updateBookingStatus(req, res);
});

// @route   PUT /api/bookings/:id/completed
const completeBooking = asyncHandler(async (req, res) => {
  req.body = { ...(req.body || {}), status: 'completed' };
  return updateBookingStatus(req, res);
});

// ── Spending summary (rider) ────────────────────────────────────────
// @route   GET /api/bookings/summary/spending
// @access  Private
const getSpendingSummary = asyncHandler(async (req, res) => {
  const riderBookings = await Booking.find({
    userId: req.user._id,
    status: 'completed',
    paymentStatus: 'processed',
    hiddenForRider: { $ne: true }
  });

  const totalSpent    = riderBookings.reduce((sum, b) => sum + resolveFare(b.fare), 0);
  const totalRides    = riderBookings.length;
  const averagePerRide = totalRides > 0 ? totalSpent / totalRides : 0;

  const emissionsReports    = await EmissionsReport.find({ userId: req.user._id });
  const totalEmissionsSaved = emissionsReports.reduce((sum, r) => sum + (r.estimatedSavings || 0), 0);
  const treesEquivalent     = Number((totalEmissionsSaved / 21).toFixed(3));

  return res.status(200).json({
    success: true,
    data: {
      summary: {
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        totalRides,
        averagePerRide: parseFloat(averagePerRide.toFixed(2)),
        totalEmissionsSaved: parseFloat(totalEmissionsSaved.toFixed(2)),
        treesEquivalent,
        message: `Saved ${totalEmissionsSaved.toFixed(2)} kg CO₂ across ${totalRides} rides`,
      },
    },
  });
});

// ── Earnings summary (driver) ───────────────────────────────────────
// @route   GET /api/bookings/summary/earnings
// @access  Private
const getEarningsSummary = asyncHandler(async (req, res) => {
  const query = {
    driverId: req.user._id,
    status: 'completed',
    paymentStatus: 'processed',
    hiddenForDriver: { $ne: true }
  };

  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate)   query.createdAt.$lte = new Date(req.query.endDate);
  }

  const bookings = await Booking.find(query).sort({ createdAt: -1 }).limit(200).lean();

  const riderIds = [...new Set(bookings.map((b) => String(b.userId)).filter(Boolean))];
  const riders   = await User.find({ _id: { $in: riderIds } }).select('name').lean();
  const riderMap = new Map(riders.map((r) => [String(r._id), r]));

  const totalEarnings  = bookings.reduce((sum, b) => sum + resolveFare(b.fare), 0);
  const platformFees   = 0;
  const totalBalance   = totalEarnings;
  const totalRides     = bookings.length;
  const averagePerRide = totalRides > 0 ? totalEarnings / totalRides : 0;

  const transactions = bookings.map((b) => ({
    id:         String(b._id),
    amount:     resolveFare(b.fare),
    currency:   b.currency || (typeof b.fare === 'object' ? b.fare?.currency : null) || 'PKR',
    date:       b.updatedAt || b.createdAt,
    status:     b.status,
    riderName:  riderMap.get(String(b.userId))?.name || 'Rider',
  }));

  return res.status(200).json({
    success: true,
    data: {
      summary: {
        totalBalance:    parseFloat(totalBalance.toFixed(2)),
        totalRides,
        totalEarnings:   parseFloat(totalEarnings.toFixed(2)),
        platformFees,
        averagePerRide:  parseFloat(averagePerRide.toFixed(2)),
        transactions,
        message: `Earned ${totalEarnings.toFixed(2)} PKR across ${totalRides} rides`,
      },
    },
  });
});

/* ====================================================================
   EXPORTS
   ==================================================================== */
module.exports = {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingDetails,
  updateBookingStatus,
  markBookingArrived,
  pickupBooking,
  completeBooking,
  getSpendingSummary,
  getEarningsSummary,
};
