import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { T4Format, T4FormatSelection } from '../models/T4Format';
import { defaultT4Format, t4Pdf } from '../utils/pdf';
import { t4PreviewData } from '../services/t4Format.service';
import { auditEvent } from '../utils/audit';

const router = Router();
router.use(authenticate, requirePermission('users.manage'), (req: AuthRequest, res, next) => {
  if (!req.superAdminContext) return res.status(403).json({ message: 'Super admin access required.' });
  next();
});

export const t4FormatSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(250).default(''),
  headerTitle: z.string().trim().min(1).max(32).default(defaultT4Format.headerTitle),
  accentColor: z.string().regex(/^#[a-f\d]{6}$/i).default(defaultT4Format.accentColor),
  showLogo: z.boolean().default(false).transform(() => false),
  footerText: z.string().trim().max(120).default(''),
  headerStyle: z.enum(['plain', 'band']).default('plain')
});

const serialize = (format: InstanceType<typeof T4Format>) => ({
  id: String(format._id), name: format.name, description: format.description,
  headerTitle: format.headerTitle, accentColor: format.accentColor, showLogo: false,
  footerText: format.footerText, headerStyle: format.headerStyle
});

router.get('/', async (_req, res) => {
  const [formats, selection] = await Promise.all([T4Format.find().sort({ name: 1 }), T4FormatSelection.findById('platform')]);
  res.json({
    formats: [{ id: 'standard', name: 'Standard T4', description: 'Default T4 presentation', ...defaultT4Format }, ...formats.map(serialize)],
    selectedId: formats.some((format) => String(format._id) === selection?.formatId) ? selection!.formatId : 'standard'
  });
});

router.post('/preview', async (req, res) => {
  const parsed = t4FormatSchema.omit({ name: true, description: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid T4 format settings.', issues: parsed.error.issues });
  res.type('application/pdf').setHeader('Cache-Control', 'no-store').setHeader('Content-Disposition', 'inline; filename="T4-preview.pdf"')
    .send(t4Pdf(t4PreviewData, parsed.data));
});

router.post('/', async (req: AuthRequest, res) => {
  const parsed = t4FormatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid T4 format.', issues: parsed.error.issues });
  const format = await T4Format.create(parsed.data);
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'USER_UPDATED', metadata: { module: 'T4 Formats', action: 'Created T4 format ' + format.name, formatId: String(format._id) } });
  res.status(201).json({ format: serialize(format) });
});

router.put('/:id', async (req: AuthRequest, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid format ID.' });
  const parsed = t4FormatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid T4 format.', issues: parsed.error.issues });
  const format = await T4Format.findById(req.params.id);
  if (!format) return res.status(404).json({ message: 'T4 format not found.' });
  Object.assign(format, parsed.data);
  await format.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'USER_UPDATED', metadata: { module: 'T4 Formats', action: 'Updated T4 format ' + format.name, formatId: String(format._id) } });
  res.json({ format: serialize(format) });
});

router.post('/:id/select', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  if (id !== 'standard' && (!mongoose.isValidObjectId(id) || !(await T4Format.exists({ _id: id })))) {
    return res.status(404).json({ message: 'T4 format not found.' });
  }
  await T4FormatSelection.findOneAndUpdate({ _id: 'platform' }, { $set: { formatId: id } }, { upsert: true });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'USER_UPDATED', metadata: { module: 'T4 Formats', action: 'Selected default T4 format', formatId: id } });
  res.json({ selectedId: id });
});

export default router;
