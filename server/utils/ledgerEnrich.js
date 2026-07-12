const CashierTransaction = require('../models/CashierTransaction');
const Advance = require('../models/Advance');
const SalaryPayment = require('../models/SalaryPayment');

async function enrichLedgerDeleteInfo(ledger) {
  return Promise.all(ledger.map(async (item) => {
    if (item.category === 'salary_advance') {
      let referenceId = item.referenceId;
      if (!referenceId) {
        const advance = await Advance.findOne({ cashierTransactionId: item.id });
        referenceId = advance?._id?.toString();
      }
      return {
        ...item,
        referenceId,
        deleteType: 'advance',
        canDelete: Boolean(referenceId),
      };
    }

    if (item.category === 'salary_payment') {
      let referenceId = item.referenceId;
      if (!referenceId) {
        const tx = await CashierTransaction.findById(item.id).select('reference');
        referenceId = tx?.reference || undefined;
      }
      if (!referenceId) {
        const payment = await SalaryPayment.findOne({ netSalary: item.amount }).sort({ paidDate: -1 });
        referenceId = payment?._id?.toString();
      }
      return {
        ...item,
        referenceId,
        deleteType: 'payment',
        canDelete: Boolean(referenceId),
      };
    }

    return item;
  }));
}

module.exports = { enrichLedgerDeleteInfo };
