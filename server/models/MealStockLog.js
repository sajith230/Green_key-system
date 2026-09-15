const mongoose = require('mongoose');

const mealStockLogSchema = new mongoose.Schema({
  meal: { type: mongoose.Schema.Types.ObjectId, ref: 'Meal', required: true },
  mealName: { type: String, required: true },
  portion: { type: String, enum: ['500g'], default: '500g', required: true },
  type: {
    type: String,
    enum: ['stock_in', 'stock_out', 'made'],
    required: true,
  },
  quantity: { type: Number, required: true, min: 1 },
  balanceAfter: { type: Number, required: true, min: 0 },
  note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('MealStockLog', mealStockLogSchema);
