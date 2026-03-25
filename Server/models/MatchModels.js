const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideOffer',
    required: true,
    index: true
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideRequest',
    required: true,
    index: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  riderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  pickupPoints: [{
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    time: {
      type: Date,
      required: true
    },
    eta: {
      type: Date,
      default: null
    }
  }],
  dropoffPoints: [{
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    time: {
      type: Date,
      required: true
    },
    eta: {
      type: Date,
      default: null
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'matched', 'booked', 'active', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  optimizedRoute: {
    type: Object,
    required: true
  },
  fareSplits: [{
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'PKR'
    },
    pickupPoint: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    },
    dropoffPoint: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: true
      }
    }
  }],
  totalFare: {
    type: Number,
    required: true
  },
  matchScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.7
  },
  matchedAt: {
    type: Date,
    default: Date.now
  },
  bookedAt: {
    type: Date,
    default: null
  },
  activeAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'matched', 'booked', 'active', 'completed', 'cancelled'],
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
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null,
    index: true
  },
  emissionsSavingsKg: {
    type: Number,
    default: 0
  },
  totalDistanceKm: {
    type: Number,
    default: 0
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: []
    },
    timestamp: {
      type: Date,
      default: null
    }
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add geospatial index for pickup and dropoff points
matchSchema.index({ 'pickupPoints.coordinates': '2dsphere' });
matchSchema.index({ 'dropoffPoints.coordinates': '2dsphere' });

// Virtual field for match duration
matchSchema.virtual('duration').get(function() {
  if (!this.activeAt || !this.completedAt) return null;
  return this.completedAt - this.activeAt;
});

// Method to update status and track history
matchSchema.methods.updateStatus = async function(newStatus, userId = null, reason = '') {
  const validTransitions = {
    'pending': ['matched', 'cancelled'],
    'matched': ['booked', 'cancelled'],
    'booked': ['active', 'cancelled'],
    'active': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };
  
  if (!validTransitions[this.status]?.includes(newStatus)) {
    throw new Error(`Cannot transition from ${this.status} to ${newStatus}`);
  }
  
  // Update status timestamps
  if (newStatus === 'booked' && !this.bookedAt) {
    this.bookedAt = new Date();
  }
  if (newStatus === 'active' && !this.activeAt) {
    this.activeAt = new Date();
  }
  if (newStatus === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  if (newStatus === 'cancelled' && !this.cancelledAt) {
    this.cancelledAt = new Date();
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

// Method to add location update
matchSchema.methods.updateLocation = async function(coordinates, timestamp = new Date()) {
  this.currentLocation = {
    coordinates,
    timestamp
  };
  this.lastUpdate = new Date();
  return this.save();
};

// Method to calculate emissions data
matchSchema.methods.calculateEmissionsData = async function() {
  // This would calculate emissions based on route data
  // For the model, we'll just add a placeholder implementation
  this.totalDistanceKm = 10; // Example value
  this.emissionsSavingsKg = this.totalDistanceKm * 0.12;
  return this.save();
};

// Method to link booking
matchSchema.methods.linkBooking = async function(bookingId) {
  this.bookingId = bookingId;
  return this.save();
};

// Static method to get active matches
matchSchema.statics.getActiveMatches = async function() {
  return this.find({
    status: { $in: ['active', 'booked'] },
    lastUpdate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
};

module.exports = mongoose.model('Match', matchSchema);
