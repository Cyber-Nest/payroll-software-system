import { calculateStatutoryDeductions, publishedSeedTaxConfig } from '../src/services/taxEngine.service';

describe('tax engine', () => {
  it('marks BC and MB seed constants as self-derived pending verification', () => {
    expect(publishedSeedTaxConfig('FEDERAL').verified).toBe(true);
    expect(publishedSeedTaxConfig('AB').verified).toBe(true);
    expect(publishedSeedTaxConfig('SK').verified).toBe(true);
    expect(publishedSeedTaxConfig('ON').verified).toBe(true);
    expect(publishedSeedTaxConfig('BC').verified).toBe(false);
    expect(publishedSeedTaxConfig('MB').verified).toBe(false);
  });

  it('applies Ontario tax, surtax, health premium and reduction rules', () => {
    const result = calculateStatutoryDeductions({
      grossPay: '4000.00',
      province: 'ON',
      payPeriods: 26
    });

    expect(result.annualTaxableIncome.gt(100000)).toBe(true);
    expect(result.annualProvincialTax.gt(0)).toBe(true);
    expect(result.provincialTax.gt(0)).toBe(true);
  });

  it('calculates the CRA Alberta weekly worked example', () => {
    const result = calculateStatutoryDeductions({
      grossPay: '1300.00',
      province: 'AB',
      payPeriods: 52,
      rrspPerPeriod: '80.00',
      claimCode: 1
    });

    expect(result.debug).toEqual(expect.objectContaining({
      grossRemuneration: '1300.00',
      cppAdditional: '12.33',
      rrsp: '80.00',
      netRemuneration: '1207.67',
      annualTaxableIncome: '62798.84',
      federalCreditBase: '22227.92',
      provincialCreditBase: '27043.92'
    }));
    expect(result.cpp.toFixed(2)).toBe('73.35');
    expect(result.ei.toFixed(2)).toBe('21.19');
    expect(result.annualFederalTax.toFixed(2)).toBe('5957.85');
    expect(result.annualProvincialTax.toFixed(2)).toBe('2892.37');
    expect(result.incomeTax.toFixed(2)).toBe('170.20');
  });

  it('calculates the CRA Alberta CPP2 and supplemental-credit worked example', () => {
    const result = calculateStatutoryDeductions({
      grossPay: '1600.00',
      province: 'AB',
      payPeriods: 52,
      ytdPensionableEarnings: '75200.00',
      ytdCppContributions: '4230.45',
      ytdEiPremiums: '1123.07',
      ytdCpp2Contributions: '24.00',
      provincialClaimAmount: '60000.00'
    });

    expect(result.cpp2.toFixed(2)).toBe('64.00');
    expect(result.annualTaxableIncome.toFixed(2)).toBe('79872.00');
    expect(result.annualFederalTax.toFixed(2)).toBe('9406.39');
    expect(result.annualProvincialTax.toFixed(2)).toBe('1522.95');
    expect(result.incomeTax.toFixed(2)).toBe('210.18');
    expect(result.debug.supplementalCredit).toBe('68.85');
  });

  it('calculates the Saskatchewan weekly worked example', () => {
    const result = calculateStatutoryDeductions({
      grossPay: '1300.00',
      province: 'SK',
      payPeriods: 52,
      rrspPerPeriod: '80.00',
      claimCode: 1
    });

    expect(result.annualTaxableIncome.toFixed(2)).toBe('62798.84');
    expect(result.annualFederalTax.toFixed(2)).toBe('5957.85');
    expect(result.annualProvincialTax.toFixed(2)).toBe('4169.99');
    expect(result.incomeTax.toFixed(2)).toBe('194.77');
  });

  it('calculates the Saskatchewan CPP2 worked example', () => {
    const result = calculateStatutoryDeductions({
      grossPay: '1600.00',
      province: 'SK',
      payPeriods: 52,
      ytdPensionableEarnings: '75200.00',
      ytdCppContributions: '4230.45',
      ytdEiPremiums: '1123.07',
      ytdCpp2Contributions: '24.00'
    });

    expect(result.cpp2.toFixed(2)).toBe('64.00');
    expect(result.annualTaxableIncome.toFixed(2)).toBe('79872.00');
    expect(result.annualFederalTax.toFixed(2)).toBe('9406.39');
    expect(result.annualProvincialTax.toFixed(2)).toBe('6265.53');
    expect(result.incomeTax.toFixed(2)).toBe('301.38');
  });

  it('handles boundary cases without negative deductions', () => {
    const zero = calculateStatutoryDeductions({ grossPay: '0.00', province: 'SK', payPeriods: 26 });
    const mbClawbackStart = calculateStatutoryDeductions({ grossPay: '7692.31', province: 'MB', payPeriods: 26 });
    const aboveYampe = calculateStatutoryDeductions({ grossPay: '10000.00', province: 'AB', payPeriods: 26, ytdPensionableEarnings: '81700.00' });

    expect(zero.totalDeductions.toFixed(2)).toBe('0.00');
    expect(mbClawbackStart.annualProvincialTax.gte(0)).toBe(true);
    expect(aboveYampe.cpp2.toFixed(2)).toBe('0.00');
  });
});
