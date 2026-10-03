import { Router } from 'express';
import { defaultHelpContent } from '../data/helpContent';
import { Help } from '../models/Help';

const router = Router();

router.get('/help', async (_req, res) => {
  const help = await Help.findOneAndUpdate(
    { key: defaultHelpContent.key },
    { $setOnInsert: defaultHelpContent },
    { new: true, upsert: true }
  ).lean();
  res.json(help);
});

export default router;
