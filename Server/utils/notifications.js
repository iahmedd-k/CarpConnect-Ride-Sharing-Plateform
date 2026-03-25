const Notification = require('../models/Notification');

const resolveIo = (context) => context?.io || context?.app?.get?.('io') || null;

const createAndEmitNotification = async (context, {
  userId,
  type,
  title,
  body = '',
  relatedId = null,
  relatedType = null,
  category = 'communication',
  priority = 1,
  isUrgent = false
}) => {
  if (!userId || !type || !title) return null;
  const io = resolveIo(context);

  const notification = await Notification.create({
    userId,
    type,
    title,
    body,
    relatedId,
    relatedType,
    category,
    priority,
    isUrgent
  });

  io?.to(`user:${userId}`).emit('newNotification', notification);
  io?.to(`user:${userId}`).emit('notification', notification);
  return notification;
};

module.exports = {
  createAndEmitNotification,
  resolveIo
};
