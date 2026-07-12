const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');
const { MONTH_NAMES, computeBalance } = require('./pettyCashBalance');

const green = '#1b4332';
const lightGreen = '#d8f3dc';
const incomeGreen = '#2d6a4f';
const expenseRed = '#c1121f';
const lightRed = '#ffe8e8';
const purple = '#6f42c1';
const darkText = '#1a1a1a';
const mutedText = '#666666';
const borderColor = '#d0d0d0';
const PAGE_BOTTOM = 740;
const MARGIN = 40;
const CONTENT_WIDTH = 515;

function formatRs(n) {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}

function formatDate(dateInput) {
  const d = new Date(dateInput);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toLocaleDateString('en-LK');
}

function formatTime(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    .text('PETTY CASH REPORT', MARGIN, 102, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(11).font('Helvetica-Bold').fillColor(green)
    .text(monthLabel, MARGIN, 124, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(8).font('Helvetica').fillColor(mutedText)
    .text('Separate from cashier — owner funds, expenses, returns & salary advances', MARGIN, 140, { align: 'center', width: CONTENT_WIDTH });
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 152, { align: 'center', width: CONTENT_WIDTH });

  return 168;
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
    doc.fillColor(isMoney ? green : green).fontSize(9).font('Helvetica-Bold')
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
    const bg = box.variant === 'expense' ? lightRed : box.variant === 'purple' ? '#f3e8ff' : box.variant === 'final' ? green : lightGreen;
    const valueColor = box.variant === 'expense' ? expenseRed : box.variant === 'purple' ? purple : box.variant === 'final' ? '#ffffff' : green;
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

function drawFormulaBar(doc, data, y) {
  y = ensureSpace(doc, y, 44);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 36, 4).fill('#f4f7f4');
  doc.strokeColor(borderColor).roundedRect(MARGIN, y, CONTENT_WIDTH, 36, 4).stroke();

  const parts = [
    { t: 'Given', v: formatRs(data.totalGivenByOwner), c: incomeGreen },
    { t: '−', v: '', c: mutedText },
    { t: 'Spent', v: formatRs(data.totalSpent), c: expenseRed },
    { t: '=', v: '', c: mutedText },
    { t: 'Net', v: formatRs(data.totalGivenByOwner - data.totalSpent), c: data.totalGivenByOwner - data.totalSpent >= 0 ? incomeGreen : expenseRed },
    { t: '|', v: '', c: mutedText },
    { t: 'Balance', v: formatRs(data.currentBalance), c: green },
  ];

  let x = MARGIN + 10;
  parts.forEach((p) => {
    if (p.v) {
      doc.fillColor(mutedText).fontSize(7).font('Helvetica').text(p.t, x, y + 6, { lineBreak: false });
      doc.fillColor(p.c).fontSize(10).font('Helvetica-Bold').text(p.v, x, y + 18, { lineBreak: false });
      x += p.t === 'Balance' ? 90 : 72;
    } else {
      doc.fillColor(p.c).fontSize(14).font('Helvetica-Bold').text(p.t, x, y + 14, { lineBreak: false });
      x += p.t === '|' ? 14 : 18;
    }
  });

  return y + 48;
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
    doc.font('Helvetica').fontSize(fontSize).fillColor(mutedText)
      .text(options.emptyText || 'No records', startX + 5, y + 6);
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
      if (col.color === 'balance') color = green;
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

function buildLedgerWithBalance(transactions, month, year) {
  const m = Number(month);
  const y = Number(year);
  const openingDate = new Date(y, m - 1, 0);
  let runningBalance = computeBalance(transactions, openingDate);

  const labels = {
    fund_in: 'Cash from Owner',
    return_to_owner: 'Returned to Owner',
    expense: 'Expense / Cost',
    salary_advance: 'Salary Advance',
  };

  const monthTransactions = transactions
    .filter((t) => {
      const d = new Date(t.date);
      return d.getMonth() + 1 === m && d.getFullYear() === y;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return monthTransactions.map((t) => {
    if (t.type === 'fund_in') runningBalance += t.amount;
    else runningBalance -= t.amount;

    return {
      date: formatDate(t.date),
      time: formatTime(t.date),
      type: labels[t.type] || t.type,
      description: t.description || '—',
      inAmount: t.type === 'fund_in' ? formatRs(t.amount) : '—',
      outAmount: t.type !== 'fund_in' ? formatRs(t.amount) : '—',
      balance: formatRs(runningBalance),
    };
  });
}

function buildYearlyRows(yearlySummary) {
  return yearlySummary.months
    .filter((m) => m.hasActivity)
    .map((m) => [
      m.monthName,
      formatRs(m.totalGivenByOwner),
      formatRs(m.totalSpent),
      String(m.transactionCount),
    ]);
}

function generatePettyCashPDF(data, yearlySummary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const monthLabel = `${MONTH_NAMES[data.month - 1]} ${data.year}`;
    let y = drawHeader(doc, monthLabel);

    y = drawStatBoxes(doc, [
      {
        label: 'Current Balance',
        value: formatRs(data.currentBalance),
        variant: 'final',
        sub: 'All-time petty cash on hand',
      },
      {
        label: 'Given by Owner',
        value: formatRs(data.totalGivenByOwner),
        variant: 'normal',
        sub: `This month`,
      },
      {
        label: 'Expenses',
        value: formatRs(data.totalExpenses),
        variant: 'expense',
        sub: `This month`,
      },
      {
        label: 'Salary Advances',
        value: formatRs(data.totalSalaryAdvances),
        variant: 'purple',
        sub: `This month`,
      },
      {
        label: 'Returned',
        value: formatRs(data.totalReturned),
        variant: 'normal',
        sub: `This month`,
      },
    ], y);

    y = drawFormulaBar(doc, data, y);

    const ledgerRows = buildLedgerWithBalance(
      data.allTransactions || [],
      data.month,
      data.year
    );

    y = drawSectionTitle(
      doc,
      `Transaction History — ${monthLabel}`,
      y,
      ledgerRows.length ? `${ledgerRows.length} entries` : 'No entries'
    );

    y = drawTable(doc, [
      { label: 'Date', width: 62 },
      { label: 'Time', width: 38 },
      { label: 'Type', width: 88 },
      { label: 'Description', width: 155 },
      { label: 'In', width: 62, align: 'right', color: 'in' },
      { label: 'Out', width: 62, align: 'right', color: 'out' },
      { label: 'Balance', width: 68, align: 'right', color: 'balance' },
    ], ledgerRows.map((r) => [r.date, r.time, r.type, r.description, r.inAmount, r.outAmount, r.balance]), y, {
      emptyText: 'No petty cash entries this month',
    });

    if (ledgerRows.length > 0) {
      const totalIn = data.totalGivenByOwner;
      const totalOut = data.totalSpent;
      const endOfMonthDate = new Date(data.year, data.month, 0);
      const endOfMonthBalance = computeBalance(data.allTransactions || [], endOfMonthDate);
      y = drawTable(doc, [
        { label: '', width: 62 },
        { label: '', width: 38 },
        { label: '', width: 88 },
        { label: 'MONTH TOTALS', width: 155 },
        { label: '', width: 62, align: 'right', color: 'in' },
        { label: '', width: 62, align: 'right', color: 'out' },
        { label: '', width: 68, align: 'right', color: 'balance' },
      ], [['', '', '', 'MONTH TOTALS', formatRs(totalIn), formatRs(totalOut), formatRs(endOfMonthBalance)]], y, {
        totalRow: true,
      });
    }

    if (yearlySummary) {
      const yearlyRows = buildYearlyRows(yearlySummary);
      y = drawSectionTitle(
        doc,
        `Yearly Summary — ${yearlySummary.year}`,
        y,
        formatRs(yearlySummary.yearlyTotalGiven)
      );

      y = drawTable(doc, [
        { label: 'Month', width: 120 },
        { label: 'Given by Owner', width: 130, align: 'right', color: 'in' },
        { label: 'Spent / Returned', width: 130, align: 'right', color: 'out' },
        { label: 'Entries', width: 135, align: 'center' },
      ], yearlyRows, y, {
        emptyText: `No petty cash activity in ${yearlySummary.year}`,
      });
    }

    y = ensureSpace(doc, y, 54);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 46, 4).fill(green);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
      .text('CURRENT PETTY CASH BALANCE', MARGIN + 14, y + 8);
    doc.fontSize(18).text(formatRs(data.currentBalance), MARGIN + 14, y + 24);
    doc.fontSize(8).font('Helvetica')
      .text(
        `Report Period: ${monthLabel}  |  Total Spent This Month: ${formatRs(data.totalSpent)}  |  Green Key Hotel System`,
        MARGIN + 180,
        y + 20,
        { width: 320, align: 'right' }
      );

    addPageFooters(doc);
    doc.end();
  });
}

module.exports = { generatePettyCashPDF };
