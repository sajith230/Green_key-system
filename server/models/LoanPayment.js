const mongoose = require('mongoose');

const loanPaymentSchema = new mongoose.Schema({
  loan: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeLoan', required: true },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  source: { type: String, enum: ['salary', 'cash'], default: 'salary' },
  note: { type: String, default: '' },
  salaryPaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryPayment' },
  cashierTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierTransaction' },
}, { timestamps: true });

module.exports = mongoose.model('LoanPayment', loanPaymentSchema);
