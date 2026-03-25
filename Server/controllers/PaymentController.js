require('dotenv').config();
const asyncHandler = require('express-async-handler');
const Payment = require('../models/PaymentModel');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const User = require('../models/User');
const Stripe = require('stripe');
const { calculatePlatformFee } = require('../utils/fareCalculator');
const { createAndEmitNotification } = require('../utils/notifications');
const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');

// Debug: Log Stripe secret key presence
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '[SET]' : '[NOT SET]');
// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

const resolveBookingFare = (fare) => {
  if (typeof fare === 'number') return fare;
  if (fare && typeof fare === 'object' && fare.totalAmount != null) {
    return Number(fare.totalAmount);
  }
  return 0;
};

const rollbackBookingAfterPaymentFailure = async (booking, reason, context) => {
  if (!booking) return;

  booking.paymentStatus = 'failed';
  booking.paymentError = reason || 'Payment failed';
  booking.status = 'cancelled';
  booking.cancellationReason = booking.cancellationReason || 'Payment failed';
  booking.cancellationTime = booking.cancellationTime || new Date();
  await booking.save();

  const match = await Match.findById(booking.matchId);
  if (match) {
    match.status = 'cancelled';
    await match.save();

    if (match.requestId) {
      const request = await RideRequest.findById(match.requestId);
      if (request && request.status !== 'cancelled') {
        request.status = 'open';
        await request.save();
      }
    }
  }

  const offer = await RideOffer.findById(booking.offerId);
  if (offer) {
    offer.seatsAvailable = Math.min(
      Number(offer.seatsTotal || offer.seatsAvailable || 0),
      Number(offer.seatsAvailable || 0) + Number(booking.seatCount || 1)
    );
    if (offer.status === 'active') {
      offer.status = 'open';
    }
    await offer.save();
  }

  if (context?.io) {
    context.io.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
      bookingId: booking._id,
      status: 'cancelled',
      paymentStatus: 'failed',
      timestamp: new Date()
    });
    context.io.to(`driver:${booking.driverId}`).emit('bookingStatusUpdated', {
      bookingId: booking._id,
      status: 'cancelled',
      paymentStatus: 'failed',
      timestamp: new Date()
    });
  }

  if (context) {
    await createAndEmitNotification(context, {
      userId: booking.userId,
      type: 'paymentFailed',
      title: 'Payment failed',
      body: reason || 'Your payment could not be processed. The booking was cancelled.',
      relatedId: booking._id,
      relatedType: 'payment',
      category: 'payment',
      priority: 2
    });
  }
};

// @desc    Create payment intent
// @route   POST /api/payments/create-intent
// @access  Private (Rider only)
const createPaymentIntent = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  
  if (!bookingId) {
    return res.status(400).json({
      success: false,
      message: 'bookingId is required'
    });
  }
  
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found'
    });
  }
  
  if (String(booking.userId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to pay for this booking'
    });
  }
  
  if (booking.paymentStatus !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'Payment has already been processed'
    });
  }
  
  try {
    const fareAmount = resolveBookingFare(booking.fare);
    const existingPayment = await Payment.findOne({
      bookingId: booking._id,
      riderId: req.user._id
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(fareAmount * 100),
      currency: (booking.currency || 'pkr').toLowerCase(),
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId: booking._id.toString(),
        userId: req.user._id.toString(),
        driverId: booking.driverId.toString()
      }
    });

    const payment = existingPayment || new Payment({
      bookingId: booking._id,
      riderId: req.user._id,
      driverId: booking.driverId
    });
    payment.amount = fareAmount;
    payment.currency = booking.currency || 'PKR';
    payment.paymentMethod = 'stripe';
    payment.status = 'pending';
    payment.stripePaymentIntentId = paymentIntent.id;
    payment.platformFee = calculatePlatformFee(fareAmount);
    payment.updatedAt = new Date();
    await payment.save();
    
    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentId: payment._id,
        message: 'Payment intent created successfully'
      }
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: error.message
    });
  }
});

