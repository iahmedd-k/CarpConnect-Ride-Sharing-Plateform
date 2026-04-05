const RideOffer = require('../models/RideOffer');
const RideRequest = require('../models/RideRequest');
const {
  shouldOccurOnDate,
  buildOccurrenceDate
} = require('./recurring');
const RECURRING_SYNC_LABEL = 'Recurring scheduler synced successfully';

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const materializeOfferOccurrence = async (template, targetDate) => {
  if (!template?.isRecurring || template.recurringParentId) return null;
  if (!shouldOccurOnDate(template, targetDate)) return null;

  const departureTime = buildOccurrenceDate(template.departureTime, targetDate);
  const existing = await RideOffer.findOne({
    recurringParentId: template._id,
    departureTime
  }).lean();
  if (existing) return existing;

  return RideOffer.create({
    driverId: template.driverId,
    origin: template.origin,
    originAddress: template.originAddress,
    destination: template.destination,
    destinationAddress: template.destinationAddress,
    routeGeoJson: template.routeGeoJson,
    departureTime,
    seatsAvailable: template.seatsTotal || template.seatsAvailable,
    seatsTotal: template.seatsTotal || template.seatsAvailable,
    pricePerSeat: template.pricePerSeat,
    currency: template.currency || 'PKR',
    preferences: template.preferences,
    isRecurring: true,
    recurrencePattern: template.recurrencePattern,
    recurrenceDays: template.recurrenceDays || [],
    recurringParentId: template._id,
    status: 'open'
  });
};

const materializeRequestOccurrence = async (template, targetDate) => {
  if (!template?.isRecurring || template.recurringParentId) return null;
  if (!shouldOccurOnDate(template, targetDate)) return null;

  const earliestDeparture = buildOccurrenceDate(template.earliestDeparture, targetDate);
  const latestDeparture = buildOccurrenceDate(template.latestDeparture, targetDate);
  const existing = await RideRequest.findOne({
    recurringParentId: template._id,
    earliestDeparture,
    latestDeparture
  }).lean();
  if (existing) return existing;

  return RideRequest.create({
    riderId: template.riderId,
    origin: template.origin,
    destination: template.destination,
    originAddress: template.originAddress,
    destinationAddress: template.destinationAddress,
    earliestDeparture,
    latestDeparture,
    groupSize: template.groupSize,
    maxPricePerSeat: template.maxPricePerSeat,
    currency: template.currency || 'PKR',
    notes: template.notes || '',
    isRecurring: true,
    recurrencePattern: template.recurrencePattern,
    recurrenceDays: template.recurrenceDays || [],
    recurringParentId: template._id,
    status: 'open'
  });
};

const runRecurringMaterialization = async ({ daysAhead = 2 } = {}) => {
  const [offerTemplates, requestTemplates] = await Promise.all([
    RideOffer.find({ isRecurring: true, recurringParentId: null }).lean(),
    RideRequest.find({ isRecurring: true, recurringParentId: null }).lean()
  ]);

  let createdOffers = 0;
  let createdRequests = 0;

  for (let offset = 1; offset <= daysAhead; offset += 1) {
    const targetDate = startOfDay(addDays(new Date(), offset));

    for (const template of offerTemplates) {
      const created = await materializeOfferOccurrence(template, targetDate);
      if (created) createdOffers += 1;
    }

    for (const template of requestTemplates) {
      const created = await materializeRequestOccurrence(template, targetDate);
      if (created) createdRequests += 1;
    }
  }

  return { createdOffers, createdRequests };
};

const startRecurringJobs = () => {
  const run = async () => {
    try {
      const result = await runRecurringMaterialization({ daysAhead: 2 });
      if (result.createdOffers || result.createdRequests) {
        console.log(
          `${RECURRING_SYNC_LABEL}: created ${result.createdOffers} future offer(s) and ${result.createdRequests} future request(s).`
        );
      }
    } catch (error) {
      console.error('Recurring materialization failed:', error);
    }
  };

  run();
  return setInterval(run, 60 * 60 * 1000);
};

module.exports = {
  materializeOfferOccurrence,
  materializeRequestOccurrence,
  runRecurringMaterialization,
  startRecurringJobs
};
