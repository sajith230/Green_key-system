const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['opening_balance', 'deposit', 'check'],
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  customerName: { type: String, default: '' },
  checkNumber: { type: String, default: '' },
  description: { type: String, default: '' },
  cashierTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
