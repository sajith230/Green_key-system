const dns = require('dns');
const mongoose = require('mongoose');

// Avoid intermittent SRV lookup failures on some Windows DNS setups
dns.setDefaultResultOrder('ipv4first');

const connectDB = async (retries = 5, delayMs = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.DATABASE_URL);
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt === retries) {
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

module.exports = connectDB;
