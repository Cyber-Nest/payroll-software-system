import Decimal from 'decimal.js';
import { taxConfigSeedData } from '../data/taxConfigSeedData';
import { moneyToDecimal } from '../utils/money';
import { ITaxConfigVersion, TaxJurisdiction } from '../models/TaxConfigVersion';
import { IPayrollStatutoryConfig } from '../models/PayrollStatutoryConfig';

type Decimalish = Decimal | string | number | { toString(): string };

export type TaxEngineInput = {
  grossPay: Decimalish;
  province: Exclude<TaxJurisdiction, 'FEDERAL'>;
  payPeriods: number;
  rrspPerPeriod?: Decimalish;
  federalClaimAmount?: Decimalish;
  provincialClaimAmount?: Decimalish;
  ytdPensionableEarnings?: Decimalish;
  ytdCppContributions?: Decimalish;
  ytdCpp2Contributions?: Decimalish;
  ytdEiPremiums?: Decimalish;
  claimCode?: number;
};

export type TaxEngineResult = {
  grossPay: Decimal;
  annualizedIncome: Decimal;
  annualTaxableIncome: Decimal;
  cpp: Decimal;
  cpp2: Decimal;
  ei: Decimal;
  annualFederalTax: Decimal;
  annualProvincialTax: Decimal;
  federalTax: Decimal;
  provincialTax: Decimal;
  incomeTax: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
  debug: Record<string, string>;
};

type BracketConfig = { threshold: Decimalish; rate: Decimalish; constant: Decimalish };
type SeedTaxConfig = {
  jurisdiction: TaxJurisdiction;
  verified: boolean;
  verificationNote: string;
  basicPersonalAmount: Decimalish;
  basicPersonalAmountMax?: Decimalish;
  basicPersonalAmountPhaseOutStart?: Decimalish;
  basicPersonalAmountPhaseOutEnd?: Decimalish;
  canadaEmploymentAmount?: Decimalish;
  supplementalCreditThreshold?: Decimalish;
  supplementalCreditRate?: Decimalish;
  bpaClawbackStart?: Decimalish;
  bpaClawbackEnd?: Decimalish;
  brackets: readonly BracketConfig[];
};
type SeedStatutoryConfig = {
  verified: boolean;
  verificationNote: string;
  cpp: {
    ympe: Decimalish;
    basicExemption: Decimalish;
    rate: Decimalish;
    maxContribution: Decimalish;
  };
  cpp2: { yampe: Decimalish; rate: Decimalish; maxContribution: Decimalish };
  ei: {
    maxInsurableEarnings: Decimalish;
    employeeRate: Decimalish;
    employerRate: Decimalish;
    maxPremium: Decimalish;
  };
};

function d(value: Decimalish | undefined, fallback = '0'): Decimal {
  if (value === undefined) return new Decimal(fallback);
  return moneyToDecimal(value as never);
}

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function publishedSeedTaxConfig(jurisdiction: TaxJurisdiction): SeedTaxConfig {
  const config = (taxConfigSeedData.taxVersions as unknown as readonly SeedTaxConfig[]).find(
    (item) => item.jurisdiction === jurisdiction
  );
  if (!config) throw new Error(`No tax config for ${jurisdiction}`);
  return config;
}

export function publishedSeedStatutoryConfig(): SeedStatutoryConfig {
  return taxConfigSeedData.statutory as SeedStatutoryConfig;
}

function activeBracket(annualIncome: Decimal, config: SeedTaxConfig | ITaxConfigVersion) {
  const brackets = config.brackets
    .map((bracket) => ({
      threshold: d(bracket.threshold),
      rate: d(bracket.rate),
      constant: d(bracket.constant)
    }))
    .sort((left, right) => left.threshold.comparedTo(right.threshold));
  return brackets.reduce(
    (selected, bracket) => (annualIncome.gte(bracket.threshold) ? bracket : selected),
    brackets[0]
  );
}

function bracketTax(annualIncome: Decimal, config: SeedTaxConfig | ITaxConfigVersion): Decimal {
  const bracket = activeBracket(annualIncome, config);
  return cents(annualIncome.times(bracket.rate)).minus(bracket.constant);
}

