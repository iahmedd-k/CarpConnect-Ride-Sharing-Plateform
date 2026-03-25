const express = require('express');
const router = express.Router();
const {
  matchRides,
  createMatch,
  updateMatchStatus,
  getMatchDetails,
} = require('../controllers/MatchingController');
const { protect } = require('../middleware/authMiddleware');

// Mounted at /api/match in server.js

// POST /api/match/rides/match  — match offers & requests
router.post('/rides/match', protect, matchRides);

// POST /api/match/matches      — create a match (frontend calls /api/match/matches)
router.post('/matches', protect, createMatch);

// GET  /api/match/matches/:id  — get match details
router.get('/matches/:id', protect, getMatchDetails);

// PUT  /api/match/matches/:id/status — update match status
router.put('/matches/:id/status', protect, updateMatchStatus);

module.exports = router;
