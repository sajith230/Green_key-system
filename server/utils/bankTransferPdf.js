const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');

const green = '#1b4332';
const lightGreen = '#d8f3dc';
const incomeGreen = '#2d6a4f';
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

function drawHeader(doc, reportDate) {
  doc.rect(0, 0, doc.page.width, 88).fill(green);
  doc.fillColor('#ffffff')
    .fontSize(22).font('Helvetica-Bold')
    .text(hotel.name, MARGIN, 18);
  doc.fontSize(9).font('Helvetica')
    .text(hotel.address, MARGIN, 44)
    .text(`Tel: ${hotel.phone}`, MARGIN, 57);

  doc.fillColor(darkText);
  doc.fontSize(16).font('Helvetica-Bold')
    .text('DAILY DIRECT BANK TRANSFER LIST', MARGIN, 102, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(10).font('Helvetica').fillColor(mutedText)
    .text('Customer payments received directly to bank (not via cashier)', MARGIN, 122, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(10).font('Helvetica-Bold').fillColor(green)
    .text(formatDateLong(reportDate), MARGIN, 138, { align: 'center', width: CONTENT_WIDTH });
  doc.fontSize(8).font('Helvetica').fillColor(mutedText)
    .text(`Generated: ${new Date().toLocaleString()}`, MARGIN, 152, { align: 'center', width: CONTENT_WIDTH });

  return 168;
}

function drawStatBoxes(doc, count, total, y) {
  y = ensureSpace(doc, y, 56);
  const gap = 8;
  const boxW = (CONTENT_WIDTH - gap) / 2;

  doc.roundedRect(MARGIN, y, boxW, 50, 5).fill(lightGreen);
  doc.fillColor(mutedText).fontSize(8).font('Helvetica')
    .text('TOTAL TRANSFERS', MARGIN + 8, y + 8, { width: boxW - 16 });
  doc.fillColor(green).fontSize(14).font('Helvetica-Bold')
    .text(String(count), MARGIN + 8, y + 24, { width: boxW - 16 });

  const x2 = MARGIN + boxW + gap;
  doc.roundedRect(x2, y, boxW, 50, 5).fill(green);
  doc.fillColor('#e8f5e9').fontSize(8).font('Helvetica')
    .text('TOTAL AMOUNT', x2 + 8, y + 8, { width: boxW - 16 });
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold')
    .text(formatRs(total), x2 + 8, y + 24, { width: boxW - 16 });

  return y + 62;
}

function drawTable(doc, rows, y) {
  const columns = [
    { label: '#', width: 30 },
    { label: 'Time', width: 55 },
    { label: 'Description / Customer Payment', width: 330 },
    { label: 'Amount', width: 100, align: 'right', color: 'in' },
  ];
  const startX = MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const fontSize = 9;
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
      .text('No direct bank transfers for this date', startX + 5, y + 6);
    return y + 30;
  }

  rows.forEach((row, rowIdx) => {
    const isTotal = rowIdx === rows.length - 1;
    const rowH = 22;
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

function buildRows(deposits) {
  const rows = deposits.map((item, i) => [
    String(i + 1),
    formatTime(item.date, item.createdAt),
    item.description || 'Online bank transfer',
    formatRs(item.amount),
  ]);
  const total = deposits.reduce((s, d) => s + d.amount, 0);
  rows.push(['', '', 'TOTAL', formatRs(total)]);
  return rows;
}

function generateBankTransferListPDF(bankTransfers) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const chunks = [];
    const deposits = bankTransfers.deposits || [];
    const count = bankTransfers.count || 0;
    const total = bankTransfers.total || 0;

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let y = drawHeader(doc, bankTransfers.date);
    y = drawStatBoxes(doc, count, total, y);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(green)
      .text('Transfer Details', MARGIN, y);
    doc.strokeColor(borderColor).moveTo(MARGIN, y + 18).lineTo(MARGIN + CONTENT_WIDTH, y + 18).stroke();
    y += 28;

    y = drawTable(doc, buildRows(deposits), y);

    y = ensureSpace(doc, y, 50);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 40, 4).fill(green);
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
      .text('TOTAL DIRECT BANK TRANSFERS', MARGIN + 14, y + 8);
    doc.fontSize(16).text(formatRs(total), MARGIN + 14, y + 22);
    doc.fontSize(9).font('Helvetica')
      .text(
        `${count} transfer${count === 1 ? '' : 's'} on ${bankTransfers.date}`,
        MARGIN + 200,
        y + 16,
        { width: 300, align: 'right' }
      );

    addPageFooters(doc);
    doc.end();
  });
}

module.exports = { generateBankTransferListPDF };
