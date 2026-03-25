const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getCommunityData, getUserProfile } = require('../controllers/UsersController');

router.get('/community', protect, getCommunityData);
router.get('/:id/profile', protect, getUserProfile);

module.exports = router;
