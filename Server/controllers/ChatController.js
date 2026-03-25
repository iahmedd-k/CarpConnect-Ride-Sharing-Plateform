const ChatMessage = require('../models/ChatMessage');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');
const asyncHandler = require('express-async-handler');
const { isValidObjectId } = require('mongoose');

// @desc    Send a message in ride chat
// @route   POST /api/chats/:rideId/messages
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId || req.body.bookingId || req.body.rideId;
  const { content, type = 'text', location } = req.body;
  
  if (!content && !location) {
    return res.status(400).json({
      success: false,
      message: 'Message content or location is required'
    });
  }

  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Create message with full context
  const chatMessage = await ChatMessage.create({
    rideId: context.threadId,
    senderId: req.user._id,
    message: content,
    type,
    location: location || null,
    status: 'sent'
  });

  // Populate the message for response
  const populatedMessage = await ChatMessage.findById(chatMessage._id)
    .populate('senderId', 'name profilePhoto')
    .lean();

  // Format the message for real-time delivery
  const payload = {
    _id: String(populatedMessage._id),
    content: populatedMessage.message,
    type: populatedMessage.type,
    location: populatedMessage.location,
    createdAt: populatedMessage.createdAt,
    sender: {
      _id: String(populatedMessage.senderId?._id || req.user._id),
      name: populatedMessage.senderId?.name || req.user.name,
      avatar: populatedMessage.senderId?.profilePhoto || null
    },
    status: 'sent',
    timestamp: populatedMessage.createdAt
  };

  // Update message status to delivered
  await ChatMessage.findByIdAndUpdate(
    chatMessage._id,
    { status: 'delivered' },
    { new: true }
  );

  // Emit real-time event to all participants
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${context.threadId}`).emit('chat:message', {
      ...payload,
      status: 'delivered'
    });
  }

  res.status(201).json({
    success: true,
    data: {
      message: {
        ...payload,
        status: 'delivered'
      }
    }
  });
});

// @desc    Get chat history for a ride
// @route   GET /api/chats/:rideId/messages
// @access  Private
const getChatHistory = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId || req.params.bookingId;
  const { limit = 100, page = 1 } = req.query;
  
  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Calculate pagination
  const skip = (page - 1) * limit;
  
  // Get messages with pagination
  const messages = await ChatMessage.find({ rideId: context.threadId })
    .populate('senderId', 'name profilePhoto')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  // Format messages for response
  const shaped = messages.map((m) => ({
    _id: String(m._id),
    content: m.message,
    type: m.type,
    location: m.location,
    createdAt: m.createdAt,
    sender: {
      _id: String(m.senderId?._id || ''),
      name: m.senderId?.name || 'User',
      avatar: m.senderId?.profilePhoto || null
    },
    status: m.status,
    timestamp: m.createdAt
  }));

  // Mark messages as delivered for this user
  await ChatMessage.updateMany(
    {
      rideId: context.threadId,
      status: { $in: ['sent'] }
    },
    { $set: { status: 'delivered' } }
  );

  res.status(200).json({
    success: true,
    data: {
      messages: shaped,
      total: messages.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
});

// @desc    Update message status to read
// @route   POST /api/chats/:rideId/messages/read
// @access  Private
const markMessagesRead = asyncHandler(async (req, res) => {
  const rideId = req.params.rideId || req.params.bookingId;
  
  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Update messages to read status
  await ChatMessage.updateMany(
    {
      rideId: context.threadId,
      status: { $in: ['delivered'] }
    },
    { $set: { status: 'read' } }
  );

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${context.threadId}`).emit('chat:status', {
      userId: req.user._id,
      status: 'read',
      timestamp: new Date()
    });
  }

  res.status(200).json({
    success: true,
    data: {
      message: 'Messages marked as read'
    }
  });
});

