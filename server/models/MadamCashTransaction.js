const mongoose = require('mongoose');

const madamCashTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['fund_in', 'payment', 'return_to_madam'],
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  description: { type: String, default: '' },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  reference: { type: String, default: '' },
  cashierTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('MadamCashTransaction', madamCashTransactionSchema);
