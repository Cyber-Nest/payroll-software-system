import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { CompanyBulletin } from '../models/CompanyBulletin';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { Help } from '../models/Help';
import { PayStatement } from '../models/PayStatement';
import { PayrollRun } from '../models/PayrollRun';
import { SuperAdmin } from '../models/SuperAdmin';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { User } from '../models/User';
import { defaultHelpContent } from '../data/helpContent';
import { addMoney, decimalToMoney, multiplyMoney } from '../utils/money';
import { encryptSin, hashPassword } from '../utils/security';

const password = 'Payhours1!';

const employers = [
  {
    customerId: 'A07998',
    legalName: 'Gayatri Holding Medicine Hat A Inc',
    operatingName: 'Gayatri Pharmacy',
    businessNumber: '734512889RP0001',
    admin: { name: 'Admin User', email: 'admin@abcsolutions.ca' },
    address: { street: '1277 Trans Canada Way SE', city: 'Medicine Hat', province: 'AB', postalCode: 'T1B1H9', country: 'Canada' },
    customerCarePhone: '(403) 555-0147',
    employees: [
      { number: '0006', first: 'ANILKUMAR', middle: 'MUKESHBHAI', last: 'SUHAGIYA', email: 'anil.suhagiya@example.com', role: 'Pharmacy Assistant', city: 'MEDICINE HAT', net: '1631.06' },
      { number: '0007', first: 'Harpreet', last: 'Singh', email: 'harpreet.singh@example.com', role: 'Store Manager', city: 'Medicine Hat', net: '1968.44' },
      { number: '0008', first: 'Jasleen', last: 'Kaur', email: 'jasleen.kaur@example.com', role: 'Cashier', city: 'Medicine Hat', net: '1284.22' }
    ]
  },
  {
    customerId: 'MF1020',
    legalName: 'Maple Foods Inc.',
    operatingName: 'Maple Foods',
    businessNumber: '881245612RP0001',
    admin: { name: 'Simran Kaur', email: 'simran@maplefoods.ca' },
    address: { street: '488 Granville Street', city: 'Vancouver', province: 'BC', postalCode: 'V6C1V4', country: 'Canada' },
    customerCarePhone: '(604) 555-0147',
    employees: [
      { number: 'MF-001', first: 'Amanpreet', last: 'Gill', email: 'amanpreet.gill@maplefoods.ca', role: 'Shift Lead', city: 'Vancouver', net: '1742.15' },
      { number: 'MF-002', first: 'Maria', last: 'Lopez', email: 'maria.lopez@maplefoods.ca', role: 'Kitchen Staff', city: 'Burnaby', net: '1428.90' }
    ]
  },
  {
    customerId: 'SP2040',
    legalName: 'Spice Hub Restaurant Ltd.',
    operatingName: 'Spice Hub',
    businessNumber: '792230441RP0001',
    admin: { name: 'Rahul Desai', email: 'rahul@spicehub.ca' },
    address: { street: '91 17 Avenue SW', city: 'Calgary', province: 'AB', postalCode: 'T2S0A1', country: 'Canada' },
    customerCarePhone: '(403) 555-0188',
    employees: [
      { number: 'SP-001', first: 'Priya', last: 'Verma', email: 'priya.verma@spicehub.ca', role: 'Server', city: 'Calgary', net: '1188.72' },
      { number: 'SP-002', first: 'Dev', last: 'Patel', email: 'dev.patel@spicehub.ca', role: 'Cook', city: 'Calgary', net: '1519.38' }
    ]
  }
];

