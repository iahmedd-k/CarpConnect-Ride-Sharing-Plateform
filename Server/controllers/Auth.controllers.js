const User = require('../models/User');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const Stripe = require('stripe');
const {
  ensureSubscriptionOnUser,
  fetchUsageCounts,
  buildUsageSummary,
  PLAN_DEFAULTS,
  normalizePlan
} = require('../utils/subscriptionUsage');

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2023-10-16' }) : null;

const PLAN_CATALOG = {
  free: {
    id: 'free',
    label: 'Free',
    monthlyPriceUsd: 0,
    limits: PLAN_DEFAULTS.free.limits
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    monthlyPriceUsd: 7,
    limits: PLAN_DEFAULTS.plus.limits
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    monthlyPriceUsd: 15,
    limits: PLAN_DEFAULTS.pro.limits
  }
};

const STRIPE_PRICE_BY_PLAN = {
  plus: process.env.STRIPE_PRICE_PLUS || '',
  pro: process.env.STRIPE_PRICE_PRO || ''
};
const PLAN_BY_STRIPE_PRICE = Object.entries(STRIPE_PRICE_BY_PLAN).reduce((acc, [plan, priceId]) => {
  if (priceId) acc[priceId] = plan;
  return acc;
}, {});

const resolveDashboardPath = (value, userRole = '') => {
  const requested = String(value || '').trim();
  if (requested === '/dashboard' || requested === '/driver-dashboard') {
    return requested;
  }
  return userRole === 'driver' ? '/driver-dashboard' : '/dashboard';
};

const buildSubscriptionBillingConfig = () => ({
  stripeAvailable: Boolean(stripe),
  devBypassEnabled: isDevBypassEnabled(),
  supportedCheckoutPlans: ['plus', 'pro']
});

const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  vehicle: user.vehicle,
  profilePhoto: user.profilePhoto,
  subscription: user.subscription || {
    plan: 'free',
    status: 'active',
    startsAt: user.createdAt,
    renewsAt: null,
    stripePriceId: '',
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    limits: PLAN_DEFAULTS.free.limits
  },
  preferences: user.preferences,
  twoFactorEnabled: !!user.twoFactorEnabled,
  verified: user.verified,
  ratings: {
    average: Number(user?.ratings?.average || 0),
    count: Number(user?.ratings?.count || 0),
    recent: Array.isArray(user?.ratings?.recent) ? user.ratings.recent : []
  },
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

// @desc    Register a new user
// @route   POST /api/auth/signup
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((error) => error.msg)
    });
  }

  const { name, email, password, phone, role, vehicle } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role,
    vehicle: role === 'driver' ? vehicle : undefined
  });

  if (user) {
    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      data: {
        user: sanitizeUser(user)
      }
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((error) => error.msg)
    });
  }

  const { email, password } = req.body;

  // Check for user email
  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      success: true,
      token: generateToken(user._id),
      data: {
        user: sanitizeUser(user)
      }
    });
  } else {
    res.status(401);
    throw new Error('Invalid credentials');
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const subscription = await ensureSubscriptionOnUser(req.user);
  const usage = await fetchUsageCounts(req.user._id);
  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
      subscription,
      usage: buildUsageSummary(subscription, usage),
      plans: Object.values(PLAN_CATALOG),
      billingConfig: buildSubscriptionBillingConfig()
    }
  });
});

// @desc    Update profile
// @route   PATCH /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'phone', 'vehicle', 'preferences', 'twoFactorEnabled', 'profilePhoto'];

  if (Object.prototype.hasOwnProperty.call(req.body, 'subscription')) {
    return res.status(403).json({
      success: false,
      message: 'Subscription updates are not allowed from profile endpoint. Use subscription checkout APIs.'
    });
  }

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      req.user[field] = req.body[field];
    }
  }

  await ensureSubscriptionOnUser(req.user);

  const updatedUser = await req.user.save();

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(updatedUser)
    }
  });
});

