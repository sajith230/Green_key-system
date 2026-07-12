const mongoose = require('mongoose');

const pettyCashTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['fund_in', 'return_to_owner', 'expense', 'salary_advance'],
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  description: { type: String, default: '' },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  reference: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PettyCashTransaction', pettyCashTransactionSchema);
