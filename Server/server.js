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
const paymentRoutes = require('./routes/PaymentRoutes');
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

  socket.on('join:chat', ({ bookingId }) => {
    if (bookingId) socket.join(`chat:${bookingId}`);
  });

  socket.on('leave:chat', ({ bookingId }) => {
    if (bookingId) socket.leave(`chat:${bookingId}`);
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
// Webhook routes must be mounted before JSON parsing so Stripe signatures can be verified.
app.use('/api/payments', paymentRoutes);

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
