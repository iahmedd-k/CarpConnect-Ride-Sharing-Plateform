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

// Confirm a booking (driver only, explicit accept)
router.put('/:id/confirm', protect, async (req, res) => {
  // Only driver can confirm
  const booking = await require('../models/Booking').findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (String(booking.driverId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the driver can confirm this booking' });
  }
  if (booking.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'Booking is not pending' });
  }
  booking.status = 'confirmed';
  await booking.save();
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
});

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
