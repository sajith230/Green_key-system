const express = require('express');
const Advance = require('../models/Advance');
const SalaryPayment = require('../models/SalaryPayment');
const Employee = require('../models/Employee');
const CashierTransaction = require('../models/CashierTransaction');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const auth = require('../middleware/auth');
const { computeBalance, getMonthYearFromDate } = require('../utils/pettyCashBalance');
const { generatePaysheetPDF, generateAdvancePDF, MONTHS } = require('../utils/pdfGenerator');
const { normalizeTransactionDate, normalizeTransactionDateTime } = require('../utils/cashierBalance');

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

async function createPettyCashAdvanceTransaction(advance, employeeName) {
  const available = await getPettyCashAvailableBalance();
  if (advance.amount > available) {
    throw new Error(`Insufficient petty cash. Available: Rs. ${available.toLocaleString()}`);
  }

  const { month, year } = getMonthYearFromDate(advance.date);
  return PettyCashTransaction.create({
    type: 'salary_advance',
    amount: advance.amount,
    date: advance.date,
    month,
    year,
    description: `Salary advance — ${employeeName}`,
    reference: advance._id.toString(),
  });
}

async function removeLinkedAdvanceTransactions(advance) {
  if (advance.cashierTransactionId) {
    await CashierTransaction.findByIdAndDelete(advance.cashierTransactionId);
    advance.cashierTransactionId = undefined;
  }
  if (advance.pettyCashTransactionId) {
    await PettyCashTransaction.findByIdAndDelete(advance.pettyCashTransactionId);
    advance.pettyCashTransactionId = undefined;
  }
}

async function getEmployeeAdvanceSummary(employeeId, month, year, excludeAdvanceId = null) {
  const employee = await Employee.findById(employeeId);
  if (!employee) return null;

  const filter = { employee: employeeId, month: Number(month), year: Number(year) };
  const advances = await Advance.find(filter).sort({ date: 1 });
  const relevant = excludeAdvanceId
    ? advances.filter((a) => a._id.toString() !== excludeAdvanceId.toString())
    : advances;

  const totalAdvances = relevant.reduce((sum, a) => sum + a.amount, 0);
  return {
    employee,
    advances: relevant,
    basicSalary: employee.basicSalary,
    totalAdvances,
    leftover: employee.basicSalary - totalAdvances,
  };
}

