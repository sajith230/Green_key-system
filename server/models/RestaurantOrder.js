const mongoose = require('mongoose');

const restaurantOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true },
  tableNumber: { type: String, default: '' },
  items: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'card', 'room_charge'], default: 'cash' },
  status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'completed' },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('RestaurantOrder', restaurantOrderSchema);
