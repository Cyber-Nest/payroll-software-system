import { T4Format, T4FormatSelection } from '../models/T4Format';
import { defaultT4Format, T4FormatOptions } from '../utils/pdf';
import mongoose from 'mongoose';

export async function selectedT4Format(settings?: Record<string, unknown>): Promise<T4FormatOptions> {
  const governmentFilings = settings?.governmentFilings as { yearEnd?: { t4Format?: string } } | undefined;
  const override = governmentFilings?.yearEnd?.t4Format;
  if (override === 'standard') return defaultT4Format;
  if (override && mongoose.isValidObjectId(override)) {
    const format = await T4Format.findById(override);
    if (format) return format;
  }
  const selection = await T4FormatSelection.findById('platform');
  if (!selection || selection.formatId === 'standard') return defaultT4Format;
  const format = await T4Format.findById(selection.formatId);
  return format || defaultT4Format;
}

export const t4PreviewData = {
  employerName: 'Sample Employer Ltd.', employerAddress: ['100 Example Street', 'Calgary, AB T2P 1J9'],
  year: 2025, sin: '000 000 000', lastName: 'SAMPLE', firstName: 'JANE', initial: 'A',
  address: ['200 Sample Avenue', 'Calgary, AB', 'T2P 2K1'], province: 'AB',
  employmentIncome: '65,000.00', incomeTax: '10,250.00', cppContributions: '3,659.25', eiPremiums: '1,066.00'
};
