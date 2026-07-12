const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');

const green = '#1b4332';
const lightGreen = '#d8f3dc';
const incomeGreen = '#2d6a4f';
const expenseRed = '#c1121f';
const lightRed = '#ffe8e8';
const darkText = '#1a1a1a';
const mutedText = '#666666';
const borderColor = '#d0d0d0';
const PAGE_BOTTOM = 740;
const MARGIN = 40;
const CONTENT_WIDTH = 515;

function formatRs(n) {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}

function formatTime(date, createdAt) {
  const d = new Date(date);
  const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
  const source = isMidnight && createdAt ? new Date(createdAt) : d;
  return source.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLong(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE_BOTTOM) {
    doc.addPage();
    return MARGIN + 8;
  }
  return y;
}

function addPageFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const pageNum = i - range.start + 1;
    const total = range.count;
    const footerY = doc.page.height - MARGIN - 10;
    doc.fontSize(8).fillColor(mutedText).font('Helvetica')
      .text(
        `${hotel.name}  |  Tel: ${hotel.phone}  |  Page ${pageNum} of ${total}`,
        MARGIN,
        footerY,
        { align: 'center', width: CONTENT_WIDTH, lineBreak: false }
      );
  }
  doc.switchToPage(range.start + range.count - 1);
}

function drawHeader(doc, title, subtitle, reportDate) {
  doc.rect(0, 0, doc.page.width, 88).fill(green);
  doc.fillColor('#ffffff')
    .fontSize(22).font('Helvetica-Bold')
    .text(hotel.name, MARGIN, 18);
  doc.fontSize(9).font('Helvetica')
    .text(hotel.address, MARGIN, 44)
    .text(`Tel: ${hotel.phone}`, MARGIN, 57);

  doc.fillColor(darkText);
  doc.fontSize(16).font('Helvetica-Bold')
    .text(title, MARGIN, 102, { align: 'center', width: CONTENT_WIDTH });
  if (subtitle) {
    doc.fontSize(10).font('Helvetica').fillColor(mutedText)
      .text(subtitle, MARGIN, 122, { align: 'center', width: CONTENT_WIDTH });
  }
  doc.fontSize(10).font('Helvetica-Bold').fillColor(green)
    .text(formatDateLong(reportDate), MARGIN, subtitle ? 138 : 124, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(8).font('Helvetica').fillColor(mutedText)
    .text(`Generated: ${new Date().toLocaleString()}`, MARGIN, subtitle ? 152 : 138, { align: 'center', width: CONTENT_WIDTH });

  return subtitle ? 168 : 154;
}

function drawSectionTitle(doc, title, y, badge) {
  y = ensureSpace(doc, y, 40);
  const lineY = y + 22;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(green);

  if (badge) {
    const badgeText = String(badge);
    doc.font('Helvetica-Bold').fontSize(9);
    const badgeW = Math.max(doc.widthOfString(badgeText) + 20, 70);
    const badgeX = MARGIN + CONTENT_WIDTH - badgeW;
    const titleMaxW = badgeX - MARGIN - 12;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(green)
      .text(title, MARGIN, y, { width: titleMaxW, lineBreak: false });

    doc.roundedRect(badgeX, y - 2, badgeW, 18, 4).fill(lightGreen);
    const isMoney = badgeText.startsWith('Rs.');
    doc.fillColor(isMoney ? expenseRed : green).fontSize(9).font('Helvetica-Bold')
      .text(badgeText, badgeX + 6, y + 4, { width: badgeW - 12, align: 'center' });
  } else {
    doc.text(title, MARGIN, y);
  }

  doc.strokeColor(borderColor).moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_WIDTH, lineY).stroke();
  return lineY + 10;
}

function drawStatBoxes(doc, boxes, y) {
  y = ensureSpace(doc, y, 56);
  const gap = 8;
  const boxW = (CONTENT_WIDTH - gap * (boxes.length - 1)) / boxes.length;

  boxes.forEach((box, i) => {
    const x = MARGIN + i * (boxW + gap);
    const bg = box.variant === 'expense' ? lightRed : box.variant === 'final' ? green : lightGreen;
    const valueColor = box.variant === 'expense' ? expenseRed : box.variant === 'final' ? '#ffffff' : green;
    const labelColor = box.variant === 'final' ? '#e8f5e9' : mutedText;

    doc.roundedRect(x, y, boxW, 50, 5).fill(bg);
    doc.fillColor(labelColor).fontSize(8).font('Helvetica')
      .text(box.label.toUpperCase(), x + 8, y + 8, { width: boxW - 16 });
    doc.fillColor(valueColor).fontSize(box.variant === 'final' ? 13 : 12).font('Helvetica-Bold')
      .text(box.value, x + 8, y + 24, { width: boxW - 16 });
    if (box.sub) {
      doc.fillColor(box.variant === 'final' ? '#c8e6c9' : mutedText).fontSize(7).font('Helvetica')
        .text(box.sub, x + 8, y + 40, { width: boxW - 16 });
    }
  });

  return y + 62;
}

