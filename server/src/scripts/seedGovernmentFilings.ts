import mongoose from 'mongoose';
import { configureDns } from '../config/dns';
import { env } from '../config/env';
import { Company } from '../models/Company';
import { EmployerUser } from '../models/EmployerUser';
import { GovernmentFiling, GovernmentFilingStatus, GovernmentFilingType } from '../models/GovernmentFiling';
import { decimalToMoney } from '../utils/money';

type SampleFiling = {
  filingKey: string;
  type: GovernmentFilingType;
  title: string;
  year: number;
  period: string;
  dueDate: Date;
  status: GovernmentFilingStatus;
  amount: string;
  reference?: string;
  confirmationNumber?: string;
  filedAt?: Date;
};

const year = new Date().getUTCFullYear();
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sampleFilings(): SampleFiling[] {
  const monthly: SampleFiling[] = monthNames.map((month, index) => {
    const dueDate = new Date(Date.UTC(year, index + 1, 15));
    const filed = index < 8;
    return {
      filingKey: `SAMPLE:CRA_REMITTANCE:${year}-${String(index + 1).padStart(2, '0')}`,
      type: 'CRA_REMITTANCE',
      title: 'CRA Remittance (Wages, CPP, EI, Income Tax)',
      year,
      period: `${month} ${year}`,
      dueDate,
      status: filed ? 'filed' : index === 8 ? 'prepared' : 'pending',
      amount: (8600 + index * 317.45).toFixed(2),
      reference: filed ? `RMT-${year}-${String(index + 1).padStart(2, '0')}` : undefined,
      confirmationNumber: filed ? `CRA${year}${String(index + 1).padStart(2, '0')}20102` : undefined,
      filedAt: filed ? new Date(Date.UTC(year, index + 1, 12)) : undefined
    };
  });
  const pd7a: SampleFiling[] = [1, 2, 3, 4].map((quarter) => {
    const dueDate = new Date(Date.UTC(year, quarter * 3, 15));
    const filed = quarter <= 2;
    return {
      filingKey: `SAMPLE:PD7A:${year}-Q${quarter}`,
      type: 'PD7A',
      title: 'PD7A - Statement of Account',
      year,
      period: `Q${quarter} ${year}`,
      dueDate,
      status: filed ? 'filed' : quarter === 3 ? 'prepared' : 'pending',
      amount: (26750 + quarter * 1425.25).toFixed(2),
      reference: filed ? `PD7A-${year}-Q${quarter}` : undefined,
      confirmationNumber: filed ? `PD7A${year}${quarter}8801` : undefined,
      filedAt: filed ? new Date(dueDate.getTime() - 2 * 24 * 60 * 60 * 1000) : undefined
    };
  });
  const annual: SampleFiling[] = [
    { filingKey: `SAMPLE:T4_SLIPS:${year}`, type: 'T4_SLIPS', title: 'T4 Slips - Employee', year, period: String(year), dueDate: new Date(Date.UTC(year + 1, 2, 0)), status: 'pending', amount: '0.00' },
    { filingKey: `SAMPLE:T4_SUMMARY:${year}`, type: 'T4_SUMMARY', title: 'T4 Summary', year, period: String(year), dueDate: new Date(Date.UTC(year + 1, 2, 0)), status: 'pending', amount: '0.00' }
  ] as SampleFiling[];
  const roe: SampleFiling[] = Array.from({ length: 6 }, (_, index) => {
    const dueDate = new Date(Date.UTC(year, index + 2, 10));
    return {
      filingKey: `SAMPLE:ROE:${year}-${index + 1}`,
      type: 'ROE',
      title: 'ROE Filing',
      year,
      period: `${monthNames[index + 1]} ${year}`,
      dueDate,
      status: 'filed',
      amount: '0.00',
      reference: `ROE-${year}-${String(index + 1).padStart(2, '0')}`,
      confirmationNumber: `ROE${year}${String(index + 1).padStart(2, '0')}55`,
      filedAt: new Date(dueDate.getTime() - 2 * 24 * 60 * 60 * 1000)
    };
  });
  return [...monthly, ...pd7a, ...annual, ...roe];
}

async function seedGovernmentFilings(): Promise<void> {
  configureDns();
  await mongoose.connect(env.mongoUri, { family: 4, serverSelectionTimeoutMS: 15000 });
  const companies = await Company.find({ status: { $ne: 'suspended' } }).select('_id legalName');
  if (!companies.length) throw new Error('No companies found. Run the employer seed first.');
  const samples = sampleFilings();
  for (const company of companies) {
    const submitter = await EmployerUser.findOne({ companyIds: company._id, isActive: true }).select('_id');
    await GovernmentFiling.bulkWrite(samples.map((sample) => ({
      updateOne: {
        filter: { companyId: company._id, filingKey: sample.filingKey },
        update: {
          $set: {
            ...sample,
            amount: decimalToMoney(sample.amount),
            submittedBy: sample.status === 'filed' ? submitter?._id : undefined,
            preparedAt: sample.status === 'prepared' ? new Date() : undefined,
            documents: [
              { name: `${sample.type.toLowerCase()}-${sample.period.replace(/\s+/g, '-').toLowerCase()}.csv`, kind: 'data' },
              { name: `${sample.type.toLowerCase()}-confirmation.txt`, kind: 'confirmation' },
              { name: `${sample.type.toLowerCase()}-summary.csv`, kind: 'summary' }
            ]
          }
        },
        upsert: true
      }
    })));
    console.log(`Government filings ready: ${company.legalName} (${samples.length} records)`);
  }
  await mongoose.disconnect();
}

seedGovernmentFilings().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
