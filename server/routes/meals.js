const express = require('express');
const Meal = require('../models/Meal');
const MealStockLog = require('../models/MealStockLog');
const auth = require('../middleware/auth');
const {
  MEAL_PORTION,
  escapeRegex,
  toClientMeal,
  adjustStock,
  setAbsoluteStock,
} = require('../utils/mealStock');

const router = express.Router();

function parseStockValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

router.get('/', auth, async (req, res) => {
  try {
    const meals = await Meal.find().sort({ name: 1 });
    res.json(meals.map(toClientMeal));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/logs', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await MealStockLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('meal', 'name');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Meal name is required' });
    }

    const existing = await Meal.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
    });
    if (existing) {
      return res.status(400).json({ message: 'This meal already exists' });
    }

    const stock500g = parseStockValue(req.body.stock);
    if (stock500g === null) {
      return res.status(400).json({ message: 'Portions must be 0 or a positive number' });
    }

    const meal = await Meal.create({ name, stock500g });

    if (stock500g > 0) {
      await MealStockLog.create({
        meal: meal._id,
        mealName: meal.name,
        portion: MEAL_PORTION,
        type: 'stock_in',
        quantity: stock500g,
        balanceAfter: stock500g,
        note: 'Initial portions',
      });
    }

    res.status(201).json(toClientMeal(meal));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/** Record newly made meal portions (+500g each) */
router.post('/:id/make', auth, async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id);
    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    const { meal: updated, log } = await adjustStock({
      meal,
      type: 'made',
      quantity: Number(req.body.quantity),
      note: req.body.note || 'Meal portions made',
    });

    res.json({ meal: toClientMeal(updated), log });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/use', auth, async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id);
    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    const { meal: updated, log } = await adjustStock({
      meal,
      type: 'stock_out',
      quantity: Number(req.body.quantity),
      note: req.body.note || 'Meal portion used',
    });

    res.json({ meal: toClientMeal(updated), log });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const meal = await Meal.findById(req.params.id);
    if (!meal) return res.status(404).json({ message: 'Meal not found' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Meal name is required' });

      const duplicate = await Meal.findOne({
        _id: { $ne: meal._id },
        name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') },
      });
      if (duplicate) {
        return res.status(400).json({ message: 'This meal name already exists' });
      }
      meal.name = name;
    }

    if (req.body.quantity !== undefined) {
      const quantity = Number(req.body.quantity);
      if (Number.isNaN(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Portions must be 0 or more' });
      }

      await setAbsoluteStock({
        meal,
        quantity,
        note: req.body.note || 'Portion set manually',
      });
      return res.json(toClientMeal(meal));
    }

    await meal.save();
    res.json(toClientMeal(meal));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const meal = await Meal.findByIdAndDelete(req.params.id);
    if (!meal) return res.status(404).json({ message: 'Meal not found' });
    await MealStockLog.deleteMany({ meal: meal._id });
    res.json({ message: 'Meal deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
