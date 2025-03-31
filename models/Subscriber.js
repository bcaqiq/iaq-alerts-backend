const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  email: String,
  device: String,
  threshold: Number,
  channelId: String,
  fieldNum: Number,
  lastAlertSentAt: Date,
  lastAQIStatus: {
    type: String,
    enum: ['above', 'below'],
    default: 'below'
  }
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
