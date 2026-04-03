const { isValidObjectId, Types } = require('mongoose');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const Booking = require('../models/Booking');
const Match = require('../models/MatchModels');
const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');

const SYSTEM_SENDER = {
  _id: 'system',
  name: 'System',
  role: 'system',
  avatar: null
};

const uniqObjectIds = (ids = []) => {
  const seen = new Set();
  return ids
    .filter(Boolean)
    .map((id) => String(id))
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => new Types.ObjectId(id));
};

const toMessagePayload = (message) => ({
  _id: String(message._id),
  rideId: String(message.rideId),
  content: message.message || '',
  type: message.type || 'text',
  location: message.location || null,
  createdAt: message.createdAt,
  timestamp: message.createdAt,
  status: message.status || 'delivered',
  sender: message.senderId
    ? {
        _id: String(message.senderId._id || message.senderId),
        name: message.senderId.name || 'User',
        role: message.senderId.role || 'rider',
        avatar: message.senderId.profilePhoto || null
      }
    : SYSTEM_SENDER
});

const resolveRideIdFromReference = async (id) => {
  if (!id) return null;

  if (isValidObjectId(id)) {
    const [booking, offer, match] = await Promise.all([
      Booking.findById(id).select('offerId').lean(),
      RideOffer.findById(id).select('_id').lean(),
      Match.findById(id).select('offerId').lean()
    ]);

    if (booking?.offerId) return String(booking.offerId);
    if (offer?._id) return String(offer._id);
    if (match?.offerId) return String(match.offerId);
  }

  const matchByOffer = await Match.findOne({ offerId: id }).select('offerId').lean();
  return matchByOffer?.offerId ? String(matchByOffer.offerId) : String(id);
};

const getRideParticipants = async (rideId) => {
  const offer = await RideOffer.findById(rideId).select('driverId').lean();
  if (!offer) return { rideId: null, driverId: null, riderIds: [] };

  const bookings = await Booking.find({
    offerId: rideId,
    status: { $in: ['confirmed', 'picked_up', 'live', 'completed'] }
  }).select('userId').lean();

  const riderIds = uniqObjectIds(bookings.map((booking) => booking.userId));

  return {
    rideId: String(rideId),
    driverId: offer.driverId ? String(offer.driverId) : null,
    riderIds: riderIds.map((id) => String(id))
  };
};

const ensureChatRoomForRide = async (rideId, options = {}) => {
  const { driverId, riderIds = [] } = options;
  if (!rideId) return null;

  const participantIds = uniqObjectIds([driverId, ...riderIds]);
  if (!participantIds.length) return null;

  let room = await ChatRoom.findOne({ rideId });
  if (!room) {
    room = await ChatRoom.create({
      rideId,
      participants: participantIds,
      isLocked: false
    });
    return room;
  }

  const existing = new Set((room.participants || []).map((id) => String(id)));
  const merged = [
    ...(room.participants || []).map((id) => new Types.ObjectId(String(id))),
    ...participantIds.filter((id) => !existing.has(String(id)))
  ];

  room.participants = merged;
  if (room.isLocked) {
    room.isLocked = false;
  }
  await room.save();
  return room;
};

const lockChatRoomForRide = async (rideId, io) => {
  if (!rideId) return null;
  const room = await ChatRoom.findOne({ rideId });
  if (!room) return null;
  const wasLocked = Boolean(room.isLocked);
  if (!wasLocked) {
    room.isLocked = true;
    await room.save();
    await createSystemChatMessage(rideId, 'Ride completed. Group chat has ended.', io);
  }
  io?.to(`chat:${rideId}`).emit('ride_ended', {
    rideId: String(rideId),
    isLocked: true,
    timestamp: new Date().toISOString()
  });
  return room;
};

const createSystemChatMessage = async (rideId, message, io, extra = {}) => {
  const room = await ChatRoom.findOne({ rideId }).lean();
  if (!room) return null;

  const doc = await ChatMessage.create({
    rideId,
    senderId: null,
    message,
    type: 'system',
    status: 'delivered',
    participants: room.participants || [],
    ...extra
  });

  const payload = toMessagePayload({
    ...doc.toObject(),
    senderId: null
  });

  io?.to(`chat:${rideId}`).emit('chat:message', payload);
  return payload;
};

const resolveChatRoomContext = async (referenceId) => {
  const rideId = await resolveRideIdFromReference(referenceId);
  if (!rideId || !isValidObjectId(rideId)) {
    return { found: false, rideId: null, room: null, participants: [] };
  }

  const room = await ChatRoom.findOne({ rideId }).lean();
  return {
    found: Boolean(room),
    rideId: String(rideId),
    room,
    participants: Array.isArray(room?.participants) ? room.participants.map((id) => String(id)) : []
  };
};

const getChatParticipantsForRide = async (rideId) => {
  const room = await ChatRoom.findOne({ rideId }).lean();
  if (!room) return [];

  const users = await User.find({ _id: { $in: room.participants || [] } })
    .select('name profilePhoto role verified')
    .lean();

  const offer = await RideOffer.findById(rideId).select('driverId').lean();
  const driverId = String(offer?.driverId || '');

  return users.map((user) => ({
    _id: String(user._id),
    name: user.name || 'User',
    role: String(user._id) === driverId ? 'driver' : (user.role === 'driver' ? 'driver' : 'rider'),
    avatar: user.profilePhoto || null,
    verified: Boolean(user.verified)
  }));
};

module.exports = {
  SYSTEM_SENDER,
  toMessagePayload,
  resolveRideIdFromReference,
  getRideParticipants,
  ensureChatRoomForRide,
  lockChatRoomForRide,
  createSystemChatMessage,
  resolveChatRoomContext,
  getChatParticipantsForRide
};
