const Match = require('../models/MatchModels');
const Booking = require('../models/Booking');
const EmissionsReport = require('../models/EmissionReport');
const RideOffer = require('../models/RideOffer');
const Review = require('../models/Review');
const ChatMessage = require('../models/ChatMessage');
const asyncHandler = require('express-async-handler');

const toIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
};

// @desc    Get user's ride history
// @route   GET /api/history/rides
// @access  Private
const getRideHistory = asyncHandler(async (req, res) => {
  const driverOffers = await RideOffer.find({ driverId: req.user._id }).select('_id').lean();
  const driverOfferIds = driverOffers.map((o) => o._id);

  // Find matches where user is rider or driver
  const matches = await Match.find({
    $or: [
      { riderIds: req.user._id },
      { driverId: req.user._id },
      { offerId: { $in: driverOfferIds } }
    ]
  })
    .populate('offerId', 'origin destination departureTime seatsAvailable pricePerSeat')
    .populate('requestId', 'origin destination earliestDeparture latestDeparture groupSize')
    .populate({
      path: 'riderIds',
      select: 'name email role'
    })
    .sort({ createdAt: -1 });

  // No status filtering - show all rides
  res.status(200).json({
    success: true,
    data: {
      rides: matches,
      total: matches.length
    }
  });
});

// @desc    Get user's booking history
// @route   GET /api/history/bookings
// @access  Private
const getBookingHistory = asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ userId: req.user._id })
    .populate('matchId', 'offerId requestId status')
    .populate({
      path: 'matchId',
      populate: {
        path: 'offerId',
        populate: {
          path: 'driverId',
          select: 'name email'
        }
      }
    })
    .populate({
      path: 'matchId',
      populate: {
        path: 'requestId',
        populate: {
          path: 'riderId',
          select: 'name email'
        }
      }
    })
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: {
      bookings,
      total: bookings.length
    }
  });
});

// @desc    Get user's emissions history
// @route   GET /api/history/emissions
// @access  Private
const getEmissionsHistory = asyncHandler(async (req, res) => {
  const reports = await EmissionsReport.find({ userId: req.user._id })
    .populate('rideId', 'offerId requestId')
    .sort({ createdAt: -1 });

  // Calculate total savings
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);

  res.status(200).json({
    success: true,
    data: {
      totalSavings,
      reports,
      total: reports.length
    }
  });
});

// @desc    Get user's ratings history
// @route   GET /api/history/ratings
// @access  Private
const getRatingsHistory = asyncHandler(async (req, res) => {
  const ratingsGiven = await Review.find({ ratedBy: req.user._id })
    .populate('userId', 'name email role')
    .populate('rideId')
    .sort({ createdAt: -1 });

  const ratingsReceived = await Review.find({ userId: req.user._id })
    .populate('ratedBy', 'name email')
    .populate('rideId')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: {
      given: ratingsGiven,
      received: ratingsReceived,
      averageRating: req.user?.ratings || null,
      totalGiven: ratingsGiven.length,
      totalReceived: ratingsReceived.length
    }
  });
});

