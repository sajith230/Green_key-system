const express = require('express');
const RestaurantOrder = require('../models/RestaurantOrder');
const auth = require('../middleware/auth');
const {
  reduceStockForOrderItems,
  restoreStockForOrder,
  validateDrinkStock,
} = require('../utils/drinkStock');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      filter.createdAt = { $gte: start, $lte: end };
    }
    const orders = await RestaurantOrder.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const stockError = await validateDrinkStock(req.body.items);
    if (stockError) {
      return res.status(400).json({ message: stockError });
    }

    const count = await RestaurantOrder.countDocuments();
    const orderNumber = `RST-${String(count + 1).padStart(4, '0')}`;
    const order = await RestaurantOrder.create({ ...req.body, orderNumber });

    try {
      await reduceStockForOrderItems(order.items, order);
    } catch (stockErr) {
      await RestaurantOrder.findByIdAndDelete(order._id);
      return res.status(400).json({ message: stockErr.message });
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const order = await RestaurantOrder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await RestaurantOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    await restoreStockForOrder(order);
    await RestaurantOrder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
