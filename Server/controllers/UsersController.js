const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const Booking = require('../models/Booking');

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } else {
    res.status(401);
    throw new Error('Invalid credentials');
  }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password');
  
  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
      joinedAt: user.joinedAt
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.phone = req.body.phone || user.phone;
    
    if (req.body.password) {
      user.password = req.body.password;
    }
    
    const updatedUser = await user.save();
    
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      verified: updatedUser.verified,
      joinedAt: updatedUser.joinedAt
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin)
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

const getCommunityData = asyncHandler(async (req, res) => {
  const [totalUsers, totalDrivers, totalCompletedBookings, topDrivers, recentReviews] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: 'driver' }),
    Booking.countDocuments({ status: 'completed', paymentStatus: 'processed' }),
    User.find({ role: 'driver' })
      .select('name profilePhoto ratings vehicle verified totalCompletedRides totalCo2SavedKg')
      .sort({ 'ratings.average': -1, 'ratings.count': -1, totalCompletedRides: -1 })
      .limit(12)
      .lean(),
    Review.find({ status: { $in: ['active', 'edited'] } })
      .populate('ratedBy', 'name profilePhoto role')
      .populate('userId', 'name profilePhoto role')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean()
  ]);

  const leaderboard = topDrivers.slice(0, 6).map((driver) => ({
    _id: String(driver._id),
    name: driver.name,
    rating: Number(driver.ratings?.average || 0),
    reviews: Number(driver.ratings?.count || 0),
    completedRides: Number(driver.totalCompletedRides || 0)
  }));

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalDrivers,
      totalCompletedRides: totalCompletedBookings,
      topDrivers: topDrivers.map((driver) => ({
        _id: String(driver._id),
        name: driver.name,
        profilePhoto: driver.profilePhoto || '',
        ratings: driver.ratings || { average: 0, count: 0, recent: [] },
        vehicle: driver.vehicle || null,
        verified: Boolean(driver.verified),
        totalCompletedRides: Number(driver.totalCompletedRides || 0),
        totalCo2SavedKg: Number(driver.totalCo2SavedKg || 0)
      })),
      leaderboard,
      recentReviews: recentReviews.map((review) => ({
        _id: String(review._id),
        rating: Number(review.rating || 0),
        comment: review.comment || '',
        category: review.category,
        createdAt: review.createdAt,
        from: review.ratedBy ? {
          _id: String(review.ratedBy._id),
          name: review.ratedBy.name,
          role: review.ratedBy.role,
          avatar: review.ratedBy.profilePhoto || ''
        } : null,
        to: review.userId ? {
          _id: String(review.userId._id),
          name: review.userId.name,
          role: review.userId.role,
          avatar: review.userId.profilePhoto || ''
        } : null
      }))
    }
  });
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (user) {
    await user.remove();
    res.json({ message: 'User removed' });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  getUsers,
  deleteUser,
  getCommunityData
};
