import mongoose from 'mongoose';
import { env } from '../config/env';
import { SuperAdmin } from '../models/SuperAdmin';
import { hashPassword } from '../utils/security';

async function run() {
  await mongoose.connect(env.mongoUri);
  await SuperAdmin.findOneAndUpdate(
    { email: 'superadmin@payhours.ca' },
    {
      name: 'Super Admin',
      email: 'superadmin@payhours.ca',
      passwordHash: await hashPassword('Payhours1!'),
      isActive: true
    },
    { upsert: true, new: true }
  );
  console.log('Super admin login ready: superadmin@payhours.ca / Payhours1!');
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
