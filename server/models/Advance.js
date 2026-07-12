const mongoose = require('mongoose');

const advanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  paidBy: { type: String, enum: ['cashier', 'owner', 'petty_cash'], default: 'cashier' },
  cashierTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierTransaction' },
  pettyCashTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('Advance', advanceSchema);
