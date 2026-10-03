import mongoose from 'mongoose';
import app from './app';
import { env } from './config/env';
import { configureDns } from './config/dns';

const startServer = async (): Promise<void> => {
  try {
    configureDns();
    await mongoose.connect(env.mongoUri, { family: 4, serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');

    app.listen(env.port, () => {
      console.log(`Server running on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();


