require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Room = require('./models/Room');
const connectDB = require('./config/db');

const HOTEL_ROOMS = [
  { roomNumber: 'VIP 1', type: 'VIP', pricePerNight: 0, status: 'available' },
  { roomNumber: 'VIP 2', type: 'VIP', pricePerNight: 0, status: 'available' },
  { roomNumber: 'Family', type: 'Family', pricePerNight: 0, status: 'available' },
  { roomNumber: 'Room 1', type: 'Standard', pricePerNight: 0, status: 'available' },
  { roomNumber: 'Room 2', type: 'Standard', pricePerNight: 0, status: 'available' },
];

async function seed() {
  await connectDB();

  const existing = await User.findOne({ username: 'admin' });
  if (!existing) {
    await User.create({ username: 'admin', password: 'greenkey123', role: 'admin' });
    console.log('Default admin created: username=admin, password=greenkey123');
  } else {
    console.log('Admin user already exists');
  }

  for (const room of HOTEL_ROOMS) {
    await Room.findOneAndUpdate(
      { roomNumber: room.roomNumber },
      { $set: room },
      { upsert: true, new: true }
    );
  }

  const keepNumbers = HOTEL_ROOMS.map((r) => r.roomNumber);
  const removed = await Room.deleteMany({ roomNumber: { $nin: keepNumbers }, status: 'available' });
  if (removed.deletedCount) console.log(`Removed ${removed.deletedCount} old sample room(s)`);

  console.log('Hotel rooms synced: 2 VIP, 1 Family, 2 Standard');

  console.log('Seed completed!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
