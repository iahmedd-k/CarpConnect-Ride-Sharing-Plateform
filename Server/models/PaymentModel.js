// models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'cash', 'wallet'],
    default: 'cash'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'succeeded', 'failed', 'refunded', 'canceled'],
    default: 'pending'
  },
  stripePaymentIntentId: {
    type: String,
    default: null
  },
  stripeChargeId: {
    type: String,
    default: null
  },
  platformFee: {
    type: Number,
    default: 0
  },
  driverPayoutId: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes for performance
paymentSchema.index({ bookingId: 1, riderId: 1 }, { unique: true });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: -1 });

// Virtual field for platform fee percentage
paymentSchema.virtual('platformFeePercentage').get(function() {
  return 0;
});

// Static method to calculate platform fee
paymentSchema.statics.calculatePlatformFee = function(amount) {
  return 0;
};

// Method to create a new payment
paymentSchema.statics.createPayment = async function(booking, rider, amount, options = {}) {
  const { paymentMethod = 'cash' } = options;
  
  // Calculate platform fee
  const platformFee = 0;
  const driverAmount = amount;
  
  // Create payment record
  return this.create({
    bookingId: booking._id,
    riderId: rider._id,
    driverId: booking.driverId,
    amount,
    currency: booking.currency || 'PKR',
    paymentMethod,
    status: 'pending',
    platformFee,
    driverAmount
  });
};

// Method to process payment
paymentSchema.methods.process = async function() {
  if (this.status !== 'pending') {
    throw new Error('Payment is not in a processable state');
  }
  
  // This would call Stripe to process the payment
  try {
    // In production, this would call Stripe API
    // const paymentIntent = await stripe.paymentIntents.confirm(
    //   this.stripePaymentIntentId,
    //   { payment_method: 'pm_card_visa' }
    // );
    
    this.status = 'succeeded';
    this.stripeChargeId = 'ch_' + Math.random().toString(36).substring(2, 15);
    this.updatedAt = new Date();
    
    return this.save();
  } catch (error) {
    this.status = 'failed';
    this.paymentError = error.message;
    this.updatedAt = new Date();
    await this.save();
    
    throw error;
  }
};

// Method to handle payment failure
paymentSchema.methods.handleFailure = async function(error) {
  this.status = 'failed';
  this.paymentError = error.message;
  this.updatedAt = new Date();
  return this.save();
};

// Method to refund payment
paymentSchema.methods.refund = async function() {
  if (this.status !== 'succeeded') {
    throw new Error('Payment must be successful to refund');
  }
  
  // This would call Stripe to process the refund
  try {
    // In production, this would call Stripe API
    // const refund = await stripe.refunds.create({
    //   payment_intent: this.stripePaymentIntentId
    // });
    
    this.status = 'refunded';
    this.updatedAt = new Date();
    return this.save();
  } catch (error) {
    this.status = 'failed';
    this.paymentError = error.message;
    this.updatedAt = new Date();
    await this.save();
    
    throw error;
  }
};

module.exports = mongoose.model('Payment', paymentSchema);
