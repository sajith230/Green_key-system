function parseLocalDate(dateInput) {
  if (!dateInput) return new Date();
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(dateInput);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayRange(dateInput) {
  const d = parseLocalDate(dateInput);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end, dateStr: formatDateStr(start) };
}

function normalizeTransactionDate(dateInput) {
  const { start } = getDayRange(dateInput);
  return start;
}

function normalizeTransactionDateTime(dateInput) {
  const now = new Date();
  const { start } = getDayRange(dateInput || now);
  start.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return start;
}

function getPreviousDateStr(dateInput) {
  const d = parseLocalDate(dateInput);
  d.setDate(d.getDate() - 1);
  return formatDateStr(d);
}

function isCashierRoomPayment(paymentMethod) {
  return !paymentMethod || paymentMethod === 'cash' || paymentMethod === 'card';
}

function isOnlineRoomPayment(paymentMethod) {
  return paymentMethod === 'online' || paymentMethod === 'bank';
}

async function getPreviousDayClosing(fetchDayDataFn, dateInput) {
  try {
    const prevDate = getPreviousDateStr(dateInput);
    const prevData = await fetchDayDataFn(prevDate);
    return { prevDate, closingBalance: prevData.cashBalance };
  } catch {
    return { prevDate: getPreviousDateStr(dateInput), closingBalance: 0 };
  }
}