async function seedEmployee(company: mongoose.Document & { _id: mongoose.Types.ObjectId; legalName: string; customerId: string }, item: (typeof employers)[number]['employees'][number], index: number) {
  const user = await User.findOneAndUpdate(
    { email: item.email },
    { email: item.email, passwordHash: await hashPassword(password), mustChangePassword: false, isActive: true },
    { new: true, upsert: true }
  );
  const employee = await Employee.findOneAndUpdate(
    { companyId: company._id, employeeNumber: item.number },
    {
      userId: user._id,
      companyId: company._id,
      employeeNumber: item.number,
      legalFirstName: item.first,
      middleName: item.middle || '',
      legalLastName: item.last,
      preferredFirstName: item.first,
      sinEncrypted: encryptSin(`97326300${index}`.slice(0, 9)),
      birthDate: new Date(`199${index}-08-15`),
      addresses: [{ street: `${100 + index} Main Street`, city: item.city, province: 'AB', postalCode: 'T1C0C4' }],
      phones: [{ type: 'Mobile', number: `403-555-010${index}` }],
      personalEmail: item.email,
      notificationEmailPreference: 'personal',
      emergencyContacts: [{ name: 'Emergency Contact', relationship: 'Family', phone: `403-555-020${index}` }],
      occupation: item.role,
      startDate: new Date('2025-04-15'),
      seniorityDate: new Date('2025-04-15'),
      primaryEarningCode: 'Regular Pay',
      payGroup: 'Biweekly',
      taxProvince: 'Alberta',
      wcbNumber: `WCB-${index}`,
      personalTaxCredits: { federalClaimAmount: decimalToMoney('16452.00'), provincialClaimAmount: decimalToMoney('22769.00') },
      payStatementPreference: { emailStatement: true, language: 'English' },
      adminProfile: {
        personal: { firstName: item.first, lastName: item.last, emailAddress: item.email, phoneNumber: `403-555-010${index}`, city: item.city, province: 'Alberta' },
        employment: { employmentStatus: 'Active', employmentType: 'Full-Time', jobTitle: item.role, department: 'Operations', location: `${company.legalName} Main`, employeeNumber: item.number },
        compensation: { payType: 'Hourly', hourlyRate: String(18 + index), payFrequency: 'Biweekly' },
        tax: { provinceOfResidence: 'Alberta', residencyStatus: 'Resident of Canada', craTd1Form: 'Completed' },
        vacation: { vacationPolicy: 'Accrue by Percentage (4%)' },
        benefits: { extendedHealthCare: 'Single' },
        banking: { directDeposit: 'Enabled', bankInstitution: 'Royal Bank of Canada (RBC)', accountType: 'Chequing' }
      }
    },
    { new: true, upsert: true }
  );
  user.lastSelectedEmployeeId = employee._id;
  await user.save();

  await PayStatement.deleteMany({ employeeId: employee._id, companyId: company._id });
  const net = decimalToMoney(item.net);
  for (const [offset, period] of [25, 26].entries()) {
    const netWithOffset = addMoney(net, multiplyMoney(18, offset));
    await PayStatement.create({
      employeeId: employee._id,
      companyId: company._id,
      payDate: new Date(period === 25 ? '2024-12-13' : '2024-12-27'),
      payPeriodNumber: period,
      payPeriodYear: 2024,
      type: 'Regular',
      netPay: decimalToMoney(netWithOffset),
      yearToDateNetPay: decimalToMoney(multiplyMoney(net, period === 25 ? 9 : 10)),
      grossEarnings: [{ code: 'REG', description: 'Regular', amount: decimalToMoney(multiplyMoney(net, '1.28')) }],
      deductions: [{ code: 'TOTAL', description: 'Total', amount: decimalToMoney(multiplyMoney(net, '0.28')) }],
      additionalInfo: [{ key: 'Employee Number', value: item.number }, { key: 'Payroll Number', value: company.customerId }],
      isUnread: period === 26
    });
  }
  await TaxFormDocument.findOneAndUpdate({ employeeId: employee._id, companyId: company._id, taxYear: 2024, formType: 'T4' }, { employeeId: employee._id, companyId: company._id, taxYear: 2024, formType: 'T4' }, { upsert: true });
}

async function seed() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  await SuperAdmin.findOneAndUpdate(
    { email: 'superadmin@payhours.ca' },
    { name: 'Payhours Super Admin', email: 'superadmin@payhours.ca', passwordHash: await hashPassword(password), isActive: true },
    { new: true, upsert: true }
  );

  for (const employer of employers) {
    const company = await Company.findOneAndUpdate(
      { customerId: employer.customerId },
      {
        legalName: employer.legalName,
        operatingName: employer.operatingName,
        customerId: employer.customerId,
        businessNumber: employer.businessNumber,
        businessType: 'Corporation',
        industry: 'Food and Retail',
        employeeCount: employer.employees.length,
        customerCarePhone: employer.customerCarePhone,
        status: 'active',
        address: employer.address,
        payrollConfiguration: { payFrequency: 'Biweekly', currency: 'CAD', standardHoursPerWeek: 40 },
        subscription: { plan: 'Professional', billingFrequency: 'Monthly', startDate: '2026-09-01' },
        features: { Employees: true, Payroll: true, Reports: true, Documents: true }
      },
      { new: true, upsert: true }
    );

    await EmployerUser.findOneAndUpdate(
      { email: employer.admin.email },
      { companyId: company._id, name: employer.admin.name, email: employer.admin.email, passwordHash: await hashPassword(password), role: 'Company Owner', isActive: true, mustChangePassword: false },
      { new: true, upsert: true }
    );

    await Promise.all([
      PayrollRun.deleteMany({ companyId: company._id }),
      CompanyBulletin.deleteMany({ companyId: company._id })
    ]);
    await PayrollRun.create({ companyId: company._id, periodStart: new Date('2025-04-16'), periodEnd: new Date('2025-04-29'), payDate: new Date('2025-04-30'), employeeCount: employer.employees.length, totalHours: employer.employees.length * 78, estimatedGross: decimalToMoney(multiplyMoney(4200, employer.employees.length)), totalDeductions: decimalToMoney('0'), totalNetPay: decimalToMoney('0'), status: 'draft' });
    await CompanyBulletin.create({ companyId: company._id, title: 'Payroll calendar updated', body: 'The next payroll run and document deadlines are ready for review.', postedBy: 'Payroll', postedAt: new Date('2026-09-04') });

    for (const [index, employee] of employer.employees.entries()) {
      await seedEmployee(company, employee, index + 1);
    }
  }

  await Help.findOneAndUpdate({ key: defaultHelpContent.key }, defaultHelpContent, { new: true, upsert: true });

  console.log('Seeded connected Payhours demo data.');
  console.log('Super admin: superadmin@payhours.ca / Payhours1!');
  console.log('Employer: admin@abcsolutions.ca / Payhours1!');
  console.log('Employer: simran@maplefoods.ca / Payhours1!');
  console.log('Employer: rahul@spicehub.ca / Payhours1!');
  console.log('Employee: anil.suhagiya@example.com / Payhours1!  Customer ID A07998 / Employee # 0006');
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
