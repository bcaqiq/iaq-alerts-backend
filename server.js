require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');

const Subscriber = require('./models/Subscriber');
const { fetchLatestAQI } = require('./services/thingspeak');

const app = express();
const port = process.env.PORT || 3000;

// Allow Netlify frontend & local dev
const allowedOrigins = ['https://bcaqiq.netlify.app', 'http://localhost:3000'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// Middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static('public')); // if needed

// Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Subscribe Route
app.post('/signup', [
  body('email').isEmail(),
  body('device').notEmpty(),
  body('threshold').isNumeric(),
  body('channelId').notEmpty(),
  body('fieldNum').isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { email, device, threshold, channelId, fieldNum } = req.body;

  try {
    const sub = new Subscriber({ email, device, threshold, channelId, fieldNum });
    await sub.save();
    res.json({ message: '✅ Subscribed!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// AQI Monitoring Loop
setInterval(async () => {
  const subs = await Subscriber.find();
  const now = new Date();

  for (const sub of subs) {
    const aqi = await fetchLatestAQI(sub.channelId, sub.fieldNum);
    if (typeof aqi !== 'number') continue;

    const isAbove = aqi > sub.threshold;
    const wasAbove = sub.lastAQIStatus === 'above';

    // If AQI crosses from below to above threshold
    if (isAbove && !wasAbove) {
      const msg = `⚠️ Air Quality Alert for ${sub.device}:\nAQI = ${aqi}, which exceeds your threshold of ${sub.threshold}.\n\nTo unsubscribe, visit: https://bcaqiq.netlify.app`;

      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: sub.email,
        subject: `AQI Alert for ${sub.device}`,
        text: msg
      }, async (err, info) => {
        if (err) {
          console.error(`❌ Email error: ${err}`);
        } else {
          console.log(`📧 Alert sent to ${sub.email}`);
          sub.lastAlertSentAt = now;
          sub.lastAQIStatus = 'above';
          await sub.save();
        }
      });
    }

    // Reset if AQI has dropped below threshold again
    else if (!isAbove && wasAbove) {
      sub.lastAQIStatus = 'below';
      await sub.save();
      console.log(`🔄 AQI back below threshold for ${sub.email}, ready for future alerts.`);
    }
  }
}, 60000); // check every 60 seconds

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
