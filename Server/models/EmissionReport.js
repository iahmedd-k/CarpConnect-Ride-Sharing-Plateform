const mongoose = require('mongoose');

const emissionsReportSchema = new mongoose.Schema({
  rideId: {
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
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  estimatedSavings: {
    type: Number, // in kg CO2
    required: true,
    min: 0
  },
  calculatedFrom: {
    type: String,
    enum: ['solo-drive', 'public-transport'],
    default: 'solo-drive'
  },
  distance: {
    type: Number, // in meters
    required: true,
    min: 0
  },
  vehicleType: {
    type: String,
    enum: ['car', 'hybrid', 'electric', 'bus', 'train'],
    default: 'car'
  },
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel', 'electric', 'hybrid', 'hydrogen'],
    default: 'petrol'
  },
  calculationMethod: {
    type: String,
    enum: ['average', 'detailed'],
    default: 'average'
  },
  carbonFactor: {
    type: Number,
    default: 0.12 // kg CO2 per km for average car
  },
  routeData: {
    type: {
      origin: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number],
          required: true
        },
        address: {
          type: String,
          default: ''
        }
      },
      destination: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number],
          required: true
        },
        address: {
          type: String,
          default: ''
        }
      },
      polyline: {
        type: [Number],
        default: []
      }
    },
    default: undefined
  },
  calculationDetails: {
    type: {
      soloDriveEmissions: {
        type: Number,
        default: 0
      },
      sharedRideEmissions: {
        type: Number,
        default: 0
      },
      percentageSaved: {
        type: Number,
        default: 0
      },
      methodology: {
        type: String,
        default: ''
      }
    },
    default: undefined
  },
  calculationDate: {
    type: Date,
    default: Date.now
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

// Add compound index for performance
emissionsReportSchema.index({ rideId: 1, userId: 1 }, { unique: true });
emissionsReportSchema.index({ userId: 1, calculationDate: -1 });

// Virtual field for trees equivalent
emissionsReportSchema.virtual('treesEquivalent').get(function() {
  return parseFloat((this.estimatedSavings / 21).toFixed(3));
});

// Virtual field for percentage saved
emissionsReportSchema.virtual('percentageSaved').get(function() {
  if (!this.calculationDetails || !this.calculationDetails.soloDriveEmissions) {
    return 0;
  }
  return parseFloat(
    ((this.calculationDetails.soloDriveEmissions - this.calculationDetails.sharedRideEmissions) / 
    this.calculationDetails.soloDriveEmissions * 100).toFixed(1)
  );
});

// Static method to calculate emissions for a ride
emissionsReportSchema.statics.calculateEmissions = async function(rideId, userId, distance, options = {}) {
  const { 
    vehicleType = 'car',
    fuelType = 'petrol',
    calculationMethod = 'average',
    carbonFactor = 0.12
  } = options;

  // Calculate emissions based on method
  let soloDriveEmissions = 0;
  let sharedRideEmissions = 0;
  
  // In real implementation, this would use more detailed calculations
  if (calculationMethod === 'detailed') {
    // Detailed calculation would consider vehicle type, fuel type, etc.
    soloDriveEmissions = distance * carbonFactor;
    sharedRideEmissions = soloDriveEmissions * 0.3; // Example 70% reduction for carpooling
  } else {
    // Average calculation
    soloDriveEmissions = distance * 0.12; // Average kg CO2 per km for a car
    sharedRideEmissions = soloDriveEmissions * 0.3; // Example 70% reduction for carpooling
  }

  const estimatedSavings = soloDriveEmissions - sharedRideEmissions;
  
  return {
    estimatedSavings,
    calculationDetails: {
      soloDriveEmissions,
      sharedRideEmissions,
      percentageSaved: ((soloDriveEmissions - sharedRideEmissions) / soloDriveEmissions) * 100,
      methodology: calculationMethod
    }
  };
};

// Static method to get user's emissions history
emissionsReportSchema.statics.getUserEmissionsHistory = async function(userId, startDate, endDate) {
  const query = { userId };
  
  if (startDate && endDate) {
    query.calculationDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else if (startDate) {
    query.calculationDate = { $gte: new Date(startDate) };
  } else if (endDate) {
    query.calculationDate = { $lte: new Date(endDate) };
  }
  
  return this.find(query)
    .sort({ calculationDate: -1 })
    .limit(100);
};

// Static method to calculate user's total emissions savings
emissionsReportSchema.statics.calculateUserTotalSavings = async function(userId) {
  const reports = await this.find({ userId });
  
  const totalSavings = reports.reduce((sum, report) => sum + report.estimatedSavings, 0);
  const totalDistance = reports.reduce((sum, report) => sum + report.distance, 0);
  const treesEquivalent = Number((totalSavings / 21).toFixed(3));
  
  return {
    totalSavings,
    totalDistance,
    treesEquivalent,
    averageSavingsPerRide: reports.length > 0 ? totalSavings / reports.length : 0
  };
};

// Method to update report with new data
emissionsReportSchema.methods.updateReport = async function(newData) {
  // Update fields
  if (newData.estimatedSavings !== undefined) {
    this.estimatedSavings = newData.estimatedSavings;
  }
  if (newData.distance !== undefined) {
    this.distance = newData.distance;
  }
  if (newData.calculationMethod) {
    this.calculationMethod = newData.calculationMethod;
  }
  
  // Update calculation details
  if (newData.calculationDetails) {
    this.calculationDetails = {
      ...this.calculationDetails,
      ...newData.calculationDetails
    };
  }
  
  this.updatedAt = new Date();
  return this.save();
};

// Method to get detailed report
emissionsReportSchema.methods.getDetailedReport = function() {
  return {
    _id: this._id,
    rideId: this.rideId,
    userId: this.userId,
    estimatedSavings: this.estimatedSavings,
    treesEquivalent: this.treesEquivalent,
    percentageSaved: this.percentageSaved,
    distance: this.distance,
    calculationDate: this.calculationDate,
    vehicleType: this.vehicleType,
    fuelType: this.fuelType,
    routeData: this.routeData,
    calculationDetails: this.calculationDetails,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('EmissionsReport', emissionsReportSchema);
