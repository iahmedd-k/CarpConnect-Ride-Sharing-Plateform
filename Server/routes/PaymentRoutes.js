const express = require('express');
const router = express.Router();
const { 
  createPaymentIntent, 
  confirmPayment,
  stripeWebhook,
  createConnectedAccount,
  payoutToDriver,
  refundPayment,
  getPaymentStatus
} = require('../controllers/PaymentController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/payments/split
// @desc    Create payment intent for a booking
router.post('/split', protect, createPaymentIntent);

// @route   POST /api/payments/confirm
// @desc    Confirm payment
router.post('/confirm', protect, confirmPayment);

// @route   GET /api/payments/:paymentId
// @desc    Get payment status
router.get('/:paymentId', protect, getPaymentStatus);

// @route   POST /api/payments/refund/:paymentId
// @desc    Refund payment
router.post('/refund/:paymentId', protect, refundPayment);

// @route   POST /api/webhooks/stripe
// @desc    Stripe webhook
router.post('/webhooks/stripe', express.raw({type: 'application/json'}), stripeWebhook);

// @route   POST /api/payments/account
// @desc    Create connected account for drivers
router.post('/account', protect, createConnectedAccount);

// @route   POST /api/payments/payout
// @desc    Payout to driver
router.post('/payout/:paymentId', protect, payoutToDriver);

module.exports = router;
