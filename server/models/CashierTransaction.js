const mongoose = require('mongoose');

const cashierTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['income', 'expense', 'bank_deposit'],
    required: true,
  },
  category: {
    type: String,
    enum: ['room_bill', 'restaurant_bill', 'daily_cost', 'bank_deposit', 'opening_balance', 'salary_advance', 'salary_payment', 'company_loan', 'loan_repayment', 'other_income', 'other_expense', 'madam_cash_in', 'madam_cash_payment', 'madam_cash_return'],
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  reference: { type: String, default: '' },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank'], default: 'cash' },
  date: { type: Date, default: Date.now },
  bankTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('CashierTransaction', cashierTransactionSchema);
