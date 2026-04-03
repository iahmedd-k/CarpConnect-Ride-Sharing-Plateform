const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RideOffer',
    required: true,
    unique: true,
    index: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }],
  isLocked: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

chatRoomSchema.index({ participants: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

