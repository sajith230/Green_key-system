const Meal = require('../models/Meal');
const MealStockLog = require('../models/MealStockLog');

const MEAL_PORTION = '500g';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function getStock(meal) {
  const value = meal.stock500g;
  return value === undefined || value === null ? 0 : Number(value);
}

function toClientMeal(meal) {
  const obj = meal.toObject ? meal.toObject() : { ...meal };
  return {
    _id: obj._id,
    name: obj.name,
    portion: MEAL_PORTION,
    stock: getStock(obj),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function adjustStock({ meal, type, quantity, note = '' }) {
  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 1) {
    throw new Error('Quantity must be at least 1');
  }

  const current = getStock(meal);

  if (type === 'stock_in' || type === 'made') {
    meal.stock500g = current + qty;
  } else {
    if (current < qty) {
      throw new Error(
        `Not enough ${meal.name} ${MEAL_PORTION} portions. Available: ${current}`
      );
    }
    meal.stock500g = current - qty;
  }

  await meal.save();

  const balanceAfter = getStock(meal);
  const log = await MealStockLog.create({
    meal: meal._id,
    mealName: meal.name,
    portion: MEAL_PORTION,
    type,
    quantity: qty,
    balanceAfter,
    note,
  });

  return { meal, log };
}

/** Set exact portion count — 0 is allowed */
async function setAbsoluteStock({ meal, quantity, note = 'Portion set manually' }) {
  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 0) {
    throw new Error('Portions cannot be negative');
  }

  const current = getStock(meal);
  const diff = qty - current;

  meal.stock500g = qty;
  await meal.save();

  let log = null;
  if (diff !== 0) {
    log = await MealStockLog.create({
      meal: meal._id,
      mealName: meal.name,
      portion: MEAL_PORTION,
      type: diff > 0 ? 'stock_in' : 'stock_out',
      quantity: Math.abs(diff),
      balanceAfter: qty,
      note,
    });
  }

  return { meal, log };
}

module.exports = {
  MEAL_PORTION,
  escapeRegex,
  normalizeName,
  getStock,
  toClientMeal,
  adjustStock,
  setAbsoluteStock,
};
