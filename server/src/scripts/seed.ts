import mongoose from 'mongoose';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { PayStatement } from '../models/PayStatement';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { User } from '../models/User';
import { decimalToMoney } from '../utils/money';
import { encryptSin, hashPassword } from '../utils/security';

const samplePayStatements = [
  {
    date: '2024-12-13',
    period: 25,
    periodRange: 'Nov 25, 2024 to Dec 8, 2024',
    gross: '2030.20',
    deductions: '442.78',
    net: '1587.42',
    ytdNet: '14774.24',
    ytdGross: '21504.08'
  },
  {
    date: '2024-12-27',
    period: 26,
    periodRange: 'Dec 9, 2024 to Dec 22, 2024',
    gross: '2081.04',
    deductions: '449.98',
    net: '1631.06',
    ytdNet: '16405.30',
    ytdGross: '23585.12'
  }
];

async function seed() {
  await mongoose.connect(env.mongoUri);

  const company = await Company.findOneAndUpdate(
    { customerId: 'A07998' },
    {
      legalName: 'Gayatri Holding Medicine Hat A Inc',
      operatingName: 'Gayatri Holding Medicine Hat A Inc',
      customerId: 'A07998',
      address: { street: '1277 Trans Canada Way SE', city: 'Medicine Hat', province: 'AB', postalCode: 'T1B1H9' }
    },
    { new: true, upsert: true }
  );

  const user = await User.findOneAndUpdate(
    { email: 'anil.suhagiya@example.com' },
    {
      email: 'anil.suhagiya@example.com',
      passwordHash: await hashPassword('Payhours1!'),
      mustChangePassword: false,
      isActive: true
    },
    { new: true, upsert: true }
  );

  const employee = await Employee.findOneAndUpdate(
    { companyId: company._id, employeeNumber: '0006' },
    {
      userId: user._id,
      companyId: company._id,
      employeeNumber: '0006',
      legalFirstName: 'ANILKUMAR',
      middleName: 'MUKESHBHAI',
      legalLastName: 'SUHAGIYA',
      preferredFirstName: 'Anilkumar',
      preferredLastName: 'Suhagiya',
      salutation: 'Mr.',
      citizenship: 'Canada',
      sinEncrypted: encryptSin('973263007'),
      birthDate: new Date('1989-08-15'),
      addresses: [{ street: '370 NORTHLANDS POINTE NE', city: 'MEDICINE HAT', province: 'AB', postalCode: 'T1C0C4' }],
      phones: [{ type: 'Mobile', number: '403-555-0106' }],
      personalEmail: 'anil.suhagiya@example.com',
      notificationEmailPreference: 'personal',
      emergencyContacts: [{ name: 'Jiya Suhagiya', relationship: 'Spouse', phone: '403-555-0111' }],
      occupation: 'Pharmacy Assistant',
      startDate: new Date('2024-01-08'),
      seniorityDate: new Date('2024-01-08'),
      primaryEarningCode: 'Regular Pay',
      payGroup: 'Bi-Weekly',
      taxProvince: 'Alberta',
      wcbNumber: 'AB-44521',
      personalTaxCredits: { federalClaimAmount: decimalToMoney('16452.00'), provincialClaimAmount: decimalToMoney('22769.00') },
      payStatementPreference: { emailStatement: true, language: 'English' }
    },
    { new: true, upsert: true }
  );

  user.lastSelectedEmployeeId = employee._id;
  await user.save();

  await Promise.all([
    PayStatement.deleteMany({ employeeId: employee._id, companyId: company._id }),
    TaxFormDocument.deleteMany({ employeeId: employee._id, companyId: company._id })
  ]);

  for (const statement of samplePayStatements) {
    await PayStatement.create({
      employeeId: employee._id,
      companyId: company._id,
      payDate: new Date(statement.date),
      payPeriodNumber: statement.period,
      payPeriodYear: 2024,
      type: 'Regular',
      netPay: decimalToMoney(statement.net),
      yearToDateNetPay: decimalToMoney(statement.ytdNet),
      grossEarnings: [
        { code: 'REG', description: 'Regular', amount: decimalToMoney(statement.period === 26 ? '2001.00' : '2030.20') },
        { code: 'VAC', description: 'Vac Fach Pay', amount: decimalToMoney(statement.period === 26 ? '80.04' : '0.00') },
        { code: 'TOTAL', description: 'Total', amount: decimalToMoney(statement.gross) }
      ],
      deductions: [
        { code: 'TAX', description: 'Federal Tax', amount: decimalToMoney(statement.period === 26 ? '299.62' : '292.38') },
        { code: 'CPP', description: 'CPP', amount: decimalToMoney(statement.period === 26 ? '115.81' : '115.85') },
        { code: 'EI', description: 'EI', amount: decimalToMoney('34.55') },
        { code: 'TOTAL', description: 'Total', amount: decimalToMoney(statement.deductions) }
      ],
      additionalInfo: [
        { key: 'Pay Period', value: statement.periodRange },
        { key: 'Period Number', value: String(statement.period) },
        { key: 'Payroll Number', value: 'A07998' },
        { key: 'Employee Number', value: '0006' },
        { key: 'Department', value: '000000' },
        { key: 'Deposit', value: `XXX-XXXXX-XXXXXX $ ${statement.net}` },
        { key: 'Seq. Number', value: '208641062' },
        { key: 'Additional Fed Tax', value: '$ 0' }
      ],
      isUnread: statement.period === 26
    });
  }

  await TaxFormDocument.create({ employeeId: employee._id, companyId: company._id, taxYear: 2024, formType: 'T4' });

  console.log('Seeded Payhours employee portal. Login: anil.suhagiya@example.com / Payhours1!');
  console.log("// Manual bulletin example: await CompanyBulletin.create({ companyId, title: 'Holiday schedule', body: 'Updated office hours are posted.', postedBy: 'Payroll' })");
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