// @desc    Get detailed ride history with all related data
// @route   GET /api/history/ride/:id
// @access  Private
const getDetailedRideHistory = asyncHandler(async (req, res) => {
  const rideId = req.params.id;

  // Verify user is a participant
  const match = await Match.findById(rideId)
    .populate('offerId', 'driverId')
    .populate('riderIds')
    .lean();

  if (!match) {
    res.status(404);
    throw new Error('Ride not found');
  }

  const isParticipant =
    (match.driverId && String(match.driverId) === String(req.user._id)) ||
    (match.riderIds && match.riderIds.some(id => String(id) === String(req.user._id)));

  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not a participant in this ride');
  }

  // Load complete ride data
  const completeRide = await Match.findById(rideId)
    .populate('offerId', 'origin destination departureTime seatsAvailable pricePerSeat')
    .populate('requestId', 'origin destination earliestDeparture latestDeparture groupSize')
    .populate({
      path: 'riderIds',
      select: 'name email role'
    })
    .populate('booking', 'status seatCount fare paymentStatus')
    .populate('rating', 'rating comment tags')
    .populate('emissionsReport', 'estimatedSavings distance')
    .sort({ createdAt: -1 });

  // Get real-time ride tracking data
  const rideTracking = {
    currentLocation: completeRide.status === 'active' ? await getCurrentLocation(rideId) : null,
    route: completeRide.optimizedRoute,
    pickupPoints: completeRide.pickupPoints,
    dropoffPoints: completeRide.dropoffPoints,
    estimatedArrival: completeRide.status === 'active' ? calculateEstimatedArrival(completeRide) : null
  };

  // Get related data
  const bookings = await Booking.find({ matchId: rideId });
  const ratings = await Review.find({ bookingId: { $in: bookings.map((b) => b._id) } });
  const emissions = await EmissionsReport.find({ rideId });

  res.status(200).json({
    success: true,
    data: {
      ride: {
        ...completeRide.toObject(),
        tracking: rideTracking,
        bookings,
        ratings,
        emissions
      },
      message: 'Detailed ride history retrieved successfully'
    }
  });
});

// @desc    Get current location for active rides
// @route   GET /api/history/ride/:id/location
// @access  Private
const getCurrentLocationHandler = asyncHandler(async (req, res) => {
  const rideId = req.params.id;
  
  // Verify user is a participant
  const match = await Match.findById(rideId).lean();
  if (!match) {
    res.status(404);
    throw new Error('Ride not found');
  }

  const isParticipant =
    (match.driverId && String(match.driverId) === String(req.user._id)) ||
    (match.riderIds && match.riderIds.some(id => String(id) === String(req.user._id)));
  
  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not a participant in this ride');
  }
  
  // Get current location from real-time tracking
  const location = req.io?.clients?.get(`ride:${rideId}`)?.location || null;
  
  res.status(200).json({
    success: true,
    data: {
      location,
      message: location ? 'Current location retrieved' : 'No active location data'
    }
  });
});

// @desc    Get ride tracking history
// @route   GET /api/history/ride/:id/tracking
// @access  Private
const getRideTrackingHistory = asyncHandler(async (req, res) => {
  const rideId = req.params.id;
  
  // Verify user is a participant
  const match = await Match.findById(rideId).lean();
  if (!match) {
    res.status(404);
    throw new Error('Ride not found');
  }

  const isParticipant =
    (match.driverId && String(match.driverId) === String(req.user._id)) ||
    (match.riderIds && match.riderIds.some(id => String(id) === String(req.user._id)));
  
  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not a participant in this ride');
  }
  
  // Get tracking history from database
  const trackingHistory = match.currentLocation?.coordinates?.length
    ? [{
        rideId,
        coordinates: match.currentLocation.coordinates,
        timestamp: match.currentLocation.timestamp || match.lastUpdate || new Date()
      }]
    : [];
  
  res.status(200).json({
    success: true,
    data: {
      trackingHistory,
      total: trackingHistory.length,
      message: 'Ride tracking history retrieved successfully'
    }
  });
});

// @desc    Get ride chat history
// @route   GET /api/history/ride/:id/chat
// @access  Private
const getRideChatHistory = asyncHandler(async (req, res) => {
  const rideId = req.params.id;
  
  // Verify user is a participant
  const match = await Match.findById(rideId).lean();
  if (!match) {
    res.status(404);
    throw new Error('Ride not found');
  }

  const isParticipant =
    (match.driverId && String(match.driverId) === String(req.user._id)) ||
    (match.riderIds && match.riderIds.some(id => String(id) === String(req.user._id)));
  
  if (!isParticipant) {
    res.status(403);
    throw new Error('You are not a participant in this ride');
  }
  
  // Get chat history from database
  const chatMessages = await ChatMessage.find({ rideId })
    .sort({ createdAt: 1 });
  
  res.status(200).json({
    success: true,
    data: {
      chatMessages,
      total: chatMessages.length,
      message: 'Ride chat history retrieved successfully'
    }
  });
});

