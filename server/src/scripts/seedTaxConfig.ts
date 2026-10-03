import mongoose from 'mongoose';
import { env } from '../config/env';
import { configureDns } from '../config/dns';
import { TaxConfigVersion } from '../models/TaxConfigVersion';
import { PayrollStatutoryConfig } from '../models/PayrollStatutoryConfig';
import { taxConfigSeedData } from '../data/taxConfigSeedData';
import { decimalToMoney } from '../utils/money';

async function seedTaxConfig() {
  configureDns();
  await mongoose.connect(env.mongoUri);

  for (const version of taxConfigSeedData.taxVersions as readonly any[]) {
    await TaxConfigVersion.findOneAndUpdate(
      { jurisdiction: version.jurisdiction, sourceYear: 2026, status: 'published' },
      {
        ...version,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        sourceYear: 2026,
        source: 'tax-reference/2026.md',
        status: 'published',
        publishedAt: new Date(),
        basicPersonalAmount: decimalToMoney(version.basicPersonalAmount),
        basicPersonalAmountMax: version.basicPersonalAmountMax ? decimalToMoney(version.basicPersonalAmountMax) : undefined,
        basicPersonalAmountPhaseOutStart: version.basicPersonalAmountPhaseOutStart ? decimalToMoney(version.basicPersonalAmountPhaseOutStart) : undefined,
        basicPersonalAmountPhaseOutEnd: version.basicPersonalAmountPhaseOutEnd ? decimalToMoney(version.basicPersonalAmountPhaseOutEnd) : undefined,
        canadaEmploymentAmount: version.canadaEmploymentAmount ? decimalToMoney(version.canadaEmploymentAmount) : undefined,
        supplementalCreditThreshold: version.supplementalCreditThreshold ? decimalToMoney(version.supplementalCreditThreshold) : undefined,
        supplementalCreditRate: version.supplementalCreditRate ? decimalToMoney(version.supplementalCreditRate) : undefined,
        bpaClawbackStart: version.bpaClawbackStart ? decimalToMoney(version.bpaClawbackStart) : undefined,
        bpaClawbackEnd: version.bpaClawbackEnd ? decimalToMoney(version.bpaClawbackEnd) : undefined,
        brackets: version.brackets.map((bracket: { threshold: string; rate: string; constant: string }) => ({
          threshold: decimalToMoney(bracket.threshold),
          rate: decimalToMoney(bracket.rate),
          constant: decimalToMoney(bracket.constant)
        }))
      },
      { upsert: true, new: true }
    );
  }

  const statutory = taxConfigSeedData.statutory;
  await PayrollStatutoryConfig.findOneAndUpdate(
    { sourceYear: 2026, status: 'published' },
    {
      ...statutory,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31'),
      sourceYear: 2026,
      source: 'tax-reference/2026.md',
      status: 'published',
      publishedAt: new Date(),
      cpp: {
        ympe: decimalToMoney(statutory.cpp.ympe),
        basicExemption: decimalToMoney(statutory.cpp.basicExemption),
        rate: decimalToMoney(statutory.cpp.rate),
        maxContribution: decimalToMoney(statutory.cpp.maxContribution)
      },
      cpp2: {
        yampe: decimalToMoney(statutory.cpp2.yampe),
        rate: decimalToMoney(statutory.cpp2.rate),
        maxContribution: decimalToMoney(statutory.cpp2.maxContribution)
      },
      ei: {
        maxInsurableEarnings: decimalToMoney(statutory.ei.maxInsurableEarnings),
        employeeRate: decimalToMoney(statutory.ei.employeeRate),
        employerRate: decimalToMoney(statutory.ei.employerRate),
        maxPremium: decimalToMoney(statutory.ei.maxPremium)
      }
    },
    { upsert: true, new: true }
  );

  console.log('Seeded 2026 published tax configuration versions.');
  await mongoose.disconnect();
}

seedTaxConfig().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
