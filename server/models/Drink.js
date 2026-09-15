const mongoose = require('mongoose');

const drinkSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  stock500ml: { type: Number, min: 0 },
  stock1L: { type: Number, min: 0 },
  stock15L: { type: Number, min: 0 }, // 1.5L
}, { timestamps: true });

module.exports = mongoose.model('Drink', drinkSchema);
