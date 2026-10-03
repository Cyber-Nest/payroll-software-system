export type VacationPolicy = {
  province: string;
  provinceName: string;
  vacationPolicy: string;
  vacationAccrualRate: string;
  accrualFrequency: string;
  vacationPayoutOnTermination: string;
  source: string;
};

const provinceAliases: Record<string, string> = {
  AB: 'AB',
  ALBERTA: 'AB',
  BC: 'BC',
  'BRITISH COLUMBIA': 'BC',
  MB: 'MB',
  MANITOBA: 'MB',
  NB: 'NB',
  'NEW BRUNSWICK': 'NB',
  NL: 'NL',
  NEWFOUNDLAND: 'NL',
  'NEWFOUNDLAND AND LABRADOR': 'NL',
  NS: 'NS',
  'NOVA SCOTIA': 'NS',
  NT: 'NT',
  'NORTHWEST TERRITORIES': 'NT',
  NU: 'NU',
  NUNAVUT: 'NU',
  ON: 'ON',
  ONTARIO: 'ON',
  PE: 'PE',
  PEI: 'PE',
  'PRINCE EDWARD ISLAND': 'PE',
  QC: 'QC',
  QUEBEC: 'QC',
  SK: 'SK',
  SASKATCHEWAN: 'SK',
  YT: 'YT',
  YUKON: 'YT'
};

const provinceNames: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon'
};

const accrualRates: Record<string, string> = {
  AB: '4.00',
  BC: '4.00',
  MB: '4.00',
  NB: '4.00',
  NL: '4.00',
  NS: '4.00',
  NT: '4.00',
  NU: '4.00',
  ON: '4.00',
  PE: '4.00',
  QC: '4.00',
  SK: '5.77',
  YT: '4.00'
};

export function normalizeProvince(value?: unknown): string {
  const key = String(value || '').trim().toUpperCase();
  return provinceAliases[key] || key || 'AB';
}

export function vacationPolicyForProvince(value?: unknown): VacationPolicy {
  const province = normalizeProvince(value);
  const provinceName = provinceNames[province] || String(value || 'Alberta').trim() || 'Alberta';
  const rate = accrualRates[province] || '4.00';

  return {
    province,
    provinceName,
    vacationPolicy: `Accrue by Percentage (${rate}%)`,
    vacationAccrualRate: rate,
    accrualFrequency: 'Each pay period',
    vacationPayoutOnTermination: 'As per provincial rules',
    source: `${provinceName} employment standards`
  };
}

export function withVacationPolicy(
  payrollConfiguration: Record<string, unknown> | undefined,
  province?: unknown
) {
  const existingVacation =
    payrollConfiguration?.vacation && typeof payrollConfiguration.vacation === 'object'
      ? (payrollConfiguration.vacation as Record<string, unknown>)
      : {};

  return {
    ...(payrollConfiguration || {}),
    vacation: {
      ...existingVacation,
      ...vacationPolicyForProvince(province)
    }
  };
}
