const RideRequest = require('../models/RideRequest');
const RideOffer = require('../models/RideOffer');
const Booking = require('../models/Booking');

const PLAN_DEFAULTS = {
  free: {
    limits: {
      monthlyRideRequests: 25,
      monthlyBookings: 8,
      monthlyRideOffers: 8
    }
  },
  plus: {
    limits: {
      monthlyRideRequests: 140,
      monthlyBookings: 90,
      monthlyRideOffers: 40
    }
  },
  pro: {
    limits: {
      monthlyRideRequests: 350,
      monthlyBookings: 250,
      monthlyRideOffers: 180
    }
  }
};

const ACTION_TO_LIMIT_KEY = {
  create_request: 'monthlyRideRequests',
  create_booking: 'monthlyBookings',
  create_offer: 'monthlyRideOffers'
};

const monthKeyFor = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const monthStartUtc = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

const monthEndUtc = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const normalizePlan = (value) => {
  const plan = String(value || 'free').toLowerCase();
  if (plan === 'basic') return 'plus';
  return PLAN_DEFAULTS[plan] ? plan : 'free';
};

const ensureSubscriptionOnUser = async (userDoc) => {
  const plan = normalizePlan(userDoc?.subscription?.plan);
  const defaults = deepClone(PLAN_DEFAULTS[plan]);
  const current = userDoc?.subscription || {};
  const existingLimits = current?.limits || {};
  const resolvedLimits = {
    monthlyRideRequests: Number(existingLimits.monthlyRideRequests ?? defaults.limits.monthlyRideRequests),
    monthlyBookings: Number(existingLimits.monthlyBookings ?? defaults.limits.monthlyBookings),
    monthlyRideOffers: Number(existingLimits.monthlyRideOffers ?? defaults.limits.monthlyRideOffers)
  };

  const normalizedSubscription = {
    plan,
    status: current.status || 'active',
    startsAt: current.startsAt || userDoc?.createdAt || new Date(),
    renewsAt: current.renewsAt || null,
    stripePriceId: current.stripePriceId || '',
    stripeCustomerId: current.stripeCustomerId || '',
    stripeSubscriptionId: current.stripeSubscriptionId || '',
    limits: resolvedLimits
  };

  const changed =
    !userDoc.subscription ||
    userDoc.subscription.plan !== normalizedSubscription.plan ||
    userDoc.subscription.status !== normalizedSubscription.status ||
    String(userDoc.subscription?.stripePriceId || '') !== normalizedSubscription.stripePriceId ||
    String(userDoc.subscription?.stripeCustomerId || '') !== normalizedSubscription.stripeCustomerId ||
    String(userDoc.subscription?.stripeSubscriptionId || '') !== normalizedSubscription.stripeSubscriptionId ||
    Number(userDoc.subscription?.limits?.monthlyRideRequests) !== normalizedSubscription.limits.monthlyRideRequests ||
    Number(userDoc.subscription?.limits?.monthlyBookings) !== normalizedSubscription.limits.monthlyBookings ||
    Number(userDoc.subscription?.limits?.monthlyRideOffers) !== normalizedSubscription.limits.monthlyRideOffers;

  if (changed) {
    userDoc.subscription = normalizedSubscription;
    await userDoc.updateOne({ $set: { subscription: normalizedSubscription } });
  }

  return normalizedSubscription;
};

const fetchUsageCounts = async (userId, date = new Date()) => {
  const from = monthStartUtc(date);
  const to = monthEndUtc(date);

  const [requestCount, bookingCount, offerCount] = await Promise.all([
    RideRequest.countDocuments({
      riderId: userId,
      createdAt: { $gte: from, $lt: to },
      status: { $ne: 'cancelled' }
    }),
    Booking.countDocuments({
      userId,
      createdAt: { $gte: from, $lt: to },
      status: { $ne: 'cancelled' }
    }),
    RideOffer.countDocuments({
      driverId: userId,
      createdAt: { $gte: from, $lt: to },
      status: { $ne: 'cancelled' }
    })
  ]);

  return {
    monthKey: monthKeyFor(date),
    monthlyRideRequestsUsed: Number(requestCount || 0),
    monthlyBookingsUsed: Number(bookingCount || 0),
    monthlyRideOffersUsed: Number(offerCount || 0)
  };
};

const buildUsageSummary = (subscription, usage) => ({
  monthKey: usage.monthKey,
  rideRequestsUsed: usage.monthlyRideRequestsUsed,
  rideRequestsLimit: Number(subscription?.limits?.monthlyRideRequests || 0),
  rideRequestsRemaining: Math.max(0, Number(subscription?.limits?.monthlyRideRequests || 0) - usage.monthlyRideRequestsUsed),
  bookingsUsed: usage.monthlyBookingsUsed,
  bookingsLimit: Number(subscription?.limits?.monthlyBookings || 0),
  bookingsRemaining: Math.max(0, Number(subscription?.limits?.monthlyBookings || 0) - usage.monthlyBookingsUsed),
  rideOffersUsed: usage.monthlyRideOffersUsed,
  rideOffersLimit: Number(subscription?.limits?.monthlyRideOffers || 0),
  rideOffersRemaining: Math.max(0, Number(subscription?.limits?.monthlyRideOffers || 0) - usage.monthlyRideOffersUsed)
});

const assertUsageAllowed = ({ subscription, usage, action }) => {
  const limitKey = ACTION_TO_LIMIT_KEY[action];
  if (!limitKey) return { allowed: true };

  const limit = Number(subscription?.limits?.[limitKey] || 0);
  const used =
    action === 'create_request'
      ? usage.monthlyRideRequestsUsed
      : action === 'create_booking'
        ? usage.monthlyBookingsUsed
        : usage.monthlyRideOffersUsed;

  if (used >= limit) {
    return {
      allowed: false,
      statusCode: 403,
      message: `Monthly ${limitKey} limit reached for your ${subscription.plan} plan`,
      usageSummary: buildUsageSummary(subscription, usage)
    };
  }

  return { allowed: true };
};

module.exports = {
  PLAN_DEFAULTS,
  normalizePlan,
  ensureSubscriptionOnUser,
  fetchUsageCounts,
  buildUsageSummary,
  assertUsageAllowed
};
