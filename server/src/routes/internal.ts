import { Router } from 'express';
import { env } from '../config/env';
import { sendWelcomeEmail } from '../services/welcome.service';

const router = Router();

router.post('/employees/:id/send-welcome-email', async (req, res) => {
  if (req.headers['x-admin-token'] !== env.internalAdminToken) return res.status(403).json({ message: 'Forbidden' });
  const result = await sendWelcomeEmail(req.params.id);
  res.json({ message: 'Welcome email queued', temporaryPassword: result.temporaryPassword });
});

export default router;
