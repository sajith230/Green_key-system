const EmployeeLoan = require('../models/EmployeeLoan');
const LoanPayment = require('../models/LoanPayment');
const CashierTransaction = require('../models/CashierTransaction');
const PettyCashTransaction = require('../models/PettyCashTransaction');

async function getEmployeeLoanSummary(employeeId) {
  const loans = await EmployeeLoan.find({
    employee: employeeId,
    status: 'active',
    remainingBalance: { $gt: 0 },
  }).sort({ date: 1 });

  const totalRemaining = loans.reduce((sum, l) => sum + l.remainingBalance, 0);
  return { loans, totalRemaining };
}

async function applyLoanPayment({ loan, amount, employeeId, month, year, source, note, salaryPaymentId, date }) {
  const payAmount = Number(amount);
  if (payAmount <= 0) throw new Error('Loan payment must be greater than 0');
  if (payAmount > loan.remainingBalance) {
    throw new Error(`Payment exceeds remaining loan balance. Remaining: Rs. ${loan.remainingBalance.toLocaleString()}`);
  }

  loan.remainingBalance = Math.round((loan.remainingBalance - payAmount) * 100) / 100;
  if (loan.remainingBalance <= 0) {
    loan.remainingBalance = 0;
    loan.status = 'paid';
  }
  await loan.save();

  const payment = await LoanPayment.create({
    loan: loan._id,
    employee: employeeId,
    amount: payAmount,
    date: date || new Date(),
    month: Number(month),
    year: Number(year),
    source,
    note: note || '',
    salaryPaymentId: salaryPaymentId || undefined,
  });

  return { loan, payment };
}

async function reverseLoanPaymentsForSalary(salaryPaymentId) {
  const payments = await LoanPayment.find({ salaryPaymentId });
  for (const payment of payments) {
    const loan = await EmployeeLoan.findById(payment.loan);
    if (loan) {
      loan.remainingBalance = Math.round((loan.remainingBalance + payment.amount) * 100) / 100;
      if (loan.remainingBalance > 0) loan.status = 'active';
      if (loan.remainingBalance > loan.amount) loan.remainingBalance = loan.amount;
      await loan.save();
    }
    if (payment.cashierTransactionId) {
      await CashierTransaction.findByIdAndDelete(payment.cashierTransactionId);
    }
    await LoanPayment.findByIdAndDelete(payment._id);
  }
  return payments.length;
}

async function removeLinkedLoanDisbursement(loan) {
  if (loan.cashierTransactionId) {
    await CashierTransaction.findByIdAndDelete(loan.cashierTransactionId);
    loan.cashierTransactionId = undefined;
  }
  if (loan.pettyCashTransactionId) {
    await PettyCashTransaction.findByIdAndDelete(loan.pettyCashTransactionId);
    loan.pettyCashTransactionId = undefined;
  }
}

module.exports = {
  getEmployeeLoanSummary,
  applyLoanPayment,
  reverseLoanPaymentsForSalary,
  removeLinkedLoanDisbursement,
};
