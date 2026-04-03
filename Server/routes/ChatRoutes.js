const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getChatHistory,
  deleteMessage,
  markMessagesRead,
  getChatParticipants,
  getChatSessionInfo
} = require('../controllers/ChatController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, sendMessage);
router.get('/:rideId', protect, getChatHistory);
router.get('/:rideId/participants', protect, getChatParticipants);
router.get('/:rideId/session', protect, getChatSessionInfo);
router.delete('/:messageId', protect, deleteMessage);
router.post('/:rideId/read', protect, markMessagesRead);

module.exports = router;
