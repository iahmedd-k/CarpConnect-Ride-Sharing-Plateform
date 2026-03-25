const mongoose = require('mongoose');
const { calculateRouteDistance, calculateRouteDuration } = require('../utils/geospatial');

const rideOfferSchema = new mongoose.Schema({
  driverId: {
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
  originAddress: {
    type: String,
    default: ''
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
  destinationAddress: {
    type: String,
    default: ''
  },
  routeGeoJson: {
    type: Object,
    required: false
  },
  departureTime: {
    type: Date,
    required: true
  },
  seatsAvailable: {
    type: Number,
    required: true,
    min: 0
  },
  seatsTotal: {
    type: Number,
    min: 1
  },
  pricePerSeat: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  estimatedDistanceKm: {
    type: Number,
    default: 0
  },
  estimatedDurationMin: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  currentStopIndex: {
    type: Number,
    default: 0
  },
  stops: {
    type: Array,
    default: []
  },
  routePolyline: {
    type: Array,
    default: []
  },
  preferences: {
    type: {
      music: { type: String, default: 'any' },
      smoking: { type: Boolean, default: false },
      pets: { type: Boolean, default: false },
      conversation: { type: Boolean, default: true },
      notifications: {
        type: {
          email: { type: Boolean, default: true },
          push: { type: Boolean, default: true },
          sms: { type: Boolean, default: false }
        },
        default: undefined
      }
    },
    default: undefined
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
    ref: 'RideOffer',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: ['open', 'matched', 'booked', 'active', 'completed', 'cancelled'],
    default: 'open'
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
  },
  hiddenForDriver: {
    type: Boolean,
    default: false,
    index: true
  },
  driverHiddenAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const normalizeLineString = (routeGeoJson) => {
  const coords = routeGeoJson?.coordinates || routeGeoJson?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords
    }
  };
};

rideOfferSchema.pre('save', function computeRouteMetrics() {
  const originCoords = this?.origin?.coordinates;
  const destinationCoords = this?.destination?.coordinates;
  const hasOrigin = Array.isArray(originCoords) && originCoords.length === 2;
  const hasDestination = Array.isArray(destinationCoords) && destinationCoords.length === 2;

  let normalizedRoute = normalizeLineString(this.routeGeoJson);
  if (!normalizedRoute && hasOrigin && hasDestination) {
    normalizedRoute = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [originCoords, destinationCoords]
      }
    };
    this.routeGeoJson = normalizedRoute;
  }

  if (normalizedRoute) {
    const distanceMeters = calculateRouteDistance(normalizedRoute);
    const durationMin = calculateRouteDuration(normalizedRoute);
    if (Number.isFinite(distanceMeters) && distanceMeters > 0) {
      this.estimatedDistanceKm = Number((distanceMeters / 1000).toFixed(2));
    }
    if (Number.isFinite(durationMin) && durationMin > 0) {
      this.estimatedDurationMin = Number(Math.round(durationMin));
    }
  }
});

// Add geospatial index for origin
rideOfferSchema.index({ 'origin': '2dsphere' });
rideOfferSchema.index({ 'destination': '2dsphere' });

// Add geospatial index for origin.coordinates
rideOfferSchema.index({ 'origin.coordinates': '2dsphere' });

// Virtual field for calculating distance
rideOfferSchema.virtual('distance').get(function() {
  // This would be calculated using the routeGeoJson
  return null;
});

// Method to update status and track history
rideOfferSchema.methods.updateStatus = async function(newStatus, reason = '') {
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

module.exports = mongoose.model('RideOffer', rideOfferSchema);