function drawFormulaBar(doc, c, y) {
  y = ensureSpace(doc, y, 44);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 36, 4).fill('#f4f7f4');
  doc.strokeColor(borderColor).roundedRect(MARGIN, y, CONTENT_WIDTH, 36, 4).stroke();

  const parts = [
    { t: 'Opening', v: formatRs(c.openingBalance), c: darkText },
    { t: '+', v: '', c: mutedText },
    { t: 'Income', v: formatRs(c.dayCashIn), c: incomeGreen },
    { t: '−', v: '', c: mutedText },
    { t: 'Expenses', v: formatRs(c.totalCashOut), c: expenseRed },
    { t: '=', v: '', c: mutedText },
    { t: 'Closing', v: formatRs(c.cashBalance), c: green },
  ];

  let x = MARGIN + 10;
  parts.forEach((p) => {
    if (p.v) {
      doc.fillColor(mutedText).fontSize(7).font('Helvetica').text(p.t, x, y + 6, { lineBreak: false });
      doc.fillColor(p.c).fontSize(10).font('Helvetica-Bold').text(p.v, x, y + 18, { lineBreak: false });
      x += 72;
    } else {
      doc.fillColor(p.c).fontSize(14).font('Helvetica-Bold').text(p.t, x, y + 14, { lineBreak: false });
      x += 18;
    }
  });

  return y + 48;
}

function drawTwoColumnPanel(doc, leftTitle, leftRows, rightTitle, rightRows, y) {
  y = ensureSpace(doc, y, 30 + Math.max(leftRows.length, rightRows.length) * 18 + 20);
  const colW = (CONTENT_WIDTH - 12) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 12;
  const panelH = 22 + Math.max(leftRows.length, rightRows.length) * 18 + 8;

  doc.roundedRect(leftX, y, colW, panelH, 4).fill('#f0faf0');
  doc.roundedRect(rightX, y, colW, panelH, 4).fill('#fff5f5');

  doc.fillColor(incomeGreen).fontSize(10).font('Helvetica-Bold').text(leftTitle, leftX + 10, y + 8);
  doc.fillColor(expenseRed).fontSize(10).font('Helvetica-Bold').text(rightTitle, rightX + 10, y + 8);

  leftRows.forEach(([label, value], i) => {
    const rowY = y + 26 + i * 18;
    doc.fillColor(darkText).fontSize(9).font('Helvetica').text(label, leftX + 10, rowY);
    doc.fillColor(incomeGreen).font('Helvetica-Bold').text(value, leftX + colW - 90, rowY, { width: 80, align: 'right' });
  });

  rightRows.forEach(([label, value], i) => {
    const rowY = y + 26 + i * 18;
    doc.fillColor(darkText).fontSize(9).font('Helvetica').text(label, rightX + 10, rowY);
    doc.fillColor(expenseRed).font('Helvetica-Bold').text(value, rightX + colW - 90, rowY, { width: 80, align: 'right' });
  });

  return y + panelH + 14;
}

function measureCellHeight(doc, text, width, fontSize) {
  doc.font('Helvetica').fontSize(fontSize);
  return Math.max(20, doc.heightOfString(String(text ?? ''), { width: width - 10 }) + 10);
}

