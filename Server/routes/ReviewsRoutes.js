const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
	createReview,
	getUserReviews,
	getReviewsHistory,
	getReviewDetails,
	updateReview,
	deleteReview
} = require('../controllers/ReviewsController');

// Create a new review
router.post('/', protect, createReview);

// Get user reviews
router.get('/user/:userId', getUserReviews);

// Get current user's reviews history
router.get('/history', protect, getReviewsHistory);

// Get review details
router.get('/:id', protect, getReviewDetails);

// Update a review
router.put('/:id', protect, updateReview);

// Delete a review
router.delete('/:id', protect, deleteReview);

module.exports = router;
