import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import employeeRoutes from './routes/employee';
import employerRoutes from './routes/employer';
import superAdminRoutes from './routes/superAdmin';
import internalRoutes from './routes/internal';
import helpRoutes from './routes/help';
import { env } from './config/env';

const app = express();

app.set('trust proxy', true);

app.use(
  cors({
    origin: [
      env.clientUrl,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5174',
      'http://localhost:5174',
      'http://127.0.0.1:4173',
      'http://localhost:4173'
    ],
    credentials: true
  })
);
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));

app.use('/api', healthRoutes);
app.use('/api', helpRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/employer', employerRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/payhours-admin', superAdminRoutes);
app.use('/api/internal', internalRoutes);

app.get('/', (_req, res) => {
  res.json({ name: 'Payhours Payroll API', status: 'ok' });
});

export default app;

