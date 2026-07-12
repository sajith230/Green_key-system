const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  position: { type: String, required: true },
  phone: { type: String, default: '' },
  nic: { type: String, default: '' },
  basicSalary: { type: Number, required: true, min: 0 },
  joinDate: { type: Date, default: Date.now },
  probationPeriodMonths: { type: Number, default: 6, min: 1, max: 24 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
