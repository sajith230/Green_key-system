const express = require('express');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const auth = require('../middleware/auth');
const {
  computeBalance,
  getMonthYearFromDate,
  buildPettyCashData,
  buildYearlySummary,
  normalizeTransactionDate,
  normalizeTransactionDateTime,
} = require('../utils/pettyCashBalance');
const { generatePettyCashPDF } = require('../utils/pettyCashPdf');

const router = express.Router();

async function getAllTransactions() {
  return PettyCashTransaction.find().sort({ date: -1 });
}

router.get('/balance', auth, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();
    const transactions = await getAllTransactions();
    const data = buildPettyCashData(transactions, month, year);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/available-balance', auth, async (req, res) => {
  try {
    const transactions = await getAllTransactions();
    res.json({ availableBalance: computeBalance(transactions) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/yearly-summary', auth, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const transactions = await getAllTransactions();
    res.json(buildYearlySummary(transactions, year));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/pdf', auth, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();
    const summaryYear = Number(req.query.summaryYear) || year;

    const transactions = await getAllTransactions();
    const data = buildPettyCashData(transactions, month, year);
    data.allTransactions = transactions;

    const yearlySummary = buildYearlySummary(transactions, summaryYear);
    const pdf = await generatePettyCashPDF(data, yearlySummary);

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const filename = `petty_cash_report_${monthKey}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/fund-in', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    const fundAmount = Number(amount);
    if (!fundAmount || fundAmount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);

    const transaction = await PettyCashTransaction.create({
      type: 'fund_in',
      amount: fundAmount,
      date: txDate,
      month,
      year,
      description: description || 'Petty cash received from owner',
    });

    const transactions = await getAllTransactions();
    res.status(201).json({
      transaction,
      currentBalance: computeBalance(transactions),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/return', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    const returnAmount = Number(amount);
    if (!returnAmount || returnAmount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const transactions = await getAllTransactions();
    const currentBalance = computeBalance(transactions);
    if (returnAmount > currentBalance) {
      return res.status(400).json({
        message: `Cannot return more than available petty cash. Available: Rs. ${currentBalance.toLocaleString()}`,
      });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);

    const transaction = await PettyCashTransaction.create({
      type: 'return_to_owner',
      amount: returnAmount,
      date: txDate,
      month,
      year,
      description: description || 'Petty cash returned to owner',
    });

    const updated = await getAllTransactions();
    res.status(201).json({
      transaction,
      currentBalance: computeBalance(updated),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/expense', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    const expenseAmount = Number(amount);
    if (!expenseAmount || expenseAmount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required for expenses' });
    }

    const transactions = await getAllTransactions();
    const currentBalance = computeBalance(transactions);
    if (expenseAmount > currentBalance) {
      return res.status(400).json({
        message: `Insufficient petty cash. Available: Rs. ${currentBalance.toLocaleString()}`,
      });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);

    const transaction = await PettyCashTransaction.create({
      type: 'expense',
      amount: expenseAmount,
      date: txDate,
      month,
      year,
      description: description.trim(),
    });

    const updated = await getAllTransactions();
    res.status(201).json({
      transaction,
      currentBalance: computeBalance(updated),
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await PettyCashTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    if (transaction.type === 'salary_advance') {
      return res.status(403).json({
        message: 'Salary advance entries must be deleted from the Salary page',
      });
    }

    await PettyCashTransaction.findByIdAndDelete(req.params.id);
    const transactions = await getAllTransactions();
    res.json({
      message: 'Transaction deleted',
      currentBalance: computeBalance(transactions),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