const isDevBypassEnabled = () => {
  const raw = String(process.env.ALLOW_DEV_STRIPE_BYPASS || '').trim().toLowerCase();
  if (!raw) return true;
  return raw !== 'false';
};

// @desc    List available subscription plans
// @route   GET /api/auth/subscription/plans
// @access  Private
const getSubscriptionPlans = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      plans: Object.values(PLAN_CATALOG),
      billingConfig: buildSubscriptionBillingConfig()
    }
  });
});

// @desc    Create Stripe checkout session for subscription
// @route   POST /api/auth/subscription/checkout
// @access  Private
const createSubscriptionCheckout = asyncHandler(async (req, res) => {
  const requestedPlan = normalizePlan(req.body?.plan);
  if (!['plus', 'pro'].includes(requestedPlan)) {
    return res.status(400).json({ success: false, message: 'Only Plus or Pro can be purchased.' });
  }

  if (!stripe) {
    return res.status(500).json({
      success: false,
      message: 'Stripe is not configured on server. Set STRIPE_SECRET_KEY.'
    });
  }

  const priceId = STRIPE_PRICE_BY_PLAN[requestedPlan];

  const frontendUrl = process.env.FRONTEND_URL || req.headers.origin || 'http://localhost:8080';
  const dashboardPath = resolveDashboardPath(req.body?.dashboardPath, req.user?.role);
  const existingCustomerId = String(req.user?.subscription?.stripeCustomerId || '').trim();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: existingCustomerId || undefined,
    customer_email: existingCustomerId ? undefined : req.user.email,
    success_url: `${frontendUrl}${dashboardPath}?tab=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}${dashboardPath}?tab=subscription&checkout=cancelled`,
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            recurring: { interval: 'month' },
            unit_amount: Number(PLAN_CATALOG[requestedPlan]?.monthlyPriceUsd || 0) * 100,
            product_data: {
              name: `CarpConnect ${PLAN_CATALOG[requestedPlan]?.label || requestedPlan}`
            }
          },
          quantity: 1
        }],
    metadata: {
      userId: String(req.user._id),
      plan: requestedPlan,
      dashboardPath
    },
    allow_promotion_codes: true
  });

  res.status(200).json({
    success: true,
    data: {
      sessionId: session.id,
      url: session.url,
      dashboardPath
    }
  });
});

// @desc    Sync subscription from Stripe checkout session
// @route   POST /api/auth/subscription/sync
// @access  Private
const syncSubscriptionFromStripe = asyncHandler(async (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim();
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'sessionId is required.' });
  }

  if (!stripe) {
    return res.status(500).json({
      success: false,
      message: 'Stripe is not configured on server. Set STRIPE_SECRET_KEY.'
    });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription']
  });

  const sessionUserId = String(session?.metadata?.userId || '');
  if (sessionUserId && sessionUserId !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Session does not belong to current user.' });
  }

  if (session.mode !== 'subscription' || session.payment_status !== 'paid') {
    return res.status(400).json({
      success: false,
      message: 'Subscription checkout is not paid yet.'
    });
  }

  const stripeSubscription = session.subscription;
  const stripePriceId = stripeSubscription?.items?.data?.[0]?.price?.id || '';
  const plan = normalizePlan(session?.metadata?.plan || PLAN_BY_STRIPE_PRICE[stripePriceId]);
  if (!plan) {
    return res.status(400).json({
      success: false,
      message: 'Stripe checkout session does not map to a supported plan price.'
    });
  }
  const defaultPlan = PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.free;

  req.user.subscription = {
    plan,
    status: 'active',
    startsAt: req.user?.subscription?.startsAt || req.user.createdAt || new Date(),
    renewsAt: stripeSubscription?.current_period_end
      ? new Date(Number(stripeSubscription.current_period_end) * 1000)
      : null,
    stripePriceId,
    stripeCustomerId: String(session.customer || ''),
    stripeSubscriptionId: String(stripeSubscription?.id || ''),
    limits: {
      monthlyRideRequests: Number(defaultPlan.limits.monthlyRideRequests),
      monthlyBookings: Number(defaultPlan.limits.monthlyBookings),
      monthlyRideOffers: Number(defaultPlan.limits.monthlyRideOffers)
    }
  };

  await req.user.save();
  await ensureSubscriptionOnUser(req.user);
  const usage = await fetchUsageCounts(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
      subscription: req.user.subscription,
      usage: buildUsageSummary(req.user.subscription, usage),
      billingConfig: buildSubscriptionBillingConfig()
    }
  });
});

