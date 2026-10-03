import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';

async function ping() {
  configureDns();
  await mongoose.connect(env.mongoUri, { family: 4, serverSelectionTimeoutMS: 10000 });
  const result = await mongoose.connection.db?.admin().ping();
  console.log(`MongoDB ping: ${JSON.stringify(result)}`);
  await mongoose.disconnect();
}

ping().catch(async (error) => {
  console.error(error);
  const servers = error?.reason?.servers;
  if (servers instanceof Map) {
    for (const [host, description] of servers) {
      console.error(`${host}:`, description?.error || 'No server error details');
    }
  }
  await mongoose.disconnect();
  process.exit(1);
});
