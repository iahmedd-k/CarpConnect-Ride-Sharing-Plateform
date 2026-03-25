const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  ratedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    default: ''
  },
  tags: {
    type: [String],
    default: []
  },
  category: {
    type: String,
    enum: ['driver', 'rider'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'edited', 'deleted'],
    default: 'active'
  },
  editedAt: {
    type: Date,
    default: null
  },
  deletedAt: {
    type: Date,
    default: null
  },
  socialTrustScore: {
    type: Number,
    default: 0
  },
  emissionsContext: {
    type: {
      estimatedSavings: {
        type: Number,
        default: 0
      },
      distance: {
        type: Number,
        default: 0
      }
    },
    default: {
      estimatedSavings: 0,
      distance: 0
    }
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

// Add composite index for unique reviews per booking
ratingSchema.index({ bookingId: 1, ratedBy: 1 }, { unique: true });

// Virtual field for calculating trust score
ratingSchema.virtual('trustScore').get(function() {
  // This would be calculated based on multiple factors:
  // - Account age
  // - Number of verified reviews
  // - Social connections
  // - Review history consistency
  return this.socialTrustScore;
});

// Static method to calculate average rating for a user
ratingSchema.statics.calculateAverageRating = async function(userId) {
  const ratings = await this.find({ 
    userId, 
    status: 'active' 
  });
  
  if (ratings.length === 0) return 0;
  
  const total = ratings.reduce((sum, rating) => sum + rating.rating, 0);
  return parseFloat((total / ratings.length).toFixed(1));
};

// Static method to calculate emissions-influenced rating
ratingSchema.statics.calculateEmissionsInfluencedRating = async function(userId) {
  const ratings = await this.find({ 
    userId, 
    status: 'active',
    'emissionsContext.estimatedSavings': { $gt: 0 }
  });
  
  if (ratings.length === 0) return 0;
  
  const weightedSum = ratings.reduce((sum, rating) => {
    // Higher emissions savings = higher weight (up to 1.5x)
    const weight = 1 + (Math.min(rating.emissionsContext.estimatedSavings, 5) / 10);
    return sum + (rating.rating * weight);
  }, 0);
  
  const totalWeight = ratings.reduce((sum, rating) => {
    const weight = 1 + (Math.min(rating.emissionsContext.estimatedSavings, 5) / 10);
    return sum + weight;
  }, 0);
  
  return parseFloat((weightedSum / totalWeight).toFixed(1));
};

// Method to update a rating
ratingSchema.methods.updateRating = async function(newRatingData) {
  // Validate the user can update this rating
  if (newRatingData.ratedBy && String(this.ratedBy) !== String(newRatingData.ratedBy)) {
    throw new Error('Not authorized to update this rating');
  }
  
  // Only allow edits within 24 hours of creation
  const hoursSinceCreation = (new Date() - new Date(this.createdAt)) / (1000 * 3600);
  if (hoursSinceCreation > 24) {
    throw new Error('Ratings can only be edited within 24 hours of creation');
  }
  
  // Update the rating
  if (newRatingData.rating !== undefined) {
    this.rating = Math.min(5, Math.max(1, Number(newRatingData.rating)));
  }
  
  if (newRatingData.comment !== undefined) {
    this.comment = newRatingData.comment;
  }
  
  if (newRatingData.tags !== undefined) {
    this.tags = Array.isArray(newRatingData.tags) ? newRatingData.tags : [];
  }
  
  this.status = 'edited';
  this.editedAt = new Date();
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to delete a rating
ratingSchema.methods.deleteRating = async function() {
  // Validate the user can delete this rating
  const hoursSinceCreation = (new Date() - new Date(this.createdAt)) / (1000 * 3600);
  if (hoursSinceCreation > 24) {
    throw new Error('Ratings can only be deleted within 24 hours of creation');
  }
  
  this.status = 'deleted';
  this.deletedAt = new Date();
  this.updatedAt = new Date();
  
  return this.save();
};

// Method to calculate the trust score for a rating
ratingSchema.methods.calculateTrustScore = function() {
  // This would consider:
  // - Account verification status
  // - Number of previous ratings
  // - Consistency with other ratings
  // - Social connections with the rated user
  
  let score = 0;
  
  // Add points for verified accounts
  if (this.ratedBy.verified) score += 10;
  
  // Add points for consistent ratings (simplified example)
  const ratingDelta = Math.abs(this.rating - 3); // Centered around 3 stars
  if (ratingDelta <= 1) score += 5; // Consistent ratings get higher trust
  
  // Add points for social connections
  if (this.ratedBy.trustedNetwork?.includes(this.userId)) {
    score += 15;
  }
  
  return Math.min(100, Math.max(0, score));
};

// Method to update the social trust score
ratingSchema.methods.updateSocialTrustScore = async function() {
  this.socialTrustScore = this.calculateTrustScore();
  this.updatedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Rating', ratingSchema);
