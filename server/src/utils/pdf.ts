type PdfLine = {
  code?: string;
  description: string;
  amount: string;
  ytd?: string;
  currentUnits?: string;
  ytdUnits?: string;
  rate?: string;
};
type PdfInfo = { key: string; value: string };

export type PayslipPdfData = {
  companyName: string;
  companyAddress: string[];
  employeeName: string;
  employeeCode: string;
  payGroup: string;
  employeeAddress: string[];
  payDate: string;
  netPay: string;
  yearToDateNetPay: string;
  grossPay: string;
  deductionsTotal: string;
  grossEarnings: PdfLine[];
  deductions: PdfLine[];
  additionalInfo: PdfInfo[];
};

export type T4PdfData = {
  employerName: string;
  employerAddress?: string[];
  year: number;
  sin: string;
  lastName: string;
  firstName: string;
  initial: string;
  address: string[];
  province?: string;
  employmentIncome?: string;
  incomeTax?: string;
  cppContributions?: string;
  eiPremiums?: string;
};

export type RoePdfData = {
  serialNumber?: string;
  payrollReference: string;
  employerName: string;
  employerAddress: string[];
  postalCode: string;
  craPayrollAccount: string;
  payPeriodType: string;
  sin: string;
  employeeName: string;
  employeeAddress: string[];
  firstDayWorked: string;
  lastDayPaid: string;
  finalPayPeriodEnd: string;
  occupation: string;
  expectedRecall: string;
  totalInsurableHours: string;
  totalInsurableEarnings: string;
  reasonCode: string;
  reasonDescription: string;
  issuerName: string;
  issuerPhone: string;
  issueDate: string;
  payPeriods: Array<{ endDate: string; earnings: string; hours: string }>;
};

function escapePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function compactLines(lines: unknown[] | undefined, fallback: string[] = []): string[] {
  const values = Array.isArray(lines) ? lines : fallback;
  return values.map((line) => String(line || '').trim()).filter(Boolean);
}

function truncateText(value: unknown, max = 70): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}

class PdfPage {
  private readonly ops: string[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number
  ) {}

  text(
    value: unknown,
    x: number,
    y: number,
    size = 10,
    bold = false,
    color?: [number, number, number]
  ): void {
    this.ops.push(
      ...(color ? [`${color.join(' ')} rg`] : []),
      'BT',
      `/${bold ? 'F2' : 'F1'} ${size} Tf`,
      `${x} ${y} Td`,
      `(${escapePdfText(value)}) Tj`,
      'ET',
      ...(color ? ['0 0 0 rg'] : [])
    );
  }

  rightText(value: unknown, x: number, y: number, size = 10, bold = false): void {
    const printable = String(value ?? '');
    this.text(printable, x - printable.length * size * 0.52, y, size, bold);
  }