function buildDailyCashierData({ roomBookings, restaurantOrders, transactions }) {
  const openingBalances = transactions.filter((t) => t.category === 'opening_balance');
  const manualRoomBills = transactions.filter((t) => t.category === 'room_bill');
  const manualRestaurantBills = transactions.filter((t) => t.category === 'restaurant_bill');
  const dailyCosts = transactions.filter((t) => t.category === 'daily_cost' || (t.type === 'expense' && t.category === 'other_expense'));
  const salaryAdvances = transactions.filter((t) => t.category === 'salary_advance');
  const salaryPayments = transactions.filter((t) => t.category === 'salary_payment');
  const companyLoans = transactions.filter((t) => t.category === 'company_loan');
  const loanRepayments = transactions.filter((t) => t.category === 'loan_repayment');
  const bankDeposits = transactions.filter((t) => t.category === 'bank_deposit' || t.type === 'bank_deposit');
  const madamCashIn = transactions.filter((t) => t.category === 'madam_cash_in');
  const madamCashPayments = transactions.filter((t) => t.category === 'madam_cash_payment');
  const madamCashReturns = transactions.filter((t) => t.category === 'madam_cash_return');
  const otherIncome = transactions.filter((t) => t.type === 'income' && !['room_bill', 'restaurant_bill', 'opening_balance', 'madam_cash_in', 'loan_repayment'].includes(t.category));

  const openingBalance = openingBalances.reduce((s, t) => s + t.amount, 0);
  const systemRoomIncome = 0;
  const systemRestaurantIncome = restaurantOrders.reduce((s, o) => s + o.total, 0);
  const manualRoomIncome = manualRoomBills.reduce((s, t) => s + t.amount, 0);
  const manualRestaurantIncome = manualRestaurantBills.reduce((s, t) => s + t.amount, 0);
  const totalDailyCost = dailyCosts.reduce((s, t) => s + t.amount, 0);
  const totalSalaryAdvance = salaryAdvances.reduce((s, t) => s + t.amount, 0);
  const totalSalaryPayment = salaryPayments.reduce((s, t) => s + t.amount, 0);
  const totalCompanyLoan = companyLoans.reduce((s, t) => s + t.amount, 0);
  const totalLoanRepayment = loanRepayments.reduce((s, t) => s + t.amount, 0);
  const totalBankDeposit = bankDeposits.reduce((s, t) => s + t.amount, 0);
  const totalMadamCashIn = madamCashIn.reduce((s, t) => s + t.amount, 0);
  const totalMadamCashPayment = madamCashPayments.reduce((s, t) => s + t.amount, 0);
  const totalMadamCashReturn = madamCashReturns.reduce((s, t) => s + t.amount, 0);
  const totalOtherIncome = otherIncome.reduce((s, t) => s + t.amount, 0) + totalMadamCashIn + totalLoanRepayment;

  const totalRoomIncome = systemRoomIncome + manualRoomIncome;
  const totalRestaurantIncome = systemRestaurantIncome + manualRestaurantIncome;
  const dayCashIn = totalRoomIncome + totalRestaurantIncome + totalOtherIncome;
  const totalCashIn = openingBalance + dayCashIn;
  const totalCashOut = totalDailyCost + totalSalaryAdvance + totalSalaryPayment + totalCompanyLoan + totalBankDeposit + totalMadamCashPayment + totalMadamCashReturn;
  const cashBalance = totalCashIn - totalCashOut;

  const ledger = [];

  openingBalances.forEach((t) => {
    ledger.push({
      id: t._id,
      source: 'manual',
      flow: 'in',
      category: 'opening_balance',
      label: 'Opening Balance',
      description: t.description || 'Cash in drawer at start of day',
      amount: t.amount,
      date: t.date,
      paymentMethod: t.paymentMethod || 'cash',
      canDelete: true,
      deleteType: 'transaction',
    });
  });

  restaurantOrders.forEach((o) => {
    ledger.push({
      id: `rest-${o._id}`,
      source: 'system',
      flow: 'in',
      category: 'restaurant_bill',
      label: 'Restaurant Bill',
      description: `${o.orderNumber}${o.tableNumber ? ` — Table ${o.tableNumber}` : ''}`,
      amount: o.total,
      date: o.createdAt,
      paymentMethod: o.paymentMethod,
      canDelete: false,
    });
  });

  transactions.filter((t) => t.category !== 'opening_balance').forEach((t) => {
    const isOut = t.type === 'expense' || t.type === 'bank_deposit' || t.category === 'bank_deposit' || t.category === 'daily_cost' || t.category === 'other_expense' || t.category === 'salary_advance' || t.category === 'salary_payment' || t.category === 'company_loan' || t.category === 'madam_cash_payment' || t.category === 'madam_cash_return';
    const labels = {
      room_bill: 'Room Bill',
      restaurant_bill: 'Restaurant Bill',
      daily_cost: 'Daily Cost',
      bank_deposit: 'Bank Deposit',
      salary_advance: 'Salary Advance',
      salary_payment: 'Salary Payment',
      company_loan: 'Company Loan',
      loan_repayment: 'Loan Repayment',
      other_income: 'Other Income',
      other_expense: 'Other Expense',
      madam_cash_in: 'Madam Cash In',
      madam_cash_payment: 'Madam Cash Payment',
      madam_cash_return: 'Madam Cash Return',
    };
    const isSalaryAdvance = t.category === 'salary_advance';
    const isSalaryPayment = t.category === 'salary_payment';
    const isCompanyLoan = t.category === 'company_loan';
    const isLoanRepayment = t.category === 'loan_repayment';
    const isMadamCash = ['madam_cash_in', 'madam_cash_payment', 'madam_cash_return'].includes(t.category);
    const salaryDeleteType = isSalaryAdvance ? 'advance' : isSalaryPayment ? 'payment' : null;

    ledger.push({
      id: t._id,
      source: isSalaryAdvance || isSalaryPayment ? 'salary' : isCompanyLoan || isLoanRepayment ? 'loan' : isMadamCash ? 'madam_cash' : 'manual',
      flow: isOut ? 'out' : 'in',
      category: t.category,
      label: labels[t.category] || t.category,
      description: t.description || t.reference || '-',
      amount: t.amount,
      date: t.date,
      paymentMethod: t.paymentMethod || 'cash',
      canDelete: salaryDeleteType ? Boolean(t.reference) : true,
      deleteType: salaryDeleteType || 'transaction',
      referenceId: (salaryDeleteType || isCompanyLoan || isLoanRepayment) ? t.reference : undefined,
    });
  });

  ledger.sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    openingBalance,
    roomIncome: totalRoomIncome,
    restaurantIncome: totalRestaurantIncome,
    otherIncome: totalOtherIncome,
    dailyCost: totalDailyCost,
    salaryAdvance: totalSalaryAdvance,
    salaryPayment: totalSalaryPayment,
    bankDeposit: totalBankDeposit,
    madamCashIn: totalMadamCashIn,
    madamCashPayment: totalMadamCashPayment,
    madamCashReturn: totalMadamCashReturn,
    dayCashIn,
    totalCashIn,
    totalCashOut,
    cashBalance,
    counts: {
      roomBills: manualRoomBills.length,
      restaurantBills: restaurantOrders.length + manualRestaurantBills.length,
      dailyCosts: dailyCosts.length,
      salaryAdvances: salaryAdvances.length,
      salaryPayments: salaryPayments.length,
      bankDeposits: bankDeposits.length,
      madamCashIn: madamCashIn.length,
      madamCashPayments: madamCashPayments.length,
      madamCashReturns: madamCashReturns.length,
      openingBalances: openingBalances.length,
    },
    breakdown: {
      systemRoomIncome,
      manualRoomIncome,
      systemRestaurantIncome,
      manualRestaurantIncome,
      systemRoomCount: 0,
      manualRoomCount: manualRoomBills.length,
      systemRestaurantCount: restaurantOrders.length,
      manualRestaurantCount: manualRestaurantBills.length,
    },
    ledger,
    transactions,
    roomBookings,
    restaurantOrders,
  };
}

module.exports = {
  getDayRange,
  parseLocalDate,
  normalizeTransactionDate,
  normalizeTransactionDateTime,
  getPreviousDateStr,
  getPreviousDayClosing,
  buildDailyCashierData,
  isCashierRoomPayment,
  isOnlineRoomPayment,
};