const hideBookingHistoryItem = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404);
    throw new Error('Booking not found');
  }

  if (String(booking.userId) === String(req.user._id)) {
    booking.hiddenForRider = true;
    booking.riderHiddenAt = new Date();
  } else if (String(booking.driverId) === String(req.user._id)) {
    booking.hiddenForDriver = true;
    booking.driverHiddenAt = new Date();
  } else {
    res.status(403);
    throw new Error('Not authorized to hide this booking');
  }

  await booking.save();
  res.status(200).json({
    success: true,
    data: { id: booking._id, message: 'History item hidden' }
  });
});

const clearBookingHistory = asyncHandler(async (req, res) => {
  const role = String(req.query.role || '').toLowerCase();
  const statuses = ['completed', 'cancelled'];

  let result;
  if (role === 'driver') {
    result = await Booking.updateMany(
      { driverId: req.user._id, status: { $in: statuses } },
      { $set: { hiddenForDriver: true, driverHiddenAt: new Date() } }
    );
  } else {
    result = await Booking.updateMany(
      { userId: req.user._id, status: { $in: statuses } },
      { $set: { hiddenForRider: true, riderHiddenAt: new Date() } }
    );
  }

  res.status(200).json({
    success: true,
    data: { modifiedCount: result.modifiedCount || 0, message: 'History cleared from view' }
  });
});

const hideRideHistoryItem = asyncHandler(async (req, res) => {
  const offer = await RideOffer.findById(req.params.id);
  if (!offer) {
    res.status(404);
    throw new Error('Ride offer not found');
  }

  const offerDriverId = toIdString(offer.driverId);
  const currentUserId = toIdString(req.user._id);

  if (offerDriverId !== currentUserId) {
    const relatedDriverBooking = await Booking.findOne({
      offerId: offer._id,
      driverId: req.user._id
    }).select('_id');

    if (!relatedDriverBooking) {
      res.status(403);
      throw new Error('Not authorized to hide this ride');
    }
  }

  offer.hiddenForDriver = true;
  offer.driverHiddenAt = new Date();
  await offer.save();

  const bookingQuery = {
    driverId: req.user._id,
    $or: [{ offerId: offer._id }]
  };

  if (offer.matchId) {
    bookingQuery.$or.push({ matchId: offer.matchId });
  }

  await Booking.updateMany(bookingQuery, {
    $set: { hiddenForDriver: true, driverHiddenAt: new Date() }
  });

  res.status(200).json({
    success: true,
    data: { id: offer._id, message: 'Ride hidden from history' }
  });
});

const clearRideHistory = asyncHandler(async (req, res) => {
  const timestamp = new Date();
  const result = await RideOffer.updateMany(
    { driverId: req.user._id, status: { $in: ['completed', 'cancelled'] } },
    { $set: { hiddenForDriver: true, driverHiddenAt: timestamp } }
  );

  await Booking.updateMany(
    { driverId: req.user._id, status: { $in: ['completed', 'cancelled'] } },
    { $set: { hiddenForDriver: true, driverHiddenAt: timestamp } }
  );

  res.status(200).json({
    success: true,
    data: { modifiedCount: result.modifiedCount || 0, message: 'Ride history cleared from view' }
  });
});

// Helper function to calculate estimated arrival
const calculateEstimatedArrival = (ride) => {
  // This would use real-time location data to calculate estimated arrival
  return new Date(Date.now() + 15 * 60000); // 15 minutes from now (example)
};

// Helper function to get current location for active rides
const getCurrentLocation = async (rideId) => {
  // This would query the real-time location data store
  return {
    lat: 37.7749,
    lng: -122.4194,
    timestamp: new Date()
  };
};

module.exports = {
  getRideHistory,
  getBookingHistory,
  getEmissionsHistory,
  getRatingsHistory,
  getDetailedRideHistory,
  getCurrentLocationHandler,
  getCurrentLocation,
  getRideTrackingHistory,
  getRideChatHistory,
  hideBookingHistoryItem,
  clearBookingHistory,
  hideRideHistoryItem,
  clearRideHistory
};