// @desc    Delete a chat message
// @route   DELETE /api/chat/:messageId
// @access  Private
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await ChatMessage.findById(req.params.messageId);
  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found'
    });
  }

  const context = await resolveChatContext(String(message.rideId), req.user._id);
  if (!context.found || !context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this message'
    });
  }

  if (String(message.senderId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Only the sender can delete this message'
    });
  }

  await message.deleteMessage(req.user._id);

  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${context.threadId}`).emit('chat:deleted', {
      messageId: String(message._id),
      rideId: context.threadId
    });
  }

  res.status(200).json({
    success: true,
    data: {
      messageId: String(message._id)
    }
  });
});

// @desc    Send location update (for ETA sharing)
// @route   POST /api/chats/:rideId/location
// @access  Private
const sendLocationUpdate = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const { coordinates, eta } = req.body;
  
  if (!coordinates || !coordinates.lat || !coordinates.lng) {
    return res.status(400).json({
      success: false,
      message: 'Valid coordinates are required'
    });
  }

  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Create location message
  const chatMessage = await ChatMessage.create({
    rideId: context.threadId,
    senderId: req.user._id,
    type: 'location',
    location: {
      coordinates: [coordinates.lng, coordinates.lat],
      eta: eta || null
    },
    status: 'sent'
  });

  // Populate the message
  const populatedMessage = await ChatMessage.findById(chatMessage._id)
    .populate('senderId', 'name profilePhoto')
    .lean();

  // Format for real-time delivery
  const payload = {
    _id: String(populatedMessage._id),
    type: 'location',
    location: {
      coordinates: populatedMessage.location.coordinates,
      eta: populatedMessage.location.eta
    },
    createdAt: populatedMessage.createdAt,
    sender: {
      _id: String(populatedMessage.senderId?._id || req.user._id),
      name: populatedMessage.senderId?.name || req.user.name,
      avatar: populatedMessage.senderId?.profilePhoto || null
    },
    status: 'sent',
    timestamp: populatedMessage.createdAt
  };

  // Update status to delivered
  await ChatMessage.findByIdAndUpdate(
    chatMessage._id,
    { status: 'delivered' },
    { new: true }
  );

  // Emit real-time event
  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${context.threadId}`).emit('chat:location', {
      ...payload,
      status: 'delivered'
    });
  }

  res.status(201).json({
    success: true,
    data: {
      message: {
        ...payload,
        status: 'delivered'
      }
    }
  });
});

// @desc    Get chat participants
// @route   GET /api/chats/:rideId/participants
// @access  Private
const getChatParticipants = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  
  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Get match details
  const match = await Match.findById(context.threadId).populate('riderIds');
  const offer = await RideOffer.findById(match.offerId);
  const request = await RideRequest.findById(match.requestId);

  // Get all participants
  const participants = [
    // Driver
    {
      _id: String(offer.driverId),
      name: 'Driver',
      role: 'driver',
      avatar: null
    },
    // Primary rider (from request)
    {
      _id: String(request.riderId),
      name: 'Rider',
      role: 'rider',
      avatar: null
    }
  ];

  // Add additional riders if any
  if (match.riderIds && match.riderIds.length > 1) {
    const additionalRiders = await User.find({
      _id: { $in: match.riderIds }
    }).select('name profilePhoto');
    
    additionalRiders.forEach(user => {
      if (!participants.some(p => String(p._id) === String(user._id))) {
        participants.push({
          _id: String(user._id),
          name: user.name,
          role: 'rider',
          avatar: user.profilePhoto
        });
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      participants,
      total: participants.length
    }
  });
});

