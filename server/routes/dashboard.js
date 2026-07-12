const express = require('express');
const Room = require('../models/Room');
const RoomBooking = require('../models/RoomBooking');
const RestaurantOrder = require('../models/RestaurantOrder');
const Employee = require('../models/Employee');
const CashierTransaction = require('../models/CashierTransaction');
const BankTransaction = require('../models/BankTransaction');
const Advance = require('../models/Advance');
const SalaryPayment = require('../models/SalaryPayment');
const PendingBill = require('../models/PendingBill');
const auth = require('../middleware/auth');
const { getDayRange, buildDailyCashierData } = require('../utils/cashierBalance');
const { buildDailyDirectDeposits } = require('../utils/bankBalance');
const { fetchPendingBillsForDate } = require('../utils/pendingBills');
const { enrichLedgerDeleteInfo } = require('../utils/ledgerEnrich');
const { generateDailyReportPDF } = require('../utils/dailyReportPdf');
const { getMonthRange, buildMonthEndReport } = require('../utils/monthEndReport');
const { generateMonthEndReportPDF } = require('../utils/monthEndReportPdf');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { start, end, dateStr } = getDayRange();

    const [
      totalRooms,
      occupiedRooms,
      todayRoomBookings,
      todayRestaurantOrders,
      activeEmployees,
      todayTransactions,
      pendingBills,
    ] = await Promise.all([
      Room.countDocuments(),
      Room.countDocuments({ status: 'occupied' }),
      RoomBooking.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }),
      RestaurantOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
      Employee.countDocuments({ isActive: true }),
      CashierTransaction.find({ date: { $gte: start, $lte: end } }),
      fetchPendingBillsForDate(PendingBill, dateStr),
    ]);

    const cashier = buildDailyCashierData({
      roomBookings: todayRoomBookings,
      restaurantOrders: todayRestaurantOrders,
      transactions: todayTransactions,
    });

    res.json({
      date: dateStr,
      rooms: { total: totalRooms, occupied: occupiedRooms, available: totalRooms - occupiedRooms },
      today: {
        roomBookings: todayRoomBookings.length,
        roomRevenue: cashier.roomIncome,
        restaurantOrders: todayRestaurantOrders.length,
        restaurantRevenue: cashier.restaurantIncome,
        openingBalance: cashier.openingBalance,
        totalIncome: cashier.totalCashIn,
        dayCashIn: cashier.dayCashIn,
        totalExpense: cashier.totalCashOut,
        dailyCost: cashier.dailyCost,
        salaryAdvance: cashier.salaryAdvance,
        salaryPayment: cashier.salaryPayment,
        bankDeposit: cashier.bankDeposit,
        balance: cashier.cashBalance,
      },
      employees: activeEmployees,
      recentRoomBookings: todayRoomBookings.slice(0, 5),
      recentRestaurantOrders: todayRestaurantOrders.slice(0, 5),
      pendingBills: {
        count: pendingBills.pendingCount,
        total: pendingBills.pendingTotal,
        bills: pendingBills.pending.slice(0, 5),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/daily-report', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const { start, end, dateStr } = getDayRange(date);

    const [roomBookings, restaurantOrders, transactions, salaryAdvances, bankTransactions, pendingBills] = await Promise.all([
      RoomBooking.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).populate('room', 'roomNumber type'),
      RestaurantOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
      CashierTransaction.find({ date: { $gte: start, $lte: end } }),
      Advance.find({ date: { $gte: start, $lte: end } }).populate('employee', 'name position basicSalary').sort({ date: -1 }),
      BankTransaction.find({ type: 'deposit', date: { $gte: start, $lte: end } }),
      fetchPendingBillsForDate(PendingBill, dateStr),
    ]);

    const cashier = buildDailyCashierData({ roomBookings, restaurantOrders, transactions });
    const bankTransfers = buildDailyDirectDeposits(bankTransactions, dateStr);
    const ledger = await enrichLedgerDeleteInfo(cashier.ledger);

    res.json({
      date: dateStr,
      room: { bookings: roomBookings, count: roomBookings.length, revenue: cashier.roomIncome },
      restaurant: { orders: restaurantOrders, count: restaurantOrders.length, revenue: cashier.restaurantIncome },
      salary: {
        advances: salaryAdvances,
        count: salaryAdvances.length,
        total: salaryAdvances.reduce((s, a) => s + a.amount, 0),
      },
      bankTransfers,
      pendingBills,
      cashier: {
        transactions,
        ledger,
        openingBalance: cashier.openingBalance,
        roomIncome: cashier.roomIncome,
        restaurantIncome: cashier.restaurantIncome,
        otherIncome: cashier.otherIncome,
        dailyCost: cashier.dailyCost,
        salaryAdvance: cashier.salaryAdvance,
        salaryPayment: cashier.salaryPayment,
        bankDeposit: cashier.bankDeposit,
        dayCashIn: cashier.dayCashIn,
        totalCashIn: cashier.totalCashIn,
        totalCashOut: cashier.totalCashOut,
        cashBalance: cashier.cashBalance,
        counts: cashier.counts,
        breakdown: cashier.breakdown,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/daily-report/pdf', auth, async (req, res) => {
  try {
    const { date, type = 'full' } = req.query;
    const { start, end, dateStr } = getDayRange(date);

    const [roomBookings, restaurantOrders, transactions, salaryAdvances, bankTransactions, pendingBills] = await Promise.all([
      RoomBooking.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).populate('room', 'roomNumber type'),
      RestaurantOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
      CashierTransaction.find({ date: { $gte: start, $lte: end } }),
      Advance.find({ date: { $gte: start, $lte: end } }).populate('employee', 'name position').sort({ date: -1 }),
      BankTransaction.find({ type: 'deposit', date: { $gte: start, $lte: end } }),
      fetchPendingBillsForDate(PendingBill, dateStr),
    ]);

    const cashier = buildDailyCashierData({ roomBookings, restaurantOrders, transactions });
    const bankTransfers = buildDailyDirectDeposits(bankTransactions, dateStr);
    const report = {
      date: dateStr,
      room: { bookings: roomBookings, count: roomBookings.length },
      restaurant: { orders: restaurantOrders, count: restaurantOrders.length },
      salary: {
        advances: salaryAdvances,
        count: salaryAdvances.length,
        total: salaryAdvances.reduce((s, a) => s + a.amount, 0),
      },
      bankTransfers,
      pendingBills,
      cashier,
    };

    const pdf = await generateDailyReportPDF(report, type);
    const suffix = type === 'summary' ? 'summary' : 'full';
    const filename = `daily_report_${suffix}_${dateStr}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

async function fetchMonthEndData(month, year) {
  const { start, end } = getMonthRange(month, year);

  const [
    totalRooms,
    roomBookings,
    restaurantOrders,
    transactions,
    salaryAdvances,
    salaryPayments,
    bankTransactions,
    pendingBills,
  ] = await Promise.all([
    Room.countDocuments(),
    RoomBooking.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).populate('room', 'roomNumber type'),
    RestaurantOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'completed' }),
    CashierTransaction.find({ date: { $gte: start, $lte: end } }),
    Advance.find({ month: Number(month), year: Number(year) }).populate('employee', 'name position').sort({ date: -1 }),
    SalaryPayment.find({ month: Number(month), year: Number(year) }).populate('employee', 'name position').sort({ paidDate: -1 }),
    BankTransaction.find({ date: { $gte: start, $lte: end } }),
    PendingBill.find({ date: { $gte: start, $lte: end } }).sort({ date: -1 }),
  ]);

  return buildMonthEndReport({
    month,
    year,
    roomBookings,
    restaurantOrders,
    transactions,
    salaryAdvances,
    salaryPayments,
    bankTransactions,
    pendingBills,
    totalRooms,
  });
}

router.get('/monthly-report', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const report = await fetchMonthEndData(month, year);
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/monthly-report/pdf', auth, async (req, res) => {
  try {
    const { month, year, type = 'summary' } = req.query;
    const report = await fetchMonthEndData(month, year);
    const pdf = await generateMonthEndReportPDF(report, type);
    const suffix = type === 'summary' ? 'summary' : 'full';
    const filename = `month_end_report_${suffix}_${report.monthKey}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
