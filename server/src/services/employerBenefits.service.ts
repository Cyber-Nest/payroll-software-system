import { IEmployee } from '../models/Employee';

export const benefitFields = [
  ['extendedHealthCare', 'Extended Health Care', 'Health'], ['dentalCare', 'Dental Care', 'Health'],
  ['groupLifeInsurance', 'Group Life Insurance', 'Insurance'], ['accidentalDeath', 'Accidental Death & Dismemberment', 'Insurance'],
  ['employeeAssistance', 'Employee Assistance Program', 'Wellness'], ['rrspContribution', 'RRSP Contribution', 'Retirement'],
  ['unionDues', 'Union Dues', 'Deduction'], ['healthSpendingAccount', 'Health Spending Account', 'Health'], ['parking', 'Parking', 'Taxable Benefit']
] as const;
export function hasBenefit(value: unknown): boolean {
  if (value == null || value === false || value === 0) return false;
  const text = String(value).trim().toLowerCase();
  return Boolean(text) && !['not enrolled', 'none', 'no', '0', '0.00', 'false', 'n/a', 'not applicable'].includes(text);
}
export function employeeBenefitRows(employees: Array<IEmployee & { _id: unknown }>) {
  return employees.flatMap((employee) => {
    const values = employee.adminProfile?.benefits || {};
    const metadata = (values.benefitDetails || {}) as Record<string, { name?: string; type?: string; applicableFrom?: string; description?: string; status?: string }>;
    return benefitFields.filter(([key]) => hasBenefit(values[key])).map(([key, name, type]) => ({
      id: `legacy:${employee._id}:${key}`, source: 'employee' as const,
      name: metadata[key]?.name || name, type: metadata[key]?.type || type,
      coverageOrValue: String(values[key]), description: metadata[key]?.description || '',
      employeeScope: 'selected' as const, employeeIds: [String(employee._id)],
      applicableFrom: String(metadata[key]?.applicableFrom || values.benefitsEnrollmentDate || values.deductionsStartDate || '').slice(0, 10),
      status: metadata[key]?.status === 'inactive' ? 'inactive' : 'active'
    }));
  });
}
