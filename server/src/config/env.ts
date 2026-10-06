import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/payhours-payroll',
  jwtSecret: process.env.JWT_SECRET || 'local-dev-secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef',
  encryptionIv: process.env.ENCRYPTION_IV || 'abcdef0123456789',
  portalUrl: process.env.PORTAL_URL || 'http://localhost:5173',
  internalAdminToken: process.env.INTERNAL_ADMIN_TOKEN || 'local-admin-token',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailFrom: process.env.EMAIL_FROM || 'Payhours <info@cyber-nest.ca>',
  dnsServers: (process.env.DNS_SERVERS || '').split(',').map((server) => server.trim()).filter(Boolean)
};


