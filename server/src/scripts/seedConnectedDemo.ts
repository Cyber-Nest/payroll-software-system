import mongoose from 'mongoose';
import { env } from '../config/env';
import { configureDns } from '../config/dns';
import { AuditLog } from '../models/AuditLog';
import { Company } from '../models/Company';
import { CompanyBulletin } from '../models/CompanyBulletin';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { PayStatement } from '../models/PayStatement';
import { PayrollRun } from '../models/PayrollRun';
import { SuperAdmin } from '../models/SuperAdmin';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { User } from '../models/User';
import { decimalToMoney } from '../utils/money';
import { encryptSin, hashPassword } from '../utils/security';

const password = 'Payhours1!';

const companies = [
  {
    customerId: 'ABC001',
    legalName: 'ABC Solutions Inc.',
    operatingName: 'ABC Solutions',
    city: 'Calgary',
    province: 'AB',
    employees: [
      ['E1001', 'Rahul', 'Sharma', 'Payroll Specialist', 'rahul.sharma@abcsolutions.ca', '32.50'],
      ['E1002', 'Simran', 'Kaur', 'HR Coordinator', 'simran.kaur@abcsolutions.ca', '29.75'],
      ['E1003', 'Anil', 'Suhagiya', 'Operations Lead', 'anil.suhagiya@abcsolutions.ca', '34.25'],
      ['E1004', 'Priya', 'Patel', 'Accountant', 'priya.patel@abcsolutions.ca', '31.00']
    ]
  },
  {
    customerId: 'MAP002',
    legalName: 'Maple Foods Ltd.',
    operatingName: 'Maple Foods',
    city: 'Toronto',
    province: 'ON',
    employees: [
      ['M2001', 'Harpreet', 'Singh', 'Restaurant Manager', 'harpreet.singh@maplefoods.ca', '28.50'],
      ['M2002', 'Maninder', 'Kaur', 'Shift Supervisor', 'maninder.kaur@maplefoods.ca', '24.75'],
      ['M2003', 'Riya', 'Kapoor', 'Team Member', 'riya.kapoor@maplefoods.ca', '19.25']
    ]
  },
  {
    customerId: 'SPH003',
    legalName: 'Spice Hub Restaurants Inc.',
    operatingName: 'Spice Hub',
    city: 'Vancouver',
    province: 'BC',
    employees: [
      ['S3001', 'Aman', 'Sharma', 'Store Manager', 'aman.sharma@spicehub.ca', '30.00'],
      ['S3002', 'Nikita', 'Patel', 'Kitchen Lead', 'nikita.patel@spicehub.ca', '25.50'],
      ['S3003', 'Krisha', 'Kapoor', 'Service Lead', 'krisha.kapoor@spicehub.ca', '23.25'],
      ['S3004', 'Jaspreet', 'Dhanjal', 'Team Member', 'jaspreet.dhanjal@spicehub.ca', '20.00']
    ]
  }
] as const;

function money(value: string | number) {
  return decimalToMoney(value);
}

