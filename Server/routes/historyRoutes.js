const express = require('express');
const router = express.Router();
const { 
  getRideHistory, 
  getBookingHistory,
  getEmissionsHistory,
  getRatingsHistory,
  getDetailedRideHistory,
  hideBookingHistoryItem,
  clearBookingHistory,
  hideRideHistoryItem,
  clearRideHistory
} = require('../controllers/historyController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/history/rides
// @desc    Get user's ride history
router.get('/rides', protect, getRideHistory);

// @route   GET /api/history/bookings
// @desc    Get user's booking history
router.get('/bookings', protect, getBookingHistory);

// @route   GET /api/history/emissions
// @desc    Get user's emissions history
router.get('/emissions', protect, getEmissionsHistory);

// @route   GET /api/history/ratings
// @desc    Get user's ratings history
router.get('/ratings', protect, getRatingsHistory);

// @route   GET /api/history/ride/:id
// @desc    Get detailed ride history
router.get('/ride/:id', protect, getDetailedRideHistory);

router.patch('/bookings/:id/hide', protect, hideBookingHistoryItem);
router.patch('/bookings/clear', protect, clearBookingHistory);
router.patch('/rides/:id/hide', protect, hideRideHistoryItem);
router.patch('/rides/clear', protect, clearRideHistory);

module.exports = router;
