const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function generatePaysheetPDF(payment, employee, advances) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#2d6a4f';
    const lightGreen = '#d8f3dc';

    doc.rect(0, 0, doc.page.width, 100).fill(green);
    doc.fillColor('#ffffff')
      .fontSize(24).font('Helvetica-Bold')
      .text(hotel.name, 50, 30);
    doc.fontSize(11).font('Helvetica')
      .text(hotel.address, 50, 58)
      .text(`Tel: ${hotel.phone}`, 50, 74);

    doc.fillColor('#000000');
    doc.fontSize(18).font('Helvetica-Bold')
      .text('SALARY PAYSLIP', 50, 120, { align: 'center' });

    const period = `${MONTHS[payment.month - 1]} ${payment.year}`;
    doc.fontSize(11).font('Helvetica')
      .text(`Pay Period: ${period}`, 50, 150)
      .text(`Payment Date: ${new Date(payment.paidDate).toLocaleDateString()}`, 350, 150);

    doc.moveTo(50, 175).lineTo(545, 175).stroke('#cccccc');

    doc.fontSize(12).font('Helvetica-Bold').text('Employee Details', 50, 190);
    doc.font('Helvetica').fontSize(11);
    doc.text(`Name: ${employee.name}`, 50, 210);
    doc.text(`Position: ${employee.position}`, 50, 228);
    doc.text(`NIC: ${employee.nic || 'N/A'}`, 50, 246);
    doc.text(`Phone: ${employee.phone || 'N/A'}`, 300, 210);

    doc.moveTo(50, 270).lineTo(545, 270).stroke('#cccccc');

    doc.fontSize(12).font('Helvetica-Bold').text('Salary Breakdown', 50, 285);

    const rows = [
      ['Basic Salary', `Rs. ${payment.basicSalary.toLocaleString()}`],
      ['Bonuses', `Rs. ${(payment.bonuses || 0).toLocaleString()}`],
      ['Gross Salary', `Rs. ${(payment.basicSalary + (payment.bonuses || 0)).toLocaleString()}`],
      ['', ''],
      ['Advances Deducted', `Rs. ${payment.totalAdvances.toLocaleString()}`],
      ['Other Deductions', `Rs. ${(payment.deductions || 0).toLocaleString()}`],
      ['Total Deductions', `Rs. ${(payment.totalAdvances + (payment.deductions || 0)).toLocaleString()}`],
    ];

    let y = 310;
    rows.forEach(([label, value]) => {
      if (!label) { y += 5; return; }
      doc.font('Helvetica').fontSize(11).fillColor('#333333')
        .text(label, 50, y)
        .text(value, 400, y, { align: 'right', width: 145 });
      y += 22;
    });

    doc.rect(50, y + 5, 495, 35).fill(lightGreen);
    doc.fillColor(green).font('Helvetica-Bold').fontSize(14)
      .text('NET SALARY PAYABLE', 60, y + 15)
      .text(`Rs. ${payment.netSalary.toLocaleString()}`, 400, y + 15, { align: 'right', width: 135 });

    if (advances && advances.length > 0) {
      y += 60;
      doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold')
        .text('Advance Details', 50, y);
      y += 20;
      advances.forEach((adv) => {
        doc.font('Helvetica').fontSize(10).fillColor('#555555')
          .text(`${new Date(adv.date).toLocaleDateString()} - ${adv.note || 'Advance'}`, 50, y)
          .text(`Rs. ${adv.amount.toLocaleString()}`, 400, y, { align: 'right', width: 145 });
        y += 18;
      });
    }

    doc.moveTo(50, 700).lineTo(545, 700).stroke('#cccccc');
    doc.fontSize(10).fillColor('#888888').font('Helvetica')
      .text('This is a computer-generated payslip from Green Key Pvt Hotel Management System.', 50, 715, { align: 'center' })
      .text(`Generated on ${new Date().toLocaleString()}`, 50, 730, { align: 'center' });

    doc.end();
  });
}

