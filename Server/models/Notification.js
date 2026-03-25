const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'newMatch',
        'bookingConfirmed',
        'bookingUpdated',
        'bookingCancelled',
        'rideUpdated',
        'chatMessage',
        'locationUpdate',
        'paymentSuccess',
        'paymentFailed',
        'systemAlert',
        'safetyAlert'
      ],
      required: true
    },
    title: {
      type: String,
      required: true
    },
    body: {
      type: String,
      default: ''
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 5
    },
    isRead: {
      type: Boolean,
      default: false
    },
    readAt: {
      type: Date,
      default: null
    },
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: {
      type: Date,
      default: null
    },
    deliveryStatus: {
      type: {
        push: { type: Boolean, default: false },
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false }
      },
      default: {
        push: false,
        email: false,
        sms: false
      }
    },
    deliveryStatusTimestamps: {
      type: {
        push: { type: Date, default: null },
        email: { type: Date, default: null },
        sms: { type: Date, default: null }
      },
      default: {
        push: null,
        email: null,
        sms: null
      }
    },
    source: {
      type: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        service: { type: String, default: 'system' },
        ipAddress: { type: String, default: '' }
      },
      default: {
        userId: null,
        service: 'system',
        ipAddress: ''
      }
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    relatedType: {
      type: String,
      enum: ['match', 'booking', 'chat', 'payment', 'ride'],
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    },
    isUrgent: {
      type: Boolean,
      default: false
    },
    category: {
      type: String,
      enum: ['communication', 'safety', 'booking', 'payment', 'system'],
      default: 'communication'
    }
  },
  { timestamps: true }
);

// Add indexes for performance
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ type: 1, userId: 1 });
notificationSchema.index({ priority: -1, createdAt: -1 });

// Virtual field for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// Virtual field for checking if notification is actionable
notificationSchema.virtual('isActionable').get(function() {
  return ['newMatch', 'bookingConfirmed', 'paymentFailed'].includes(this.type);
});

// Static method to find unread notifications
notificationSchema.statics.getUnread = async function(userId) {
  return this.find({ 
    userId, 
    isRead: false 
  }).sort({ priority: -1, createdAt: -1 }).limit(100);
};

// Static method to find recent notifications
notificationSchema.statics.getRecent = async function(userId, days = 7) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  
  return this.find({ 
    userId,
    createdAt: { $gte: threshold }
  }).sort({ createdAt: -1 }).limit(100);
};

// Static method to mark all as read
notificationSchema.statics.markAllRead = async function(userId) {
  return this.updateMany(
    { userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
};

// Static method to get notification counts
notificationSchema.statics.getNotificationCounts = async function(userId) {
  const [total, unread] = await Promise.all([
    this.countDocuments({ userId }),
    this.countDocuments({ userId, isRead: false })
  ]);
  
  return {
    total,
    unread,
    actionable: await this.countDocuments({ 
      userId, 
      isRead: false,
      type: { $in: ['newMatch', 'bookingConfirmed', 'paymentFailed'] }
    })
  };
};

// Method to mark notification as read
notificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Method to mark notification as archived
notificationSchema.methods.markAsArchived = async function() {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Method to update delivery status
notificationSchema.methods.updateDeliveryStatus = async function(channel, success) {
  if (!['push', 'email', 'sms'].includes(channel)) {
    throw new Error('Invalid delivery channel');
  }
  
  this.deliveryStatus[channel] = success;
  this.deliveryStatusTimestamps[channel] = new Date();
  return this.save();
};

// Removed duplicate isActionable method. Use virtual instead.

module.exports = mongoose.model('Notification', notificationSchema);
