const path = require('path');
const PDFDocument = require('pdfkit');
const hotel = require('../config/hotel');

const LOGO_PATH = path.join(__dirname, '../assets/greenkey-logo.png');

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
      ['Loan Payment Deducted', `Rs. ${(payment.loanPayment || 0).toLocaleString()}`],
      ['Other Deductions', `Rs. ${(payment.deductions || 0).toLocaleString()}`],
      ['Total Deductions', `Rs. ${(payment.totalAdvances + (payment.loanPayment || 0) + (payment.deductions || 0)).toLocaleString()}`],
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

function formatLongDate(date) {
  return new Date(date).toLocaleDateString('en-LK', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function getProbationEndDate(joinDate, months) {
  const end = new Date(joinDate);
  end.setMonth(end.getMonth() + months);
  return end;
}

function generateAppointmentLetterPDF(employee) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    const pageW = doc.page.width;
    const margin = 45;
    const contentW = pageW - margin * 2;

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#1b4332';
    const midGreen = '#2d6a4f';
    const lightGreen = '#d8f3dc';
    const paleGreen = '#f1f8f4';
    const gold = '#b8860b';
    const darkText = '#1a1a1a';
    const mutedText = '#5a5a5a';
    const white = '#ffffff';

    const joinDate = formatLongDate(employee.joinDate);
    const joinDateShort = new Date(employee.joinDate).toLocaleDateString('en-LK');
    const letterDate = formatLongDate(new Date());
    const salary = `Rs. ${employee.basicSalary.toLocaleString()}`;
    const probationMonths = employee.probationPeriodMonths || 6;
    const probationEndDate = getProbationEndDate(employee.joinDate, probationMonths);
    const probationEndShort = probationEndDate.toLocaleDateString('en-LK');
    const probationLabel = `${probationMonths} Month${probationMonths > 1 ? 's' : ''}`;
    const refNo = `GK/HR/${new Date().getFullYear()}/${String(employee._id || Date.now()).slice(-6).toUpperCase()}`;

    // ── Header band ──
    doc.rect(0, 0, pageW, 125).fill(green);
    doc.rect(0, 118, pageW, 7).fill(gold);

    try {
      doc.roundedRect(margin, 22, 82, 82, 8).fill(white);
      doc.image(LOGO_PATH, margin + 8, 30, { width: 66 });
    } catch {
      doc.roundedRect(margin, 22, 82, 82, 8).fill(white);
    }

    doc.fillColor(white)
      .fontSize(24).font('Helvetica-Bold')
      .text(hotel.name, margin + 96, 28);
    doc.fontSize(10).font('Helvetica')
      .text(hotel.address, margin + 96, 58)
      .text(`Tel: ${hotel.phone}`, margin + 96, 74)
      .text('Human Resources Department', margin + 96, 90);

    // ── Title ribbon ──
    let y = 145;
    doc.roundedRect(margin, y, contentW, 36, 6).fill(midGreen);
    doc.fillColor(white).fontSize(15).font('Helvetica-Bold')
      .text('OFFICIAL APPOINTMENT LETTER', margin, y + 10, { align: 'center', width: contentW });

    y += 50;
    doc.fillColor(mutedText).fontSize(9).font('Helvetica')
      .text(`Ref: ${refNo}`, margin, y)
      .text(`Date: ${letterDate}`, margin, y, { align: 'right', width: contentW });

    // ── Employee highlight card ──
    y += 22;
    doc.roundedRect(margin, y, contentW, 78, 8).fill(lightGreen);
    doc.roundedRect(margin + 4, y + 4, contentW - 8, 70, 6).fill(white);

    doc.fillColor(gold).fontSize(8).font('Helvetica-Bold')
      .text('APPOINTEE', margin + 20, y + 16);
    doc.fillColor(green).fontSize(22).font('Helvetica-Bold')
      .text(employee.name, margin + 20, y + 30, { width: contentW - 40 });

    const detailY = y + 58;
    doc.fillColor(mutedText).fontSize(9).font('Helvetica');
    if (employee.nic) doc.text(`NIC: ${employee.nic}`, margin + 20, detailY);
    if (employee.phone) doc.text(`Tel: ${employee.phone}`, margin + 200, detailY);

    // ── Key details grid ──
    y += 94;
    const colW = (contentW - 12) / 2;
    const detailCards = [
      { label: 'POSITION', value: employee.position },
      { label: 'JOIN DATE', value: joinDateShort },
      { label: 'BASIC SALARY', value: salary },
      { label: 'PROBATION PERIOD', value: `${probationLabel} (until ${probationEndShort})` },
    ];

    detailCards.forEach((card, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (colW + 12);
      const cardY = y + row * 52;
      doc.roundedRect(x, cardY, colW, 44, 6).fill(paleGreen);
      doc.fillColor(midGreen).fontSize(7).font('Helvetica-Bold')
        .text(card.label, x + 14, cardY + 10);
      doc.fillColor(darkText).fontSize(11).font('Helvetica-Bold')
        .text(card.value, x + 14, cardY + 24, { width: colW - 28 });
    });

    y += 118;

    // ── Welcome message ──
    doc.fillColor(darkText).fontSize(11).font('Helvetica-Bold')
      .text(`Dear ${employee.name},`, margin, y);
    y += 20;
    doc.font('Helvetica').fontSize(10.5).fillColor(darkText)
      .text(
        `Congratulations and welcome to the ${hotel.name} family! We are delighted to offer you the position of ${employee.position}, effective from ${joinDate}. Your probation period is ${probationLabel}, ending on ${probationEndShort}. We believe your skills and dedication will be a valuable addition to our team.`,
        margin, y, { width: contentW, align: 'justify', lineGap: 2 }
      );
    y = doc.y + 14;

    // ── Terms section ──
    doc.roundedRect(margin, y, contentW, 22, 4).fill(green);
    doc.fillColor(white).fontSize(10).font('Helvetica-Bold')
      .text('TERMS & CONDITIONS OF EMPLOYMENT', margin + 14, y + 6);
    y += 32;

    const terms = [
      ['Compensation', `Your monthly basic salary is ${salary}, paid at the end of each month after lawful deductions.`],
      ['Reporting', 'You will report to Hotel Management and carry out duties assigned for hotel operations and guest satisfaction.'],
      ['Probation', `A probation period of ${probationLabel} applies from your join date, ending on ${probationEndShort}. Either party may end employment with one week's written notice during probation.`],
      ['Working Hours', 'Standard hours are 8 hours per day, 6 days per week, or as per the duty roster. Overtime follows company policy.'],
      ['Leave & Benefits', 'Annual leave, sick leave, and public holidays apply as per Sri Lankan labour law and hotel policy.'],
      ['Confidentiality', 'You must protect guest information, financial records, and all confidential hotel data at all times.'],
      ['Notice Period', `After probation ends on ${probationEndShort}, either party may terminate employment with thirty (30) days' written notice or payment in lieu.`],
    ];

    terms.forEach(([title, body], idx) => {
      if (y > 680) {
        doc.addPage();
        y = 50;
      }
      doc.circle(margin + 8, y + 6, 8).fill(midGreen);
      doc.fillColor(white).fontSize(8).font('Helvetica-Bold')
        .text(String(idx + 1), margin + 5, y + 2, { width: 12, align: 'center' });
      doc.fillColor(green).fontSize(9.5).font('Helvetica-Bold')
        .text(title, margin + 22, y);
      doc.fillColor(darkText).fontSize(9).font('Helvetica')
        .text(body, margin + 22, y + 13, { width: contentW - 30, lineGap: 1 });
      y = doc.y + 10;
    });

    // ── Acceptance box ──
    if (y > 620) {
      doc.addPage();
      y = 50;
    }
    y += 6;
    doc.roundedRect(margin, y, contentW, 58, 6).lineWidth(1).strokeColor(midGreen).stroke();
    doc.roundedRect(margin, y, contentW, 58, 6).fill(paleGreen);
    doc.fillColor(green).fontSize(9).font('Helvetica-Bold')
      .text('ACCEPTANCE', margin + 16, y + 12);
    doc.fillColor(darkText).fontSize(9).font('Helvetica')
      .text(
        'I, the undersigned, accept this appointment and agree to abide by the terms and conditions stated in this letter.',
        margin + 16, y + 28, { width: contentW - 32 }
      );

    y += 72;

    // ── Signatures ──
    const sigW = (contentW - 20) / 2;
    const sigBlocks = [
      { title: 'For ' + hotel.name, sub: 'Authorized Signatory', stamp: 'Management' },
      { title: 'Employee', sub: 'Signature & Date', stamp: employee.name },
    ];

    sigBlocks.forEach((block, i) => {
      const x = margin + i * (sigW + 20);
      doc.roundedRect(x, y, sigW, 90, 6).lineWidth(0.8).strokeColor('#cccccc').stroke();
      doc.fillColor(green).fontSize(9).font('Helvetica-Bold').text(block.title, x + 12, y + 12);
      doc.moveTo(x + 12, y + 58).lineTo(x + sigW - 12, y + 58).stroke('#aaaaaa');
      doc.fillColor(mutedText).fontSize(8).font('Helvetica')
        .text(block.sub, x + 12, y + 64)
        .text(block.stamp, x + 12, y + 76);
    });

    // ── Footer ──
    doc.rect(0, 770, pageW, 72).fill(green);
    doc.rect(0, 770, pageW, 3).fill(gold);
    doc.fillColor(white).fontSize(8).font('Helvetica')
      .text(
        `${hotel.name}  |  ${hotel.address}  |  Tel: ${hotel.phone}`,
        margin, 786, { align: 'center', width: contentW }
      )
      .text(
        'This is an official computer-generated appointment letter. Please retain a signed copy for your records.',
        margin, 802, { align: 'center', width: contentW }
      )
      .text(`Generated on ${new Date().toLocaleString('en-LK')}`, margin, 818, { align: 'center', width: contentW });

    doc.end();
  });
}

module.exports = { generatePaysheetPDF, generateAdvancePDF, generateAppointmentLetterPDF, MONTHS };
