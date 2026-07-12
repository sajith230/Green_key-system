const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');

const green = '#1b4332';
const incomeGreen = '#2d6a4f';
const expenseRed = '#c1121f';
const darkText = '#1a1a1a';
const mutedText = '#666666';
const borderColor = '#d0d0d0';
const PAGE_BOTTOM = 740;
const MARGIN = 40;
const CONTENT_WIDTH = 515;

function formatRs(n) {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage();
    return MARGIN + 8;
  }
  return y;
}

function drawHeader(doc, monthLabel) {
  doc.rect(0, 0, doc.page.width, 88).fill(green);
  doc.fillColor('#ffffff')
    .fontSize(22).font('Helvetica-Bold')
    .text(hotel.name, MARGIN, 18);
  doc.fontSize(9).font('Helvetica')
    .text(hotel.address, MARGIN, 44)
    .text(`Tel: ${hotel.phone}`, MARGIN, 57);

  doc.fillColor(darkText);
  doc.fontSize(16).font('Helvetica-Bold')
    .text('Month-End Financial Report', MARGIN, 102, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(12).font('Helvetica-Bold').fillColor(green)
    .text(monthLabel, MARGIN, 124, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(8).font('Helvetica').fillColor(mutedText)
    .text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 142, { align: 'center', width: CONTENT_WIDTH });

  return 158;
}

function drawSummaryBox(doc, x, y, label, value, color = green) {
  const boxW = CONTENT_WIDTH / 2 - 6;
  doc.roundedRect(x, y, boxW, 52, 6).stroke(borderColor);
  doc.fontSize(9).fillColor(mutedText).font('Helvetica').text(label, x + 10, y + 10);
  doc.fontSize(14).fillColor(color).font('Helvetica-Bold').text(value, x + 10, y + 26);
}

function drawRow(doc, y, label, value, opts = {}) {
  const { bold = false, color = darkText } = opts;
  doc.fontSize(10).fillColor(mutedText).font('Helvetica').text(label, MARGIN, y, { width: 300 });
  doc.fontSize(10).fillColor(color).font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(value, MARGIN + 300, y, { width: 215, align: 'right' });
  return y + 18;
}

function generateMonthEndReportPDF(report, type = 'summary') {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const s = report.summary;
      let y = drawHeader(doc, report.monthLabel);

      y = ensureSpace(doc, y, 70);
      const col2 = MARGIN + CONTENT_WIDTH / 2 + 6;
      drawSummaryBox(doc, MARGIN, y, 'Total Revenue', formatRs(s.totalRevenue), incomeGreen);
      drawSummaryBox(doc, col2, y, 'Total Expenses', formatRs(s.totalExpenses), expenseRed);
      drawSummaryBox(doc, MARGIN, y + 58, 'Net Profit', formatRs(s.netProfit), s.netProfit >= 0 ? incomeGreen : expenseRed);
      drawSummaryBox(doc, col2, y + 58, 'Profit Margin', `${s.profitMargin}%`, green);
      y += 120;

      y = ensureSpace(doc, y, 30);
      doc.fontSize(12).fillColor(green).font('Helvetica-Bold').text('Income Breakdown', MARGIN, y);
      y += 20;
      y = drawRow(doc, y, 'Room Revenue', formatRs(report.income.room));
      y = drawRow(doc, y, 'Restaurant Revenue', formatRs(report.income.restaurant));
      y = drawRow(doc, y, 'Other Income', formatRs(report.income.other));
      y = drawRow(doc, y, 'Online Bank Transfers', formatRs(s.bankTransfers));
      y = drawRow(doc, y, 'Total Cash Income', formatRs(s.cashIncome), { bold: true, color: incomeGreen });
      y += 10;

      y = ensureSpace(doc, y, 30);
      doc.fontSize(12).fillColor(green).font('Helvetica-Bold').text('Expense Breakdown', MARGIN, y);
      y += 20;
      y = drawRow(doc, y, 'Daily Costs', formatRs(report.expenses.dailyCost));
      y = drawRow(doc, y, 'Salary Advances', formatRs(report.expenses.salaryAdvance));
      y = drawRow(doc, y, 'Salary Payments', formatRs(report.expenses.salaryPayment));
      y = drawRow(doc, y, 'Bank Deposits (Cash Out)', formatRs(report.expenses.bankDeposit));
      y = drawRow(doc, y, 'Total Expenses', formatRs(s.totalExpenses), { bold: true, color: expenseRed });
      y += 10;

      y = ensureSpace(doc, y, 30);
      doc.fontSize(12).fillColor(green).font('Helvetica-Bold').text('Operations Summary', MARGIN, y);
      y += 20;
      y = drawRow(doc, y, 'Room Bookings', String(report.rooms.bookings));
      y = drawRow(doc, y, 'Total Room Nights', String(report.rooms.nights));
      y = drawRow(doc, y, 'Occupancy Rate', `${report.rooms.occupancyRate}%`);
      y = drawRow(doc, y, 'Restaurant Orders', String(report.restaurant.orders));
      y = drawRow(doc, y, 'Avg. Order Value', formatRs(report.restaurant.avgOrderValue));
      y = drawRow(doc, y, 'Salary Payments Made', String(report.salary.payments.count));
      y = drawRow(doc, y, 'Pending Bills Outstanding', formatRs(report.pendingBills.outstandingTotal));

      if (type === 'full' && report.dailyTrend?.length) {
        y = ensureSpace(doc, y, 40);
        y += 16;
        doc.fontSize(12).fillColor(green).font('Helvetica-Bold').text('Daily Income Trend', MARGIN, y);
        y += 20;

        doc.fontSize(8).fillColor(mutedText).font('Helvetica-Bold');
        doc.text('Date', MARGIN, y, { width: 80 });
        doc.text('Room', MARGIN + 80, y, { width: 80, align: 'right' });
        doc.text('Restaurant', MARGIN + 160, y, { width: 80, align: 'right' });
        doc.text('Income', MARGIN + 240, y, { width: 80, align: 'right' });
        doc.text('Expense', MARGIN + 320, y, { width: 80, align: 'right' });
        doc.text('Net', MARGIN + 400, y, { width: 115, align: 'right' });
        y += 14;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke(borderColor);
        y += 6;

        report.dailyTrend.forEach((day) => {
          y = ensureSpace(doc, y, 14);
          doc.fontSize(8).fillColor(darkText).font('Helvetica');
          doc.text(day.date, MARGIN, y, { width: 80 });
          doc.text(formatRs(day.roomRevenue), MARGIN + 80, y, { width: 80, align: 'right' });
          doc.text(formatRs(day.restaurantRevenue), MARGIN + 160, y, { width: 80, align: 'right' });
          doc.text(formatRs(day.totalIncome), MARGIN + 240, y, { width: 80, align: 'right' });
          doc.text(formatRs(day.totalExpense), MARGIN + 320, y, { width: 80, align: 'right' });
          doc.fillColor(day.netCash >= 0 ? incomeGreen : expenseRed)
            .text(formatRs(day.netCash), MARGIN + 400, y, { width: 115, align: 'right' });
          y += 12;
        });
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const pageNum = i - range.start + 1;
        doc.fontSize(8).fillColor(mutedText).font('Helvetica')
          .text(`${hotel.name} | Month-End Report | Page ${pageNum} of ${range.count}`, MARGIN, doc.page.height - MARGIN, {
            align: 'center',
            width: CONTENT_WIDTH,
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateMonthEndReportPDF };
