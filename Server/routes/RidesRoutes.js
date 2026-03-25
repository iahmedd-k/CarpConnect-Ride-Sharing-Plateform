const express = require('express');
const router = express.Router();
const { getActiveRide } = require('../controllers/RidesController');
const { getRideOffers, searchByDestination, bookDirectRide } = require('../controllers/CompatRidesController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/rides/active - Get the user's active ride
router.get('/active', protect, getActiveRide);

// GET /api/rides/offers - Get ride offers
router.get('/offers', protect, getRideOffers);

// GET /api/rides/search-dest - Search rides by destination
router.get('/search-dest', searchByDestination);

// POST /api/rides/book-direct - Book a ride directly
router.post('/book-direct', protect, bookDirectRide);

module.exports = router;
