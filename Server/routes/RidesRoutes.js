const express = require('express');
const router = express.Router();
const {
  getRideOffers,
  searchByDestination,
  bookDirectRide,
  searchAddressSuggestions,
  resolveAddressSuggestion,
  completeRide
} = require('../controllers/CompatRidesController');
const { getActiveRide, getPublicTrackingRide, optimizeMatchedRide } = require('../controllers/RidesController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/rides/track/:rideId - Public tracking payload
router.get('/track/:rideId', getPublicTrackingRide);

// GET /api/rides/active - Get the user's active ride
router.get('/active', protect, getActiveRide);

// POST /api/rides/optimize/:matchId - Get or apply route optimization
router.post('/optimize/:matchId', protect, optimizeMatchedRide);

// GET /api/rides/offers - Get ride offers
router.get('/offers', protect, getRideOffers);

// GET /api/rides/search-dest - Search rides by destination
router.get('/search-dest', searchByDestination);

// GET /api/rides/address-suggestions - Pakistan-focused address suggestions
router.get('/address-suggestions', searchAddressSuggestions);

// GET /api/rides/address-resolve - Resolve one address to coordinates
router.get('/address-resolve', resolveAddressSuggestion);

// POST /api/rides/book-direct - Book a ride directly
router.post('/book-direct', protect, bookDirectRide);

// PUT /api/rides/offers/:id/complete - Complete a live ride
router.put('/offers/:id/complete', protect, completeRide);

module.exports = router;
