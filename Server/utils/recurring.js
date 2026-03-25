const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const normalizeRecurringConfig = (pattern, days = []) => {
  const raw = String(pattern || '').trim().toLowerCase();
  const normalizedDays = Array.isArray(days)
    ? days
        .map((day) => String(day || '').trim().slice(0, 3).toLowerCase())
        .filter((day) => WEEKDAYS.includes(day))
    : [];

  if (normalizedDays.length > 0) {
    return {
      recurrencePattern: 'custom',
      recurrenceDays: [...new Set(normalizedDays)]
    };
  }

  if (raw.includes('mon') || raw.includes('fri') || raw.includes('weekday')) {
    return {
      recurrencePattern: 'weekdays',
      recurrenceDays: ['mon', 'tue', 'wed', 'thu', 'fri']
    };
  }

  if (raw.includes('weekend')) {
    return {
      recurrencePattern: 'weekends',
      recurrenceDays: ['sat', 'sun']
    };
  }

  if (WEEKDAYS.includes(raw.slice(0, 3))) {
    return {
      recurrencePattern: 'custom',
      recurrenceDays: [raw.slice(0, 3)]
    };
  }

  if (['daily', 'weekly', 'biweekly', 'monthly'].includes(raw)) {
    return {
      recurrencePattern: raw,
      recurrenceDays: []
    };
  }

  return {
    recurrencePattern: raw || 'daily',
    recurrenceDays: []
  };
};

const getWeekdayCode = (date) => WEEKDAYS[new Date(date).getDay()];

const shouldOccurOnDate = (template, date) => {
  if (!template?.isRecurring) return false;
  const target = new Date(date);
  const base = new Date(template.departureTime || template.earliestDeparture);
  const pattern = String(template.recurrencePattern || 'daily').toLowerCase();
  const days = Array.isArray(template.recurrenceDays) ? template.recurrenceDays : [];

  if (pattern === 'daily') return true;
  if (pattern === 'weekdays') return ['mon', 'tue', 'wed', 'thu', 'fri'].includes(getWeekdayCode(target));
  if (pattern === 'weekends') return ['sat', 'sun'].includes(getWeekdayCode(target));
  if (pattern === 'custom') return days.includes(getWeekdayCode(target));
  if (pattern === 'weekly') return getWeekdayCode(target) === getWeekdayCode(base);
  if (pattern === 'biweekly') {
    const diffDays = Math.floor((target.setHours(0, 0, 0, 0) - new Date(base).setHours(0, 0, 0, 0)) / 86400000);
    return diffDays >= 0 && diffDays % 14 === 0;
  }
  if (pattern === 'monthly') return target.getDate() === base.getDate();

  return false;
};

const buildOccurrenceDate = (sourceDate, targetDate) => {
  const source = new Date(sourceDate);
  const target = new Date(targetDate);
  target.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), source.getMilliseconds());
  return target;
};

module.exports = {
  normalizeRecurringConfig,
  shouldOccurOnDate,
  buildOccurrenceDate
};
