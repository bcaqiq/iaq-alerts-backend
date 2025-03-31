const mongoose = require('mongoose');

const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true },
  device: { type: String, required: true },
  channelId: { type: String, required: true },
  fieldNum: { type: Number, required: true },
  threshold: { type: Number, required: true }
});

module.exports = mongoose.model('Subscriber', SubscriberSchema);
