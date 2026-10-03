import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { User } from '../models/User';
import { encryptSin, hashPassword } from '../utils/security';

const adminProfile = {
  personal: { firstName: 'Rahul', middleName: '', lastName: 'Sharma', preferredName: 'Rahul', birthDate: '1990-05-15', gender: 'Male', maritalStatus: 'Single', languagePreference: 'English', sin: '123456789', sinExpiryDate: '', emailAddress: 'rahul.sharma@example.com', phoneNumber: '+1 587 438 3340', address: '123, Main Street', apartment: 'Unit 4', city: 'Calgary', province: 'Alberta', postalCode: 'T2A 1B3' },
  employment: { employmentStatus: 'Active', employmentType: 'Full-Time', hireDate: '2025-04-15', originalHireDate: '2025-04-15', jobTitle: 'Restaurant Manager', department: 'Operations', location: 'Calgary - Main Branch', manager: 'Amit Patel', provinceOfEmployment: 'Alberta', standardWeeklyHours: '40', standardDailyHours: '8', workSchedule: 'Day Shift (9 AM - 5 PM)', expectedEndDate: '', probationPeriodMonths: '3', unionMember: 'No', employeeGroup: 'Management', employeeNumber: 'E011', costCentre: '' },
  compensation: { payType: 'Hourly', hourlyRate: '22.50', standardHoursPerWeek: '40', standardHoursPerDay: '8', overtimeEligible: 'Yes', overtimeAfter: '44', overtimeRateMultiplier: '1.5x', payFrequency: 'Biweekly', nextPayDate: '2025-04-30' },
  tax: { provinceOfResidence: 'Alberta', cityRegion: 'Calgary', residencyStatus: 'Resident of Canada', sin: '123456789', sinExpiryDate: '', craTd1Form: 'Completed', claimPersonalAmount: 'Yes (Standard)', additionalTaxToDeduct: '0.00', cppExempt: 'No', eiExempt: 'No' },
  vacation: { vacationPolicy: 'Accrue by Percentage (4%)', vacationAccrualRate: '4.00', accrualFrequency: 'Biweekly', vacationStartDate: '2025-04-15', carryForwardUnusedVacation: 'As per provincial rules', vacationPayoutOnTermination: 'As per provincial rules', province: 'Alberta', sickLeave: '5 days per year', personalLeave: '3 days per year' },
  benefits: { extendedHealthCare: 'Single', dentalCare: 'Single', groupLifeInsurance: '$50,000', accidentalDeath: 'Not Enrolled', employeeAssistance: 'Included', rrspContribution: '5%', unionDues: '$25.00 (Fixed)', healthSpendingAccount: 'Not Enrolled', parking: 'Not Enrolled', benefitsEnrollmentDate: '2025-04-15', deductionsStartDate: '2025-04-15' },
  banking: { directDeposit: 'Enabled', bankInstitution: 'Royal Bank of Canada (RBC)', transitNumber: '003', institutionNumber: '000', accountNumber: '1234567', accountType: 'Chequing', accountNickname: 'Primary Account' }
};

async function run() {
  configureDns();
  await mongoose.connect(env.mongoUri);
  const company = await Company.findOneAndUpdate(
    { customerId: 'A07998' },
    { legalName: 'ABC Solutions Inc.', operatingName: 'ABC Solutions Inc.', customerId: 'A07998', address: { street: '123 Main Street', city: 'Calgary', province: 'AB', postalCode: 'T2A1B3' } },
    { new: true, upsert: true }
  );
  const user = await User.findOneAndUpdate(
    { email: adminProfile.personal.emailAddress },
    { email: adminProfile.personal.emailAddress, passwordHash: await hashPassword('Payhours1!'), mustChangePassword: false, isActive: true },
    { new: true, upsert: true }
  );
  const employee = await Employee.findOneAndUpdate(
    { companyId: company._id, employeeNumber: adminProfile.employment.employeeNumber },
    {
      userId: user._id,
      companyId: company._id,
      employeeNumber: adminProfile.employment.employeeNumber,
      legalFirstName: adminProfile.personal.firstName,
      middleName: adminProfile.personal.middleName,
      legalLastName: adminProfile.personal.lastName,
      preferredFirstName: adminProfile.personal.preferredName,
      sinEncrypted: encryptSin(adminProfile.personal.sin),
      birthDate: new Date(adminProfile.personal.birthDate),
      addresses: [{ street: adminProfile.personal.address, city: adminProfile.personal.city, province: adminProfile.personal.province, postalCode: adminProfile.personal.postalCode }],
      phones: [{ type: 'Mobile', number: adminProfile.personal.phoneNumber }],
      personalEmail: adminProfile.personal.emailAddress,
      notificationEmailPreference: 'personal',
      emergencyContacts: [],
      occupation: adminProfile.employment.jobTitle,
      startDate: new Date(adminProfile.employment.hireDate),
      seniorityDate: new Date(adminProfile.employment.originalHireDate),
      primaryEarningCode: adminProfile.compensation.payType,
      payGroup: adminProfile.compensation.payFrequency,
      taxProvince: adminProfile.tax.provinceOfResidence,
      payStatementPreference: { emailStatement: true, language: 'English' },
      adminProfile
    },
    { new: true, upsert: true }
  );
  user.lastSelectedEmployeeId = employee._id;
  await user.save();
  await EmployerUser.findOneAndUpdate(
    { email: 'admin@abcsolutions.ca' },
    { companyId: company._id, name: 'Admin User', email: 'admin@abcsolutions.ca', passwordHash: await hashPassword('Payhours1!'), role: 'Company Owner', isActive: true },
    { new: true, upsert: true }
  );
  console.log('Upserted admin employee profile without deleting existing payroll data.');
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
