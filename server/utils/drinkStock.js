const Drink = require('../models/Drink');
const DrinkStockLog = require('../models/DrinkStockLog');

const DEFAULT_DRINKS = ['Water', 'Necto', 'Pepsi', 'Orange Crush', 'EGB'];

/** UI/API size label -> DB field */
const SIZE_FIELD = {
  '500ml': 'stock500ml',
  '1L': 'stock1L',
  '1.5L': 'stock15L',
};

const DRINK_SIZES = ['500ml', '1L', '1.5L'];

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeSize(size) {
  const s = String(size || '').trim().toLowerCase().replace(/\s+/g, '');
  if (s === '500ml' || s === '500') return '500ml';
  if (s === '1l' || s === '1liter' || s === '1litre') return '1L';
  if (s === '1.5l' || s === '15l' || s === '1.5liter' || s === '1.5litre') return '1.5L';
  return null;
}

function sizeField(size) {
  const normalized = normalizeSize(size);
  return normalized ? SIZE_FIELD[normalized] : null;
}

function getStock(drink, size) {
  const field = sizeField(size);
  if (!field) return 0;
  const value = drink[field];
  return value === undefined || value === null ? 0 : Number(value);
}

function setStock(drink, size, value) {
  const field = sizeField(size);
  if (!field) throw new Error('Size must be 500ml, 1L, or 1.5L');
  drink[field] = Math.max(0, Number(value));
}

