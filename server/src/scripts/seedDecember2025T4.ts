import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { PayStatement } from '../models/PayStatement';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { decimalToMoney } from '../utils/money';

const samples = [
  { gross: 3200, tax: 510, cpp: 190.4, ei: 52.16, hours: 80, rate: 40 },
  { gross: 2800, tax: 420, cpp: 166.6, ei: 45.64, hours: 80, rate: 35 }
];

async function seedDecember2025T4() {
  configureDns();
  await mongoose.connect(env.mongoUri);
  const company = await Company.findOne({ customerId: 'A07998' }) || await Company.findOne();
  if (!company) throw new Error('No company found. Run the base seed first.');
  const employees = await Employee.find({ companyId: company._id }).sort({ employeeNumber: 1 }).limit(2);
  if (employees.length < 2) throw new Error('At least two employees are required. Run the base seed first.');

  for (const [index, employee] of employees.entries()) {
    const sample = samples[index];
    const deductions = sample.tax + sample.cpp + sample.ei;
    const net = sample.gross - deductions;
    await PayStatement.findOneAndUpdate(
      {
        employeeId: employee._id,
        companyId: company._id,
        payPeriodYear: 2025,
        payPeriodNumber: 26
      },
      {
        employeeId: employee._id,
        companyId: company._id,
        payDate: new Date('2025-12-19T12:00:00.000Z'),
        payPeriodNumber: 26,
        payPeriodYear: 2025,
        type: 'Regular',
        periodStart: new Date('2025-12-06T12:00:00.000Z'),
        periodEnd: new Date('2025-12-19T12:00:00.000Z'),
        regularHours: sample.hours,
        overtimeHours: 0,
        hourlyRate: decimalToMoney(sample.rate.toFixed(2)),
        grossPay: decimalToMoney(sample.gross.toFixed(2)),
        netPay: decimalToMoney(net.toFixed(2)),
        yearToDateNetPay: decimalToMoney(net.toFixed(2)),
        grossEarnings: [
          { code: 'REG', description: 'Regular Hours', amount: decimalToMoney(sample.gross.toFixed(2)) },
          { code: 'TOTAL', description: 'Total Earnings', amount: decimalToMoney(sample.gross.toFixed(2)) }
        ],
        deductions: [
          { code: 'TAX', description: 'Income Tax', amount: decimalToMoney(sample.tax.toFixed(2)) },
          { code: 'CPP', description: 'CPP', amount: decimalToMoney(sample.cpp.toFixed(2)) },
          { code: 'EI', description: 'EI', amount: decimalToMoney(sample.ei.toFixed(2)) },
          { code: 'TOTAL', description: 'Total Deductions', amount: decimalToMoney(deductions.toFixed(2)) }
        ],
        additionalInfo: [
          { key: 'Employee Number', value: employee.employeeNumber },
          { key: 'Pay Period', value: 'Dec 6, 2025 to Dec 19, 2025' }
        ],
        revision: 1,
        changeSummary: [],
        isUnread: true
      },
      { upsert: true, new: true }
    );
    await TaxFormDocument.findOneAndUpdate(
      { employeeId: employee._id, companyId: company._id, taxYear: 2025, formType: 'T4' },
      { employeeId: employee._id, companyId: company._id, taxYear: 2025, formType: 'T4', generatedAt: new Date() },
      { upsert: true }
    );
  }
  console.log(`Created December 2025 payslips and T4 records for ${employees.map((item) => `${item.legalFirstName} ${item.legalLastName}`).join(' and ')}.`);
  await mongoose.disconnect();
}

seedDecember2025T4().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
