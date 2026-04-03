const express = require('express');
const router = express.Router();
const {
  createBooking,
  cancelBooking,
  getUserBookings,
  getBookingDetails,
  updateBookingStatus,
  markBookingArrived,
  pickupBooking,
  completeBooking,
  getSpendingSummary,
  getEarningsSummary
} = require('../controllers/BookingController');
const { protect } = require('../middleware/authMiddleware');
const { createAndEmitNotification } = require('../utils/notifications');
const Booking = require('../models/Booking');
const RideOffer = require('../models/RideOffer');
const Match = require('../models/MatchModels');
const RideRequest = require('../models/RideRequest');
const { ensureChatRoomForRide, getRideParticipants } = require('../utils/chatRooms');

// Create a new booking
router.post('/', protect, createBooking);

// Get user's bookings
router.get('/', protect, getUserBookings);

// Get booking details
router.get('/:id', protect, getBookingDetails);

// Cancel a booking
router.delete('/:id', protect, cancelBooking);

// Update booking status (driver or rider can update)
router.put('/:id/status', protect, updateBookingStatus);
router.patch('/:id/status', protect, updateBookingStatus);

const confirmPendingBooking = async (req, res) => {
  // Only driver can confirm
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (String(booking.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the driver can confirm this booking' });
  }
  if (booking.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Booking is not pending' });
  }

  const offer = await RideOffer.findById(booking.offerId);
  if (!offer) {
    return res.status(404).json({ success: false, message: 'Ride offer not found' });
  }

  const seatsNeeded = Number(booking.seatCount || 1);
  if (Number(offer.seatsAvailable || 0) < seatsNeeded) {
    return res.status(409).json({ success: false, message: 'Not enough seats available for this booking anymore' });
  }

  booking.status = 'confirmed';
  if (String(booking.paymentMethod || '').toLowerCase() === 'cash') {
    booking.paymentStatus = 'processed';
  }
  await booking.save();

  offer.seatsAvailable = Math.max(0, Number(offer.seatsAvailable || 0) - seatsNeeded);
  if (offer.seatsAvailable === 0 && offer.status === 'open') {
    offer.status = 'matched';
  }
  await offer.save();

  const match = booking.matchId ? await Match.findById(booking.matchId) : null;
  if (match && match.status === 'matched') {
    match.status = 'booked';
    if (!Array.isArray(match.riderIds)) {
      match.riderIds = [];
    }
    if (!match.riderIds.some((id) => String(id) === String(booking.userId))) {
      match.riderIds.push(booking.userId);
    }
    await match.save();
  }

  const rideParticipants = await getRideParticipants(offer._id);
  await ensureChatRoomForRide(offer._id, {
    driverId: rideParticipants.driverId || booking.driverId,
    riderIds: rideParticipants.riderIds
  });

  // Emit real-time event
  req.io?.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });
  req.io?.to(`driver:${booking.driverId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });
  await createAndEmitNotification(req, {
    userId: booking.userId,
    type: 'bookingConfirmed',
    title: 'Booking confirmed',
    body: 'Your driver confirmed the booking.',
    relatedId: booking._id,
    relatedType: 'booking',
    category: 'booking',
    priority: 2
  });
  return res.status(200).json({ success: true, data: { booking, message: 'Booking confirmed by driver' } });
};

const rejectPendingBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (String(booking.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the driver can reject this booking' });
  }
  if (booking.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Only pending bookings can be rejected' });
  }

  booking.status = 'cancelled';
  booking.paymentStatus = 'cancelled';
  booking.cancellationReason = req.body?.reason || 'Driver rejected the booking request';
  booking.cancellationTime = new Date();
  await booking.save();

  let rideRequest = null;
  if (booking.matchId) {
    const match = await Match.findById(booking.matchId);
    if (match) {
      match.status = 'cancelled';
      await match.save();

      rideRequest = match.requestId ? await RideRequest.findById(match.requestId) : null;
      if (rideRequest && rideRequest.status !== 'cancelled') {
        rideRequest.status = 'open';
        rideRequest.bookingId = null;
        rideRequest.matchId = null;
        await rideRequest.save();
      }
    }
  }

  const offer = await RideOffer.findById(booking.offerId);
  if (offer) {
    const seatsNeeded = Number(booking.seatCount || 1);
    offer.seatsAvailable = Math.max(0, Number(offer.seatsAvailable || 0) + seatsNeeded);
    if (['matched', 'booked'].includes(String(offer.status || '').toLowerCase())) {
      offer.status = 'open';
    }
    if (booking.matchId && String(offer.matchId || '') === String(booking.matchId)) {
      offer.matchId = null;
    }
    if (String(offer.bookingId || '') === String(booking._id)) {
      offer.bookingId = null;
    }
    await offer.save();
  }

  req.io?.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });
  req.io?.to(`driver:${booking.driverId}`).emit('bookingStatusUpdated', {
    bookingId: booking._id, status: booking.status, timestamp: new Date(),
  });

  await createAndEmitNotification(req, {
    userId: booking.userId,
    type: 'bookingCancelled',
    title: 'Booking rejected',
    body: 'The driver declined your booking request.',
    relatedId: booking._id,
    relatedType: 'booking',
    category: 'booking',
    priority: 2
  });

  if (rideRequest) {
    req.io?.to(`user:${rideRequest.riderId}`).emit('requestUpdated', {
      requestId: rideRequest._id,
      status: 'open',
      message: 'The matched offer was declined. Your request is open again.'
    });
  }

  return res.status(200).json({ success: true, data: { booking, message: 'Booking rejected by driver' } });
};

// Confirm a booking (driver only, explicit accept)
router.put('/:id/confirm', protect, confirmPendingBooking);
router.patch('/:id/confirm', protect, confirmPendingBooking);
router.put('/:id/reject', protect, rejectPendingBooking);
router.patch('/:id/reject', protect, rejectPendingBooking);

// Mark booking as picked up
router.put('/:id/arrived', protect, markBookingArrived);
router.patch('/:id/arrived', protect, markBookingArrived);

// Mark booking as picked up
router.put('/:id/picked-up', protect, pickupBooking);
router.patch('/:id/picked-up', protect, pickupBooking);

// Mark booking as completed
router.put('/:id/completed', protect, completeBooking);
router.patch('/:id/completed', protect, completeBooking);

// Get spending summary for rider
router.get('/spending', protect, getSpendingSummary);
router.get('/summary/spending', protect, getSpendingSummary);

// Get earnings summary for driver
router.get('/summary/earnings', protect, getEarningsSummary);

module.exports = router;
