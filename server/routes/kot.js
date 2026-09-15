const express = require('express');
const KotOrder = require('../models/KotOrder');
const auth = require('../middleware/auth');
const { getDayRange, normalizeTransactionDate } = require('../utils/cashierBalance');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const { start, end } = getDayRange(date);
      filter.date = { $gte: start, $lte: end };
    }
    const orders = await KotOrder.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/summary', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { start, end, dateStr } = getDayRange(date);
    const orders = await KotOrder.find({ date: { $gte: start, $lte: end } });

    const byStatus = { pending: 0, preparing: 0, served: 0, cancelled: 0 };
    orders.forEach((o) => {
      if (byStatus[o.status] !== undefined) byStatus[o.status] += 1;
    });

    res.json({
      date: dateStr,
      count: orders.length,
      totalItems: orders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0),
      byStatus,
      orders,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { items, tableNumber, status, note, date } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }

    const count = await KotOrder.countDocuments();
    const kotNumber = `KOT-${String(count + 1).padStart(4, '0')}`;
    const order = await KotOrder.create({
      kotNumber,
      tableNumber: tableNumber || '',
      items,
      status: status || 'pending',
      note: note || '',
      date: normalizeTransactionDate(date),
    });

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.date) {
      updates.date = normalizeTransactionDate(updates.date);
    }
    const order = await KotOrder.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!order) return res.status(404).json({ message: 'KOT not found' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await KotOrder.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'KOT not found' });
    res.json({ message: 'KOT deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
