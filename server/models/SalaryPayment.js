const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  basicSalary: { type: Number, required: true },
  totalAdvances: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  bonuses: { type: Number, default: 0 },
  netSalary: { type: Number, required: true },
  paidDate: { type: Date, default: Date.now },
  note: { type: String, default: '' },
}, { timestamps: true });

salaryPaymentSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);
