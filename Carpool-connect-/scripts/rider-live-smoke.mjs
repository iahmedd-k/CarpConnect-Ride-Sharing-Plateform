import { io } from 'socket.io-client';

const API = 'http://localhost:5000/api';
const SIO = 'http://localhost:5000';

async function req(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function run() {
  const t = Date.now();
  const driverEmail = `drv_live_${t}@mail.com`;
  const riderEmail = `rdr_live_${t + 1}@mail.com`;

  const driverSignup = await req('POST', '/auth/signup', null, {
    name: 'Live Driver',
    email: driverEmail,
    password: 'password123',
    role: 'driver'
  });

  const riderSignup = await req('POST', '/auth/signup', null, {
    name: 'Live Rider',
    email: riderEmail,
    password: 'password123',
    role: 'rider'
  });

  const driverToken = driverSignup.token;
  const riderToken = riderSignup.token;

  const offerResp = await req('POST', '/rides/offers', driverToken, {
    origin: { address: 'Blue Area, Islamabad' },
    destination: { address: 'Johar Town Lahore' },
    departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    seatsTotal: 2,
    pricePerSeat: 1200
  });

  const offer = offerResp.data.offer;
  const offerId = offer._id;
  const origin = offer.origin?.point?.coordinates || [];
  const destination = offer.destination?.point?.coordinates || [];

  const bookResp = await req('POST', '/rides/book-direct', riderToken, {
    offerId,
    seatsNeeded: 1
  });

  const bookingId = bookResp.data.booking._id;

  await req('PATCH', `/bookings/${bookingId}/status`, driverToken, { status: 'confirmed' });
  await req('POST', `/bookings/${bookingId}/pickup`, driverToken, {});
  await req('POST', `/rides/offers/${offerId}/start`, driverToken, {});

  const riderSock = io(SIO, { auth: { token: riderToken }, transports: ['websocket', 'polling'] });
  const driverSock = io(SIO, { auth: { token: driverToken }, transports: ['websocket', 'polling'] });

  const event = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No driverLocationUpdate received in time')), 10000);

    riderSock.on('connect', () => {
      riderSock.emit('join:ride', { rideId: offerId });
      setTimeout(() => {
        driverSock.emit('driverLocationUpdate', {
          rideId: offerId,
          latitude: 31.5204,
          longitude: 74.3587,
          timestamp: new Date().toISOString()
        });
      }, 700);
    });

    riderSock.on('driverLocationUpdate', (payload) => {
      if (String(payload?.rideId) !== String(offerId)) return;
      clearTimeout(timeout);
      resolve(payload);
    });
  });

  riderSock.disconnect();
  driverSock.disconnect();

  const summary = {
    offerId,
    bookingId,
    originCoords: origin,
    destinationCoords: destination,
    destinationLooksLahore:
      Math.abs((destination[0] || 0) - 74.3587) < 0.8 &&
      Math.abs((destination[1] || 0) - 31.5204) < 0.8,
    bookingFlow: 'booked->confirmed->picked_up->ride_started',
    socketEventReceived: !!event,
    socketRideId: event?.rideId || null,
    socketLat: event?.latitude || null,
    socketLng: event?.longitude || null
  };

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error('SMOKE_FAIL', err.message);
  process.exit(1);
});