// @desc    Confirm payment
// @route   POST /api/payments/confirm/:paymentId
// @access  Private (Rider only)
const confirmPayment = asyncHandler(async (req, res) => {
  const paymentId = req.params.paymentId || req.body.paymentId;
  if (!paymentId) {
    return res.status(400).json({
      success: false,
      message: 'paymentId is required'
    });
  }
  
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    if (String(payment.riderId) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to confirm this payment'
      });
    }
    
    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Payment is already ${payment.status}`
      });
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(
      payment.stripePaymentIntentId
    );

    let confirmedPayment = paymentIntent;
    if (paymentIntent.status === 'requires_confirmation') {
      confirmedPayment = await stripe.paymentIntents.confirm(payment.stripePaymentIntentId);
    }

    if (confirmedPayment.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Payment is in '${confirmedPayment.status}' state`
      });
    }
    
    // Update payment status
    payment.status = 'succeeded';
    payment.stripeChargeId = confirmedPayment.latest_charge;
    payment.updatedAt = new Date();
    await payment.save();
    
    // Update booking status
    const booking = await Booking.findById(payment.bookingId);
    if (booking) {
      booking.paymentStatus = 'processed';
      if (booking.status === 'pending') {
        booking.status = 'confirmed';
      }
      await booking.save();

      if (req.io) {
        req.io.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
          bookingId: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          timestamp: new Date()
        });
        req.io.to(`driver:${booking.driverId}`).emit('bookingStatusUpdated', {
          bookingId: booking._id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          timestamp: new Date()
        });
      }
    }

    await createAndEmitNotification(req, {
      userId: payment.riderId,
      type: 'paymentSuccess',
      title: 'Payment confirmed',
      body: 'Your payment has been confirmed and held for the ride.',
      relatedId: payment._id,
      relatedType: 'payment',
      category: 'payment',
      priority: 2
    });
    
    res.status(200).json({
      success: true,
      data: {
        payment: {
          _id: payment._id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency
        },
        message: 'Payment confirmed successfully'
      }
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    const payment = await Payment.findById(paymentId);
    if (payment) {
      payment.status = 'failed';
      payment.paymentError = error.message;
      payment.updatedAt = new Date();
      await payment.save();

      const booking = await Booking.findById(payment.bookingId);
      await rollbackBookingAfterPaymentFailure(booking, error.message, req);
    }
    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: error.message
    });
  }
});

// @desc    Handle Stripe webhook events
// @route   POST /api/payments/webhook
// @access  Public (Stripe only)
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object, req);
        break;
      case 'payment_intent.failed':
        await handlePaymentFailed(event.data.object, req);
        break;
      case 'payment_intent.processing':
        await handlePaymentProcessing(event.data.object, req);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing webhook',
      error: error.message
    });
  }
};

// @desc    Refund a payment
// @route   POST /api/payments/refund/:paymentId
// @access  Private (Driver or Admin)
const refundPayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;
  
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    // Check authorization (only driver or admin can refund)
    const isDriver = String(payment.driverId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    
    if (!isDriver && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to refund this payment'
      });
    }
    
    if (payment.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Only successful payments can be refunded'
      });
    }
    
    // Create refund with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      reason: reason || 'requested_by_customer'
    });
    
    // Update payment status
    payment.status = 'refunded';
    payment.refundId = refund.id;
    payment.updatedAt = new Date();
    await payment.save();
    
    // Update booking status
    const booking = await Booking.findById(payment.bookingId);
    if (booking) {
      booking.paymentStatus = 'refunded';
      booking.status = 'cancelled';
      booking.cancellationTime = new Date();
      await booking.save();
    }

    await createAndEmitNotification(req, {
      userId: payment.riderId,
      type: 'paymentSuccess',
      title: 'Refund processed',
      body: 'Your ride payment has been refunded.',
      relatedId: payment._id,
      relatedType: 'payment',
      category: 'payment',
      priority: 2
    });
    
    res.status(200).json({
      success: true,
      data: {
        refundId: refund.id,
        status: 'refunded',
        message: 'Payment refunded successfully'
      }
    });
  } catch (error) {
    console.error('Error refunding payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error refunding payment',
      error: error.message
    });
  }
});

// @desc    Get payment status
// @route   GET /api/payments/:paymentId
// @access  Private
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: 'Payment not found'
    });
  }
  
  // Check authorization
  const isRider = String(payment.riderId) === String(req.user._id);
  const isDriver = String(payment.driverId) === String(req.user._id);
  
  if (!isRider && !isDriver && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this payment'
    });
  }
  
  res.status(200).json({
    success: true,
    data: {
      payment: {
        _id: payment._id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      },
      message: 'Payment status retrieved successfully'
    }
  });
});

