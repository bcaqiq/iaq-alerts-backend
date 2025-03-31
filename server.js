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
const allowedOrigins = ['https://bcaqiq.netlify.app', 'http://localhost:3000'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
<<<<<<< HEAD
}));
=======
}));  
>>>>>>> af31c2a2e60fc2b8e643299934a4aa58cd2641a5
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB error:", err));

// Middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve website

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Sign-up Route
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
    res.json({ message: '✅ Subscribed for AQI alerts!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check AQI Every Minute
setInterval(async () => {
  const subs = await Subscriber.find();
  const alertsSent = new Set();

  for (const sub of subs) {
    const aqi = await fetchLatestAQI(sub.channelId, sub.fieldNum);
    if (aqi && aqi > sub.threshold && !alertsSent.has(sub.email)) {
      const msg = `⚠️ Air Quality Alert for ${sub.device}:\nAQI = ${aqi} (Threshold = ${sub.threshold})`;

      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: sub.email,
        subject: `AQI Alert for ${sub.device}`,
        text: msg
      }, (err, info) => {
        if (err) console.error(`Email error: ${err}`);
        else console.log(`📧 Sent alert to ${sub.email}`);
      });

      alertsSent.add(sub.email);
    }
  }
}, 60000); // 1 minute

app.listen(port, () => {
  console.log(`🚀 Server running: http://localhost:${port}`);
});
