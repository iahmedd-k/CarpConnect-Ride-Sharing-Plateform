const asyncHandler = require('express-async-handler');
const RideOffer = require('../models/RideOffer');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');
const { toOfferResponse, toBookingResponse } = require('../utils/compatFormatters');
const { optimizeMatchRoute, applyOptimizationDecision } = require('../services/routeOptimization');

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'picked_up', 'live'];
const PUBLIC_BOOKING_STATUSES = ['pending', 'confirmed', 'picked_up', 'live', 'completed'];

const getActiveRide = asyncHandler(async (req, res) => {
  const candidateOffers = await RideOffer.find({
    driverId: req.user._id,
    status: { $in: ['active', 'booked', 'matched', 'open'] }
  })
    .sort({ departureTime: 1, updatedAt: -1 })
    .lean();

  if (!candidateOffers.length) {
    return res.status(200).json({
      success: true,
      data: {
        ride: null,
        bookings: [],
        match: null,
        message: 'No active ride found'
      }
    });
  }

  let selectedOffer = null;
  let selectedBookings = [];
  let selectedMatch = null;

  for (const offer of candidateOffers) {
    const bookings = await Booking.find({
      offerId: offer._id,
      status: { $in: ACTIVE_BOOKING_STATUSES }
    }).lean();

    if (!bookings.length) {
      continue;
    }

    selectedOffer = offer;
    selectedBookings = bookings;
    selectedMatch = await Match.findOne({ offerId: offer._id }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    break;
  }

  if (!selectedOffer) {
    return res.status(200).json({
      success: true,
      data: {
        ride: null,
        bookings: [],
        match: null,
        message: 'No active ride found'
      }
    });
  }

  const riderIds = [...new Set(selectedBookings.map((booking) => String(booking.userId)).filter(Boolean))];
  const requestIds = [...new Set(
    selectedBookings
      .map((booking) => booking.matchId)
      .filter(Boolean)
      .map(String)
  )];

  const [riders, matches] = await Promise.all([
    User.find({ _id: { $in: riderIds } })
      .select('name profilePhoto ratings vehicle verified totalCompletedRides totalCo2SavedKg')
      .lean(),
    Match.find({ _id: { $in: requestIds } }).lean()
  ]);

  const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));
  const matchMap = new Map(matches.map((match) => [String(match._id), match]));

  const rideRequestIds = [...new Set(
    matches.map((match) => String(match.requestId)).filter(Boolean)
  )];
  const requests = await RideRequest.find({ _id: { $in: rideRequestIds } }).lean();
  const requestMap = new Map(requests.map((request) => [String(request._id), request]));

  const driver = await User.findById(req.user._id)
    .select('name profilePhoto ratings vehicle verified totalCompletedRides totalCo2SavedKg')
    .lean();

  const shapedRide = {
    ...toOfferResponse(selectedOffer, driver),
    status: selectedOffer.status,
    estimatedEarnings: selectedBookings
      .filter((booking) => booking.status !== 'cancelled')
      .reduce((sum, booking) => sum + Number(booking.fare || 0), 0),
    estimatedEmissionsSaved: selectedOffer.emissionsSavingsKg || 0
  };

  const shapedBookings = selectedBookings.map((booking) => {
    const rider = riderMap.get(String(booking.userId));
    const match = matchMap.get(String(booking.matchId));
    const rideRequest = requestMap.get(String(match?.requestId || ''));
    const shaped = toBookingResponse(booking, rider, driver, selectedOffer);

    return {
      ...shaped,
      rider: shaped.rider || (rider ? {
        _id: String(rider._id),
        name: rider.name,
        avatar: rider.profilePhoto || '',
        ratings: rider.ratings || { average: 0, count: 0, recent: [] }
      } : null),
      request: rideRequest ? {
        _id: String(rideRequest._id),
        origin: {
          address: rideRequest.originAddress || 'Pickup',
          coordinates: rideRequest.origin?.coordinates || []
        },
        destination: {
          address: rideRequest.destinationAddress || 'Dropoff',
          coordinates: rideRequest.destination?.coordinates || []
        },
        earliestDeparture: rideRequest.earliestDeparture,
        latestDeparture: rideRequest.latestDeparture,
        seatsNeeded: rideRequest.groupSize || 1
      } : null,
      pickupPoint: match?.pickupPoints?.[0] || null,
      dropoffPoint: match?.dropoffPoints?.[0] || null
    };
  });

  res.status(200).json({
    success: true,
    data: {
      ride: shapedRide,
      bookings: shapedBookings,
      match: selectedMatch
    }
  });
});

