const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const User = require('../models/User');
const Match = require('../models/MatchModels');
const EmissionReport = require('../models/EmissionReport');
const Booking = require('../models/Booking');
const { createAndEmitNotification } = require('../utils/notifications');

const buildUserRatingSnapshot = async (userId) => {
  const reviews = await Review.find({ userId, status: 'active' })
    .sort({ createdAt: -1 })
    .select('rating')
    .lean();

  const count = reviews.length;
  const average = count
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / count).toFixed(1))
    : 0;

  return {
    average,
    count,
    recent: reviews.slice(0, 5).map((review) => Number(review.rating || 0))
  };
};

const applyUserRatingSnapshot = async (userId) => {
  const ratings = await buildUserRatingSnapshot(userId);
  await User.findByIdAndUpdate(userId, { ratings });
  return ratings;
};

const serializeReview = (review) => ({
  _id: String(review._id),
  userId: typeof review.userId === 'object' && review.userId?._id ? String(review.userId._id) : String(review.userId),
  ratedBy: typeof review.ratedBy === 'object' && review.ratedBy?._id ? String(review.ratedBy._id) : String(review.ratedBy),
  rideId: typeof review.rideId === 'object' && review.rideId?._id ? String(review.rideId._id) : String(review.rideId),
  bookingId: typeof review.bookingId === 'object' && review.bookingId?._id ? String(review.bookingId._id) : String(review.bookingId),
  rating: Number(review.rating),
  comment: review.comment || '',
  tags: Array.isArray(review.tags) ? review.tags : [],
  category: review.category,
  status: review.status,
  emissionsContext: review.emissionsContext || { estimatedSavings: 0, distance: 0 },
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  from: review.ratedBy && typeof review.ratedBy === 'object'
    ? {
        _id: String(review.ratedBy._id),
        name: review.ratedBy.name,
        email: review.ratedBy.email,
        role: review.ratedBy.role,
        avatar: review.ratedBy.profilePhoto || ''
      }
    : undefined,
  to: review.userId && typeof review.userId === 'object'
    ? {
        _id: String(review.userId._id),
        name: review.userId.name,
        email: review.userId.email,
        role: review.userId.role,
        avatar: review.userId.profilePhoto || ''
      }
    : undefined
});

// @desc    Create a new review
// @route   POST /api/reviews
// @access  Private (Ride participant only)
const createReview = asyncHandler(async (req, res) => {
  const { userId, rideId, bookingId, booking, to, rating, comment, category, tags } = req.body;
  const resolvedBookingId = bookingId || booking;
  const resolvedTargetUserId = userId || to;

  if (!resolvedBookingId || !resolvedTargetUserId || rating === undefined) {
    return res.status(400).json({
      success: false,
      message: 'bookingId, userId and rating are required'
    });
  }

  const numericRating = Number(rating);
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({
      success: false,
      message: 'Rating must be between 1 and 5'
    });
  }

  const rideBooking = await Booking.findById(resolvedBookingId);
  if (!rideBooking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found'
    });
  }

  const isDriver = String(rideBooking.driverId) === String(req.user._id);
  const isRider = String(rideBooking.userId) === String(req.user._id);
  if (!isDriver && !isRider) {
    return res.status(403).json({
      success: false,
      message: 'You are not part of this booking'
    });
  }

  const targetUserId = String(resolvedTargetUserId);
  const expectedTargetId = isDriver ? String(rideBooking.userId) : String(rideBooking.driverId);
  if (targetUserId !== expectedTargetId) {
    return res.status(400).json({
      success: false,
      message: 'You can only rate the other participant in the booking'
    });
  }

  if (String(rideBooking.status) !== 'completed') {
    return res.status(403).json({
      success: false,
      message: 'You can only review completed rides'
    });
  }

  const resolvedRideId = rideId || rideBooking.matchId;
  const match = await Match.findById(resolvedRideId);
  if (!match) {
    return res.status(404).json({
      success: false,
      message: 'Ride not found'
    });
  }

  if (String(match.status) !== 'completed' && String(rideBooking.status) !== 'completed') {
    return res.status(403).json({
      success: false,
      message: 'Ride must be completed before leaving a review'
    });
  }

  const existingReview = await Review.findOne({
    bookingId: rideBooking._id,
    ratedBy: req.user._id,
    status: { $ne: 'deleted' }
  });

  if (existingReview) {
    return res.status(400).json({
      success: false,
      message: 'You have already submitted a review for this booking'
    });
  }

  const resolvedCategory = category || (isDriver ? 'rider' : 'driver');
  const emissionsReport = await EmissionReport.findOne({
    bookingId: rideBooking._id,
    userId: isDriver ? rideBooking.userId : req.user._id
  }).lean();

  const newReview = await Review.create({
    userId: targetUserId,
    ratedBy: req.user._id,
    rideId: match._id,
    bookingId: rideBooking._id,
    rating: numericRating,
    comment: comment || '',
    tags: Array.isArray(tags) ? tags : [],
    category: resolvedCategory,
    status: 'active',
    emissionsContext: {
      estimatedSavings: Number(emissionsReport?.estimatedSavings || 0),
      distance: Number(emissionsReport?.distance || 0)
    }
  });

  const updatedRatings = await applyUserRatingSnapshot(targetUserId);
  const populatedReview = await Review.findById(newReview._id)
    .populate('ratedBy', 'name email role profilePhoto')
    .populate('userId', 'name email role profilePhoto')
    .populate('rideId')
    .populate('bookingId');

  req.io?.to(`user:${targetUserId}`).emit('newReview', {
    reviewId: newReview._id,
    from: req.user._id,
    rating: newReview.rating,
    comment: newReview.comment,
    category: newReview.category
  });

  await createAndEmitNotification(req, {
    userId: targetUserId,
    type: 'rideUpdated',
    title: 'New rating received',
    body: 'You received a new post-ride rating.',
    relatedId: newReview._id,
    relatedType: 'ride',
    category: 'communication',
    priority: 1
  });

  res.status(201).json({
    success: true,
    data: {
      review: serializeReview(populatedReview),
      ratings: updatedRatings,
      message: 'Review submitted successfully'
    }
  });
});

