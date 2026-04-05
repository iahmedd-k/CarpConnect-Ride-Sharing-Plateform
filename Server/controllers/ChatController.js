const asyncHandler = require('express-async-handler');
const ChatMessage = require('../models/ChatMessage');
const Booking = require('../models/Booking');
const {
  SYSTEM_SENDER,
  toMessagePayload,
  resolveChatRoomContext,
  getChatParticipantsForRide,
  ensureChatRoomForRide
} = require('../utils/chatRooms');

const getAuthorizedRoom = async (referenceId, userId) => {
  let context = await resolveChatRoomContext(referenceId);
  const booking = await Booking.findById(referenceId).select('offerId userId driverId status').lean();

  if (!context.found) {
    if (booking && [String(booking.userId), String(booking.driverId)].includes(String(userId))) {
      await ensureChatRoomForRide(booking.offerId, {
        driverId: booking.driverId,
        riderIds: [booking.userId]
      });
      context = await resolveChatRoomContext(referenceId);
    }
  }

  if (
    context.found &&
    booking &&
    [String(booking.userId), String(booking.driverId)].includes(String(userId)) &&
    !context.participants.includes(String(userId))
  ) {
    await ensureChatRoomForRide(booking.offerId, {
      driverId: booking.driverId,
      riderIds: [booking.userId]
    });
    context = await resolveChatRoomContext(referenceId);
  }

  if (!context.found) {
    return {
      ok: false,
      status: 404,
      message: 'Ride chat not found. It becomes available once a booking is confirmed.'
    };
  }

  const isParticipant = context.participants.includes(String(userId));
  if (!isParticipant) {
    return {
      ok: false,
      status: 403,
      message: 'You are not a participant in this ride chat.'
    };
  }

  return {
    ok: true,
    rideId: context.rideId,
    room: context.room
  };
};

const sendMessage = asyncHandler(async (req, res) => {
  const referenceId = req.body.rideId || req.body.bookingId || req.params.rideId;
  const content = String(req.body.content || '').trim();

  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Message content is required.'
    });
  }

  const auth = await getAuthorizedRoom(referenceId, req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  if (auth.room?.isLocked) {
    return res.status(423).json({
      success: false,
      message: 'Ride completed. Chat is now read only.'
    });
  }

  const doc = await ChatMessage.create({
    rideId: auth.rideId,
    senderId: req.user._id,
    message: content,
    type: 'text',
    status: 'delivered',
    participants: auth.room.participants || []
  });

  const populated = await ChatMessage.findById(doc._id)
    .populate('senderId', 'name profilePhoto role')
    .lean();

  const payload = toMessagePayload(populated);
  req.io?.to(`chat:${auth.rideId}`).emit('chat:message', payload);

  return res.status(201).json({
    success: true,
    data: {
      message: payload,
      room: {
        rideId: auth.rideId,
        isLocked: Boolean(auth.room?.isLocked)
      }
    }
  });
});

const getChatHistory = asyncHandler(async (req, res) => {
  const referenceId = req.params.rideId || req.params.bookingId;
  const auth = await getAuthorizedRoom(referenceId, req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
  const page = Math.max(1, Number(req.query.page || 1));
  const skip = (page - 1) * limit;

  const [messages, total, participants] = await Promise.all([
    ChatMessage.find({ rideId: auth.rideId })
      .populate('senderId', 'name profilePhoto role')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChatMessage.countDocuments({ rideId: auth.rideId }),
    getChatParticipantsForRide(auth.rideId)
  ]);

  const shaped = messages.map((message) =>
    message.senderId ? toMessagePayload(message) : {
      _id: String(message._id),
      rideId: String(message.rideId),
      content: message.message || '',
      type: message.type || 'system',
      location: message.location || null,
      createdAt: message.createdAt,
      timestamp: message.createdAt,
      status: message.status || 'delivered',
      sender: SYSTEM_SENDER
    }
  );

  await ChatMessage.updateMany(
    {
      rideId: auth.rideId,
      status: 'sent'
    },
    { $set: { status: 'delivered', deliveredAt: new Date() } }
  );

  return res.status(200).json({
    success: true,
    data: {
      messages: shaped,
      total,
      page,
      limit,
      room: {
        rideId: auth.rideId,
        participants,
        isLocked: Boolean(auth.room?.isLocked),
        createdAt: auth.room?.createdAt || null
      }
    }
  });
});

const markMessagesRead = asyncHandler(async (req, res) => {
  const referenceId = req.params.rideId || req.params.bookingId;
  const auth = await getAuthorizedRoom(referenceId, req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  await ChatMessage.updateMany(
    {
      rideId: auth.rideId,
      status: { $in: ['sent', 'delivered'] }
    },
    { $set: { status: 'read', readAt: new Date() } }
  );

  req.io?.to(`chat:${auth.rideId}`).emit('chat:status', {
    rideId: auth.rideId,
    userId: String(req.user._id),
    status: 'read',
    timestamp: new Date().toISOString()
  });

  return res.status(200).json({
    success: true,
    data: {
      message: 'Messages marked as read.'
    }
  });
});

const deleteMessage = asyncHandler(async (req, res) => {
  const message = await ChatMessage.findById(req.params.messageId);
  if (!message) {
    return res.status(404).json({ success: false, message: 'Message not found.' });
  }

  const auth = await getAuthorizedRoom(String(message.rideId), req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  if (String(message.senderId || '') !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Only the sender can delete this message.'
    });
  }

  await message.deleteMessage(req.user._id);

  req.io?.to(`chat:${auth.rideId}`).emit('chat:deleted', {
    rideId: auth.rideId,
    messageId: String(message._id)
  });

  return res.status(200).json({
    success: true,
    data: {
      messageId: String(message._id)
    }
  });
});

const getChatParticipants = asyncHandler(async (req, res) => {
  const referenceId = req.params.rideId || req.params.bookingId;
  const auth = await getAuthorizedRoom(referenceId, req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  const participants = await getChatParticipantsForRide(auth.rideId);
  return res.status(200).json({
    success: true,
    data: {
      participants,
      total: participants.length,
      isLocked: Boolean(auth.room?.isLocked)
    }
  });
});

const getChatSessionInfo = asyncHandler(async (req, res) => {
  const referenceId = req.params.rideId || req.params.bookingId;
  const auth = await getAuthorizedRoom(referenceId, req.user._id);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, message: auth.message });
  }

  const participants = await getChatParticipantsForRide(auth.rideId);
  const unreadCount = await ChatMessage.countDocuments({
    rideId: auth.rideId,
    status: 'delivered'
  });

  return res.status(200).json({
    success: true,
    data: {
      session: {
        rideId: auth.rideId,
        isLocked: Boolean(auth.room?.isLocked),
        participants,
        unreadCount,
        createdAt: auth.room?.createdAt || null
      }
    }
  });
});

module.exports = {
  sendMessage,
  getChatHistory,
  markMessagesRead,
  deleteMessage,
  getChatParticipants,
  getChatSessionInfo
};
