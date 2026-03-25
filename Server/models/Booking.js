const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideOffer',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'picked_up', 'live', 'completed', 'cancelled'],
    default: 'pending'
  },
  seatCount: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  fare: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'PKR',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'cash', 'wallet'],
    default: 'cash'
  },
  paymentIntentId: {
    type: String,
    default: null
  },
  paymentTransactionId: {
    type: String,
    default: null
  },
  paymentRetries: {
    type: Number,
    default: 0
  },
  paymentError: {
    type: String,
    default: null
  },
  cancellationReason: {
    type: String,
    default: null
  },
  cancellationTime: {
    type: Date,
    default: null
  },
  arrivedAt: {
    type: Date,
    default: null
  },
  pickedUpAt: {
    type: Date,
    default: null
  },
  liveAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  hiddenForRider: {
    type: Boolean,
    default: false,
    index: true
  },
  hiddenForDriver: {
    type: Boolean,
    default: false,
    index: true
  },
  riderHiddenAt: {
    type: Date,
    default: null
  },
  driverHiddenAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'picked_up', 'live', 'completed', 'cancelled'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reason: {
      type: String,
      default: ''
    }
  }],
  bookingReference: {
    type: String,
    unique: true,
    default: function() {
      return 'B' + Date.now() + Math.floor(Math.random() * 10000);
    }
  },
  emissionsSavingsKg: {
    type: Number,
    default: 0
  },
  totalDistanceKm: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Add compound index for performance
bookingSchema.index({ matchId: 1, userId: 1 }, { unique: true });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ driverId: 1, createdAt: -1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });
bookingSchema.index({ bookingReference: 1 }, { unique: true });

// Virtual field for booking status timeline
bookingSchema.virtual('statusTimeline').get(function() {
  return this.statusHistory.map(status => ({
    status: status.status,
    timestamp: status.timestamp,
    reason: status.reason
  }));
});

// Virtual field for payment status
bookingSchema.virtual('isPaymentComplete').get(function() {
  return this.paymentStatus === 'processed';
});

// Virtual field for ride progress
bookingSchema.virtual('progress').get(function() {
  const stages = ['pending', 'confirmed', 'picked_up', 'live', 'completed'];
  const currentStage = stages.indexOf(this.status);
  return currentStage >= 0 ? (currentStage / (stages.length - 1)) * 100 : 0;
});

// Static method to create a new booking
bookingSchema.statics.createBooking = async function(bookingData) {
  // Generate a unique booking reference
  let reference = 'B' + Date.now() + Math.floor(Math.random() * 10000);
  let exists = await this.findOne({ bookingReference: reference });
  
  while (exists) {
    reference = 'B' + Date.now() + Math.floor(Math.random() * 10000);
    exists = await this.findOne({ bookingReference: reference });
  }
  
  bookingData.bookingReference = reference;
  return this.create(bookingData);
};

// Static method to get user's active bookings
bookingSchema.statics.getActiveBookings = async function(userId) {
  return this.find({
    $or: [
      { userId, status: { $in: ['confirmed', 'picked_up', 'live'] } },
      { driverId, status: { $in: ['confirmed', 'picked_up', 'live'] } }
    ]
  }).sort({ createdAt: -1 });
};

// Static method to get user's completed bookings
bookingSchema.statics.getCompletedBookings = async function(userId) {
  return this.find({
    $or: [
      { userId, status: 'completed' },
      { driverId, status: 'completed' }
    ]
  }).sort({ createdAt: -1 });
};

// Method to update status and track history
bookingSchema.methods.updateStatus = async function(newStatus, userId = null, reason = '') {
  const validTransitions = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['picked_up', 'cancelled'],
    'picked_up': ['live', 'cancelled'],
    'live': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };
  
  if (!validTransitions[this.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
  }
  
  // Update status timestamps
  if (newStatus === 'picked_up' && !this.pickedUpAt) {
    this.pickedUpAt = new Date();
  }
  if (newStatus === 'live' && !this.liveAt) {
    this.liveAt = new Date();
  }
  if (newStatus === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (newStatus === 'cancelled' && !this.cancellationTime) {
    this.cancellationTime = new Date();
  }
  
  // Update status
  this.status = newStatus;
  
  // Add to status history
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    userId: userId,
    reason: reason
  });
  
  // Save the document
  return this.save();
};

// Method to process payment
bookingSchema.methods.processPayment = async function(transactionId) {
  this.paymentStatus = 'processed';
  this.paymentTransactionId = transactionId;
  this.paymentError = null;
  this.updatedAt = new Date();
  return this.save();
};

// Method to handle payment failure
bookingSchema.methods.handlePaymentFailure = async function(error, retry = false) {
  if (retry) {
    this.paymentRetries = this.paymentRetries + 1;
  }
  
  this.paymentStatus = 'failed';
  this.paymentError = error;
  this.updatedAt = new Date();
  return this.save();
};

// Method to get booking summary
bookingSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    bookingReference: this.bookingReference,
    matchId: this.matchId,
    userId: this.userId,
    driverId: this.driverId,
    status: this.status,
    seatCount: this.seatCount,
    fare: this.fare,
    currency: this.currency,
    paymentStatus: this.paymentStatus,
    progress: this.progress,
    statusTimeline: this.statusTimeline,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    emissionsSavingsKg: this.emissionsSavingsKg,
    totalDistanceKm: this.totalDistanceKm
  };
};

// Method to link to emissions report
bookingSchema.methods.linkEmissionsReport = async function(emissionsReport) {
  this.emissionsSavingsKg = emissionsReport.estimatedSavings;
  this.totalDistanceKm = emissionsReport.distance;
  this.updatedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Booking', bookingSchema);
