const { buildDailyCashierData } = require('./cashierBalance');

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthRange(monthInput, yearInput) {
  const now = new Date();
  const month = Number(monthInput) || now.getMonth() + 1;
  const year = Number(yearInput) || now.getFullYear();
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const daysInMonth = end.getDate();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return {
    start,
    end,
    month,
    year,
    daysInMonth,
    monthKey,
    monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

function dateInRange(dateInput, start, end) {
  const d = new Date(dateInput);
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function toDateStr(dateInput) {
  const d = new Date(dateInput);
  return formatDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
}

function buildDailyBuckets({ year, month, daysInMonth }) {
  const buckets = {};
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    buckets[dateStr] = {
      date: dateStr,
      day,
      roomRevenue: 0,
      restaurantRevenue: 0,
      otherIncome: 0,
      totalIncome: 0,
      dailyCost: 0,
      salaryAdvance: 0,
      salaryPayment: 0,
      bankDeposit: 0,
      totalExpense: 0,
      netCash: 0,
      roomBookings: 0,
      restaurantOrders: 0,
    };
  }
  return buckets;
}

function buildMonthEndReport({
  month,
  year,
  roomBookings,
  restaurantOrders,
  transactions,
  salaryAdvances,
  salaryPayments,
  bankTransactions,
  pendingBills,
  totalRooms = 0,
}) {
  const range = getMonthRange(month, year);
  const cashier = buildDailyCashierData({ roomBookings, restaurantOrders, transactions });

  const directDeposits = bankTransactions.filter((t) => t.type === 'deposit' && !t.cashierTransactionId);
  const bankChecks = bankTransactions.filter((t) => t.type === 'check');
  const cashierBankDeposits = bankTransactions.filter((t) => t.type === 'deposit' && t.cashierTransactionId);

  const pendingCreated = pendingBills.filter((b) => b.status !== 'cancelled');
  const pendingOutstanding = pendingBills.filter((b) => b.status === 'pending');
  const pendingCollected = pendingBills.filter((b) => b.status === 'collected');

  const totalBankTransfers = directDeposits.reduce((s, t) => s + t.amount, 0);
  const totalBankChecks = bankChecks.reduce((s, t) => s + t.amount, 0);
  const totalSalaryAdvanceRecords = salaryAdvances.reduce((s, a) => s + a.amount, 0);
  const totalSalaryPaymentRecords = salaryPayments.reduce((s, p) => s + p.netSalary, 0);

  const totalRevenue = cashier.dayCashIn + totalBankTransfers;
  const totalExpenses = cashier.totalCashOut;
  const netProfit = totalRevenue - totalExpenses;

  const totalNights = roomBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const roomCapacityNights = totalRooms * range.daysInMonth;
  const occupancyRate = roomCapacityNights > 0
    ? Math.round((totalNights / roomCapacityNights) * 100)
    : 0;

  const buckets = buildDailyBuckets(range);
  for (let day = 1; day <= range.daysInMonth; day += 1) {
    const dateStr = `${range.year}-${String(range.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayStart = new Date(range.year, range.month - 1, day, 0, 0, 0, 0);
    const dayEnd = new Date(range.year, range.month - 1, day, 23, 59, 59, 999);

    const dayBookings = roomBookings.filter((b) => dateInRange(b.createdAt, dayStart, dayEnd));
    const dayOrders = restaurantOrders.filter((o) => dateInRange(o.createdAt, dayStart, dayEnd));
    const dayTx = transactions.filter((t) => dateInRange(t.date, dayStart, dayEnd));
    const dayCashier = buildDailyCashierData({
      roomBookings: dayBookings,
      restaurantOrders: dayOrders,
      transactions: dayTx,
    });

    buckets[dateStr] = {
      ...buckets[dateStr],
      roomRevenue: dayCashier.roomIncome,
      restaurantRevenue: dayCashier.restaurantIncome,
      otherIncome: dayCashier.otherIncome,
      totalIncome: dayCashier.dayCashIn,
      dailyCost: dayCashier.dailyCost,
      salaryAdvance: dayCashier.salaryAdvance,
      salaryPayment: dayCashier.salaryPayment,
      bankDeposit: dayCashier.bankDeposit,
      totalExpense: dayCashier.totalCashOut,
      netCash: dayCashier.dayCashIn - dayCashier.totalCashOut,
      roomBookings: dayBookings.length,
      restaurantOrders: dayOrders.length,
    };
  }

  const dailyTrend = Object.values(buckets);
  const maxDailyIncome = Math.max(...dailyTrend.map((d) => d.totalIncome), 1);

  const bestDay = dailyTrend.reduce((best, d) => (d.totalIncome > best.totalIncome ? d : best), dailyTrend[0]);
  const busiestRoomDay = dailyTrend.reduce((best, d) => (d.roomBookings > best.roomBookings ? d : best), dailyTrend[0]);
  const busiestRestaurantDay = dailyTrend.reduce((best, d) => (d.restaurantOrders > best.restaurantOrders ? d : best), dailyTrend[0]);

  const avgDailyIncome = range.daysInMonth > 0
    ? Math.round(cashier.dayCashIn / range.daysInMonth)
    : 0;

  return {
    month: range.month,
    year: range.year,
    monthLabel: range.monthLabel,
    monthKey: range.monthKey,
    period: {
      start: toDateStr(range.start),
      end: toDateStr(range.end),
      daysInMonth: range.daysInMonth,
    },
    summary: {
      totalRevenue,
      cashIncome: cashier.dayCashIn,
      bankTransfers: totalBankTransfers,
      totalExpenses,
      netProfit,
      profitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0,
      avgDailyIncome,
    },
    rooms: {
      bookings: roomBookings.length,
      revenue: cashier.roomIncome,
      nights: totalNights,
      occupancyRate,
      systemRevenue: cashier.breakdown.systemRoomIncome,
      manualRevenue: cashier.breakdown.manualRoomIncome,
    },
    restaurant: {
      orders: restaurantOrders.length,
      revenue: cashier.restaurantIncome,
      systemRevenue: cashier.breakdown.systemRestaurantIncome,
      manualRevenue: cashier.breakdown.manualRestaurantIncome,
      avgOrderValue: restaurantOrders.length > 0
        ? Math.round(cashier.restaurantIncome / restaurantOrders.length)
        : 0,
    },
    expenses: {
      dailyCost: cashier.dailyCost,
      salaryAdvance: cashier.salaryAdvance,
      salaryPayment: cashier.salaryPayment,
      bankDeposit: cashier.bankDeposit,
      otherExpense: transactions
        .filter((t) => t.type === 'expense' && t.category === 'other_expense')
        .reduce((s, t) => s + t.amount, 0),
      total: totalExpenses,
    },
    income: {
      room: cashier.roomIncome,
      restaurant: cashier.restaurantIncome,
      other: cashier.otherIncome,
      total: cashier.dayCashIn,
    },
    salary: {
      advances: {
        count: salaryAdvances.length,
        total: totalSalaryAdvanceRecords,
        items: salaryAdvances,
      },
      payments: {
        count: salaryPayments.length,
        total: totalSalaryPaymentRecords,
        items: salaryPayments,
      },
    },
    bank: {
      directDeposits: {
        count: directDeposits.length,
        total: totalBankTransfers,
        items: directDeposits,
      },
      checks: {
        count: bankChecks.length,
        total: totalBankChecks,
        items: bankChecks,
      },
      cashierDeposits: {
        count: cashierBankDeposits.length,
        total: cashierBankDeposits.reduce((s, t) => s + t.amount, 0),
      },
      netBankFlow: totalBankTransfers - totalBankChecks,
    },
    pendingBills: {
      created: pendingCreated.length,
      createdTotal: pendingCreated.reduce((s, b) => s + b.amount, 0),
      outstanding: pendingOutstanding.length,
      outstandingTotal: pendingOutstanding.reduce((s, b) => s + b.amount, 0),
      collected: pendingCollected.length,
      collectedTotal: pendingCollected.reduce((s, b) => s + b.amount, 0),
      bills: pendingBills,
    },
    highlights: {
      bestIncomeDay: bestDay,
      busiestRoomDay,
      busiestRestaurantDay,
    },
    dailyTrend,
    chart: {
      maxDailyIncome,
    },
    counts: cashier.counts,
    breakdown: cashier.breakdown,
  };
}

module.exports = {
  MONTH_NAMES,
  getMonthRange,
  buildMonthEndReport,
};
