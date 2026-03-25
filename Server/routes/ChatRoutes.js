const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getChatHistory,
  deleteMessage,
  markMessagesRead
} = require('../controllers/ChatController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, sendMessage);
router.get('/:bookingId', protect, getChatHistory);
router.delete('/:messageId', protect, deleteMessage);
router.post('/:bookingId/read', protect, markMessagesRead);

module.exports = router;
