const express = require('express');
const CashierTransaction = require('../models/CashierTransaction');
const BankTransaction = require('../models/BankTransaction');
const PendingBill = require('../models/PendingBill');
const RoomBooking = require('../models/RoomBooking');
const RestaurantOrder = require('../models/RestaurantOrder');
const Advance = require('../models/Advance');
const SalaryPayment = require('../models/SalaryPayment');
const auth = require('../middleware/auth');
const { getDayRange, normalizeTransactionDate, normalizeTransactionDateTime, getPreviousDayClosing, buildDailyCashierData } = require('../utils/cashierBalance');
const { fetchPendingBillsForDate, fetchPendingBillsHistory } = require('../utils/pendingBills');
const { enrichLedgerDeleteInfo } = require('../utils/ledgerEnrich');

const router = express.Router();

async function fetchDayData(date) {
  const { start, end } = getDayRange(date);
  const [transactions, roomBookings, restaurantOrders] = await Promise.all([
    CashierTransaction.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 }),
    RoomBooking.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } })
      .populate('room', 'roomNumber type'),
    RestaurantOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
  ]);
  const data = buildDailyCashierData({ roomBookings, restaurantOrders, transactions });
  data.ledger = await enrichLedgerDeleteInfo(data.ledger);
  return data;
}

