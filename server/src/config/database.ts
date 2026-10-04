import mongoose from 'mongoose';
import { env } from './env';
import { configureDns } from './dns';

let connectionPromise: Promise<typeof mongoose> | null = null;

mongoose.set('bufferCommands', false);

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    configureDns();
    connectionPromise = mongoose
      .connect(env.mongoUri, {
        family: 4,
        serverSelectionTimeoutMS: 10000
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}
