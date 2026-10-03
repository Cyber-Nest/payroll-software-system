import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { EmployerUser } from '../models/EmployerUser';
import { hashPassword } from '../utils/security';

const password = 'Payhours1!';

const employerLogins = [
  {
    customerId: 'A07998',
    legalName: 'Gayatri Holding Medicine Hat A Inc',
    operatingName: 'Gayatri Pharmacy',
    adminName: 'Admin User',
    email: 'admin@abcsolutions.ca',
    address: { street: '1277 Trans Canada Way SE', city: 'Medicine Hat', province: 'AB', postalCode: 'T1B1H9', country: 'Canada' }
  },
  {
    customerId: 'MF1020',
    legalName: 'Maple Foods Inc.',
    operatingName: 'Maple Foods',
    adminName: 'Simran Kaur',
    email: 'simran@maplefoods.ca',
    address: { street: '488 Granville Street', city: 'Vancouver', province: 'BC', postalCode: 'V6C1V4', country: 'Canada' }
  },
  {
    customerId: 'SP2040',
    legalName: 'Spice Hub Restaurant Ltd.',
    operatingName: 'Spice Hub',
    adminName: 'Rahul Desai',
    email: 'rahul@spicehub.ca',
    address: { street: '91 17 Avenue SW', city: 'Calgary', province: 'AB', postalCode: 'T2S0A1', country: 'Canada' }
  },
  {
    customerId: 'TB3060',
    legalName: 'Tasty Bites Inc.',
    operatingName: 'Tasty Bites',
    adminName: 'Linda Chen',
    email: 'linda@tastybites.ca',
    address: { street: '220 Queen Street W', city: 'Toronto', province: 'ON', postalCode: 'M5V1Z4', country: 'Canada' }
  }
] as const;

async function ensureEmployerLogins() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  for (const employer of employerLogins) {
    const company = await Company.findOneAndUpdate(
      { customerId: employer.customerId },
      {
        $setOnInsert: {
          legalName: employer.legalName,
          operatingName: employer.operatingName,
          customerId: employer.customerId,
          address: employer.address,
          status: 'active'
        }
      },
      { new: true, upsert: true }
    );

    await EmployerUser.findOneAndUpdate(
      { email: employer.email },
      {
        $set: {
          companyId: company._id,
          companyIds: [company._id],
          lastSelectedCompanyId: company._id,
          name: employer.adminName,
          email: employer.email,
          passwordHash: await hashPassword(password),
          role: 'Company Owner',
          isActive: true,
          mustChangePassword: false
        }
      },
      { new: true, upsert: true }
    );

    console.log(`Employer login ready: ${employer.email} / ${password}`);
  }

  await mongoose.disconnect();
}

ensureEmployerLogins().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
