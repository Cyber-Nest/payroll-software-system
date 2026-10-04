import { payslipPdf, payslipsPdf, roePdf, t4Pdf, t4sPdf, PayslipPdfData, RoePdfData, T4PdfData } from '../src/utils/pdf';

const pdfText = (buffer: Buffer) => buffer.toString('latin1');
const pageCount = (buffer: Buffer) => (pdfText(buffer).match(/\/Type \/Page\b/g) || []).length;

const payslip: PayslipPdfData = {
  companyName: 'Acme Payroll Ltd.',
  companyAddress: ['1 Main St', 'Medicine Hat, AB T1A 0A1'],
  employeeName: 'Jane Doe',
  employeeCode: 'E001',
  payGroup: 'Biweekly',
  employeeAddress: ['2 Side St'],
  payDate: 'Oct 3, 2026',
  netPay: '80.00',
  yearToDateNetPay: '800.00',
  grossPay: '100.00',
  deductionsTotal: '20.00',
  grossEarnings: [{ code: 'TOTAL', description: 'Total gross pay', amount: '100.00', ytd: '1000.00' }],
  deductions: [{ code: 'TOTAL', description: 'Total deductions', amount: '20.00', ytd: '200.00' }],
  additionalInfo: [{ key: 'Pay Period', value: '2026-09-20 to 2026-10-03' }]
};

const t4: T4PdfData = {
  employerName: 'Acme Payroll Ltd.',
  employerAddress: ['1 Main St', 'Medicine Hat, AB T1A 0A1'],
  year: 2025,
  sin: '123456789',
  lastName: 'Doe',
  firstName: 'Jane',
  initial: 'Q',
  address: ['2 Side St', 'Medicine Hat, AB', 'T1A 0A2'],
  province: 'AB',
  employmentIncome: '100.00',
  incomeTax: '20.00',
  cppContributions: '5.00',
  eiPremiums: '2.00'
};

const roe: RoePdfData = {
  payrollReference: 'E001',
  employerName: 'Acme Payroll Ltd.',
  employerAddress: ['1 Main St', 'Medicine Hat, AB T1A 0A1'],
  postalCode: 'T1A 0A1',
  craPayrollAccount: '123456789RP0001',
  payPeriodType: 'Biweekly',
  sin: '123456789',
  employeeName: 'Jane Doe',
  employeeAddress: ['2 Side St', 'Medicine Hat, AB T1A 0A2'],
  firstDayWorked: '2026-01-01',
  lastDayPaid: '2026-10-03',
  finalPayPeriodEnd: '2026-10-03',
  occupation: 'Clerk',
  expectedRecall: 'Unknown',
  totalInsurableHours: '80.00',
  totalInsurableEarnings: '1000.00',
  reasonCode: 'A',
  reasonDescription: 'Shortage of work',
  issuerName: 'Payroll Admin',
  issuerPhone: '555-0100',
  issueDate: '2026-10-03',
  payPeriods: [{ endDate: '2026-10-03', earnings: '1000.00', hours: '80.00' }]
};

describe('PDF generation', () => {
  it('generates a branded payslip PDF', () => {
    const file = payslipPdf(payslip);
    expect(pdfText(file)).toContain('%PDF-1.4');
    expect(pdfText(file)).toContain('Payhours');
    expect(pdfText(file)).toContain('Acme Payroll Ltd.');
    expect(pageCount(file)).toBe(1);
  });

  it('formats payslip deductions with payroll tax detail from statement lines', () => {
    const file = payslipPdf({
      ...payslip,
      deductionsTotal: '463.92',
      deductions: [
        { code: 'CPP', description: 'CPP', amount: '114.51', ytd: '114.51' },
        { code: 'EI', description: 'EI', amount: '33.56', ytd: '33.56' },
        { code: 'FTAX', description: 'Federal tax', amount: '170.89', ytd: '170.89' },
        { code: 'PTAX', description: 'Provincial tax', amount: '144.96', ytd: '144.96' },
        { code: 'TOTAL', description: 'Total deductions', amount: '463.92', ytd: '463.92' }
      ]
    });
    const text = pdfText(file);
    expect(text).toContain('Canada Pension Plan');
    expect(text).toContain('Employment Insurance');
    expect(text).toContain('Federal income tax');
    expect(text).toContain('315.85');
    expect(text).toContain('463.92');
  });

  it('generates multi-page payslip PDFs', () => {
    const file = payslipsPdf([payslip, payslip]);
    expect(pageCount(file)).toBe(2);
  });

  it('generates a branded T4 PDF with employer details', () => {
    const file = t4Pdf(t4);
    expect(pdfText(file)).toContain('Payhours');
    expect(pdfText(file)).toContain('Acme Payroll Ltd.');
    expect(pageCount(file)).toBe(1);
  });

  it('generates multi-page T4 PDFs', () => {
    const file = t4sPdf([t4, t4]);
    expect(pageCount(file)).toBe(2);
  });

  it('generates ROE PDFs and tolerates legacy missing arrays', () => {
    const legacy = { ...roe, employerAddress: undefined, employeeAddress: undefined, payPeriods: undefined } as unknown as RoePdfData;
    const file = roePdf(legacy);
    expect(pdfText(file)).toContain('Payhours');
    expect(pdfText(file)).toContain('Acme Payroll Ltd.');
    expect(pageCount(file)).toBe(1);
  });
});