// @desc    Cancel paid plan and move to free
// @route   POST /api/auth/subscription/cancel
// @access  Private
const cancelSubscription = asyncHandler(async (req, res) => {
  if (stripe && req.user?.subscription?.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(req.user.subscription.stripeSubscriptionId);
    } catch (error) {
      console.error('Stripe cancel failed:', error.message);
    }
  }

  req.user.subscription = {
    plan: 'free',
    status: 'active',
    startsAt: req.user?.subscription?.startsAt || req.user.createdAt || new Date(),
    renewsAt: null,
    stripePriceId: '',
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    limits: {
      monthlyRideRequests: Number(PLAN_DEFAULTS.free.limits.monthlyRideRequests),
      monthlyBookings: Number(PLAN_DEFAULTS.free.limits.monthlyBookings),
      monthlyRideOffers: Number(PLAN_DEFAULTS.free.limits.monthlyRideOffers)
    }
  };

  await req.user.save();
  await ensureSubscriptionOnUser(req.user);
  const usage = await fetchUsageCounts(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
      subscription: req.user.subscription,
      usage: buildUsageSummary(req.user.subscription, usage),
      message: 'Subscription changed to Free plan.',
      billingConfig: buildSubscriptionBillingConfig()
    }
  });
});

// @desc    Dev-only upgrade without Stripe payment (local/testing)
// @route   POST /api/auth/subscription/dev-upgrade
// @access  Private
const devUpgradeSubscription = asyncHandler(async (req, res) => {
  if (!isDevBypassEnabled()) {
    return res.status(403).json({
      success: false,
      message: 'Dev subscription bypass is disabled.'
    });
  }

  const requestedPlan = normalizePlan(req.body?.plan || 'pro');
  if (!['plus', 'pro'].includes(requestedPlan)) {
    return res.status(400).json({
      success: false,
      message: 'Only Plus or Pro can be selected.'
    });
  }

  const defaultPlan = PLAN_DEFAULTS[requestedPlan] || PLAN_DEFAULTS.free;
  req.user.subscription = {
    plan: requestedPlan,
    status: 'active',
    startsAt: req.user?.subscription?.startsAt || req.user.createdAt || new Date(),
    renewsAt: null,
    stripePriceId: `dev_bypass_${requestedPlan}`,
    stripeCustomerId: `dev_customer_${String(req.user._id)}`,
    stripeSubscriptionId: `dev_sub_${requestedPlan}_${Date.now()}`,
    limits: {
      monthlyRideRequests: Number(defaultPlan.limits.monthlyRideRequests),
      monthlyBookings: Number(defaultPlan.limits.monthlyBookings),
      monthlyRideOffers: Number(defaultPlan.limits.monthlyRideOffers)
    }
  };

  await req.user.save();
  await ensureSubscriptionOnUser(req.user);
  const usage = await fetchUsageCounts(req.user._id);

  res.status(200).json({
    success: true,
    data: {
      user: sanitizeUser(req.user),
      subscription: req.user.subscription,
      usage: buildUsageSummary(req.user.subscription, usage),
      message: `Dev upgrade applied: ${requestedPlan.toUpperCase()}`,
      billingConfig: buildSubscriptionBillingConfig()
    }
  });
});

// @desc    Change password
// @route   PATCH /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const ok = await user.matchPassword(currentPassword);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    token: generateToken(user._id),
    data: {
      user: sanitizeUser(user)
    }
  });
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  changePassword,
  getSubscriptionPlans,
  createSubscriptionCheckout,
  syncSubscriptionFromStripe,
  cancelSubscription,
  devUpgradeSubscription
};
