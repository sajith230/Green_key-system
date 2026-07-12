const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true, unique: true },
  type: { type: String, enum: ['VIP', 'Family', 'Standard'], default: 'Standard' },
  pricePerNight: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['available', 'occupied', 'maintenance'], default: 'available' },
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);
