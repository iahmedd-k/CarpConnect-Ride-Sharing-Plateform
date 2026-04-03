const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  message: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['text', 'location', 'system', 'image', 'file'],
    default: 'text'
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: []
    },
    eta: {
      type: Date,
      default: null
    }
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent',
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reaction: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage',
    default: null
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }]
}, {
  timestamps: true
});

// Add compound index for performance
chatMessageSchema.index({ rideId: 1, status: 1 });
chatMessageSchema.index({ rideId: 1, createdAt: -1 });

// Virtual field for checking if message is deleted
chatMessageSchema.virtual('isDeleted').get(function() {
  return this.deleted && this.deletedAt !== null;
});

// Virtual field for checking if message is edited
chatMessageSchema.virtual('isEdited').get(function() {
  return this.edited && this.editedAt !== null;
});

// Static method to get chat history for a ride
chatMessageSchema.statics.getChatHistory = async function(rideId, limit = 100, page = 1) {
  const skip = (page - 1) * limit;
  
  return this.find({ rideId })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(parseInt(limit));
};

// Static method to mark messages as delivered
chatMessageSchema.statics.markAsDelivered = async function(rideId, messageId) {
  return this.updateOne(
    { _id: messageId, rideId },
    { $set: { status: 'delivered', deliveredAt: new Date() } }
  );
};

// Static method to mark messages as read
chatMessageSchema.statics.markAsRead = async function(rideId, userId) {
  return this.updateMany(
    { rideId, status: 'delivered' },
    { $set: { status: 'read', readAt: new Date() } }
  );
};

// Method to edit a message
chatMessageSchema.methods.edit = async function(newContent) {
  if (this.isDeleted) {
    throw new Error('Cannot edit a deleted message');
  }
  
  this.message = newContent;
  this.edited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to delete a message
chatMessageSchema.methods.deleteMessage = async function(userId) {
  if (this.senderId.toString() !== userId.toString()) {
    throw new Error('Not authorized to delete this message');
  }
  
  this.deleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

// Method to add a reaction
chatMessageSchema.methods.addReaction = async function(userId, reaction) {
  // Check if user already reacted
  const existingIndex = this.reactions.findIndex(
    r => String(r.userId) === String(userId)
  );
  
  if (existingIndex >= 0) {
    // Update existing reaction
    this.reactions[existingIndex].reaction = reaction;
    this.reactions[existingIndex].timestamp = new Date();
  } else {
    // Add new reaction
    this.reactions.push({
      userId,
      reaction,
      timestamp: new Date()
    });
  }
  
  return this.save();
};

// Method to remove a reaction
chatMessageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(
    r => String(r.userId) !== String(userId)
  );
  return this.save();
};

// Method to get message summary
chatMessageSchema.methods.getSummary = function() {
  return {
    _id: this._id,
    rideId: this.rideId,
    senderId: this.senderId,
    message: this.message,
    type: this.type,
    location: this.location,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    isEdited: this.isEdited,
    isDeleted: this.isDeleted,
    reactions: this.reactions
  };
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
