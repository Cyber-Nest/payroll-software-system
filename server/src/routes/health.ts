import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