async function seedConnectedDemo() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  const superAdmin = await SuperAdmin.findOneAndUpdate(
    { email: 'superadmin@payhours.ca' },
    { name: 'Super Admin', email: 'superadmin@payhours.ca', passwordHash: await hashPassword(password), isActive: true },
    { new: true, upsert: true }
  );

  const seededCompanyIds: mongoose.Types.ObjectId[] = [];
  const seededEmployeeIds: mongoose.Types.ObjectId[] = [];

  for (const companySeed of companies) {
    const company = await Company.findOneAndUpdate(
      { customerId: companySeed.customerId },
      {
        legalName: companySeed.legalName,
        operatingName: companySeed.operatingName,
        customerId: companySeed.customerId,
        businessNumber: `${companySeed.customerId.replace(/\D/g, '').padEnd(9, '1')}RP0001`,
        businessType: 'Corporation',
        industry: 'Payroll Services and Hospitality',
        naicsCode: '541214',
        employeeCount: companySeed.employees.length,
        customerCarePhone:
          companySeed.province === 'ON'
            ? '(416) 555-0147'
            : companySeed.province === 'BC'
              ? '(604) 555-0147'
              : '(403) 555-0147',
        status: 'active',
        address: { street: '100 King Street W', city: companySeed.city, province: companySeed.province, postalCode: 'T2P1J9', country: 'Canada' },
        subscription: { plan: 'Professional', billingFrequency: 'Monthly', startDate: '2026-01-01' },
        features: { payroll: true, ess: true, reports: true, t4: true }
      },
      { new: true, upsert: true }
    );
    seededCompanyIds.push(company._id);

    await EmployerUser.findOneAndUpdate(
      { email: companySeed.customerId === 'ABC001' ? 'admin@abcsolutions.ca' : `owner@${companySeed.customerId.toLowerCase()}.payhours.demo` },
      {
        companyId: company._id,
        name: `${companySeed.operatingName} Owner`,
        email: companySeed.customerId === 'ABC001' ? 'admin@abcsolutions.ca' : `owner@${companySeed.customerId.toLowerCase()}.payhours.demo`,
        passwordHash: await hashPassword(password),
        role: 'Company Owner',
        isActive: true,
        mustChangePassword: false
      },
      { new: true, upsert: true }
    );

    await CompanyBulletin.deleteMany({ companyId: company._id });
    await CompanyBulletin.create([
      { companyId: company._id, title: 'Payroll calendar confirmed', body: `${companySeed.operatingName} payroll dates are ready for review.`, postedBy: 'Payhours', postedAt: new Date('2026-09-01') },
      { companyId: company._id, title: 'Tax form reminder', body: 'Employees should review TD1 and banking details before the next run.', postedBy: 'Payroll', postedAt: new Date('2026-09-05') }
    ]);

    for (const [employeeNumber, firstName, lastName, jobTitle, email, hourlyRate] of companySeed.employees) {
      const user = await User.findOneAndUpdate(
        { email },
        { email, passwordHash: await hashPassword(password), mustChangePassword: false, isActive: true, twoFactorEnabled: false },
        { new: true, upsert: true }
      );
      const employee = await Employee.findOneAndUpdate(
        { companyId: company._id, employeeNumber },
        {
          userId: user._id,
          companyId: company._id,
          employeeNumber,
          legalFirstName: firstName,
          legalLastName: lastName,
          preferredFirstName: firstName,
          sinEncrypted: encryptSin(`9${employeeNumber.replace(/\D/g, '').padStart(8, '0')}`.slice(0, 9)),
          birthDate: new Date('1990-04-15'),
          addresses: [{ street: '123 Main Street', city: companySeed.city, province: companySeed.province, postalCode: 'T2A1B3' }],
          phones: [{ type: 'Mobile', number: '(403) 555-0100' }],
          personalEmail: email,
          notificationEmailPreference: 'personal',
          emergencyContacts: [{ name: 'Emergency Contact', relationship: 'Family', phone: '(403) 555-0199' }],
          occupation: jobTitle,
          startDate: new Date('2025-01-06'),
          seniorityDate: new Date('2025-01-06'),
          primaryEarningCode: 'Hourly',
          payGroup: 'Biweekly',
          taxProvince: companySeed.province,
          personalTaxCredits: { federalClaimAmount: money('16452.00'), provincialClaimAmount: money(companySeed.province === 'AB' ? '22769.00' : '20381.00') },
          payStatementPreference: { emailStatement: true, language: 'English' },
          adminProfile: {
            personal: { firstName, lastName, emailAddress: email, phoneNumber: '(403) 555-0100', city: companySeed.city, province: companySeed.province },
            employment: { employeeNumber, jobTitle, department: 'Operations', location: companySeed.city, employmentStatus: 'Active', employmentType: 'Full-Time' },
            compensation: { payType: 'Hourly', hourlyRate, standardHoursPerWeek: '44', payFrequency: 'Biweekly' },
            tax: { provinceOfResidence: companySeed.province, craTd1Form: 'Completed' },
            vacation: { vacationPolicy: 'Accrue by Percentage (4%)' },
            benefits: { extendedHealthCare: 'Single', dentalCare: 'Single' },
            banking: { bankInstitution: 'Royal Bank of Canada (RBC)', transitNumber: '00001', institutionNumber: '003', accountNumber: '1234567' }
          }
        },
        { new: true, upsert: true }
      );
      user.lastSelectedEmployeeId = employee._id;
      await user.save();
      seededEmployeeIds.push(employee._id);

      const gross = Number(hourlyRate) * 80;
      const tax = gross * 0.18;
      const cpp = gross * 0.045;
      const ei = gross * 0.0163;
      const net = gross - tax - cpp - ei;
      await PayStatement.deleteMany({ employeeId: employee._id, companyId: company._id });
      await PayStatement.create({
        employeeId: employee._id,
        companyId: company._id,
        payDate: new Date('2026-09-11'),
        payPeriodNumber: 19,
        payPeriodYear: 2026,
        type: 'Regular',
        netPay: money(net.toFixed(2)),
        yearToDateNetPay: money((net * 19).toFixed(2)),
        grossEarnings: [
          { code: 'REG', description: 'Regular Hours', amount: money(gross.toFixed(2)) },
          { code: 'TOTAL', description: 'Total Earnings', amount: money(gross.toFixed(2)) }
        ],
        deductions: [
          { code: 'TAX', description: 'Federal/Provincial Tax', amount: money(tax.toFixed(2)) },
          { code: 'CPP', description: 'CPP', amount: money(cpp.toFixed(2)) },
          { code: 'EI', description: 'EI', amount: money(ei.toFixed(2)) },
          { code: 'TOTAL', description: 'Total Deductions', amount: money((tax + cpp + ei).toFixed(2)) }
        ],
        additionalInfo: [
          { key: 'Pay Period', value: 'Aug 29, 2026 to Sep 11, 2026' },
          { key: 'Payroll Number', value: `${companySeed.customerId}-PR-019` },
          { key: 'Deposit', value: 'Direct deposit ending 4567' }
        ],
        isUnread: true
      });
      await TaxFormDocument.findOneAndUpdate(
        { employeeId: employee._id, companyId: company._id, taxYear: 2026, formType: 'T4' },
        { employeeId: employee._id, companyId: company._id, taxYear: 2026, formType: 'T4', generatedAt: new Date('2026-09-12') },
        { upsert: true }
      );
    }

    await PayrollRun.deleteMany({ companyId: company._id });
    await PayrollRun.create({
      companyId: company._id,
      periodStart: new Date('2026-08-29'),
      periodEnd: new Date('2026-09-11'),
      payDate: new Date('2026-09-11'),
      runType: 'regular',
      employeeCount: companySeed.employees.length,
      totalHours: companySeed.employees.length * 80,
      estimatedGross: money(companySeed.employees.reduce((sum, item) => sum + Number(item[5]) * 80, 0).toFixed(2)),
      totalDeductions: money('0.00'),
      totalNetPay: money('0.00'),
      status: 'finalized',
      adjustmentRunIds: [],
      lines: [],
      statusHistory: [{ to: 'finalized', changedBy: superAdmin._id, changedAt: new Date('2026-09-11'), note: 'Connected demo seed' }]
    });
  }

  await AuditLog.deleteMany({ 'metadata.seededDemo': true });
  await AuditLog.create([
    { userId: superAdmin._id, eventType: 'EMPLOYER_CREATED', companyId: seededCompanyIds[0], metadata: { seededDemo: true, action: 'Activated ABC Solutions Inc.' } },
    { userId: superAdmin._id, eventType: 'EMPLOYER_CREATED', companyId: seededCompanyIds[1], metadata: { seededDemo: true, action: 'Activated Maple Foods Ltd.' } },
    { userId: superAdmin._id, eventType: 'EMPLOYER_CREATED', companyId: seededCompanyIds[2], metadata: { seededDemo: true, action: 'Activated Spice Hub Restaurants Inc.' } },
    { userId: superAdmin._id, eventType: 'PAYROLL_UPDATED', companyId: seededCompanyIds[0], metadata: { seededDemo: true, action: 'Reviewed employer payroll activity' } }
  ]);

  console.log('Connected demo seeded.');
  console.log('Super Admin: superadmin@payhours.ca / Payhours1!');
  console.log('Employer: admin@abcsolutions.ca / Payhours1!');
  console.log('Employee sample: rahul.sharma@abcsolutions.ca / Payhours1!');
  await mongoose.disconnect();
}

seedConnectedDemo().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