// @desc    Get user reviews
// @route   GET /api/reviews/user/:userId
// @access  Public
const getUserReviews = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  const [reviews, user] = await Promise.all([
    Review.find({ userId, status: 'active' })
      .populate('ratedBy', 'name email role profilePhoto')
      .populate('userId', 'name email role profilePhoto')
      .populate('rideId')
      .populate('bookingId')
      .sort({ createdAt: -1 }),
    User.findById(userId).lean()
  ]);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: {
      user: {
        _id: String(user._id),
        name: user.name,
        role: user.role,
        ratings: user.ratings || { average: 0, count: 0, recent: [] }
      },
      reviews: reviews.map(serializeReview),
      total: reviews.length
    }
  });
});

// @desc    Get current user's reviews history
// @route   GET /api/reviews/history
// @access  Private
const getReviewsHistory = asyncHandler(async (req, res) => {
  const [reviewsGiven, reviewsReceived] = await Promise.all([
    Review.find({ ratedBy: req.user._id, status: { $ne: 'deleted' } })
      .populate('ratedBy', 'name email role profilePhoto')
      .populate('userId', 'name email role profilePhoto')
      .populate('rideId')
      .populate('bookingId')
      .sort({ createdAt: -1 }),
    Review.find({ userId: req.user._id, status: { $ne: 'deleted' } })
      .populate('ratedBy', 'name email role profilePhoto')
      .populate('userId', 'name email role profilePhoto')
      .populate('rideId')
      .populate('bookingId')
      .sort({ createdAt: -1 })
  ]);

  res.json({
    success: true,
    data: {
      given: reviewsGiven.map(serializeReview),
      received: reviewsReceived.map(serializeReview),
      averageRating: req.user.ratings || { average: 0, count: 0, recent: [] }
    }
  });
});

// @desc    Get review details
// @route   GET /api/reviews/:id
// @access  Private (Reviewer or reviewee only)
const getReviewDetails = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate('userId', 'name email role profilePhoto')
    .populate('ratedBy', 'name email role profilePhoto')
    .populate('rideId')
    .populate('bookingId');

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  if (
    String(review.ratedBy?._id || review.ratedBy) !== String(req.user._id) &&
    String(review.userId?._id || review.userId) !== String(req.user._id)
  ) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this review'
    });
  }

  res.status(200).json({
    success: true,
    data: {
      review: serializeReview(review)
    }
  });
});

// @desc    Update a review
// @route   PUT /api/reviews/:id
// @access  Private (Reviewer only)
const updateReview = asyncHandler(async (req, res) => {
  const { rating, comment, category, tags } = req.body;
  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  if (String(review.ratedBy) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this review'
    });
  }

  const hoursSinceCreation = (Date.now() - new Date(review.createdAt).getTime()) / (1000 * 3600);
  if (hoursSinceCreation > 24) {
    return res.status(400).json({
      success: false,
      message: 'Reviews can only be edited within 24 hours of creation'
    });
  }

  if (rating !== undefined) {
    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    review.rating = numericRating;
  }

  if (comment !== undefined) review.comment = comment;
  if (category !== undefined) review.category = category;
  if (tags !== undefined) review.tags = Array.isArray(tags) ? tags : [];
  review.status = 'edited';
  review.editedAt = new Date();
  review.updatedAt = new Date();
  await review.save();

  const updatedRatings = await applyUserRatingSnapshot(review.userId);
  const populatedReview = await Review.findById(review._id)
    .populate('ratedBy', 'name email role profilePhoto')
    .populate('userId', 'name email role profilePhoto')
    .populate('rideId')
    .populate('bookingId');

  req.io?.to(`user:${review.userId}`).emit('reviewUpdated', {
    reviewId: review._id,
    rating: review.rating,
    comment: review.comment,
    category: review.category
  });

  res.status(200).json({
    success: true,
    data: {
      review: serializeReview(populatedReview),
      ratings: updatedRatings,
      message: 'Review updated successfully'
    }
  });
});

// @desc    Delete a review
// @route   DELETE /api/reviews/:id
// @access  Private (Reviewer only)
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  if (String(review.ratedBy) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this review'
    });
  }

  const hoursSinceCreation = (Date.now() - new Date(review.createdAt).getTime()) / (1000 * 3600);
  if (hoursSinceCreation > 24) {
    return res.status(400).json({
      success: false,
      message: 'Reviews can only be deleted within 24 hours of creation'
    });
  }

  review.status = 'deleted';
  review.deletedAt = new Date();
  review.updatedAt = new Date();
  await review.save();

  const updatedRatings = await applyUserRatingSnapshot(review.userId);

  req.io?.to(`user:${review.userId}`).emit('reviewDeleted', {
    reviewId: review._id,
    deletedAt: review.deletedAt
  });

  res.status(200).json({
    success: true,
    data: {
      reviewId: String(review._id),
      ratings: updatedRatings,
      message: 'Review deleted successfully'
    }
  });
});

module.exports = {
  createReview,
  getUserReviews,
  getReviewsHistory,
  getReviewDetails,
  updateReview,
  deleteReview
};
