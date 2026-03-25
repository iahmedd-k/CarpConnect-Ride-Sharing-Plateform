const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const { createAndEmitNotification } = require('../utils/notifications');

const VALID_NOTIFICATION_TYPES = [
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
];

const LEGACY_TYPE_MAP = {
  match: 'newMatch',
  booking: 'bookingUpdated',
  payment: 'paymentSuccess',
  ride_update: 'rideUpdated',
  chat: 'chatMessage',
  rating: 'rideUpdated',
  system: 'systemAlert',
  bookingCanceled: 'bookingCancelled',
  bookingCanceledLegacy: 'bookingCancelled',
  bookingRejected: 'bookingCancelled',
  message: 'chatMessage'
};

const normalizeNotificationType = (type) => LEGACY_TYPE_MAP[type] || type;

// @desc    Get user's notifications with pagination
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const type = normalizeNotificationType(req.query.type);
  const status = req.query.status;

  const query = { userId: req.user._id, isArchived: { $ne: true } };

  if (type && VALID_NOTIFICATION_TYPES.includes(type)) {
    query.type = type;
  }

  if (status === 'read') {
    query.isRead = true;
  } else if (status === 'unread') {
    query.isRead = false;
  }

  const total = await Notification.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const skip = Math.max(0, (page - 1) * limit);

  const notifications = await Notification.find(query)
    .sort({ isRead: 1, priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    data: {
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        limit
      }
    }
  });
});

// @desc    Get a single notification
// @route   GET /api/notifications/:id
// @access  Private
const getNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  res.status(200).json({
    success: true,
    data: { notification }
  });
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  req.io?.to(`user:${req.user._id}`).emit('notificationRead', {
    notificationId: notification._id,
    timestamp: new Date()
  });

  res.status(200).json({
    success: true,
    data: {
      notification,
      message: 'Notification marked as read'
    }
  });
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read
// @access  Private
const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  req.io?.to(`user:${req.user._id}`).emit('allNotificationsRead', {
    timestamp: new Date()
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'All notifications marked as read'
    }
  });
});

// @desc    Create a notification
// @route   POST /api/notifications
// @access  Private (Internal use)
const createNotification = asyncHandler(async (req, res) => {
  const {
    userId,
    type,
    title,
    body,
    message,
    relatedId,
    relatedType,
    category,
    priority,
    isUrgent
  } = req.body;

  const normalizedType = normalizeNotificationType(type);

  if (!userId || !normalizedType || !title || !(body || message)) {
    return res.status(400).json({
      success: false,
      message: 'userId, type, title and body are required'
    });
  }

  if (!VALID_NOTIFICATION_TYPES.includes(normalizedType)) {
    return res.status(400).json({
      success: false,
      message: `Invalid notification type. Must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`
    });
  }

  const notification = await createAndEmitNotification(req, {
    userId,
    type: normalizedType,
    title,
    body: body || message,
    relatedId,
    relatedType,
    category,
    priority,
    isUrgent
  });

  res.status(201).json({
    success: true,
    data: {
      notification,
      message: 'Notification created successfully'
    }
  });
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    userId: req.user._id
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  await notification.deleteOne();

  req.io?.to(`user:${req.user._id}`).emit('notificationDeleted', {
    notificationId: notification._id,
    timestamp: new Date()
  });

  res.status(200).json({
    success: true,
    data: {
      message: 'Notification deleted successfully'
    }
  });
});

// @desc    Get unread notification count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
    isArchived: { $ne: true }
  });

  res.status(200).json({
    success: true,
    data: { count }
  });
});

module.exports = {
  getNotifications,
  getNotification,
  markNotificationRead,
  markAllRead,
  createNotification,
  deleteNotification,
  getUnreadCount
};
