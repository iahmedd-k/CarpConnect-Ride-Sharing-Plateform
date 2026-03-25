const express = require('express');
const router = express.Router();
const { protect, driverOnly } = require('../middleware/authMiddleware');
const {
  createRideOffer,
  updateOfferStatus,
  updateRideOffer,
  getRideOffers,
  getMyRideOffers,
  cancelRideOffer,       // ← was missing from imports
  getRideOfferDetails,   // ← was missing from imports
} = require('../controllers/RideOfferController');

// Get current driver's ride offers  — must be before /:id
router.get('/me', protect, driverOnly, getMyRideOffers);

// Create a new ride offer
router.post('/', protect, driverOnly, createRideOffer);

// Get all ride offers
router.get('/', protect, getRideOffers);

// Get single offer details
router.get('/:id', protect, getRideOfferDetails);

// Cancel a ride offer  ← was completely missing
router.post('/:id/cancel', protect, driverOnly, cancelRideOffer);

// Update ride offer status
router.patch('/:id/status', protect, driverOnly, updateOfferStatus);

// Update ride offer details (full update)
router.put('/:id', protect, driverOnly, updateRideOffer);

// Update seats available
router.patch('/:id/seats', protect, driverOnly, updateRideOffer);

module.exports = router;