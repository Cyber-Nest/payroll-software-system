import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employee';
import internalRoutes from './routes/internal';
import { env } from './config/env';

const app = express();

app.use(
  cors({
    origin: env.clientUrl,
    credentials: true
  })
);
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/internal', internalRoutes);

app.get('/', (_req, res) => {
  res.json({ name: 'Payhours Payroll API', status: 'ok' });
});

export default app;
