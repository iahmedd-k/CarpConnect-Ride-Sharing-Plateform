const express = require('express');
const connectDB = require('./config/db');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Match = require('./models/MatchModels');
const { calculatePointToRouteDistance } = require('./utils/geospatial');
const { createAndEmitNotification } = require('./utils/notifications');
const {
  createSystemChatMessage,
  resolveChatRoomContext
} = require('./utils/chatRooms');
const { startRecurringJobs } = require('./utils/recurringJobs');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
     origin: true, // allows any origin
    credentials: true
  }
});
const etaAnnouncementCache = new Map();

const estimateEtaMinutes = (from, to, speedKmh = 35) => {
  if (!Array.isArray(from) || !Array.isArray(to) || from.length < 2 || to.length < 2) return null;
  const [fromLng, fromLat] = from.map(Number);
  const [toLng, toLat] = to.map(Number);
  const R = 6371;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((fromLat * Math.PI) / 180) *
    Math.cos((toLat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  const distanceKm = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id name role');
    socket.user = user || null;
    return next();
  } catch (err) {
    return next();
  }
});

io.on('connection', (socket) => {
  if (socket.user?._id) {
    const userRoom = `user:${socket.user._id}`;
    socket.join(userRoom);
    if (socket.user.role === 'driver' || socket.user.role === 'both') {
      socket.join(`driver:${socket.user._id}`);
    }
  }

  socket.on('join:chat', async ({ rideId, bookingId }, callback) => {
    try {
      if (!socket.user?._id) {
        callback?.({ ok: false, message: 'Authentication required.' });
        return;
      }

      const referenceId = rideId || bookingId;
      const context = await resolveChatRoomContext(referenceId);
      if (!context.found) {
        callback?.({ ok: false, message: 'Ride chat not available yet.' });
        return;
      }

      const isParticipant = context.participants.includes(String(socket.user._id));
      if (!isParticipant) {
        socket.emit('chat:error', {
          rideId: context.rideId,
          message: 'You are not allowed to join this ride chat.'
        });
        callback?.({ ok: false, message: 'Forbidden.' });
        return;
      }

      socket.join(`chat:${context.rideId}`);
      await createSystemChatMessage(context.rideId, `${socket.user.name || 'A rider'} joined the ride chat`, io);
      callback?.({ ok: true, rideId: context.rideId, isLocked: Boolean(context.room?.isLocked) });
    } catch (error) {
      console.error('join:chat error', error);
      callback?.({ ok: false, message: 'Failed to join chat.' });
    }
  });

  socket.on('leave:chat', async ({ rideId, bookingId }) => {
    const referenceId = rideId || bookingId;
    const context = await resolveChatRoomContext(referenceId);
    if (context.found) {
      socket.leave(`chat:${context.rideId}`);
    }
  });

  socket.on('chat:send', ({ bookingId, content }) => {
    if (!bookingId || !content || !socket.user?._id) return;

    io.to(`chat:${bookingId}`).emit('chat:message', {
      _id: `tmp-${Date.now()}`,
      bookingId,
      content,
      senderId: String(socket.user._id),
      timestamp: new Date().toISOString(),
      status: 'delivered'
    });
  });

  socket.on('join:ride', ({ rideId }) => {
    if (rideId) socket.join(`ride:${rideId}`);
  });

  socket.on('driverLocationUpdate', ({ rideId, latitude, longitude, timestamp }) => {
    if (!rideId || latitude === undefined || longitude === undefined) return;

    const payload = {
      rideId,
      latitude,
      longitude,
      timestamp: timestamp || new Date().toISOString()
    };

    io.to(`ride:${rideId}`).emit('driverLocationUpdate', {
      ...payload
    });

    (async () => {
      try {
        const match = await Match.findOne({
          $or: [{ _id: rideId }, { offerId: rideId }],
          status: { $in: ['matched', 'booked', 'active'] }
        }).lean();

        const routeCoordinates = match?.optimizedRoute?.geometry?.coordinates;
        const distanceFromRoute = calculatePointToRouteDistance(routeCoordinates, [Number(longitude), Number(latitude)]);
        const destinationCoordinates = Array.isArray(routeCoordinates) && routeCoordinates.length
          ? routeCoordinates[routeCoordinates.length - 1]
          : null;
        const etaMinutes = estimateEtaMinutes([Number(longitude), Number(latitude)], destinationCoordinates);
        if (Number.isFinite(etaMinutes) && etaMinutes <= 30) {
          const previousEta = etaAnnouncementCache.get(String(rideId));
          if (previousEta !== etaMinutes) {
            etaAnnouncementCache.set(String(rideId), etaMinutes);
            await createSystemChatMessage(String(rideId), `Driver is ${etaMinutes} mins away`, io);
          }
        }
        if (!Number.isFinite(distanceFromRoute) || distanceFromRoute <= 600) return;

        const alertPayload = {
          rideId,
          distanceFromRouteMeters: Math.round(distanceFromRoute),
          latitude,
          longitude,
          timestamp: payload.timestamp,
          message: 'Driver appears to be off the planned route.'
        };

        io.to(`ride:${rideId}`).emit('routeDeviationAlert', alertPayload);
        if (Array.isArray(match?.riderIds)) {
          match.riderIds.forEach(async (riderId) => {
            io.to(`user:${riderId}`).emit('routeDeviationAlert', alertPayload);
            await createAndEmitNotification({ io }, {
              userId: riderId,
              type: 'safetyAlert',
              title: 'Route deviation detected',
              body: alertPayload.message,
              relatedId: match._id,
              relatedType: 'ride',
              category: 'safety',
              priority: 3,
              isUrgent: true
            });
          });
        }
      } catch (error) {
        console.error('Route deviation detection error:', error);
      }
    })();
  });
});

app.set('io', io);

app.use((req, res, next) => {
  req.io = io;
  next();
});
// Middleware
app.use(express.json());
const allowedOrigins = [
  'https://carp-connect-ride-sharing-plateform.vercel.app',
  'http://localhost:8080',
  'http://localhost:3000'
];
app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);

// Import routes
const authRoutes = require('./routes/Authroutes');
const bookingRoutes = require('./routes/BookingRoutes');
const chatRoutes = require('./routes/ChatRoutes');
const emissionsRoutes = require('./routes/EmissionsRoutes');
const historyRoutes = require('./routes/historyRoutes');
const matchRoutes = require('./routes/MatchRoutes');
const notificationsRoutes = require('./routes/NotificationsRoutes');
const reviewsRoutes = require('./routes/ReviewsRoutes');
const rideOfferRoutes = require('./routes/RideOfferRoutes');
const rideRequestRoutes = require('./routes/RideRequestroutes');
const ridesRoutes = require('./routes/RidesRoutes');
const usersRoutes = require('./routes/UsersRoutes');

// Add routes
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'API is running' });
});
app.use('/api/auth', authRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/emissions', emissionsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/rides/offers', rideOfferRoutes);
app.use('/api/rides/requests', rideRequestRoutes);
app.use('/api/rides', ridesRoutes);
app.use('/api/users', usersRoutes);

// Error handler
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

const PORT = process.env.PORT || 5000;
startRecurringJobs();
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
