const express = require('express');
const BankTransaction = require('../models/BankTransaction');
const auth = require('../middleware/auth');
const { getDayRange, normalizeTransactionDate, normalizeTransactionDateTime, buildBankBalanceData, buildMonthlyHistory, buildDailyDirectDeposits } = require('../utils/bankBalance');
const { generateBankTransferListPDF } = require('../utils/bankTransferPdf');

const router = express.Router();

router.get('/balance', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date || new Date());
    const transactions = await BankTransaction.find().sort({ date: -1 });
    const data = buildBankBalanceData(transactions, dateStr);
    res.json({ date: dateStr, ...data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await BankTransaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/daily-transfers', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date || new Date());
    const transactions = await BankTransaction.find({ type: 'deposit' }).sort({ date: -1 });
    const data = buildDailyDirectDeposits(transactions, dateStr);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/daily-transfers/pdf', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date || new Date());
    const transactions = await BankTransaction.find({ type: 'deposit' }).sort({ date: -1 });
    const bankTransfers = buildDailyDirectDeposits(transactions, dateStr);
    const pdf = await generateBankTransferListPDF(bankTransfers);
    const filename = `direct_bank_transfers_${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/monthly-history', auth, async (req, res) => {
  try {
    const { year } = req.query;
    const transactions = await BankTransaction.find().sort({ date: -1 });
    const data = buildMonthlyHistory(transactions, year);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/opening-balance', auth, async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (amount == null || Number(amount) < 0) {
      return res.status(400).json({ message: 'Valid opening amount is required' });
    }
    await BankTransaction.deleteMany({ type: 'opening_balance' });
    const transaction = await BankTransaction.create({
      type: 'opening_balance',
      amount: Number(amount),
      date: normalizeTransactionDate(new Date()),
      description: description || 'Available balance in bank account',
    });
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/deposit', auth, async (req, res) => {
  try {
    const { amount, date, description } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid deposit amount is required' });
    }
    const transaction = await BankTransaction.create({
      type: 'deposit',
      amount: Number(amount),
      date: normalizeTransactionDateTime(date || new Date()),
      description: description || 'Direct bank deposit',
    });
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/check', auth, async (req, res) => {
  try {
    const { amount, date, customerName, checkNumber, description } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid check amount is required' });
    }
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ message: 'Customer name is required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Check date is required' });
    }
    const transaction = await BankTransaction.create({
      type: 'check',
      amount: Number(amount),
      date: normalizeTransactionDate(date),
      customerName: customerName.trim(),
      checkNumber: checkNumber || '',
      description: description || `Check to ${customerName.trim()}`,
    });
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await BankTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    if (transaction.type === 'deposit' && transaction.cashierTransactionId) {
      return res.status(403).json({ message: 'Cashier deposits can only be deleted from the Cashier page' });
    }
    await BankTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
