const mongoose = require('mongoose');

const pendingBillSchema = new mongoose.Schema({
  billType: {
    type: String,
    enum: ['room', 'restaurant', 'other'],
    required: true,
  },
  customerName: { type: String, default: '' },
  description: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, required: true },
  reference: { type: String, default: '' },
  note: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'collected', 'cancelled'],
    default: 'pending',
  },
  collectedAt: { type: Date },
  cashierTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('PendingBill', pendingBillSchema);