function federalBpa(annualIncome: Decimal, config: SeedTaxConfig | ITaxConfigVersion): Decimal {
  const min = d(config.basicPersonalAmount);
  const max = d(config.basicPersonalAmountMax, min.toString());
  const start = d(config.basicPersonalAmountPhaseOutStart);
  const end = d(config.basicPersonalAmountPhaseOutEnd);
  if (!config.basicPersonalAmountMax || annualIncome.lte(start)) return max;
  if (annualIncome.gte(end)) return min;
  return max.minus(max.minus(min).times(annualIncome.minus(start).div(end.minus(start))));
}

function provincialBpa(annualIncome: Decimal, config: SeedTaxConfig | ITaxConfigVersion): Decimal {
  const bpa = d(config.basicPersonalAmount);
  const start = d(config.bpaClawbackStart);
  const end = d(config.bpaClawbackEnd);
  if (!config.bpaClawbackStart || annualIncome.lte(start)) return bpa;
  if (annualIncome.gte(end)) return new Decimal(0);
  return bpa.times(new Decimal(1).minus(annualIncome.minus(start).div(end.minus(start))));
}

function cppContribution(
  input: TaxEngineInput,
  statutory: SeedStatutoryConfig | IPayrollStatutoryConfig
): Decimal {
  const gross = d(input.grossPay);
  const ytdPensionable = d(input.ytdPensionableEarnings);
  const ytdCpp = d(input.ytdCppContributions);
  const pensionableThisPeriod = Decimal.min(
    gross,
    Decimal.max(0, d(statutory.cpp.ympe).minus(ytdPensionable))
  );
  const exemption = d(statutory.cpp.basicExemption).div(input.payPeriods);
  const contribution = Decimal.max(0, pensionableThisPeriod.minus(exemption)).times(
    d(statutory.cpp.rate)
  );
  return cents(
    Decimal.max(0, Decimal.min(contribution, d(statutory.cpp.maxContribution).minus(ytdCpp)))
  );
}

function cpp2Contribution(
  input: TaxEngineInput,
  statutory: SeedStatutoryConfig | IPayrollStatutoryConfig
): Decimal {
  const gross = d(input.grossPay);
  const ytdPensionable = d(input.ytdPensionableEarnings);
  const ytdCpp2 = d(input.ytdCpp2Contributions);
  const cpp2Base = Decimal.max(
    0,
    Decimal.min(ytdPensionable.plus(gross), d(statutory.cpp2.yampe)).minus(
      Decimal.max(ytdPensionable, d(statutory.cpp.ympe))
    )
  );
  const contribution = cpp2Base.times(d(statutory.cpp2.rate));
  return cents(
    Decimal.max(0, Decimal.min(contribution, d(statutory.cpp2.maxContribution).minus(ytdCpp2)))
  );
}

function eiPremium(
  input: TaxEngineInput,
  statutory: SeedStatutoryConfig | IPayrollStatutoryConfig
): Decimal {
  const premium = d(input.grossPay).times(d(statutory.ei.employeeRate));
  return cents(
    Decimal.max(0, Decimal.min(premium, d(statutory.ei.maxPremium).minus(d(input.ytdEiPremiums))))
  );
}

function cppBaseAnnual(
  cpp: Decimal,
  input: TaxEngineInput,
  statutory: SeedStatutoryConfig | IPayrollStatutoryConfig
): Decimal {
  if (d(input.ytdCppContributions).gte(d(statutory.cpp.maxContribution)))
    return new Decimal('3519.45');
  return cents(cpp.times(new Decimal('0.0495').div(d(statutory.cpp.rate)))).times(input.payPeriods);
}

function ontarioHealthPremium(income: Decimal): Decimal {
  if (income.lte(20000)) return new Decimal(0);
  if (income.lte(36000)) return Decimal.min(300, income.minus(20000).times(0.06));
  if (income.lte(48000))
    return Decimal.min(450, new Decimal(300).plus(income.minus(36000).times(0.06)));
  if (income.lte(72000))
    return Decimal.min(600, new Decimal(450).plus(income.minus(48000).times(0.25)));
  if (income.lte(200000))
    return Decimal.min(750, new Decimal(600).plus(income.minus(72000).times(0.25)));
  return Decimal.min(900, new Decimal(750).plus(income.minus(200000).times(0.25)));
}

function ontarioAnnualTax(basicTax: Decimal, annualIncome: Decimal): Decimal {
  const surtax = basicTax.lte(5818)
    ? new Decimal(0)
    : basicTax.lte(7446)
      ? basicTax.minus(5818).times(0.2)
      : basicTax.minus(5818).times(0.2).plus(basicTax.minus(7446).times(0.36));
  const reduction = Decimal.max(0, Decimal.min(basicTax, new Decimal(600).minus(basicTax)));
  return Decimal.max(
    0,
    basicTax.plus(surtax).plus(ontarioHealthPremium(annualIncome)).minus(reduction)
  );
}