  centerText(value: unknown, centerX: number, y: number, size = 10, bold = false): void {
    const printable = String(value ?? '');
    this.text(printable, centerX - printable.length * size * 0.26, y, size, bold);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    this.ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  rect(x: number, y: number, w: number, h: number): void {
    this.ops.push(`${x} ${y} ${w} ${h} re S`);
  }

  fillRect(x: number, y: number, w: number, h: number, color: [number, number, number]): void {
    this.ops.push(`${color.join(' ')} rg`, `${x} ${y} ${w} ${h} re f`, '0 0 0 rg');
  }

  fillCircle(
    centerX: number,
    centerY: number,
    radius: number,
    color: [number, number, number]
  ): void {
    const control = radius * 0.5522847498;
    this.ops.push(
      `${color.join(' ')} rg`,
      `${centerX + radius} ${centerY} m`,
      `${centerX + radius} ${centerY + control} ${centerX + control} ${centerY + radius} ${centerX} ${centerY + radius} c`,
      `${centerX - control} ${centerY + radius} ${centerX - radius} ${centerY + control} ${centerX - radius} ${centerY} c`,
      `${centerX - radius} ${centerY - control} ${centerX - control} ${centerY - radius} ${centerX} ${centerY - radius} c`,
      `${centerX + control} ${centerY - radius} ${centerX + radius} ${centerY - control} ${centerX + radius} ${centerY} c`,
      'f',
      '0 0 0 rg'
    );
  }

  fillCircleRightSide(
    centerX: number,
    centerY: number,
    radius: number,
    startX: number,
    color: [number, number, number]
  ): void {
    const control = radius * 0.5522847498;
    this.ops.push(
      'q',
      `${centerX + radius} ${centerY} m`,
      `${centerX + radius} ${centerY + control} ${centerX + control} ${centerY + radius} ${centerX} ${centerY + radius} c`,
      `${centerX - control} ${centerY + radius} ${centerX - radius} ${centerY + control} ${centerX - radius} ${centerY} c`,
      `${centerX - radius} ${centerY - control} ${centerX - control} ${centerY - radius} ${centerX} ${centerY - radius} c`,
      `${centerX + control} ${centerY - radius} ${centerX + radius} ${centerY - control} ${centerX + radius} ${centerY} c`,
      'W n',
      `${color.join(' ')} rg`,
      `${startX} ${centerY - radius} ${centerX + radius - startX} ${radius * 2} re f`,
      'Q',
      '0 0 0 rg'
    );
  }

  content(): string {
    return this.ops.join('\n');
  }

  buffer(): Buffer {
    return buildPdf([{ width: this.width, height: this.height, content: this.content() }]);
  }
}

function drawPayhoursLogo(page: PdfPage, x: number, y: number, scale = 1): void {
  const radius = 15 * scale;
  page.fillCircle(x + radius, y + radius, radius, [0.145, 0.725, 0.839]);
  page.fillCircleRightSide(x + radius, y + radius, radius, x + radius * 0.8, [0.078, 0.388, 0.953]);
  page.fillCircle(x + radius, y + radius, 6 * scale, [0.973, 0.984, 1]);
  page.fillRect(x + 12.75 * scale, y + 16 * scale, 4.5 * scale, 11 * scale, [0.078, 0.388, 0.953]);
  page.text('Payhours', x + 39 * scale, y + 13 * scale, 19 * scale, true, [0.078, 0.388, 0.953]);
  page.text('Payroll Made Simple', x + 40 * scale, y + 1 * scale, 7 * scale, true, [0.145, 0.725, 0.839]);
}

function drawDocumentHeader(
  page: PdfPage,
  width: number,
  topY: number,
  title: string,
  employerName: string,
  employerAddress: string[] = []
): void {
  drawPayhoursLogo(page, 18, topY - 30);
  page.text(title, width - 190, topY - 10, 10, true, [0.05, 0.12, 0.2]);
  page.text('Employer', 18, topY - 50, 6, true, [0.28, 0.35, 0.45]);
  page.text(truncateText(employerName || '-', 72), 18, topY - 62, 8, true);
  compactLines(employerAddress)
    .slice(0, 3)
    .forEach((line, index) => page.text(truncateText(line, 82), 18, topY - 73 - index * 9, 7));
  page.line(14, topY - 100, width - 14, topY - 100);
}

function buildPdf(pages: Array<{ width: number; height: number; content: string }>): Buffer {
  const pageObjectStart = 3;
  const fontObjectId = pageObjectStart + pages.length * 2;
  const boldFontObjectId = fontObjectId + 1;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${pageObjectStart + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`
  ];

  pages.forEach((page, index) => {
    const pageObjectId = pageObjectStart + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(
      `${pageObjectId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 ${fontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >> endobj`,
      `${contentObjectId} 0 obj << /Length ${Buffer.byteLength(page.content, 'utf8')} >> stream\n${page.content}\nendstream endobj`
    );
  });

  objects.push(
    `${fontObjectId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
    `${boldFontObjectId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`
  );

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${object}\n`;
  }
  const xrefStart = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}

function drawPayslip(data: PayslipPdfData): PdfPage {
  const page = new PdfPage(792, 612);
  const grossEarnings = Array.isArray(data.grossEarnings) ? data.grossEarnings : [];
  const deductions = Array.isArray(data.deductions) ? data.deductions : [];
  const additionalInfo = Array.isArray(data.additionalInfo) ? data.additionalInfo : [];
  drawDocumentHeader(page, 792, 606, 'EARNINGS STATEMENT', data.companyName, compactLines(data.companyAddress));
  page.text(truncateText(data.employeeName, 44), 405, 544, 8, true);
  page.text(`Employee code: ${data.employeeCode}`, 405, 533, 7);
  page.text(`Pay frequency: ${data.payGroup}`, 405, 523, 7);
  page.rect(14, 462, 764, 48);
  page.text('PAY DATE:', 22, 494, 12, true);
  page.text(data.payDate, 22, 474, 10);
  page.text('NET PAY', 405, 494, 12, true);
  page.text('$', 625, 494, 12);
  page.rightText(data.netPay, 756, 494, 12, true);
  page.text('YEAR TO DATE', 405, 474, 12, true);
  page.text('$', 625, 474, 12);
  page.rightText(data.yearToDateNetPay, 756, 474, 12, true);

  page.rect(14, 146, 450, 306);
  page.rect(464, 250, 314, 202);
  page.text('Gross Earnings', 22, 435, 14);
  page.text('$', 320, 435, 14);
  page.rightText(data.grossPay, 458, 435, 14);
  page.text('Deductions', 472, 435, 14);
  page.text('$', 650, 435, 14);
  page.rightText(data.deductionsTotal, 756, 435, 14);
  page.line(14, 418, 778, 418);
  page.text('Description', 22, 404, 7, true);
  page.rightText('Current', 210, 404, 7, true);
  page.rightText('YTD', 298, 404, 7, true);
  page.rightText('Rate', 352, 404, 7, true);
  page.rightText('Current', 428, 404, 7, true);
  page.rightText('YTD', 458, 404, 7, true);
  page.text('Hours/Units', 174, 394, 6);
  page.text('Hours/Units', 266, 394, 6);
  page.text('Earnings', 394, 394, 6);
  page.text('Earnings', 438, 394, 6);
  grossEarnings.slice(0, 12).forEach((line, index) => {
    const y = 376 - index * 15;
    page.text(truncateText(line.description, 34), 22, y, 6);
    page.rightText(line.currentUnits || '', 210, y, 6);
    page.rightText(line.ytdUnits || '', 298, y, 6);
    page.rightText(line.rate || '', 352, y, 6);
    page.rightText(line.amount, 428, y, 6, line.code === 'TOTAL');
    page.rightText(line.ytd || '', 458, y, 6);
  });
  page.text('Description', 472, 404, 7, true);
  page.rightText('Current', 710, 404, 7, true);
  page.rightText('YTD', 756, 404, 7, true);
  deductions.slice(0, 9).forEach((line, index) => {
    const y = 384 - index * 13;
    page.text(truncateText(line.description, 38), 472, y, 6);
    page.rightText(line.amount, 710, y, 6, line.code === 'TOTAL');
    page.rightText(line.ytd || '', 756, y, 6);
  });

  page.rect(464, 146, 314, 104);
  page.text('Additional Statement Information', 472, 229, 12);
  page.line(464, 216, 778, 216);
  additionalInfo
    .slice(0, 9)
    .forEach((line, index) => page.text(truncateText(`${line.key}: ${line.value}`, 76), 472, 203 - index * 6.5, 6));
  return page;
}

export function payslipPdf(data: PayslipPdfData): Buffer {
  return drawPayslip(data).buffer();
}

export function payslipsPdf(items: PayslipPdfData[]): Buffer {
  return buildPdf(
    items.map((item) => ({ width: 792, height: 612, content: drawPayslip(item).content() }))
  );
}

function boxedValue(
  page: PdfPage,
  box: string,
  label: string,
  value: string,
  x: number,
  y: number,
  width = 156
): void {
  page.text(label, x + 28, y + 23, 5.5);
  page.rect(x, y, width, 20);
  page.rect(x, y, 24, 20);
  page.text(box, x + 6, y + 6, 8, true);
  page.rightText(value, x + width - 6, y + 6, 9);
}

function drawT4(data: T4PdfData): PdfPage {
  const page = new PdfPage(792, 612);
  const employerAddress = compactLines(data.employerAddress);
  const employeeAddress = compactLines(data.address);
  drawPayhoursLogo(page, 18, 576);
  page.text('T4 STATEMENT', 602, 596, 10, true, [0.05, 0.12, 0.2]);
  page.rect(14, 438, 286, 92);
  page.text("Employer's name and address - Nom et adresse de l'employeur", 24, 516, 8);
  page.text(truncateText(data.employerName, 38), 24, 500, 10, true);
  employerAddress.slice(0, 3).forEach((line, index) => page.text(truncateText(line, 50), 24, 488 - index * 10, 7));
  page.text('Canada Revenue', 340, 558, 7);
  page.text('Agence du revenu', 420, 558, 7);
  page.text('Canada', 340, 548, 7);
  page.text('du Canada', 420, 548, 7);
  page.text('Year', 310, 528, 10);
  page.text('Annee', 310, 516, 10);
  page.rect(354, 515, 60, 22);
  page.text(String(data.year), 370, 522, 12);
  page.text('T4', 620, 560, 18, true);
  page.text('Statement of Remuneration Paid', 535, 540, 11, true);
  page.text('Etat de la remuneration payee', 545, 526, 11, true);
  page.line(310, 510, 778, 510);
  page.rect(14, 400, 286, 38);
  page.rect(14, 418, 28, 20);
  page.text('54', 20, 425, 8, true);
  page.text("Employer's account number / Numero de compte de l'employeur", 52, 425, 5.5);
  boxedValue(page, '12', 'Social insurance number', data.sin, 18, 382, 124);
  page.rect(220, 382, 24, 20); page.text('28', 226, 388, 8, true); page.text('CPP-QPP', 219, 405, 5.5);
  page.rect(252, 382, 24, 20); page.text('EI', 260, 388, 8, true); page.text('EI', 260, 405, 5.5);
  page.rect(284, 382, 24, 20); page.text('PPIP', 285, 405, 5.5);
  page.rect(316, 382, 68, 20); page.rect(316, 382, 24, 20); page.text('29', 322, 388, 8, true); page.text('Employment code', 316, 405, 5.5);
  page.rect(14, 190, 370, 174);
  page.text("Employee's name and address - Nom et adresse de l'employe", 72, 348, 8, true);
  page.text('Last name - Nom de famille', 38, 331, 6);
  page.text('First name - Prenom', 204, 331, 6);
  page.text('Initial - Initiale', 310, 331, 6);
  page.rect(36, 304, 334, 22);
  page.text(truncateText(data.lastName, 28), 42, 311, 9);
  page.text(truncateText(data.firstName, 18), 208, 311, 9);
  page.text(data.initial, 316, 311, 9);
  employeeAddress.slice(0, 4).forEach((line, index) => page.text(truncateText(line, 48), 34, 282 - index * 12, 9));
  boxedValue(page, '14', 'Employment income / Revenus demploi', data.employmentIncome || '0.00', 420, 462);
  boxedValue(page, '22', 'Income tax deducted / Impot sur le revenu retenu', data.incomeTax || '0.00', 610, 462);
  boxedValue(page, '16', "Employee's CPP contributions", data.cppContributions || '0.00', 420, 416);
  boxedValue(page, '24', 'EI insurable earnings', data.employmentIncome || '0.00', 420, 370);
  boxedValue(page, '26', 'CPP-QPP pensionable earnings', data.employmentIncome || '0.00', 610, 370);
  boxedValue(page, '18', "Employee's EI premiums", data.eiPremiums || '0.00', 420, 324);
  boxedValue(page, '44', 'Union dues', '', 610, 324);
  boxedValue(page, '20', 'RPP contributions', '', 420, 278);
  boxedValue(page, '46', 'Charitable donations', '', 610, 278);
  boxedValue(page, '52', 'Pension adjustment', '', 420, 232);
  boxedValue(page, '50', 'RPP or DPSP registration number', '', 610, 232);
  boxedValue(page, '55', "Employee's PPIP premiums", '', 420, 186);
  boxedValue(page, '56', 'PPIP insurable earnings', '', 610, 186);
  boxedValue(page, '10', 'Province of employment', data.province || 'AB', 316, 416, 88);
  page.rect(14, 100, 764, 70);
  page.text('Other information', 42, 141, 7);
  for (let i = 0; i < 6; i += 1) {
    const x = 134 + (i % 3) * 212;
    const y = i < 3 ? 132 : 104;
    page.text('Box - Case', x, y + 22, 5.5);
    page.text('Amount - Montant', x + 54, y + 22, 5.5);
    page.rect(x, y, 34, 18);
    page.rect(x + 42, y, 154, 18);
  }
  page.text('T4 (23)', 14, 82, 8);
  return page;
}

export function t4Pdf(data: T4PdfData): Buffer {
  return drawT4(data).buffer();
}

export function t4sPdf(items: T4PdfData[]): Buffer {
  return buildPdf(
    items.map((item) => ({ width: 792, height: 612, content: drawT4(item).content() }))
  );
}

export function roePdf(data: RoePdfData): Buffer {
  const page = new PdfPage(612, 792);
  const employerAddress = compactLines(data.employerAddress);
  const employeeAddress = compactLines(data.employeeAddress);
  const payPeriods = Array.isArray(data.payPeriods) ? data.payPeriods : [];
  const blue: [number, number, number] = [0, 0.25, 0.8];
  const value = (text: string, x: number, y: number, size = 7) => page.text(text || '-', x, y, size, false, blue);
  const box = (number: string, label: string, x: number, y: number, w: number, h: number) => {
    page.rect(x, y, w, h);
    page.text(`${number}  ${label}`, x + 3, y + h - 9, 6, true);
  };
  drawDocumentHeader(page, 612, 790, 'RECORD OF EMPLOYMENT (ROE)', data.employerName, employerAddress);
  page.text('Service', 48, 688, 7, true);
  page.text('Canada', 48, 679, 7, true);
  page.fillRect(27, 679, 7, 16, [0.9, 0.05, 0.12]);
  page.fillRect(39, 679, 7, 16, [0.9, 0.05, 0.12]);
  page.text('DRAFT - OFFICIAL SERIAL ASSIGNED BY SERVICE CANADA AFTER SUBMISSION', 318, 692, 5, true);

  box('1', 'SERIAL NO.', 27, 646, 112, 17); value(data.serialNumber || 'PENDING SUBMISSION', 31, 647, 5.5);
  box('2', 'SERIAL NO. OF ROE AMENDED OR REPLACED', 139, 646, 186, 17);
  box('3', "EMPLOYER'S PAYROLL REFERENCE NUMBER", 325, 646, 260, 17); value(data.payrollReference, 329, 647, 5.5);
  box('4', "EMPLOYER'S NAME AND ADDRESS", 27, 576, 275, 70);
  value(truncateText(data.employerName, 44), 35, 615); employerAddress.slice(0, 3).forEach((line, index) => value(truncateText(line, 54), 35, 603 - index * 10));
  box('5', 'CRA PAYROLL ACCOUNT NUMBER', 302, 611, 145, 35); value(data.craPayrollAccount, 310, 618);
  box('8', 'SOCIAL INSURANCE NUMBER', 447, 611, 138, 35); value(data.sin, 455, 618);
  box('6', 'PAY PERIOD TYPE', 302, 576, 145, 35); value(data.payPeriodType, 310, 583);
  box('10', 'FIRST DAY WORKED', 447, 576, 138, 35); value(data.firstDayWorked, 455, 583);
  box('7', 'POSTAL CODE', 190, 556, 112, 20); value(data.postalCode, 235, 561);
  box('11', 'LAST DAY FOR WHICH PAID', 447, 556, 138, 20); value(data.lastDayPaid, 520, 561);
  box('9', "EMPLOYEE'S NAME AND ADDRESS", 27, 486, 275, 70);
  value(truncateText(data.employeeName, 44), 35, 525); employeeAddress.slice(0, 3).forEach((line, index) => value(truncateText(line, 54), 35, 513 - index * 10));
  box('12', 'FINAL PAY PERIOD ENDING DATE', 447, 536, 138, 20); value(data.finalPayPeriodEnd, 520, 541);
  box('14', 'EXPECTED DATE OF RECALL', 302, 506, 145, 30); value(data.expectedRecall || 'NOT RETURNING', 310, 513, 6);
  box('13', 'OCCUPATION', 447, 506, 138, 30); value(data.occupation, 455, 513);
  box('15A', 'TOTAL INSURABLE HOURS', 302, 486, 145, 20); value(data.totalInsurableHours, 398, 491);
  box('15B', 'TOTAL INSURABLE EARNINGS', 447, 486, 138, 20); value(`$${data.totalInsurableEarnings}`, 535, 491);

  box('16', 'REASON FOR ISSUING THIS ROE', 27, 436, 275, 50);
  value(`${data.reasonCode} - ${data.reasonDescription}`, 35, 457, 8);
  page.text('FOR MORE INFORMATION, CONTACT', 35, 443, 5.5, true); value(`${data.issuerName}  ${data.issuerPhone}`, 177, 443, 5.5);
  box('15C', 'PAY PERIOD ENDING DATE / INSURABLE EARNINGS / INSURABLE HOURS', 302, 226, 283, 260);
  const rowTop = 451;
  page.line(327, 226, 327, rowTop); page.line(412, 226, 412, rowTop); page.line(493, 226, 493, rowTop);
  page.text('PP', 309, 461, 5.5, true);
  page.text('PAY PERIOD', 344, 467, 5, true); page.text('ENDING DATE', 344, 459, 5, true);
  page.text('INSURABLE', 430, 467, 5, true); page.text('EARNINGS', 432, 459, 5, true);
  page.text('INSURABLE', 508, 467, 5, true); page.text('HOURS', 515, 459, 5, true);
  for (let index = 0; index < 27; index += 1) {
    const y = rowTop - (index + 1) * 8.3;
    page.line(302, y, 585, y);
    page.text(String(index + 1), 310, y + 2, 5);
    const period = payPeriods[index];
    if (period) { value(period.endDate, 334, y + 2, 5); value(`$${period.earnings}`, 418, y + 2, 5); value(period.hours, 500, y + 2, 5); }
  }
  box('17', 'SEPARATION PAYMENTS', 27, 346, 275, 90); page.text('A - VACATION PAY', 35, 410, 6, true); page.text('B - STATUTORY HOLIDAY PAY', 35, 384, 6, true); page.text('C - OTHER MONIES', 35, 358, 6, true);
  box('18', 'COMMENTS', 27, 276, 275, 70);
  box('19', 'PAID SICK / MATERNITY / PARENTAL / CARE LEAVE', 27, 226, 275, 50);
  box('20', 'COMMUNICATION PREFERRED IN', 27, 196, 145, 30); value('ENGLISH', 35, 204);
  box('21', 'TELEPHONE NO.', 172, 196, 130, 30); value(data.issuerPhone, 180, 204);
  box('22', 'NAME OF ISSUER', 27, 156, 275, 40); value(data.issuerName, 35, 172); value(`DATE ISSUED: ${data.issueDate}`, 35, 161, 6);
  page.rect(27, 129, 558, 27); page.text('THIS RECORD OF EMPLOYMENT IS A DRAFT GENERATED FROM PAYROLL RECORDS.', 32, 144, 6, true); page.text('Submit through ROE Web or SAT. Service Canada assigns the official serial number after acceptance.', 32, 134, 6);
  page.text('Service Canada', 27, 111, 8, true); page.text('Page 2 contains important information.', 238, 111, 6);
  return page.buffer();
}