function generateAdvancePDF(advance, employee, summary) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#1b4332';
    const lightGreen = '#d8f3dc';
    const darkText = '#1a1a1a';
    const mutedText = '#666666';
    const period = `${MONTHS[advance.month - 1]} ${advance.year}`;
    const advanceDate = new Date(advance.date).toLocaleDateString('en-LK', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    doc.rect(0, 0, doc.page.width, 95).fill(green);
    doc.fillColor('#ffffff')
      .fontSize(22).font('Helvetica-Bold')
      .text(hotel.name, 50, 20);
    doc.fontSize(10).font('Helvetica')
      .text(hotel.address, 50, 46)
      .text(`Tel: ${hotel.phone}`, 50, 60);

    doc.fillColor(darkText);
    doc.fontSize(14).font('Helvetica-Bold')
      .text('SALARY ADVANCE RECEIPT', 50, 108, { align: 'center', width: 495 });

    doc.roundedRect(50, 128, 495, 52, 6).fill(lightGreen);
    doc.fillColor(mutedText).fontSize(9).font('Helvetica')
      .text('EMPLOYEE NAME', 65, 138);
    doc.fillColor(green).fontSize(20).font('Helvetica-Bold')
      .text(employee.name, 65, 154, { width: 465 });

    doc.fillColor(mutedText).fontSize(10).font('Helvetica')
      .text(`Period: ${period}`, 50, 192)
      .text(`Date: ${advanceDate}`, 320, 192);

    doc.moveTo(50, 212).lineTo(545, 212).stroke('#cccccc');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('Employee Details', 50, 224);
    doc.font('Helvetica').fontSize(10).fillColor(darkText);
    doc.text(`Position: ${employee.position}`, 50, 242);
    doc.text(`NIC: ${employee.nic || 'N/A'}`, 50, 258);
    doc.text(`Phone: ${employee.phone || 'N/A'}`, 300, 242);

    doc.moveTo(50, 278).lineTo(545, 278).stroke('#cccccc');

    doc.fontSize(11).font('Helvetica-Bold').fillColor(green).text('Advance Summary', 50, 290);
    const rows = [
      ['Basic Salary (Monthly)', `Rs. ${summary.basicSalary.toLocaleString()}`],
      ['Previous Advances This Month', `Rs. ${summary.previousAdvances.toLocaleString()}`],
      ['This Advance Amount', `Rs. ${advance.amount.toLocaleString()}`],
      ['Total Advances After This', `Rs. ${summary.totalAdvances.toLocaleString()}`],
    ];

    let y = 312;
    rows.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(10).fillColor(darkText)
        .text(label, 50, y)
        .text(value, 400, y, { align: 'right', width: 145 });
      y += 20;
    });

    if (advance.note) {
      y += 6;
      doc.font('Helvetica').fontSize(10).fillColor(mutedText)
        .text(`Note: ${advance.note}`, 50, y, { width: 495 });
      y += 22;
    }

    doc.roundedRect(50, y + 4, 495, 40, 6).fill(green);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
      .text('AMOUNT PAID TO EMPLOYEE', 65, y + 14);
    doc.fontSize(16)
      .text(`Rs. ${advance.amount.toLocaleString()}`, 400, y + 12, { align: 'right', width: 130 });

    y += 54;
    doc.roundedRect(50, y, 495, 36, 6).fill(lightGreen);
    doc.fillColor(green).font('Helvetica-Bold').fontSize(11)
      .text('LEFTOVER SALARY (After All Advances)', 65, y + 10);
    doc.fontSize(13)
      .text(`Rs. ${summary.leftover.toLocaleString()}`, 400, y + 10, { align: 'right', width: 130 });

    y += 48;
    const paidByOwner = advance.paidBy === 'owner';
    const paidByPettyCash = advance.paidBy === 'petty_cash';
    if (paidByPettyCash) {
      doc.roundedRect(50, y, 495, 32, 6).fill('#f3e8ff');
      doc.fillColor('#6f42c1').font('Helvetica-Bold').fontSize(10)
        .text('Deducted from Petty Cash', 65, y + 10)
        .text(`Rs. ${advance.amount.toLocaleString()}`, 400, y + 10, { align: 'right', width: 130 });
      y += 40;
    } else if (!paidByOwner) {
      doc.roundedRect(50, y, 495, 32, 6).fill('#fff3cd');
      doc.fillColor('#856404').font('Helvetica-Bold').fontSize(10)
        .text('Deducted from Daily Cashier', 65, y + 10)
        .text(`Rs. ${advance.amount.toLocaleString()}`, 400, y + 10, { align: 'right', width: 130 });
      y += 40;
    } else {
      doc.roundedRect(50, y, 495, 32, 6).fill('#e8f4fd');
      doc.fillColor('#084298').font('Helvetica-Bold').fontSize(10)
        .text('Paid By Owner (Not from Cashier)', 65, y + 10);
      y += 40;
    }

    doc.moveTo(50, 700).lineTo(545, 700).stroke('#cccccc');
    const footerNote = paidByOwner
      ? 'This advance was paid by the owner and was not deducted from the daily cashier balance.'
      : paidByPettyCash
        ? 'This advance was paid from petty cash and was not deducted from the daily cashier balance.'
        : 'This advance has been recorded and deducted from the daily cashier balance.';
    doc.fontSize(9).fillColor(mutedText).font('Helvetica')
      .text(`Receipt for: ${employee.name}`, 50, 712, { align: 'center', width: 495 })
      .text(footerNote, 50, 726, { align: 'center', width: 495 })
      .text(`Generated on ${new Date().toLocaleString()}`, 50, 740, { align: 'center', width: 495 });

    doc.end();
  });
}

module.exports = { generatePaysheetPDF, generateAdvancePDF, MONTHS };
