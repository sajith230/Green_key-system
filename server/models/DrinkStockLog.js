const mongoose = require('mongoose');

const drinkStockLogSchema = new mongoose.Schema({
  drink: { type: mongoose.Schema.Types.ObjectId, ref: 'Drink', required: true },
  drinkName: { type: String, required: true },
  size: { type: String, enum: ['500ml', '1L', '1.5L'], required: true },
  type: {
    type: String,
    enum: ['stock_in', 'stock_out', 'order_use', 'order_restore'],
    required: true,
  },
  quantity: { type: Number, required: true, min: 1 },
  balanceAfter: { type: Number, required: true, min: 0 },
  note: { type: String, default: '' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'RestaurantOrder' },
  orderNumber: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('DrinkStockLog', drinkStockLogSchema);
