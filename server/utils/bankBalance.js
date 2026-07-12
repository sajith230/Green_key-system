const { getDayRange, parseLocalDate, normalizeTransactionDate, normalizeTransactionDateTime } = require('./cashierBalance');

function isOnOrBefore(transactionDate, asOfDate) {
  const tx = parseLocalDate(transactionDate);
  const asOf = parseLocalDate(asOfDate);
  return tx.getTime() <= asOf.getTime();
}

function buildBankBalanceData(transactions, asOfDate) {
  const openingBalances = transactions.filter((t) => t.type === 'opening_balance');
  const deposits = transactions.filter((t) => t.type === 'deposit' && isOnOrBefore(t.date, asOfDate));
  const checks = transactions.filter((t) => t.type === 'check' && isOnOrBefore(t.date, asOfDate));
  const pendingChecks = transactions.filter((t) => t.type === 'check' && !isOnOrBefore(t.date, asOfDate));

  const openingBalance = openingBalances.reduce((s, t) => s + t.amount, 0);
  const totalDeposits = deposits.reduce((s, t) => s + t.amount, 0);
  const totalChecks = checks.reduce((s, t) => s + t.amount, 0);
  const pendingCheckTotal = pendingChecks.reduce((s, t) => s + t.amount, 0);
  const availableBalance = openingBalance + totalDeposits - totalChecks;

  const ledger = transactions.map((t) => {
    const isCheck = t.type === 'check';
    const isPending = isCheck && !isOnOrBefore(t.date, asOfDate);
    const affectsBalance = t.type === 'opening_balance' || t.type === 'deposit' || (isCheck && !isPending);

    const labels = {
      opening_balance: 'Opening Balance',
      deposit: t.cashierTransactionId ? 'Deposit (Cashier)' : 'Direct Deposit',
      check: isPending ? 'Check (Pending)' : 'Check',
    };

    const isCashierDeposit = t.type === 'deposit' && t.cashierTransactionId;

    return {
      id: t._id,
      type: t.type,
      label: labels[t.type],
      description: t.description || (isCheck ? `Check to ${t.customerName}` : '-'),
      customerName: t.customerName || '',
      checkNumber: t.checkNumber || '',
      amount: t.amount,
      date: t.date,
      flow: t.type === 'deposit' || t.type === 'opening_balance' ? 'in' : 'out',
      status: isPending ? 'pending' : 'cleared',
      affectsBalance,
      source: isCashierDeposit ? 'cashier' : 'bank',
      canDelete: t.type === 'check' || (t.type === 'deposit' && !t.cashierTransactionId),
      cashierTransactionId: t.cashierTransactionId || null,
    };
  });

  ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    openingBalance,
    totalDeposits,
    totalChecks,
    pendingCheckTotal,
    availableBalance,
    hasOpeningBalance: openingBalances.length > 0,
    counts: {
      deposits: deposits.length,
      checks: checks.length,
      pendingChecks: pendingChecks.length,
      totalTransactions: transactions.length,
    },
    ledger,
    transactions,
  };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthKey(dateInput) {
  const d = parseLocalDate(dateInput);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildMonthlyHistory(transactions, year) {
  const targetYear = Number(year) || new Date().getFullYear();
  const months = {};

  for (let m = 1; m <= 12; m += 1) {
    const key = `${targetYear}-${String(m).padStart(2, '0')}`;
    months[key] = {
      monthKey: key,
      monthLabel: `${MONTH_NAMES[m - 1]} ${targetYear}`,
      monthNumber: m,
      deposits: [],
      checks: [],
      totalDeposits: 0,
      totalChecks: 0,
      depositCount: 0,
      checkCount: 0,
      netAmount: 0,
    };
  }

  transactions.forEach((t) => {
    if (t.type === 'opening_balance') return;
    const key = getMonthKey(t.date);
    if (!key.startsWith(`${targetYear}-`)) return;
    if (!months[key]) return;

    const entry = {
      id: t._id,
      date: t.date,
      amount: t.amount,
      description: t.description || '',
      customerName: t.customerName || '',
      checkNumber: t.checkNumber || '',
    };

    if (t.type === 'deposit') {
      months[key].deposits.push(entry);
      months[key].totalDeposits += t.amount;
      months[key].depositCount += 1;
    } else if (t.type === 'check') {
      months[key].checks.push(entry);
      months[key].totalChecks += t.amount;
      months[key].checkCount += 1;
    }
  });

  const monthlyData = Object.values(months)
    .map((month) => ({
      ...month,
      netAmount: month.totalDeposits - month.totalChecks,
      deposits: month.deposits.sort((a, b) => new Date(b.date) - new Date(a.date)),
      checks: month.checks.sort((a, b) => new Date(b.date) - new Date(a.date)),
    }))
    .sort((a, b) => b.monthNumber - a.monthNumber);

  const yearTotals = monthlyData.reduce(
    (acc, month) => ({
      totalDeposits: acc.totalDeposits + month.totalDeposits,
      totalChecks: acc.totalChecks + month.totalChecks,
      depositCount: acc.depositCount + month.depositCount,
      checkCount: acc.checkCount + month.checkCount,
    }),
    { totalDeposits: 0, totalChecks: 0, depositCount: 0, checkCount: 0 },
  );

  return {
    year: targetYear,
    months: monthlyData,
    yearTotals: {
      ...yearTotals,
      netAmount: yearTotals.totalDeposits - yearTotals.totalChecks,
    },
  };
}

function buildDailyDirectDeposits(transactions, dateInput) {
  const { start, end, dateStr } = getDayRange(dateInput);
  const deposits = transactions.filter((t) => {
    if (t.type !== 'deposit' || t.cashierTransactionId) return false;
    const d = parseLocalDate(t.date);
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  });

  const items = deposits
    .map((t) => ({
      id: t._id,
      date: t.date,
      createdAt: t.createdAt,
      amount: t.amount,
      description: t.description || 'Online bank transfer',
    }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    date: dateStr,
    deposits: items,
    count: items.length,
    total: items.reduce((s, t) => s + t.amount, 0),
  };
}

module.exports = {
  getDayRange,
  normalizeTransactionDate,
  normalizeTransactionDateTime,
  buildBankBalanceData,
  buildMonthlyHistory,
  buildDailyDirectDeposits,
  isOnOrBefore,
};