export function calculateStatutoryDeductions(input: TaxEngineInput): TaxEngineResult {
  const grossPay = d(input.grossPay);
  const payPeriods = input.payPeriods || 26;
  const federal = publishedSeedTaxConfig('FEDERAL');
  const province = publishedSeedTaxConfig(input.province);
  const statutory = publishedSeedStatutoryConfig();
  const cpp = cppContribution(input, statutory);
  const cpp2 = cpp2Contribution(input, statutory);
  const ei = eiPremium(input, statutory);
  const cppAdditional = cents(cpp.times(new Decimal('0.0100').div(d(statutory.cpp.rate))));
  const rrsp = d(input.rrspPerPeriod);
  const taxablePerPeriod = grossPay.minus(cppAdditional).minus(cpp2).minus(rrsp);
  const annualTaxableIncome = taxablePerPeriod.times(payPeriods);
  const cppBase = cppBaseAnnual(cpp, input, statutory);
  const eiAnnual = d(input.ytdEiPremiums).gte(d(statutory.ei.maxPremium))
    ? d(statutory.ei.maxPremium)
    : ei.times(payPeriods);
  const federalCreditBase = d(
    input.federalClaimAmount,
    federalBpa(annualTaxableIncome, federal).toString()
  )
    .plus(cppBase)
    .plus(eiAnnual)
    .plus(d(federal.canadaEmploymentAmount));
  const provincialCreditBase = d(
    input.provincialClaimAmount,
    provincialBpa(annualTaxableIncome, province).toString()
  )
    .plus(cppBase)
    .plus(eiAnnual);
  const federalGrossTax = bracketTax(annualTaxableIncome, federal);
  const provincialGrossTax = bracketTax(annualTaxableIncome, province);
  const supplementalCredit = province.supplementalCreditThreshold
    ? Decimal.max(0, provincialCreditBase.minus(d(province.supplementalCreditThreshold))).times(
        d(province.supplementalCreditRate)
      )
    : new Decimal(0);
  const annualFederalTax = Decimal.max(
    0,
    federalGrossTax.minus(federalCreditBase.times(d(federal.brackets[0].rate)))
  );
  const basicAnnualProvincialTax = Decimal.max(
    0,
    provincialGrossTax
      .minus(provincialCreditBase.times(d(province.brackets[0].rate)))
      .minus(supplementalCredit)
  );
  const annualProvincialTax =
    province.jurisdiction === 'ON'
      ? ontarioAnnualTax(basicAnnualProvincialTax, annualTaxableIncome)
      : basicAnnualProvincialTax;
  const federalTax = cents(annualFederalTax.div(payPeriods));
  const provincialTax = cents(annualProvincialTax.div(payPeriods));
  const incomeTax = cents(annualFederalTax.plus(annualProvincialTax).div(payPeriods));
  const totalDeductions = cents(cpp.plus(cpp2).plus(ei).plus(incomeTax));
  return {
    grossPay: cents(grossPay),
    annualizedIncome: cents(annualTaxableIncome),
    annualTaxableIncome: cents(annualTaxableIncome),
    cpp,
    cpp2,
    ei,
    annualFederalTax: cents(annualFederalTax),
    annualProvincialTax: cents(annualProvincialTax),
    federalTax,
    provincialTax,
    incomeTax,
    totalDeductions,
    netPay: cents(grossPay.minus(totalDeductions)),
    debug: {
      grossRemuneration: cents(grossPay).toFixed(2),
      cppAdditional: cents(cppAdditional).toFixed(2),
      rrsp: cents(rrsp).toFixed(2),
      netRemuneration: cents(taxablePerPeriod).toFixed(2),
      annualTaxableIncome: cents(annualTaxableIncome).toFixed(2),
      federalGrossTax: cents(federalGrossTax).toFixed(2),
      federalCreditBase: cents(federalCreditBase).toFixed(2),
      cppBaseAnnual: cents(cppBase).toFixed(2),
      eiAnnual: cents(eiAnnual).toFixed(2),
      provincialGrossTax: cents(provincialGrossTax).toFixed(2),
      provincialCreditBase: cents(provincialCreditBase).toFixed(2),
      supplementalCredit: cents(supplementalCredit).toFixed(2)
    }
  };
}
