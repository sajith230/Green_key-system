const mongoose = require('mongoose');

const kotOrderSchema = new mongoose.Schema({
  kotNumber: { type: String, required: true },
  tableNumber: { type: String, default: '' },
  items: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    note: { type: String, default: '' },
  }],
  status: { type: String, enum: ['pending', 'preparing', 'served', 'cancelled'], default: 'pending' },
  date: { type: Date, required: true },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('KotOrder', kotOrderSchema);
