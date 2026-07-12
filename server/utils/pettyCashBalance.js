const { parseLocalDate, normalizeTransactionDate, normalizeTransactionDateTime } = require('./cashierBalance');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isOnOrBefore(transactionDate, asOfDate) {
  const tx = parseLocalDate(transactionDate);
  const asOf = parseLocalDate(asOfDate);
  return tx.getTime() <= asOf.getTime();
}

function isInMonthYear(transactionDate, month, year) {
  const d = parseLocalDate(transactionDate);
  return d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year);
}

function computeBalance(transactions, asOfDate = null) {
  let balance = 0;
  for (const t of transactions) {
    if (asOfDate && !isOnOrBefore(t.date, asOfDate)) continue;
    if (t.type === 'fund_in') balance += t.amount;
    else balance -= t.amount;
  }
  return balance;
}

function getMonthYearFromDate(dateInput) {
  const d = parseLocalDate(dateInput);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function buildLedgerItem(t) {
  const labels = {
    fund_in: 'Cash from Owner',
    return_to_owner: 'Returned to Owner',
    expense: 'Expense / Cost',
    salary_advance: 'Salary Advance',
  };

  return {
    id: t._id,
    type: t.type,
    label: labels[t.type] || t.type,
    description: t.description || '-',
    amount: t.amount,
    date: t.date,
    month: t.month,
    year: t.year,
    flow: t.type === 'fund_in' ? 'in' : 'out',
    reference: t.reference || '',
    canDelete: t.type !== 'salary_advance',
  };
}

function buildPettyCashData(transactions, month, year) {
  const m = Number(month);
  const y = Number(year);
  const monthTransactions = transactions.filter((t) => isInMonthYear(t.date, m, y));
  const currentBalance = computeBalance(transactions);

  const totalGivenByOwner = monthTransactions
    .filter((t) => t.type === 'fund_in')
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);
  const totalSalaryAdvances = monthTransactions
    .filter((t) => t.type === 'salary_advance')
    .reduce((s, t) => s + t.amount, 0);
  const totalReturned = monthTransactions
    .filter((t) => t.type === 'return_to_owner')
    .reduce((s, t) => s + t.amount, 0);
  const totalSpent = totalExpenses + totalSalaryAdvances + totalReturned;

  const ledger = monthTransactions
    .map(buildLedgerItem)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    month: m,
    year: y,
    currentBalance,
    totalGivenByOwner,
    totalExpenses,
    totalSalaryAdvances,
    totalReturned,
    totalSpent,
    ledger,
  };
}

function buildYearlySummary(transactions, year) {
  const y = Number(year);
  const months = MONTH_NAMES.map((name, index) => {
    const month = index + 1;
    const monthTransactions = transactions.filter((t) => isInMonthYear(t.date, month, y));
    const totalGivenByOwner = monthTransactions
      .filter((t) => t.type === 'fund_in')
      .reduce((s, t) => s + t.amount, 0);
    const totalSpent = monthTransactions
      .filter((t) => t.type !== 'fund_in')
      .reduce((s, t) => s + t.amount, 0);

    return {
      month,
      monthName: name,
      monthKey: `${y}-${String(month).padStart(2, '0')}`,
      totalGivenByOwner,
      totalSpent,
      transactionCount: monthTransactions.length,
      hasActivity: monthTransactions.length > 0,
    };
  });

  return {
    year: y,
    months,
    yearlyTotalGiven: months.reduce((s, m) => s + m.totalGivenByOwner, 0),
  };
}

module.exports = {
  MONTH_NAMES,
  computeBalance,
  getMonthYearFromDate,
  buildPettyCashData,
  buildYearlySummary,
  normalizeTransactionDate,
  normalizeTransactionDateTime,
};
