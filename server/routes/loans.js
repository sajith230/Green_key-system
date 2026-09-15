const express = require('express');
const Employee = require('../models/Employee');
const EmployeeLoan = require('../models/EmployeeLoan');
const LoanPayment = require('../models/LoanPayment');
const CashierTransaction = require('../models/CashierTransaction');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const auth = require('../middleware/auth');
const { computeBalance, getMonthYearFromDate } = require('../utils/pettyCashBalance');
const { normalizeTransactionDateTime } = require('../utils/cashierBalance');
const {
  getEmployeeLoanSummary,
  applyLoanPayment,
  removeLinkedLoanDisbursement,
} = require('../utils/loanBalance');

const router = express.Router();

function normalizePaidBy(paidBy) {
  if (paidBy === 'owner') return 'owner';
  if (paidBy === 'petty_cash') return 'petty_cash';
  return 'cashier';
}

async function getPettyCashAvailableBalance() {
  const transactions = await PettyCashTransaction.find();
  return computeBalance(transactions);
}

router.get('/', auth, async (req, res) => {
  try {
    const { employeeId, status } = req.query;
    const filter = {};
    if (employeeId) filter.employee = employeeId;
    if (status === 'active' || status === 'paid') filter.status = status;

    const loans = await EmployeeLoan.find(filter)
      .populate('employee', 'name position basicSalary phone nic')
      .sort({ date: -1 });

    const loanIds = loans.map((l) => l._id);
    const payments = await LoanPayment.find({ loan: { $in: loanIds } }).sort({ date: -1 });

    const rows = loans.map((loan) => {
      const loanPayments = payments.filter((p) => p.loan.toString() === loan._id.toString());
      const totalPaid = loanPayments.reduce((sum, p) => sum + p.amount, 0);
      return {
        ...loan.toObject(),
        totalPaid,
        paymentCount: loanPayments.length,
        payments: loanPayments,
      };
    });

    const activeLoans = rows.filter((l) => l.status === 'active' && l.remainingBalance > 0);
    res.json({
      loans: rows,
      totals: {
        totalLoaned: rows.reduce((s, l) => s + l.amount, 0),
        totalRemaining: activeLoans.reduce((s, l) => s + l.remainingBalance, 0),
        totalRepaid: rows.reduce((s, l) => s + (l.amount - l.remainingBalance), 0),
        activeCount: activeLoans.length,
        employeeCount: new Set(activeLoans.map((l) => (l.employee?._id || l.employee).toString())).size,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/employee/:employeeId', auth, async (req, res) => {
  try {
    const summary = await getEmployeeLoanSummary(req.params.employeeId);
    const employee = await Employee.findById(req.params.employeeId).select('name position basicSalary');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json({ employee, ...summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { employee: employeeId, amount, note, date, paidBy } = req.body;
    const loanAmount = Number(amount);
    const payer = normalizePaidBy(paidBy);

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (loanAmount <= 0) return res.status(400).json({ message: 'Loan amount must be greater than 0' });

    if (payer === 'petty_cash') {
      const available = await getPettyCashAvailableBalance();
      if (loanAmount > available) {
        return res.status(400).json({
          message: `Insufficient petty cash. Available: Rs. ${available.toLocaleString()}`,
        });
      }
    }

    const loanDate = normalizeTransactionDateTime(date || new Date());

    const loan = await EmployeeLoan.create({
      employee: employeeId,
      amount: loanAmount,
      remainingBalance: loanAmount,
      note: note || '',
      date: loanDate,
      paidBy: payer,
      status: 'active',
    });

    if (payer === 'cashier') {
      const cashierTx = await CashierTransaction.create({
        type: 'expense',
        category: 'company_loan',
        amount: loanAmount,
        description: `Company loan — ${employee.name}`,
        reference: loan._id.toString(),
        paymentMethod: 'cash',
        date: loanDate,
      });
      loan.cashierTransactionId = cashierTx._id;
      await loan.save();
    } else if (payer === 'petty_cash') {
      const { month, year } = getMonthYearFromDate(loanDate);
      const pettyTx = await PettyCashTransaction.create({
        type: 'expense',
        amount: loanAmount,
        date: loanDate,
        month,
        year,
        description: `Company loan — ${employee.name}`,
        reference: loan._id.toString(),
      });
      loan.pettyCashTransactionId = pettyTx._id;
      await loan.save();
    }

    const populated = await loan.populate('employee', 'name position basicSalary phone nic');
    res.status(201).json({
      loan: populated,
      cashierDeducted: payer === 'cashier' ? loanAmount : 0,
      pettyCashDeducted: payer === 'petty_cash' ? loanAmount : 0,
      paidBy: payer,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/repay', auth, async (req, res) => {
  try {
    const { amount, note, date, month, year } = req.body;
    const loan = await EmployeeLoan.findById(req.params.id).populate('employee', 'name');
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status === 'paid' || loan.remainingBalance <= 0) {
      return res.status(400).json({ message: 'Loan is already fully paid' });
    }

    const payDate = normalizeTransactionDateTime(date || new Date());
    const m = Number(month) || (payDate.getMonth() + 1);
    const y = Number(year) || payDate.getFullYear();
    const payAmount = Number(amount);

    const { loan: updatedLoan, payment } = await applyLoanPayment({
      loan,
      amount: payAmount,
      employeeId: loan.employee._id || loan.employee,
      month: m,
      year: y,
      source: 'cash',
      note: note || 'Cash repayment',
      date: payDate,
    });

    const cashierTx = await CashierTransaction.create({
      type: 'income',
      category: 'loan_repayment',
      amount: payAmount,
      description: `Loan repayment — ${loan.employee.name}`,
      reference: payment._id.toString(),
      paymentMethod: 'cash',
      date: payDate,
    });
    payment.cashierTransactionId = cashierTx._id;
    await payment.save();

    res.status(201).json({
      loan: updatedLoan,
      payment,
      remainingBalance: updatedLoan.remainingBalance,
      cashierAdded: payAmount,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const loan = await EmployeeLoan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    const payments = await LoanPayment.find({ loan: loan._id });
    if (payments.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete loan with repayments. Reverse salary payments or cash repayments first.',
      });
    }

    await removeLinkedLoanDisbursement(loan);
    await EmployeeLoan.findByIdAndDelete(loan._id);
    res.json({ message: 'Loan deleted and linked cash entries removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/payments/:paymentId', auth, async (req, res) => {
  try {
    const payment = await LoanPayment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Loan payment not found' });
    if (payment.source === 'salary') {
      return res.status(400).json({
        message: 'Salary loan deductions must be reversed by deleting the salary payment',
      });
    }

    const loan = await EmployeeLoan.findById(payment.loan);
    if (loan) {
      loan.remainingBalance = Math.round((loan.remainingBalance + payment.amount) * 100) / 100;
      if (loan.remainingBalance > loan.amount) loan.remainingBalance = loan.amount;
      if (loan.remainingBalance > 0) loan.status = 'active';
      await loan.save();
    }

    if (payment.cashierTransactionId) {
      await CashierTransaction.findByIdAndDelete(payment.cashierTransactionId);
    }
    await LoanPayment.findByIdAndDelete(payment._id);

    res.json({
      message: 'Loan repayment deleted and balance restored',
      remainingBalance: loan?.remainingBalance,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