// @desc    Get chat session info
// @route   GET /api/chats/:rideId/session
// @access  Private
const getChatSessionInfo = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  
  const context = await resolveChatContext(rideId, req.user._id);
  if (!context.found) {
    return res.status(404).json({
      success: false,
      message: context.notFoundMessage
    });
  }

  if (!context.isParticipant) {
    return res.status(403).json({
      success: false,
      message: context.forbiddenMessage
    });
  }

  // Get match details
  const match = await Match.findById(context.threadId)
    .populate('offerId', 'departureTime destination')
    .populate('requestId', 'earliestDeparture latestDeparture origin')
    .lean();

  // Get ride status
  const booking = await Booking.findOne({ matchId: context.threadId });
  
  const sessionInfo = {
    rideId: context.threadId,
    status: match.status,
    departureTime: match.offerId?.departureTime || null,
    destination: match.offerId?.destination?.coordinates || null,
    origin: match.requestId?.origin?.coordinates || null,
    estimatedDuration: match.estimatedDuration || null,
    currentLocation: null, // This would come from real-time tracking
    participants: await getChatParticipantsForSession(context.threadId),
    unreadCount: await ChatMessage.countDocuments({
      rideId: context.threadId,
      status: 'delivered'
    })
  };

  res.status(200).json({
    success: true,
    data: {
      session: sessionInfo
    }
  });
});

// Helper functions
const resolveChatContext = async (id, userId) => {
  if (!id) {
    return {
      found: false,
      isParticipant: false,
      threadId: '',
      notFoundMessage: 'Ride not found',
      forbiddenMessage: 'You are not a participant in this ride chat'
    };
  }

  const booking = isValidObjectId(id) ? await Booking.findById(id).lean() : null;
  if (booking) {
    const isParticipant =
      String(booking.userId) === String(userId) ||
      String(booking.driverId) === String(userId);

    return {
      found: true,
      isParticipant,
      threadId: String(booking._id),
      notFoundMessage: 'Booking not found',
      forbiddenMessage: 'You are not a participant in this booking chat'
    };
  }

  let match = isValidObjectId(id) ? await Match.findById(id).lean() : null;
  if (!match) {
    // Compatibility: accept offerId as rideId by resolving latest related match.
    match = await Match.findOne({ offerId: id }).sort({ createdAt: -1 }).lean();
  }

  if (!match) {
    return {
      found: false,
      isParticipant: false,
      threadId: String(id),
      notFoundMessage: 'Ride not found',
      forbiddenMessage: 'You are not a participant in this ride chat'
    };
  }

  const [offer, request] = await Promise.all([
    RideOffer.findById(match.offerId).select('driverId').lean(),
    RideRequest.findById(match.requestId).select('riderId').lean()
  ]);

  const riderIds = Array.isArray(match.riderIds) ? match.riderIds.map((r) => String(r)) : [];
  const isParticipant =
    String(offer?.driverId || '') === String(userId) ||
    String(request?.riderId || '') === String(userId) ||
    riderIds.includes(String(userId));

  return {
    found: true,
    isParticipant,
    threadId: String(match._id),
    notFoundMessage: 'Ride not found',
    forbiddenMessage: 'You are not a participant in this ride chat'
  };
};

const getChatParticipantsForSession = async (matchId) => {
  const match = await Match.findById(matchId).populate('riderIds').lean();
  const offer = await RideOffer.findById(match.offerId);
  const request = await RideRequest.findById(match.requestId);

  const participants = [
    {
      _id: String(offer.driverId),
      name: 'Driver',
      role: 'driver',
      avatar: null
    },
    {
      _id: String(request.riderId),
      name: 'Rider',
      role: 'rider',
      avatar: null
    }
  ];

  // Add additional riders
  if (match.riderIds && match.riderIds.length > 1) {
    const additionalRiders = await User.find({
      _id: { $in: match.riderIds }
    }).select('name profilePhoto');
    
    additionalRiders.forEach(user => {
      if (!participants.some(p => String(p._id) === String(user._id))) {
        participants.push({
          _id: String(user._id),
          name: user.name,
          role: 'rider',
          avatar: user.profilePhoto
        });
      }
    });
  }

  return participants;
};

module.exports = {
  sendMessage,
  getChatHistory,
  markMessagesRead,
  sendLocationUpdate,
  getChatParticipants,
  getChatSessionInfo,
  deleteMessage
};
