const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  origin: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  destination: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  originAddress: {
    type: String,
    default: ''
  },
  destinationAddress: {
    type: String,
    default: ''
  },
  earliestDeparture: {
    type: Date,
    required: true
  },
  latestDeparture: {
    type: Date,
    required: true
  },
  groupSize: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  maxPricePerSeat: {
    type: Number,
    default: null,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  notes: {
    type: String,
    default: ''
  },
  counterOffer: {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RideOffer',
      default: null
    },
    pricePerSeat: {
      type: Number,
      default: null
    },
    currency: {
      type: String,
      default: 'PKR'
    },
    message: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: null
    },
    respondedAt: {
      type: Date,
      default: null
    }
  },
  rejectedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['open', 'matched', 'booked', 'active', 'completed', 'cancelled'],
    default: 'open'
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrencePattern: {
    type: String,
    default: 'daily'
  },
  recurrenceDays: {
    type: [String],
    default: []
  },
  recurringParentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideRequest',
    default: null,
    index: true
  },
  // Added for documentation compliance
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
      enum: ['open', 'matched', 'booked', 'active', 'completed', 'cancelled'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      default: ''
    }
  }],
  totalDistanceKm: {
    type: Number,
    default: 0
  },
  emissionsSavingsKg: {
    type: Number,
    default: 0
  },
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    default: null
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  }
}, {
  timestamps: true
});

// Add geospatial index for origin
rideRequestSchema.index({ 'origin': '2dsphere' });
rideRequestSchema.index({ 'destination': '2dsphere' });

// Virtual field for match score
rideRequestSchema.virtual('matchScore').get(function() {
  // This would be calculated based on match data
  return null;
});

// Method to update status and track history
rideRequestSchema.methods.updateStatus = async function(newStatus, reason = '') {
  const validTransitions = {
    'open': ['matched', 'cancelled'],
    'matched': ['booked', 'cancelled'],
    'booked': ['active', 'cancelled'],
    'active': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };
  
  if (!validTransitions[this.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
  }
  
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    reason: reason
  });
  return this.save();
};

module.exports = mongoose.model('RideRequest', rideRequestSchema);