router.get('/transactions', auth, async (req, res) => {
  try {
    const { date, type, category } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (date) {
      const { start, end } = getDayRange(date);
      filter.date = { $gte: start, $lte: end };
    }
    const transactions = await CashierTransaction.find(filter).sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/transactions', auth, async (req, res) => {
  try {
    const payload = { ...req.body };

    if (payload.category === 'bank_deposit') {
      return res.status(400).json({ message: 'Use /cashier/bank-deposit for bank deposits' });
    }

    if (payload.date) {
      payload.date = normalizeTransactionDate(payload.date);
    }
    if (payload.category === 'opening_balance') {
      const { start, end } = getDayRange(payload.date);
      await CashierTransaction.deleteMany({
        category: 'opening_balance',
        date: { $gte: start, $lte: end },
      });
      payload.type = 'income';
      payload.paymentMethod = 'cash';
      payload.description = payload.description || 'Cash in drawer at start of day';
    }
    const transaction = await CashierTransaction.create(payload);
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/bank-deposit', auth, async (req, res) => {
  try {
    const { amount, date, description, reference } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid deposit amount is required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Deposit date is required' });
    }

    const depositDate = normalizeTransactionDateTime(date);
    const depositAmount = Number(amount);
    const depositDescription = description || 'Bank deposit from cashier';

    const cashierTx = await CashierTransaction.create({
      type: 'bank_deposit',
      category: 'bank_deposit',
      amount: depositAmount,
      description: depositDescription,
      reference: reference || '',
      paymentMethod: 'cash',
      date: depositDate,
    });

    const bankTx = await BankTransaction.create({
      type: 'deposit',
      amount: depositAmount,
      date: depositDate,
      description: depositDescription,
      cashierTransactionId: cashierTx._id,
    });

    cashierTx.bankTransactionId = bankTx._id;
    await cashierTx.save();

    res.status(201).json({
      cashierTransaction: cashierTx,
      bankTransaction: bankTx,
      message: 'Cash reduced and bank account increased',
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/opening-balance', auth, async (req, res) => {
  try {
    const { date, amount, description } = req.body;
    if (amount == null || Number(amount) < 0) {
      return res.status(400).json({ message: 'Valid opening amount is required' });
    }
    const normalizedDate = normalizeTransactionDate(date || new Date());
    const { start, end } = getDayRange(normalizedDate);
    await CashierTransaction.deleteMany({
      category: 'opening_balance',
      date: { $gte: start, $lte: end },
    });
    const transaction = await CashierTransaction.create({
      type: 'income',
      category: 'opening_balance',
      amount: Number(amount),
      description: description || 'Cash in drawer at start of day',
      paymentMethod: 'cash',
      date: normalizedDate,
    });
    res.status(201).json(transaction);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/transactions/:id', auth, async (req, res) => {
  try {
    const transaction = await CashierTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction.category === 'salary_advance') {
      const advance = await Advance.findOne({
        $or: [
          { cashierTransactionId: transaction._id },
          ...(transaction.reference ? [{ _id: transaction.reference }] : []),
        ],
      });
      if (advance) await Advance.findByIdAndDelete(advance._id);
    } else if (transaction.category === 'salary_payment') {
      let payment = transaction.reference
        ? await SalaryPayment.findById(transaction.reference)
        : null;
      if (!payment) {
        payment = await SalaryPayment.findOne({ netSalary: transaction.amount }).sort({ paidDate: -1 });
      }
      if (payment) await SalaryPayment.findByIdAndDelete(payment._id);
    } else if (transaction.bankTransactionId) {
      await BankTransaction.findByIdAndDelete(transaction.bankTransactionId);
    } else if (transaction.category === 'bank_deposit') {
      await BankTransaction.deleteOne({ cashierTransactionId: transaction._id });
    }

    await CashierTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/pending-bills/history', auth, async (req, res) => {
  try {
    const { search, status, from, to, limit } = req.query;
    const history = await fetchPendingBillsHistory(PendingBill, { search, status, from, to, limit });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/pending-bills', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date);
    const pendingBills = await fetchPendingBillsForDate(PendingBill, date);
    res.json({ date: dateStr, ...pendingBills });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/pending-bills', auth, async (req, res) => {
  try {
    const { billType, customerName, description, amount, date, reference, note } = req.body;
    if (!billType || !description || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Bill type, description and valid amount are required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Bill date is required' });
    }

    const bill = await PendingBill.create({
      billType,
      customerName: customerName || '',
      description,
      amount: Number(amount),
      date: normalizeTransactionDateTime(date || new Date()),
      reference: reference || '',
      note: note || '',
      status: 'pending',
    });
    res.status(201).json(bill);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/pending-bills/:id/collect', auth, async (req, res) => {
  try {
    const bill = await PendingBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Pending bill not found' });
    if (bill.status !== 'pending') {
      return res.status(400).json({ message: 'Bill is already collected or cancelled' });
    }

    const categoryMap = { room: 'room_bill', restaurant: 'restaurant_bill', other: 'other_income' };
    const category = categoryMap[bill.billType] || 'other_income';
    const label = bill.customerName ? `${bill.customerName} — ${bill.description}` : bill.description;

    const cashierTx = await CashierTransaction.create({
      type: 'income',
      category,
      amount: bill.amount,
      description: `Collected: ${label}`,
      reference: bill.reference || '',
      paymentMethod: 'cash',
      date: normalizeTransactionDateTime(new Date()),
    });

    bill.status = 'collected';
    bill.collectedAt = new Date();
    bill.cashierTransactionId = cashierTx._id;
    await bill.save();

    res.json({ bill, cashierTransaction: cashierTx, message: 'Bill collected and added to cashier income' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/pending-bills/:id', auth, async (req, res) => {
  try {
    const bill = await PendingBill.findById(req.params.id);
    if (!bill) return res.status(404).json({ message: 'Pending bill not found' });
    if (bill.status === 'collected') {
      return res.status(400).json({ message: 'Cannot delete a collected bill' });
    }
    await PendingBill.findByIdAndDelete(req.params.id);
    res.json({ message: 'Pending bill deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/balance', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date);
    const [data, previousDay, pendingBills] = await Promise.all([
      fetchDayData(date),
      getPreviousDayClosing(fetchDayData, date),
      fetchPendingBillsForDate(PendingBill, date),
    ]);
    res.json({
      date: dateStr,
      ...data,
      pendingBills,
      previousDayClosing: previousDay.closingBalance,
      previousDayDate: previousDay.prevDate,
      hasOpeningBalance: (data.counts?.openingBalances || 0) > 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/daily-report', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { dateStr } = getDayRange(date);
    const data = await fetchDayData(date);
    res.json({
      date: dateStr,
      hotel: { name: 'Green Key Pvt', phone: '0778651767' },
      summary: {
        openingBalance: data.openingBalance,
        roomIncome: data.roomIncome,
        restaurantIncome: data.restaurantIncome,
        otherIncome: data.otherIncome,
        dayCashIn: data.dayCashIn,
        totalCashIn: data.totalCashIn,
        dailyCost: data.dailyCost,
        bankDeposit: data.bankDeposit,
        totalCashOut: data.totalCashOut,
        cashBalance: data.cashBalance,
      },
      counts: data.counts,
      breakdown: data.breakdown,
      ledger: data.ledger,
      roomBookings: data.roomBookings,
      restaurantOrders: data.restaurantOrders,
      transactions: data.transactions,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
