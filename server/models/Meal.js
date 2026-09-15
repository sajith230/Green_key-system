const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  stock500g: { type: Number, min: 0, default: 0 }, // number of 500g portions
}, { timestamps: true });

module.exports = mongoose.model('Meal', mealSchema);