const getPublicTrackingRide = asyncHandler(async (req, res) => {
  const ride = await RideOffer.findById(req.params.rideId).lean();

  if (!ride) {
    return res.status(404).json({
      success: false,
      message: 'Ride not found'
    });
  }

  const [driver, bookings] = await Promise.all([
    User.findById(ride.driverId)
      .select('name verified vehicle profilePhoto phone')
      .lean(),
    Booking.find({
      offerId: ride._id,
      status: { $in: PUBLIC_BOOKING_STATUSES }
    }).lean()
  ]);

  const riderIds = [...new Set(bookings.map((booking) => String(booking.userId || '')).filter(Boolean))];
  const riders = riderIds.length
    ? await User.find({ _id: { $in: riderIds } })
      .select('name verified profilePhoto phone')
      .lean()
    : [];
  const riderMap = new Map(riders.map((rider) => [String(rider._id), rider]));

  const hasLiveMovement = bookings.some((booking) => ['picked_up', 'live'].includes(String(booking.status || '').toLowerCase()));
  const hasAnyBooking = bookings.length > 0;
  const allFinished = hasAnyBooking && bookings.every((booking) =>
    ['completed', 'cancelled'].includes(String(booking.status || '').toLowerCase())
  );

  const status = allFinished || String(ride.status || '').toLowerCase() === 'completed'
    ? 'completed'
    : hasLiveMovement || ['active', 'booked', 'matched', 'open'].includes(String(ride.status || '').toLowerCase())
      ? 'active'
      : 'scheduled';

  res.status(200).json({
    success: true,
    data: {
      ride: {
        _id: String(ride._id),
        status,
        departureTime: ride.departureTime || null,
        origin: {
          address: ride.originAddress || 'Pickup',
          coordinates: ride.origin?.coordinates || []
        },
        destination: {
          address: ride.destinationAddress || 'Dropoff',
          coordinates: ride.destination?.coordinates || []
        },
        completedAt: ride.completedAt || null,
        driver: driver ? {
          _id: String(driver._id),
          name: driver.name || 'Driver',
          verified: Boolean(driver.verified),
          avatar: driver.profilePhoto || '',
          phone: driver.phone || '',
        } : null,
        vehicle: driver?.vehicle || null,
        riders: bookings.map((booking) => {
          const rider = riderMap.get(String(booking.userId || ''));
          return {
            _id: rider ? String(rider._id) : String(booking.userId || ''),
            name: rider?.name || 'Rider',
            verified: Boolean(rider?.verified),
            avatar: rider?.profilePhoto || '',
            phone: rider?.phone || '',
            seatCount: Number(booking.seatCount || 1),
            status: booking.status || 'pending'
          };
        }),
        safety: {
          activeRiderCount: bookings.filter((booking) => ['confirmed', 'picked_up', 'live'].includes(String(booking.status || '').toLowerCase())).length,
          completedRiderCount: bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'completed').length,
          totalSeatsBooked: bookings.reduce((sum, booking) => sum + Number(booking.seatCount || 1), 0)
        }
      }
    }
  });
});

const optimizeMatchedRide = asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  const { decision } = req.body || {};

  const match = await Match.findById(matchId).lean();
  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Match not found'
    });
  }

  if (String(match.driverId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Only the matched driver can optimize this route'
    });
  }

  let optimizedRoute;
  if (decision) {
    optimizedRoute = await applyOptimizationDecision(matchId, String(decision).toLowerCase());
  } else {
    optimizedRoute = await optimizeMatchRoute(matchId);
  }

  return res.status(200).json({
    success: true,
    data: {
      matchId,
      optimizedRoute,
      message: decision
        ? `Route optimization ${String(decision).toLowerCase()}ed successfully`
        : 'Route optimization retrieved successfully'
    }
  });
});

module.exports = {
  getActiveRide,
  getPublicTrackingRide,
  optimizeMatchedRide
};