function drawTable(doc, columns, rows, y, options = {}) {
  const startX = MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const fontSize = options.fontSize || 8;
  const headerH = 22;

  y = ensureSpace(doc, y, headerH + 14);

  doc.rect(startX, y, tableWidth, headerH).fill(green);
  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');
  let x = startX;
  columns.forEach((col) => {
    doc.text(col.label, x + 5, y + 6, { width: col.width - 10, align: col.align || 'left' });
    x += col.width;
  });
  y += headerH;

  if (rows.length === 0) {
    y = ensureSpace(doc, y, 22);
    doc.rect(startX, y, tableWidth, 22).fill('#f5f5f5');
    doc.font('Helvetica').fontSize(fontSize).fillColor(mutedText).text('No records for this date', startX + 5, y + 6);
    return y + 30;
  }

  rows.forEach((row, rowIdx) => {
    const isTotal = options.totalRow && rowIdx === rows.length - 1;
    const rowHeights = row.map((cell, i) => measureCellHeight(doc, cell, columns[i].width, fontSize));
    const rowH = Math.max(...rowHeights, 20);

    y = ensureSpace(doc, y, rowH);
    const bg = isTotal ? lightGreen : rowIdx % 2 === 0 ? '#f8faf8' : '#ffffff';
    doc.rect(startX, y, tableWidth, rowH).fill(bg);
    if (isTotal) doc.rect(startX, y, tableWidth, rowH).stroke(green);

    x = startX;
    doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    row.forEach((cell, i) => {
      const col = columns[i];
      let color = darkText;
      if (col.color === 'in') color = incomeGreen;
      if (col.color === 'out') color = expenseRed;
      if (isTotal) color = green;
      doc.fillColor(color).text(String(cell ?? ''), x + 5, y + 5, {
        width: col.width - 10,
        align: col.align || 'left',
      });
      x += col.width;
    });
    y += rowH;
  });

  return y + 10;
}

function buildIncomeRows(c, breakdown) {
  return [
    ['Room Bills (Total)', formatRs(c.roomIncome)],
    [`  • From Bookings (${breakdown.systemRoomCount || 0})`, formatRs(breakdown.systemRoomIncome)],
    [`  • Manual Cashier (${breakdown.manualRoomCount || 0})`, formatRs(breakdown.manualRoomIncome)],
    ['Restaurant Bills (Total)', formatRs(c.restaurantIncome)],
    [`  • From Orders (${breakdown.systemRestaurantCount || 0})`, formatRs(breakdown.systemRestaurantIncome)],
    [`  • Manual Cashier (${breakdown.manualRestaurantCount || 0})`, formatRs(breakdown.manualRestaurantIncome)],
    ['Other Income', formatRs(c.otherIncome)],
    ['TOTAL INCOME TODAY', formatRs(c.dayCashIn)],
  ];
}

function buildExpenseRows(c) {
  return [
    ['Daily Costs', formatRs(c.dailyCost)],
    [`Salary Advances (${c.counts?.salaryAdvances || 0})`, formatRs(c.salaryAdvance)],
    [`Salary Payments (${c.counts?.salaryPayments || 0})`, formatRs(c.salaryPayment)],
    ['Bank Deposits', formatRs(c.bankDeposit)],
    ['TOTAL CASH OUT', formatRs(c.totalCashOut)],
  ];
}

function buildSalaryAdvanceRows(advances) {
  return advances.map((a) => [
    a.employee?.name || '-',
    a.employee?.position || '-',
    a.paidBy === 'owner' ? 'Owner' : 'Cashier',
    formatTime(a.date, a.createdAt),
    a.note || '-',
    formatRs(a.amount),
  ]);
}

function buildBankTransferRows(deposits) {
  return deposits.map((item) => [
    formatTime(item.date, item.createdAt),
    item.description || 'Online bank transfer',
    formatRs(item.amount),
  ]);
}

function buildPendingBillRows(bills) {
  const typeLabels = { room: 'Room', restaurant: 'Restaurant', other: 'Other' };
  return bills.map((bill) => [
    new Date(bill.date).toLocaleDateString(),
    formatTime(bill.date, bill.createdAt),
    typeLabels[bill.billType] || bill.billType,
    bill.customerName ? `${bill.customerName} — ${bill.description}` : bill.description,
    bill.status === 'collected' ? 'Collected' : 'Pending',
    formatRs(bill.amount),
  ]);
}

function buildLedgerRows(ledger) {
  return ledger.map((item) => [
    formatTime(item.date, item.createdAt),
    item.label,
    item.description,
    item.paymentMethod || 'cash',
    item.flow === 'in' ? formatRs(item.amount) : '—',
    item.flow === 'out' ? formatRs(item.amount) : '—',
    item.source === 'system' ? 'System' : item.source === 'salary' ? 'Salary' : 'Cashier',
  ]);
}

const LEDGER_COLUMNS = [
  { label: 'Time', width: 36 },
  { label: 'Type', width: 56 },
  { label: 'Description', width: 175 },
  { label: 'Payment', width: 38 },
  { label: 'IN', width: 60, align: 'right', color: 'in' },
  { label: 'OUT', width: 60, align: 'right', color: 'out' },
  { label: 'Source', width: 50 },
];

