const express = require('express');
const Drink = require('../models/Drink');
const DrinkStockLog = require('../models/DrinkStockLog');
const auth = require('../middleware/auth');
const {
  ensureDefaultDrinks,
  adjustStock,
  setAbsoluteStock,
  normalizeSize,
  getStock,
  toClientDrink,
  DRINK_SIZES,
} = require('../utils/drinkStock');

const router = express.Router();

function parseStockValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

router.get('/', auth, async (req, res) => {
  try {
    await ensureDefaultDrinks();
    const drinks = await Drink.find().sort({ name: 1 });
    res.json(drinks.map(toClientDrink));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/logs', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await DrinkStockLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('drink', 'name');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Drink name is required' });
    }

    const existing = await Drink.findOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
      return res.status(400).json({ message: 'This drink already exists' });
    }

    const stock500ml = parseStockValue(req.body.stock?.['500ml']);
    const stock1L = parseStockValue(req.body.stock?.['1L']);
    const stock15L = parseStockValue(req.body.stock?.['1.5L']);

    if (stock500ml === null || stock1L === null || stock15L === null) {
      return res.status(400).json({ message: 'Stock must be 0 or a positive number' });
    }

    const drink = await Drink.create({ name, stock500ml, stock1L, stock15L });

    const initial = [
      ['500ml', stock500ml],
      ['1L', stock1L],
      ['1.5L', stock15L],
    ];
    for (const [size, qty] of initial) {
      if (qty > 0) {
        await DrinkStockLog.create({
          drink: drink._id,
          drinkName: drink.name,
          size,
          type: 'stock_in',
          quantity: qty,
          balanceAfter: qty,
          note: 'Initial stock',
        });
      }
    }

    res.status(201).json(toClientDrink(drink));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/stock-in', auth, async (req, res) => {
  try {
    const drink = await Drink.findById(req.params.id);
    if (!drink) return res.status(404).json({ message: 'Drink not found' });

    const size = normalizeSize(req.body.size);
    if (!size) return res.status(400).json({ message: 'Size must be 500ml, 1L, or 1.5L' });

    const { drink: updated, log } = await adjustStock({
      drink,
      size,
      type: 'stock_in',
      quantity: Number(req.body.quantity),
      note: req.body.note || 'Stock added',
    });

    res.json({ drink: toClientDrink(updated), log });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/use', auth, async (req, res) => {
  try {
    const drink = await Drink.findById(req.params.id);
    if (!drink) return res.status(404).json({ message: 'Drink not found' });

    const size = normalizeSize(req.body.size);
    if (!size) return res.status(400).json({ message: 'Size must be 500ml, 1L, or 1.5L' });

    const { drink: updated, log } = await adjustStock({
      drink,
      size,
      type: 'stock_out',
      quantity: Number(req.body.quantity),
      note: req.body.note || 'Drink used',
    });

    res.json({ drink: toClientDrink(updated), log });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const drink = await Drink.findById(req.params.id);
    if (!drink) return res.status(404).json({ message: 'Drink not found' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Drink name is required' });

      const duplicate = await Drink.findOne({
        _id: { $ne: drink._id },
        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });
      if (duplicate) {
        return res.status(400).json({ message: 'This drink name already exists' });
      }
      drink.name = name;
    }

    if (req.body.size !== undefined && req.body.quantity !== undefined) {
      const size = normalizeSize(req.body.size);
      if (!size) return res.status(400).json({ message: 'Size must be 500ml, 1L, or 1.5L' });

      const quantity = Number(req.body.quantity);
      if (Number.isNaN(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Stock must be 0 or more' });
      }

      await setAbsoluteStock({
        drink,
        size,
        quantity,
        note: req.body.note || 'Stock set manually',
      });
      return res.json(toClientDrink(drink));
    }

    await drink.save();
    res.json(toClientDrink(drink));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const drink = await Drink.findByIdAndDelete(req.params.id);
    if (!drink) return res.status(404).json({ message: 'Drink not found' });
    await DrinkStockLog.deleteMany({ drink: drink._id });
    res.json({ message: 'Drink deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
