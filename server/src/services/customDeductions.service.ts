import { IDeductionType } from '../models/DeductionType';
import { decimalToMoney, moneyToDecimal } from '../utils/money';

export function applicableCustomDeductions(items: IDeductionType[], employeeId: string, payDate: Date, grossPay: Parameters<typeof moneyToDecimal>[0], province: string, payFrequency: string, employmentType = '') {
  const date = payDate.toISOString().slice(0, 10);
  return items.filter((item) => item.kind === 'custom' && item.status === 'active'
    && Boolean(item.effectivePayDate && item.effectivePayDate <= date)
    && (!item.provinces?.length || item.provinces.includes(province))
    && (!item.payFrequency || item.payFrequency === 'all' || item.payFrequency === payFrequency)
    && (!item.employmentType || item.employmentType === 'all' || item.employmentType === employmentType)
    && (item.employeeScope !== 'selected' || (item.employeeIds || []).some((id) => String(id) === employeeId)))
    .map((item) => ({ code: item.code, description: item.name, amount: decimalToMoney(item.calculationMethod === 'percentage' ? moneyToDecimal(grossPay).times(moneyToDecimal(item.value || 0)).div(100) : item.value || 0) }));
}
