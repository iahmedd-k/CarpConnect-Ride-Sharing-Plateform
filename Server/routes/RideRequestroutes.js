const express = require('express');
const router = express.Router();
const {
	createRideRequest,
	updateRideRequest,
	cancelRideRequest,
	getRideRequests,
	getMyRideRequests,
	getDriverOpenRequests,
	rejectRideRequest,
	counterRideRequest,
	respondCounterOffer
} = require('../controllers/RideRequestController');
const { protect, riderOnly, driverOnly } = require('../middleware/authMiddleware');

// @route   POST /api/rides/requests
// @desc    Create a ride request
router.post('/', protect, riderOnly, createRideRequest);

// @route   PUT /api/rides/requests/:id
// @desc    Update current rider request
router.put('/:id', protect, riderOnly, updateRideRequest);

// @route   GET /api/rides/requests/me
// @desc    Get current rider requests
router.get('/me', protect, riderOnly, getMyRideRequests);

// @route   GET /api/rides/requests/driver/open
// @desc    Get open rider requests for current driver
router.get('/driver/open', protect, driverOnly, getDriverOpenRequests);

// @route   POST /api/rides/requests/:id/reject
// @desc    Hide/reject a rider request for current driver
router.post('/:id/reject', protect, driverOnly, rejectRideRequest);

// @route   POST /api/rides/requests/:id/counter
// @desc    Driver proposes a counter fare
router.post('/:id/counter', protect, driverOnly, counterRideRequest);

// @route   POST /api/rides/requests/:id/counter/respond
// @desc    Rider accepts/declines counter fare
router.post('/:id/counter/respond', protect, riderOnly, respondCounterOffer);
router.post('/:id/cancel', protect, riderOnly, cancelRideRequest);

// @route   GET /api/rides/requests
// @desc    Get all ride requests (with optional location filtering)
router.get('/', getRideRequests);

module.exports = router;
