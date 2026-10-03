import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { User } from '../models/User';
import { hashPassword } from '../utils/security';

const password = 'Payhours1!';

const companyEmployees = [
  {
    customerId: 'A07998',
    province: 'AB',
    city: 'Medicine Hat',
    employees: [
      { employeeNumber: '0006', firstName: 'Anilkumar', lastName: 'Suhagiya', email: 'anil.suhagiya@example.com', occupation: 'Pharmacy Assistant', hourlyRate: '22.00' },
      { employeeNumber: '0007', firstName: 'Harpreet', lastName: 'Singh', email: 'harpreet.singh@example.com', occupation: 'Store Manager', hourlyRate: '28.00' }
    ]
  },
  {
    customerId: 'MF1020',
    province: 'BC',
    city: 'Vancouver',
    employees: [
      { employeeNumber: 'MF-001', firstName: 'Amanpreet', lastName: 'Gill', email: 'amanpreet.gill@maplefoods.ca', occupation: 'Shift Lead', hourlyRate: '25.00' },
      { employeeNumber: 'MF-002', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@maplefoods.ca', occupation: 'Kitchen Staff', hourlyRate: '21.00' }
    ]
  },
  {
    customerId: 'SP2040',
    province: 'AB',
    city: 'Calgary',
    employees: [
      { employeeNumber: 'SP-001', firstName: 'Priya', lastName: 'Verma', email: 'priya.verma@spicehub.ca', occupation: 'Server', hourlyRate: '19.00' },
      { employeeNumber: 'SP-002', firstName: 'Dev', lastName: 'Patel', email: 'dev.patel@spicehub.ca', occupation: 'Cook', hourlyRate: '24.00' }
    ]
  },
  {
    customerId: 'TB3060',
    province: 'ON',
    city: 'Toronto',
    employees: [
      { employeeNumber: 'TB-001', firstName: 'Pooja', lastName: 'Mehta', email: 'pooja.mehta@tastybites.ca', occupation: 'Restaurant Supervisor', hourlyRate: '26.00' },
      { employeeNumber: 'TB-002', firstName: 'David', lastName: 'Kim', email: 'david.kim@tastybites.ca', occupation: 'Kitchen Lead', hourlyRate: '24.00' }
    ]
  }
] as const;

async function ensureEmployeeLogins() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  for (const companySeed of companyEmployees) {
    const company = await Company.findOne({ customerId: companySeed.customerId });
    if (!company) throw new Error(`Company ${companySeed.customerId} is missing. Run seed:employer first.`);

    for (const employeeSeed of companySeed.employees) {
      const user = await User.findOneAndUpdate(
        { email: employeeSeed.email },
        {
          $set: {
            email: employeeSeed.email,
            passwordHash: await hashPassword(password),
            mustChangePassword: false,
            isActive: true,
            twoFactorEnabled: false
          }
        },
        { new: true, upsert: true }
      );

      const employee = await Employee.findOneAndUpdate(
        { companyId: company._id, employeeNumber: employeeSeed.employeeNumber },
        {
          $set: {
            userId: user._id,
            legalFirstName: employeeSeed.firstName,
            legalLastName: employeeSeed.lastName,
            preferredFirstName: employeeSeed.firstName,
            personalEmail: employeeSeed.email,
            notificationEmailPreference: 'personal',
            occupation: employeeSeed.occupation,
            primaryEarningCode: 'Regular Pay',
            payGroup: 'Biweekly',
            taxProvince: companySeed.province,
            payStatementPreference: { emailStatement: true, language: 'English' },
            adminProfile: {
              personal: { firstName: employeeSeed.firstName, lastName: employeeSeed.lastName, emailAddress: employeeSeed.email, city: companySeed.city, province: companySeed.province },
              employment: { employeeNumber: employeeSeed.employeeNumber, employmentStatus: 'Active', employmentType: 'Full-Time', jobTitle: employeeSeed.occupation, department: 'Operations', location: companySeed.city },
              compensation: { payType: 'Hourly', hourlyRate: employeeSeed.hourlyRate, payFrequency: 'Biweekly' }
            }
          },
          $setOnInsert: {
            companyId: company._id,
            employeeNumber: employeeSeed.employeeNumber,
            addresses: [],
            phones: [],
            emergencyContacts: []
          }
        },
        { new: true, upsert: true }
      );

      user.lastSelectedEmployeeId = employee._id as mongoose.Types.ObjectId;
      await user.save();
      console.log(`Employee login ready: ${companySeed.customerId} / ${employeeSeed.employeeNumber} / ${employeeSeed.email} / ${password}`);
    }
  }

  await mongoose.disconnect();
}

ensureEmployeeLogins().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
