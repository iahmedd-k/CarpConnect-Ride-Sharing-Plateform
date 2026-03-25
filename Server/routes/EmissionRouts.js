const express = require('express');
const router = express.Router();
const { getEmissionsReport, getEmissionsHistory } = require('../controllers/EmissionController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/emissions/:rideId
// @desc    Get emissions report for a ride
router.get('/:rideId', protect, getEmissionsReport);

// @route   GET /api/emissions/history
// @desc    Get user emissions history
router.get('/history', protect, getEmissionsHistory);

module.exports = router;
