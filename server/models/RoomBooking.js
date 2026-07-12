const mongoose = require('mongoose');

const roomBookingSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  guestName: { type: String, required: true },
  guestIdNumber: { type: String, default: '' },
  guestAddress: { type: String, default: '' },
  guestPhone: { type: String, default: '' },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  nights: { type: Number, required: true },
  pricePerNight: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'online', 'card', 'bank'], default: 'cash' },
  bankTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankTransaction' },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('RoomBooking', roomBookingSchema);
