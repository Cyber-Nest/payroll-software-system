import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';

const numbersByCustomerId: Record<string, string> = {
  A07998: '(403) 555-0147',
  ABC001: '(403) 555-0147',
  MF1020: '(604) 555-0147',
  MAP002: '(416) 555-0147',
  SP2040: '(403) 555-0188',
  SPH003: '(604) 555-0188'
};

async function seedCustomerCare() {
  configureDns();
  await mongoose.connect(env.mongoUri, { family: 4, serverSelectionTimeoutMS: 10000 });
  for (const [customerId, customerCarePhone] of Object.entries(numbersByCustomerId)) {
    await Company.updateOne({ customerId }, { $set: { customerCarePhone } });
  }
  await Company.updateMany(
    { $or: [{ customerCarePhone: { $exists: false } }, { customerCarePhone: '' }] },
    { $set: { customerCarePhone: '(403) 555-0147' } }
  );
  console.log('Seeded employer customer-care phone numbers.');
  await mongoose.disconnect();
}

seedCustomerCare().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
