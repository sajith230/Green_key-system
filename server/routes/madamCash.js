const express = require('express');
const MadamCashTransaction = require('../models/MadamCashTransaction');
const CashierTransaction = require('../models/CashierTransaction');
const auth = require('../middleware/auth');
const {
  computeBalance,
  getMonthYearFromDate,
  buildMadamCashData,
  buildYearlySummary,
  normalizeTransactionDateTime,
} = require('../utils/madamCashBalance');

const router = express.Router();

async function getAllTransactions() {
  return MadamCashTransaction.find().sort({ date: -1 });
}

async function createPaymentCashierTx({ amount, date, description }) {
  return CashierTransaction.create({
    type: 'expense',
    category: 'madam_cash_payment',
    amount,
    description,
    paymentMethod: 'cash',
    date,
  });
}

router.get('/balance', auth, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();
    const transactions = await getAllTransactions();
    res.json(buildMadamCashData(transactions, month, year));
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

router.post('/fund-in', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    const fundAmount = Number(amount);
    if (!fundAmount || fundAmount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);
    const desc = description || 'Cash received from madam';

    const transaction = await MadamCashTransaction.create({
      type: 'fund_in',
      amount: fundAmount,
      date: txDate,
      month,
      year,
      description: desc,
    });

    const transactions = await getAllTransactions();
    res.status(201).json({
      transaction,
      currentBalance: computeBalance(transactions),
      message: 'Cash from madam recorded (not added to cashier)',
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/payment', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required for payments' });
    }

    const transactions = await getAllTransactions();
    const currentBalance = computeBalance(transactions);
    if (paymentAmount > currentBalance) {
      return res.status(400).json({
        message: `Insufficient madam cash. Available: Rs. ${currentBalance.toLocaleString()}`,
      });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);
    const desc = description.trim();

    const cashierTx = await createPaymentCashierTx({
      amount: paymentAmount,
      date: txDate,
      description: desc,
    });

    const transaction = await MadamCashTransaction.create({
      type: 'payment',
      amount: paymentAmount,
      date: txDate,
      month,
      year,
      description: desc,
      cashierTransactionId: cashierTx._id,
    });

    const updated = await getAllTransactions();
    res.status(201).json({
      transaction,
      cashierTransaction: cashierTx,
      currentBalance: computeBalance(updated),
      message: 'Payment recorded and deducted from cashier',
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
        message: `Cannot return more than available madam cash. Available: Rs. ${currentBalance.toLocaleString()}`,
      });
    }

    const txDate = normalizeTransactionDateTime(date || new Date());
    const { month, year } = getMonthYearFromDate(txDate);
    const desc = description || 'Cash returned to madam';

    const transaction = await MadamCashTransaction.create({
      type: 'return_to_madam',
      amount: returnAmount,
      date: txDate,
      month,
      year,
      description: desc,
    });

    const updated = await getAllTransactions();
    res.status(201).json({
      transaction,
      currentBalance: computeBalance(updated),
      message: 'Returned to madam (cashier unchanged)',
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await MadamCashTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.cashierTransactionId) {
      await CashierTransaction.findByIdAndDelete(transaction.cashierTransactionId);
    }

    await MadamCashTransaction.findByIdAndDelete(req.params.id);
    const transactions = await getAllTransactions();
    res.json({
      message: transaction.cashierTransactionId
        ? 'Transaction deleted and cashier entry removed'
        : 'Transaction deleted',
      currentBalance: computeBalance(transactions),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
