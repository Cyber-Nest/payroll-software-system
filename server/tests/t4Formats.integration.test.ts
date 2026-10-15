import express from 'express';
import http from 'http';
import routes from '../src/routes/t4Formats';
import { AccessRole } from '../src/models/AccessRole';
import { SuperAdmin } from '../src/models/SuperAdmin';
import { EmployerUser } from '../src/models/EmployerUser';
import { T4Format, T4FormatSelection } from '../src/models/T4Format';
import { AuditLog } from '../src/models/AuditLog';
import { signEmployerToken, signSuperAdminToken } from '../src/middleware/auth';
import { defaultT4Format, t4Pdf, t4sPdf } from '../src/utils/pdf';
import { selectedT4Format, t4PreviewData } from '../src/services/t4Format.service';

const adminId = '64b7f8f8f8f8f8f8f8f8f8f5';
const formatId = '64b7f8f8f8f8f8f8f8f8f8f6';
const format = { ...defaultT4Format, name: 'Blue T4', description: 'Custom format', headerTitle: 'CUSTOM T4', footerText: 'Contact payroll for questions.', headerStyle: 'band' as const, accentColor: '#224488' };

describe('T4 format management and rendering', () => {
  let server: http.Server;
  let base: string;
  beforeAll((done) => {
    const app = express();
    app.use(express.json()); app.use('/formats', routes);
    server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test address');
      base = `http://127.0.0.1:${address.port}/formats`; done();
    });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(SuperAdmin, 'findOne').mockResolvedValue({ _id: adminId, isActive: true } as never);
    jest.spyOn(EmployerUser, 'findOne').mockResolvedValue({ _id: adminId, isActive: true, role: 'Company Owner' } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
    jest.spyOn(T4FormatSelection, 'findById').mockResolvedValue(null);
  });
  const request = (path: string, body?: unknown, method = 'POST', token = signSuperAdminToken(adminId)) => fetch(base + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
  });

  it('lists saved formats with the selected default', async () => {
    jest.spyOn(T4Format, 'find').mockReturnValue({ sort: jest.fn().mockResolvedValue([{ ...format, _id: formatId }]) } as never);
    jest.spyOn(T4FormatSelection, 'findById').mockResolvedValue({ formatId } as never);
    const response = await request('', undefined, 'GET');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.selectedId).toBe(formatId);
    expect(body.formats.map((item: any) => item.id)).toEqual(['standard', formatId]);
  });

  it('creates and edits reusable formats', async () => {
    const create = jest.spyOn(T4Format, 'create').mockResolvedValue({ ...format, _id: formatId } as never);
    expect((await request('', format)).status).toBe(201);
    expect(create).toHaveBeenCalledWith(format);
    const save = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(T4Format, 'findById').mockResolvedValue({ ...format, _id: formatId, save } as never);
    const response = await request('/' + formatId, { ...format, headerTitle: 'UPDATED T4' }, 'PUT');
    expect(response.status).toBe(200);
    expect((await response.json() as any).format.headerTitle).toBe('UPDATED T4');
    expect(save).toHaveBeenCalled();
  });

  it('previews unsaved changes with the production renderer and never persists them', async () => {
    const create = jest.spyOn(T4Format, 'create');
    const response = await request('/preview', format);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(t4Pdf(t4PreviewData, format));
    expect(create).not.toHaveBeenCalled();
  });

  it('validates fields and prevents employer access', async () => {
    expect((await request('', { ...format, accentColor: 'red' })).status).toBe(400);
    expect((await request('/preview', { ...format, headerTitle: 'X'.repeat(33) })).status).toBe(400);
    expect((await request('/preview', format, 'POST', signEmployerToken(adminId, formatId))).status).toBe(403);
  });

  it('selects an existing format atomically and can restore the standard format', async () => {
    jest.spyOn(T4Format, 'exists').mockResolvedValue({ _id: formatId } as never);
    const update = jest.spyOn(T4FormatSelection, 'findOneAndUpdate').mockResolvedValue({ formatId } as never);
    expect((await request('/' + formatId + '/select')).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: 'platform' }, { $set: { formatId } }, { upsert: true });
    expect((await request('/standard/select')).status).toBe(200);
    expect((await request('/invalid/select')).status).toBe(404);
  });

  it('uses employer overrides, then the platform selection, then the built-in default', async () => {
    const find = jest.spyOn(T4Format, 'findById').mockResolvedValue(format as never);
    expect(await selectedT4Format({ governmentFilings: { yearEnd: { t4Format: formatId } } })).toEqual(format);
    expect(find).toHaveBeenCalledWith(formatId);
    expect(await selectedT4Format({ governmentFilings: { yearEnd: { t4Format: 'standard' } } })).toEqual(defaultT4Format);
    jest.spyOn(T4FormatSelection, 'findById').mockResolvedValue({ formatId } as never);
    expect(await selectedT4Format()).toEqual(format);
    find.mockResolvedValue(null);
    expect(await selectedT4Format()).toEqual(defaultT4Format);
  });

  it('preserves employee data and applies custom settings to every page', () => {
    const pdf = t4sPdf([t4PreviewData, { ...t4PreviewData, firstName: 'SECOND' }], format).toString('latin1');
    expect((pdf.match(/CUSTOM T4/g) || []).length).toBe(2);
    expect((pdf.match(/Contact payroll for questions/g) || []).length).toBe(2);
    expect(pdf).toContain('65,000.00'); expect(pdf).toContain('SECOND');
    const noLogo = t4Pdf(t4PreviewData, { ...format, showLogo: false }).toString('latin1');
    expect(noLogo).not.toContain('(Payhours)');
  });
});