function toClientDrink(drink) {
  const obj = drink.toObject ? drink.toObject() : { ...drink };
  const num = (v) => (v === undefined || v === null || Number.isNaN(Number(v)) ? 0 : Number(v));
  return {
    _id: obj._id,
    name: obj.name,
    stock: {
      '500ml': num(obj.stock500ml),
      '1L': num(obj.stock1L),
      '1.5L': num(obj.stock15L),
    },
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/** Parse "Pepsi 1L" / "Water 500ml" from order item names */
function parseDrinkItemName(itemName) {
  const raw = String(itemName || '').trim();
  const match = raw.match(/^(.*?)[\s\-]*(500\s*ml|1\.5\s*l|1\s*l)$/i);
  if (!match) return null;
  const name = match[1].trim();
  const size = normalizeSize(match[2]);
  if (!name || !size) return null;
  return { name, size };
}

async function migrateDrinkDoc(drink) {
  const updates = {};
  let changed = false;

  const raw = drink.toObject({ getters: false });
  const legacyStock = raw.stock;

  if (legacyStock && typeof legacyStock === 'object') {
    if (typeof legacyStock['500ml'] === 'number' && !drink.stock500ml) {
      drink.stock500ml = legacyStock['500ml'];
      changed = true;
    }
    if (typeof legacyStock['1L'] === 'number' && !drink.stock1L) {
      drink.stock1L = legacyStock['1L'];
      changed = true;
    }
    const nested15 = legacyStock['1'] && legacyStock['1']['5L'];
    if (typeof nested15 === 'number' && !drink.stock15L) {
      drink.stock15L = nested15;
      changed = true;
    } else if (typeof legacyStock['1.5L'] === 'number' && !drink.stock15L) {
      drink.stock15L = legacyStock['1.5L'];
      changed = true;
    } else if (typeof legacyStock['15L'] === 'number' && !drink.stock15L) {
      drink.stock15L = legacyStock['15L'];
      changed = true;
    }
    updates.$unset = { ...(updates.$unset || {}), stock: 1 };
    changed = true;
  }

  if (typeof raw.quantity === 'number') {
    const total = (drink.stock500ml || 0) + (drink.stock1L || 0) + (drink.stock15L || 0);
    if (raw.quantity > 0 && total === 0) {
      drink.stock500ml = raw.quantity;
      changed = true;
    }
    updates.$unset = { ...(updates.$unset || {}), quantity: 1 };
    changed = true;
  }

  if (drink.stock500ml == null) { drink.stock500ml = 0; changed = true; }
  if (drink.stock1L == null) { drink.stock1L = 0; changed = true; }
  if (drink.stock15L == null) { drink.stock15L = 0; changed = true; }

  if (changed) {
    await drink.save();
    if (updates.$unset) {
      await Drink.updateOne({ _id: drink._id }, updates);
    }
  }
  return drink;
}

async function ensureDefaultDrinks() {
  for (const name of DEFAULT_DRINKS) {
    let drink = await Drink.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
    if (!drink) {
      await Drink.create({ name, stock500ml: 0, stock1L: 0, stock15L: 0 });
    }
  }

  const all = await Drink.find();
  for (const drink of all) {
    await migrateDrinkDoc(drink);
  }
}

async function findDrinkByName(name) {
  const drinks = await Drink.find();
  const target = normalizeName(name);
  return drinks.find((d) => normalizeName(d.name) === target) || null;
}

async function findDrinkFromItemName(itemName) {
  const parsed = parseDrinkItemName(itemName);
  if (!parsed) return null;
  const drink = await findDrinkByName(parsed.name);
  if (!drink) return null;
  return { drink, size: parsed.size };
}

async function adjustStock({ drink, size, type, quantity, note = '', orderId = null, orderNumber = '' }) {
  const qty = Number(quantity);
  const normalizedSize = normalizeSize(size);
  if (!normalizedSize) {
    throw new Error('Size must be 500ml, 1L, or 1.5L');
  }
  if (Number.isNaN(qty) || qty < 1) {
    throw new Error('Quantity must be at least 1');
  }

  const current = getStock(drink, normalizedSize);

  if (type === 'stock_in' || type === 'order_restore') {
    setStock(drink, normalizedSize, current + qty);
  } else {
    if (current < qty) {
      throw new Error(
        `Not enough ${drink.name} ${normalizedSize} stock. Available: ${current}`
      );
    }
    setStock(drink, normalizedSize, current - qty);
  }

  await drink.save();

  const balanceAfter = getStock(drink, normalizedSize);
  const log = await DrinkStockLog.create({
    drink: drink._id,
    drinkName: drink.name,
    size: normalizedSize,
    type,
    quantity: qty,
    balanceAfter,
    note,
    orderId: orderId || undefined,
    orderNumber: orderNumber || '',
  });

  return { drink, log };
}

/** Set exact stock count — 0 is allowed */
async function setAbsoluteStock({ drink, size, quantity, note = 'Stock set manually' }) {
  const normalizedSize = normalizeSize(size);
  if (!normalizedSize) {
    throw new Error('Size must be 500ml, 1L, or 1.5L');
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty < 0) {
    throw new Error('Stock cannot be negative');
  }

  const current = getStock(drink, normalizedSize);
  const diff = qty - current;

  setStock(drink, normalizedSize, qty);
  await drink.save();

  let log = null;
  if (diff !== 0) {
    log = await DrinkStockLog.create({
      drink: drink._id,
      drinkName: drink.name,
      size: normalizedSize,
      type: diff > 0 ? 'stock_in' : 'stock_out',
      quantity: Math.abs(diff),
      balanceAfter: qty,
      note,
    });
  }

  return { drink, log };
}

async function reduceStockForOrderItems(items, order) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = [];
  for (const item of items) {
    const matched = await findDrinkFromItemName(item.name);
    if (!matched) continue;

    const qty = Number(item.quantity) || 0;
    if (qty < 1) continue;

    const result = await adjustStock({
      drink: matched.drink,
      size: matched.size,
      type: 'order_use',
      quantity: qty,
      note: `Used in restaurant order ${order.orderNumber}`,
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
    results.push(result);
  }
  return results;
}

async function restoreStockForOrder(order) {
  if (!order?.items?.length) return [];

  const results = [];
  for (const item of order.items) {
    const matched = await findDrinkFromItemName(item.name);
    if (!matched) continue;

    const qty = Number(item.quantity) || 0;
    if (qty < 1) continue;

    const result = await adjustStock({
      drink: matched.drink,
      size: matched.size,
      type: 'order_restore',
      quantity: qty,
      note: `Restored from deleted order ${order.orderNumber}`,
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
    results.push(result);
  }
  return results;
}

async function validateDrinkStock(items) {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const matched = await findDrinkFromItemName(item.name);
    if (!matched) continue;
    const qty = Number(item.quantity) || 0;
    const available = getStock(matched.drink, matched.size);
    if (qty > available) {
      return `Not enough ${matched.drink.name} ${matched.size} stock. Available: ${available}, ordered: ${qty}`;
    }
  }
  return null;
}

module.exports = {
  DEFAULT_DRINKS,
  DRINK_SIZES,
  SIZE_FIELD,
  ensureDefaultDrinks,
  findDrinkByName,
  findDrinkFromItemName,
  parseDrinkItemName,
  normalizeSize,
  getStock,
  setStock,
  toClientDrink,
  adjustStock,
  setAbsoluteStock,
  reduceStockForOrderItems,
  restoreStockForOrder,
  validateDrinkStock,
  normalizeName,
};
