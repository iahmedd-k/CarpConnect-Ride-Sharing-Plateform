const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const vehicleSchema = new mongoose.Schema({
  make: {
    type: String,
    default: ''
  },
  model: {
    type: String,
    default: ''
  },
  year: {
    type: Number,
    min: 1900
  },
  plateNumber: {
    type: String,
    default: ''
  },
  seats: {
    type: Number,
    default: 4,
    min: 1
  },
  fuelType: {
    type: String,
    default: 'petrol'
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  phone: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: '',
    trim: true
  },
  role: {
    type: String,
    enum: ['rider', 'driver', 'both'],
    default: 'rider'
  },
  vehicle: {
    type: vehicleSchema,
    default: undefined
  },
  stripeAccountId: {
    type: String,
    default: ''
  },
  payoutDetails: {
    type: {
      accountHolderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      iban: { type: String, default: '' },
      bankName: { type: String, default: '' },
      payoutMethod: { type: String, enum: ['bank', 'wallet', 'none'], default: 'none' }
    },
    default: undefined
  },
  subscription: {
    type: {
      plan: { type: String, enum: ['free', 'basic', 'plus', 'pro'], default: 'free' },
      status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
      startsAt: { type: Date, default: Date.now },
      renewsAt: { type: Date, default: null },
      stripePriceId: { type: String, default: '' },
      stripeCustomerId: { type: String, default: '' },
      stripeSubscriptionId: { type: String, default: '' },
      limits: {
        type: {
          monthlyRideRequests: { type: Number, default: 25 },
          monthlyBookings: { type: Number, default: 8 },
          monthlyRideOffers: { type: Number, default: 8 }
        },
        default: undefined
      }
    },
    default: undefined
  },
  profilePhoto: {
    type: String,
    default: ''
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
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  emailVerification: {
    type: {
      otpHash: { type: String, default: '' },
      expiresAt: { type: Date, default: null },
      lastSentAt: { type: Date, default: null }
    },
    default: undefined
  },
  ratings: {
    type: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
      recent: { type: [Number], default: [] }
    },
    default: undefined
  },
  totalCompletedRides: {
    type: Number,
    default: 0
  },
  totalCo2SavedKg: {
    type: Number,
    default: 0
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  socialVerification: {
    type: {
      linkedin: { type: Boolean, default: false },
      facebook: { type: Boolean, default: false },
      google: { type: Boolean, default: false },
      phone: { type: Boolean, default: false }
    },
    default: undefined
  },
  emergencyContact: {
    type: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relationship: { type: String, default: '' }
    },
    default: undefined
  },
  trustedNetwork: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: []
  }
}, {
  timestamps: true
});

// Password hashing middleware
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Update user ratings
userSchema.methods.updateRatings = async function(newRating) {
  if (this.ratings) {
    this.ratings.count += 1;
    this.ratings.average = ((this.ratings.average * (this.ratings.count - 1)) + newRating) / this.ratings.count;
    if (this.ratings.recent.length >= 5) {
      this.ratings.recent.shift();
    }
    this.ratings.recent.push(newRating);
  } else {
    this.ratings = {
      average: newRating,
      count: 1,
      recent: [newRating]
    };
  }
};

// Add to trusted network
userSchema.methods.addToTrustedNetwork = async function(userId) {
  if (!this.trustedNetwork.includes(userId)) {
    this.trustedNetwork.push(userId);
    await this.save();
  }
};

// Calculate emissions savings
userSchema.methods.addEmissionsSavings = async function(kg) {
  this.totalCo2SavedKg = (this.totalCo2SavedKg || 0) + kg;
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