router.get('/advances/summary', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = Number(month);
    const y = Number(year);

    const [employees, advances] = await Promise.all([
      Employee.find({ isActive: { $ne: false } }).sort({ name: 1 }),
      Advance.find({ month: m, year: y }).populate('employee', 'name position basicSalary').sort({ date: -1 }),
    ]);

    const rows = employees.map((emp) => {
      const empAdvances = advances.filter((a) => {
        const id = a.employee?._id || a.employee;
        return id.toString() === emp._id.toString();
      });
      const totalAdvances = empAdvances.reduce((sum, a) => sum + a.amount, 0);
      return {
        employee: {
          _id: emp._id,
          name: emp.name,
          position: emp.position,
          basicSalary: emp.basicSalary,
        },
        advanceCount: empAdvances.length,
        totalAdvances,
        leftover: emp.basicSalary - totalAdvances,
        advances: empAdvances,
      };
    });

    const totalGiven = advances.reduce((sum, a) => sum + a.amount, 0);
    const totalLeftover = rows.reduce((sum, r) => sum + Math.max(r.leftover, 0), 0);

    res.json({
      month: m,
      year: y,
      rows,
      totals: {
        totalAdvances: totalGiven,
        totalLeftover,
        employeeCount: employees.length,
        employeesWithAdvances: rows.filter((r) => r.totalAdvances > 0).length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/advances', auth, async (req, res) => {
  try {
    const { month, year, employeeId } = req.query;
    const filter = {};
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);
    if (employeeId) filter.employee = employeeId;
    const advances = await Advance.find(filter).populate('employee', 'name position basicSalary').sort({ date: -1 });
    res.json(advances);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/advances', auth, async (req, res) => {
  try {
    const { employee: employeeId, amount, note, month, year, date, paidBy } = req.body;
    const advanceAmount = Number(amount);
    const m = Number(month);
    const y = Number(year);
    const payer = normalizePaidBy(paidBy);

    const summary = await getEmployeeAdvanceSummary(employeeId, m, y);
    if (!summary) return res.status(404).json({ message: 'Employee not found' });

    if (advanceAmount <= 0) {
      return res.status(400).json({ message: 'Advance amount must be greater than 0' });
    }

    if (summary.totalAdvances + advanceAmount > summary.basicSalary) {
      return res.status(400).json({
        message: `Advance exceeds leftover salary. Leftover: Rs. ${(summary.basicSalary - summary.totalAdvances).toLocaleString()}`,
      });
    }

    if (payer === 'petty_cash') {
      const available = await getPettyCashAvailableBalance();
      if (advanceAmount > available) {
        return res.status(400).json({
          message: `Insufficient petty cash. Available: Rs. ${available.toLocaleString()}`,
        });
      }
    }

    const advanceDate = normalizeTransactionDateTime(date || new Date());

    const advance = await Advance.create({
      employee: employeeId,
      amount: advanceAmount,
      note: note || '',
      month: m,
      year: y,
      date: advanceDate,
      paidBy: payer,
    });

    if (payer === 'cashier') {
      const cashierTx = await CashierTransaction.create({
        type: 'expense',
        category: 'salary_advance',
        amount: advanceAmount,
        description: `Salary advance — ${summary.employee.name}`,
        reference: advance._id.toString(),
        paymentMethod: 'cash',
        date: advanceDate,
      });

      advance.cashierTransactionId = cashierTx._id;
      await advance.save();
    } else if (payer === 'petty_cash') {
      const pettyTx = await createPettyCashAdvanceTransaction(advance, summary.employee.name);
      advance.pettyCashTransactionId = pettyTx._id;
      await advance.save();
    }

    const populated = await advance.populate('employee', 'name position basicSalary nic phone');
    const updatedSummary = await getEmployeeAdvanceSummary(employeeId, m, y);

    res.status(201).json({
      advance: populated,
      leftover: updatedSummary.leftover,
      totalAdvances: updatedSummary.totalAdvances,
      cashierDeducted: payer === 'cashier' ? advanceAmount : 0,
      pettyCashDeducted: payer === 'petty_cash' ? advanceAmount : 0,
      paidBy: payer,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/advances/:id', auth, async (req, res) => {
  try {
    const advance = await Advance.findById(req.params.id);
    if (!advance) return res.status(404).json({ message: 'Advance not found' });

    const hadCashier = !!advance.cashierTransactionId;
    const hadPettyCash = !!advance.pettyCashTransactionId;
    await removeLinkedAdvanceTransactions(advance);

    await Advance.findByIdAndDelete(req.params.id);
    let message = 'Advance deleted';
    if (hadCashier && hadPettyCash) message = 'Advance deleted and linked entries removed';
    else if (hadCashier) message = 'Advance deleted and cashier entry removed';
    else if (hadPettyCash) message = 'Advance deleted and petty cash entry removed';
    res.json({ message });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/advances/:id/paid-by', auth, async (req, res) => {
  try {
    const { paidBy } = req.body;
    const payer = normalizePaidBy(paidBy);
    const advance = await Advance.findById(req.params.id).populate('employee', 'name position basicSalary nic phone');
    if (!advance) return res.status(404).json({ message: 'Advance not found' });

    if (advance.paidBy === payer) {
      return res.json({ advance, message: 'No change needed' });
    }

    await removeLinkedAdvanceTransactions(advance);

    if (payer === 'cashier') {
      const cashierTx = await CashierTransaction.create({
        type: 'expense',
        category: 'salary_advance',
        amount: advance.amount,
        description: `Salary advance — ${advance.employee.name}`,
        reference: advance._id.toString(),
        paymentMethod: 'cash',
        date: advance.date,
      });
      advance.cashierTransactionId = cashierTx._id;
    } else if (payer === 'petty_cash') {
      const pettyTx = await createPettyCashAdvanceTransaction(advance, advance.employee.name);
      advance.pettyCashTransactionId = pettyTx._id;
    }

    advance.paidBy = payer;
    await advance.save();

    const messages = {
      owner: 'Changed to owner — no cashier or petty cash deduction',
      cashier: 'Changed to cashier — deducted from cashier balance',
      petty_cash: 'Changed to petty cash — deducted from petty cash balance',
    };
    res.json({ advance, message: messages[payer] });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/advances/:id/pdf', auth, async (req, res) => {
  try {
    const advance = await Advance.findById(req.params.id).populate('employee');
    if (!advance) return res.status(404).json({ message: 'Advance not found' });

    const allForMonth = await Advance.find({
      employee: advance.employee._id,
      month: advance.month,
      year: advance.year,
    }).sort({ date: 1 });

    const previousAdvances = allForMonth
      .filter((a) => a.date < advance.date || (a.date.getTime() === advance.date.getTime() && a._id.toString() < advance._id.toString()))
      .reduce((sum, a) => sum + a.amount, 0);

    const totalAdvances = previousAdvances + advance.amount;
    const summary = {
      basicSalary: advance.employee.basicSalary,
      previousAdvances,
      totalAdvances,
      leftover: advance.employee.basicSalary - totalAdvances,
    };

    const pdf = await generateAdvancePDF(advance, advance.employee, summary);
    const filename = `advance_${advance.employee.name.replace(/\s+/g, '_')}_${MONTHS[advance.month - 1]}_${advance.year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/payments/:id', auth, async (req, res) => {
  try {
    const payment = await SalaryPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Salary payment not found' });

    await CashierTransaction.deleteMany({
      category: 'salary_payment',
      reference: payment._id.toString(),
    });

    await SalaryPayment.findByIdAndDelete(payment._id);
    res.json({ message: 'Salary payment deleted and cashier entry removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/payments', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = {};
    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);
    const payments = await SalaryPayment.find(filter)
      .populate('employee', 'name position phone nic basicSalary')
      .sort({ createdAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/calculate/:employeeId', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = Number(month);
    const y = Number(year);
    const summary = await getEmployeeAdvanceSummary(req.params.employeeId, m, y);
    if (!summary) return res.status(404).json({ message: 'Employee not found' });

    const existing = await SalaryPayment.findOne({ employee: req.params.employeeId, month: m, year: y });

    res.json({
      employee: summary.employee,
      month: m,
      year: y,
      basicSalary: summary.basicSalary,
      advances: summary.advances,
      totalAdvances: summary.totalAdvances,
      leftover: summary.leftover,
      deductions: 0,
      bonuses: 0,
      netSalary: summary.basicSalary - summary.totalAdvances,
      alreadyPaid: !!existing,
      existingPayment: existing,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/pay', auth, async (req, res) => {
  try {
    const { employeeId, month, year, deductions, bonuses, note } = req.body;
    const m = Number(month);
    const y = Number(year);
    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const summary = await getEmployeeAdvanceSummary(employeeId, m, y);
    const netSalary = employee.basicSalary + (bonuses || 0) - summary.totalAdvances - (deductions || 0);

    const existing = await SalaryPayment.findOne({ employee: employeeId, month: m, year: y });
    if (existing) {
      return res.status(400).json({ message: 'Salary already paid for this month' });
    }

    if (netSalary < 0) {
      return res.status(400).json({ message: 'Net salary cannot be negative' });
    }

    const payment = await SalaryPayment.create({
      employee: employeeId,
      month: m,
      year: y,
      basicSalary: employee.basicSalary,
      totalAdvances: summary.totalAdvances,
      deductions: deductions || 0,
      bonuses: bonuses || 0,
      netSalary,
      note: note || '',
    });

    if (netSalary > 0) {
      await CashierTransaction.create({
        type: 'expense',
        category: 'salary_payment',
        amount: netSalary,
        description: `Salary payment — ${employee.name} (${MONTHS[m - 1]} ${y})`,
        reference: payment._id.toString(),
        paymentMethod: 'cash',
        date: new Date(),
      });
    }

    const populated = await payment.populate('employee', 'name position phone nic');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/paysheet/:paymentId/pdf', auth, async (req, res) => {
  try {
    const payment = await SalaryPayment.findById(req.params.paymentId).populate('employee');
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const advances = await Advance.find({
      employee: payment.employee._id,
      month: payment.month,
      year: payment.year,
    });

    const pdf = await generatePaysheetPDF(payment, payment.employee, advances);
    const filename = `paysheet_${payment.employee.name.replace(/\s+/g, '_')}_${MONTHS[payment.month - 1]}_${payment.year}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