function drawCashierLedgerSection(doc, c, y) {
  const ledger = c.ledger || [];
  y = drawSectionTitle(doc, 'Full Cashier Ledger', y, `${ledger.length} entries`);
  const ledgerRows = buildLedgerRows(ledger);
  if (ledgerRows.length > 0) {
    ledgerRows.push([
      '',
      '',
      'TOTAL',
      '',
      formatRs(c.totalCashIn),
      formatRs(c.totalCashOut),
      `Balance: ${formatRs(c.cashBalance)}`,
    ]);
  }
  return drawTable(doc, LEDGER_COLUMNS, ledgerRows, y, { totalRow: ledgerRows.length > 0 });
}

function generateSummaryPDF(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];
    const c = report.cashier;
    const breakdown = c.breakdown || {};
    const salaryAdvances = report.salary?.advances || [];
    const bankTransfers = report.bankTransfers || { deposits: [], count: 0, total: 0 };
    const pendingBills = report.pendingBills || { pending: [], pendingCount: 0, pendingTotal: 0, bills: [] };

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = drawHeader(doc, 'DAILY CASH REPORT', 'Summary — Quick Overview', report.date);

    y = drawStatBoxes(doc, [
      { label: 'Opening Cash', value: formatRs(c.openingBalance), variant: 'normal' },
      { label: "Today's Income", value: formatRs(c.dayCashIn), variant: 'normal', sub: `${(c.counts?.roomBills || 0) + (c.counts?.restaurantBills || 0)} bills` },
      { label: 'Cash OUT', value: formatRs(c.totalCashOut), variant: 'expense', sub: 'All expenses' },
      { label: 'Closing Balance', value: formatRs(c.cashBalance), variant: 'final', sub: 'Cash in drawer' },
    ], y);

    y = drawFormulaBar(doc, c, y);

    y = drawTwoColumnPanel(
      doc,
      'MONEY IN',
      buildIncomeRows(c, breakdown).slice(0, -1),
      'MONEY OUT',
      buildExpenseRows(c).slice(0, -1),
      y
    );

    y = drawCashierLedgerSection(doc, c, y);

    y = drawSectionTitle(doc, 'Today\'s Activity', y);
    y = drawStatBoxes(doc, [
      { label: 'Room Bookings', value: String(report.room?.count || 0), variant: 'normal' },
      { label: 'Restaurant Orders', value: String(report.restaurant?.count || 0), variant: 'normal' },
      { label: 'Salary Advances', value: String(report.salary?.count || 0), variant: 'expense', sub: formatRs(c.salaryAdvance) },
      { label: 'Ledger Entries', value: String((c.ledger || []).length), variant: 'normal' },
    ], y);

    if (salaryAdvances.length > 0) {
      y = drawSectionTitle(doc, 'Salary Advances Given Today', y, formatRs(report.salary?.total || 0));
      y = drawTable(doc, [
        { label: 'Employee', width: 100 },
        { label: 'Position', width: 75 },
        { label: 'Paid By', width: 55 },
        { label: 'Time', width: 45 },
        { label: 'Note', width: 155 },
        { label: 'Amount', width: 85, align: 'right', color: 'out' },
      ], buildSalaryAdvanceRows(salaryAdvances), y);
    }

    y = drawSectionTitle(
      doc,
      'Online Bank Transfers — Direct Deposits',
      y,
      bankTransfers.count ? formatRs(bankTransfers.total) : 'None'
    );
    y = drawTable(doc, [
      { label: 'Time', width: 55 },
      { label: 'Description / Customer Payment', width: 360 },
      { label: 'Amount', width: 100, align: 'right', color: 'in' },
    ], buildBankTransferRows(bankTransfers.deposits || []), y);

    y = drawSectionTitle(
      doc,
      'Pending Bills — Not Yet Collected',
      y,
      pendingBills.pendingCount ? formatRs(pendingBills.pendingTotal) : 'None'
    );
    y = drawTable(doc, [
      { label: 'Date', width: 52 },
      { label: 'Time', width: 40 },
      { label: 'Type', width: 48 },
      { label: 'Customer / Description', width: 240 },
      { label: 'Status', width: 55 },
      { label: 'Amount', width: 80, align: 'right' },
    ], buildPendingBillRows(pendingBills.bills || []), y);

    y = ensureSpace(doc, y, 50);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 40, 4).fill(green);
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
      .text('CLOSING CASH BALANCE', MARGIN + 14, y + 8);
    doc.fontSize(16).text(formatRs(c.cashBalance), MARGIN + 14, y + 22);
    doc.fontSize(9).font('Helvetica')
      .text(
        `Opening ${formatRs(c.openingBalance)}  +  Income ${formatRs(c.dayCashIn)}  −  Expenses ${formatRs(c.totalCashOut)}`,
        MARGIN + 200,
        y + 16,
        { width: 300, align: 'right' }
      );

    addPageFooters(doc);
    doc.end();
  });
}

