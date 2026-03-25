const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getMyEmissions } = require('../controllers/EmissionsCompatController');
const { getEmissionsReport, getEmissionsHistory } = require('../controllers/EmissionController');

router.get('/me', protect, getMyEmissions);
router.get('/history', protect, getEmissionsHistory);
router.get('/:rideId', protect, getEmissionsReport);

module.exports = router;