// @desc    Process driver payout
// @route   POST /api/payments/payout/:paymentId
// @access  Private (Admin only)
const processDriverPayout = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  try {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can process driver payouts'
      });
    }
    
    if (payment.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Payment must be successful to process payout'
      });
    }
    
    if (payment.driverPayoutId) {
      return res.status(400).json({
        success: false,
        message: 'Payout has already been processed'
      });
    }
    
    // Create transfer to driver's connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round((payment.amount - payment.platformFee) * 100),
      currency: payment.currency.toLowerCase(),
      destination: 'acct_1234567890', // In production, this would be the driver's connected account
      metadata: {
        paymentId: payment._id.toString(),
        bookingId: payment.bookingId.toString()
      }
    });
    
    // Update payment record
    payment.driverPayoutId = transfer.id;
    payment.updatedAt = new Date();
    await payment.save();
    
    res.status(200).json({
      success: true,
      data: {
        payoutId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        message: 'Driver payout processed successfully'
      }
    });
  } catch (error) {
    console.error('Error processing driver payout:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing driver payout',
      error: error.message
    });
  }
});

// Helper functions
const handlePaymentSucceeded = async (paymentIntent, context) => {
  const payment = await Payment.findOne({ 
    stripePaymentIntentId: paymentIntent.id 
  });
  
  if (!payment) {
    console.error('No payment found for payment intent:', paymentIntent.id);
    return;
  }
  
  // Update payment status
  payment.status = 'succeeded';
  payment.stripeChargeId = paymentIntent.latest_charge;
  payment.updatedAt = new Date();
  await payment.save();
  
  // Update booking status
  const booking = await Booking.findById(payment.bookingId);
  if (booking) {
    booking.paymentStatus = 'processed';
    if (booking.status === 'pending') {
      booking.status = 'confirmed';
    }
    await booking.save();

    if (context?.io) {
      context.io.to(`user:${booking.userId}`).emit('bookingStatusUpdated', {
        bookingId: booking._id,
        status: booking.status,
        paymentStatus: 'processed',
        timestamp: new Date()
      });
    }
  }

  await createAndEmitNotification(context, {
    userId: payment.riderId,
    type: 'paymentSuccess',
    title: 'Payment confirmed',
    body: 'Stripe confirmed your payment hold for the ride.',
    relatedId: payment._id,
    relatedType: 'payment',
    category: 'payment',
    priority: 2
  });
};

const handlePaymentFailed = async (paymentIntent, context) => {
  const payment = await Payment.findOne({ 
    stripePaymentIntentId: paymentIntent.id 
  });
  
  if (!payment) {
    console.error('No payment found for payment intent:', paymentIntent.id);
    return;
  }
  
  // Update payment status
  payment.status = 'failed';
  payment.paymentError = paymentIntent.last_payment_error?.message || 'Payment failed';
  payment.updatedAt = new Date();
  await payment.save();
  
  // Update booking status
  const booking = await Booking.findById(payment.bookingId);
  if (booking) {
    await rollbackBookingAfterPaymentFailure(
      booking,
      paymentIntent.last_payment_error?.message || 'Payment failed',
      context
    );
  }
  
};

const handlePaymentProcessing = async (paymentIntent, context) => {
  const payment = await Payment.findOne({ 
    stripePaymentIntentId: paymentIntent.id 
  });
  
  if (!payment) {
    console.error('No payment found for payment intent:', paymentIntent.id);
    return;
  }
  
  // Update payment status
  payment.status = 'processing';
  payment.updatedAt = new Date();
  await payment.save();

  await createAndEmitNotification(context, {
    userId: payment.riderId,
    type: 'rideUpdated',
    title: 'Payment is processing',
    body: 'Your payment is still being processed by Stripe.',
    relatedId: payment._id,
    relatedType: 'payment',
    category: 'payment'
  });
};

// @desc    Process driver payout (internal)
// @route   POST /api/payments/payout/:paymentId
// @access  Internal
const processDriverPayoutInternal = async (payment) => {
  try {
    // Create transfer to driver's connected account
    const transfer = await stripe.transfers.create({
      amount: Math.round((payment.amount - payment.platformFee) * 100),
      currency: payment.currency.toLowerCase(),
      destination: 'acct_1234567890', // In production, this would be the driver's connected account
      metadata: {
        paymentId: payment._id.toString(),
        bookingId: payment.bookingId.toString()
      }
    });
    
    // Update payment record
    payment.driverPayoutId = transfer.id;
    payment.updatedAt = new Date();
    await payment.save();
    
    return { success: true, payoutId: transfer.id };
  } catch (error) {
    console.error('Error processing driver payout:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  refundPayment,
  getPaymentStatus,
  processDriverPayout,
  processDriverPayoutInternal,
  // Dummy handlers for missing routes
  stripeWebhook: handleWebhook,
  createConnectedAccount: asyncHandler(async (req, res) => {
    // Placeholder for Stripe connected account creation
    res.status(200).json({ success: true, message: 'Connected account created (dummy)' });
  }),
  payoutToDriver: processDriverPayout
};