function generateFullPDF(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];
    const c = report.cashier;
    const breakdown = c.breakdown || {};
    const salaryAdvances = report.salary?.advances || [];
    const bookings = report.room?.bookings || [];
    const orders = report.restaurant?.orders || [];
    const bankTransfers = report.bankTransfers || { deposits: [], count: 0, total: 0 };

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = drawHeader(doc, 'DAILY CASH REPORT', 'Full Detail — Complete Breakdown', report.date);

    y = drawStatBoxes(doc, [
      { label: 'Opening Cash', value: formatRs(c.openingBalance), variant: 'normal' },
      { label: "Today's Income", value: formatRs(c.dayCashIn), variant: 'normal' },
      { label: 'Cash OUT', value: formatRs(c.totalCashOut), variant: 'expense' },
      { label: 'Closing Balance', value: formatRs(c.cashBalance), variant: 'final' },
    ], y);

    y = drawFormulaBar(doc, c, y);

    y = drawTwoColumnPanel(
      doc,
      'INCOME BREAKDOWN',
      buildIncomeRows(c, breakdown),
      'EXPENSE BREAKDOWN',
      buildExpenseRows(c),
      y
    );

    y = drawCashierLedgerSection(doc, c, y);

    y = drawSectionTitle(
      doc,
      'Salary Advances — Cash Paid to Staff',
      y,
      salaryAdvances.length ? formatRs(report.salary?.total || 0) : 'None'
    );
    y = drawTable(doc, [
      { label: 'Employee Name', width: 100 },
      { label: 'Position', width: 75 },
      { label: 'Paid By', width: 55 },
      { label: 'Time', width: 45 },
      { label: 'Note / Reason', width: 155 },
      { label: 'Amount Paid', width: 85, align: 'right', color: 'out' },
    ], buildSalaryAdvanceRows(salaryAdvances), y);

    y = drawSectionTitle(doc, 'Room Bookings — Guest Details', y, `${bookings.length} bookings`);
    y = drawTable(doc, [
      { label: 'Guest Name', width: 80 },
      { label: 'ID Number', width: 68 },
      { label: 'Address', width: 100 },
      { label: 'Room', width: 38 },
      { label: 'Nights', width: 38 },
      { label: 'Amount', width: 68, align: 'right', color: 'in' },
      { label: 'Status', width: 83 },
    ], bookings.map((b) => [
      `${b.guestName}${b.guestPhone ? `\n${b.guestPhone}` : ''}`,
      b.guestIdNumber || '—',
      b.guestAddress || '—',
      b.room?.roomNumber || '—',
      String(b.nights || '—'),
      formatRs(b.amount),
      b.status,
    ]), y);

    y = drawSectionTitle(doc, 'Restaurant Orders', y, `${orders.length} orders`);
    y = drawTable(doc, [
      { label: 'Order No.', width: 62 },
      { label: 'Table', width: 40 },
      { label: 'Items Ordered', width: 248 },
      { label: 'Total', width: 72, align: 'right', color: 'in' },
      { label: 'Status', width: 73 },
    ], orders.map((o) => [
      o.orderNumber,
      o.tableNumber || '—',
      (o.items || []).map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', ') || '—',
      formatRs(o.total),
      o.status,
    ]), y);

    y = drawSectionTitle(
      doc,
      'Online Bank Payments — Direct Deposits',
      y,
      bankTransfers.count ? formatRs(bankTransfers.total) : 'None'
    );
    y = drawTable(doc, [
      { label: 'Time', width: 55 },
      { label: 'Description / Customer Payment', width: 360 },
      { label: 'Amount', width: 100, align: 'right', color: 'in' },
    ], buildBankTransferRows(bankTransfers.deposits || []), y);

    y = ensureSpace(doc, y, 54);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 46, 4).fill(green);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
      .text('END OF DAY — CLOSING CASH BALANCE', MARGIN + 14, y + 8);
    doc.fontSize(18).text(formatRs(c.cashBalance), MARGIN + 14, y + 24);
    doc.fontSize(8).font('Helvetica')
      .text(
        `Report Date: ${report.date}  |  Salary Advances: ${formatRs(c.salaryAdvance)}  |  Generated by Green Key Hotel System`,
        MARGIN + 200,
        y + 20,
        { width: 300, align: 'right' }
      );

    addPageFooters(doc);
    doc.end();
  });
}

function generateDailyReportPDF(report, type = 'full') {
  if (type === 'summary') return generateSummaryPDF(report);
  return generateFullPDF(report);
}

module.exports = { generateDailyReportPDF };
