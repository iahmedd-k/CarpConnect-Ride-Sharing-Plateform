const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  getSubscriptionPlans,
  createSubscriptionCheckout,
  syncSubscriptionFromStripe,
  cancelSubscription,
  devUpgradeSubscription
} = require('../controllers/Auth.controllers');
const { body } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/auth/signup
// @desc    Register user
router.post(
  '/signup',
  [
    body('name', 'Name is required').not().isEmpty(),
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
    body('role', 'Role must be rider, driver, or both').isIn(['rider', 'driver', 'both'])
  ],
  registerUser
);

// @route   POST /api/auth/login
// @desc    Login user
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists()
  ],
  loginUser
);

// @route   GET /api/auth/me
// @desc    Current user profile
router.get('/me', protect, getMe);

// @route   PATCH /api/auth/profile
// @desc    Update profile settings
router.patch('/profile', protect, updateProfile);

// @route   PATCH /api/auth/change-password
// @desc    Change account password
router.patch('/change-password', protect, changePassword);

// @route   GET /api/auth/subscription/plans
// @desc    List plans for current app
router.get('/subscription/plans', protect, getSubscriptionPlans);

// @route   POST /api/auth/subscription/checkout
// @desc    Create checkout session
router.post('/subscription/checkout', protect, createSubscriptionCheckout);

// @route   POST /api/auth/subscription/sync
// @desc    Sync subscription from Stripe session
router.post('/subscription/sync', protect, syncSubscriptionFromStripe);

// @route   POST /api/auth/subscription/cancel
// @desc    Downgrade to free plan
router.post('/subscription/cancel', protect, cancelSubscription);

// @route   POST /api/auth/subscription/dev-upgrade
// @desc    Dev-only plan upgrade bypass (no Stripe payment)
router.post('/subscription/dev-upgrade', protect, devUpgradeSubscription);

module.exports = router;
