import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { defaultHelpContent } from '../data/helpContent';
import { Help } from '../models/Help';

async function seedHelp() {
  configureDns();
  await mongoose.connect(env.mongoUri);
  await Help.findOneAndUpdate({ key: defaultHelpContent.key }, defaultHelpContent, { new: true, upsert: true });
  console.log('Seeded Payhours help collection.');
  await mongoose.disconnect();
}

seedHelp().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
