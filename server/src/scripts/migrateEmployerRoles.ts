import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { EmployerUser } from '../models/EmployerUser';

async function migrateEmployerRoles() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  const before = await EmployerUser.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$role', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  const result = await Promise.all([
    EmployerUser.updateMany({ role: 'admin' } as never, { $set: { role: 'Company Owner' } }),
    EmployerUser.updateMany({ role: 'payroll_manager' } as never, { $set: { role: 'Payroll Administrator' } })
  ]);

  const after = await EmployerUser.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$role', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log('Before role distribution:', before);
  console.log(`Employer roles migrated. admin -> Company Owner: ${result[0].modifiedCount}, payroll_manager -> Payroll Administrator: ${result[1].modifiedCount}`);
  console.log('After role distribution:', after);
  await mongoose.disconnect();
}

migrateEmployerRoles().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
