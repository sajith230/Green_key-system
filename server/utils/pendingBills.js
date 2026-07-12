const { getDayRange } = require('./cashierBalance');

const BILL_TYPE_LABELS = {
  room: 'Room',
  restaurant: 'Restaurant',
  other: 'Other',
};

function buildDailyPendingBills(bills) {
  const pending = bills.filter((b) => b.status === 'pending');
  const collected = bills.filter((b) => b.status === 'collected');

  return {
    bills,
    pending,
    collected,
    count: bills.length,
    pendingCount: pending.length,
    collectedCount: collected.length,
    pendingTotal: pending.reduce((s, b) => s + b.amount, 0),
    collectedTotal: collected.reduce((s, b) => s + b.amount, 0),
    total: bills.reduce((s, b) => s + b.amount, 0),
  };
}

async function fetchPendingBillsForDate(PendingBill, dateInput) {
  const { start, end } = getDayRange(dateInput);
  const bills = await PendingBill.find({
    date: { $gte: start, $lte: end },
    status: { $ne: 'cancelled' },
  }).sort({ date: -1 });
  return buildDailyPendingBills(bills);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchPendingBillsHistory(PendingBill, { search, status, from, to, limit = 300 } = {}) {
  const filter = { status: { $ne: 'cancelled' } };

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = getDayRange(from).start;
    if (to) filter.date.$lte = getDayRange(to).end;
  }

  const q = search?.trim();
  if (q) {
    const regex = new RegExp(escapeRegex(q), 'i');
    filter.$or = [
      { customerName: regex },
      { description: regex },
      { reference: regex },
      { note: regex },
    ];
    const lower = q.toLowerCase();
    if (lower.includes('room')) filter.$or.push({ billType: 'room' });
    if (lower.includes('restaurant')) filter.$or.push({ billType: 'restaurant' });
    if (lower.includes('other')) filter.$or.push({ billType: 'other' });
  }

  const bills = await PendingBill.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(Number(limit) || 300);

  return buildDailyPendingBills(bills);
}

module.exports = {
  BILL_TYPE_LABELS,
  buildDailyPendingBills,
  fetchPendingBillsForDate,
  fetchPendingBillsHistory,
};
