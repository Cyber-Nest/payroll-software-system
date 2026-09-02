import { IEmployee } from '../models/Employee';
import { ICompany } from '../models/Company';
import { formatMoney } from './money';
import { maskSin } from './security';

export function serializeMoney(value: unknown): string {
  return formatMoney(value as never);
}

export function serializeEmployee(employee: IEmployee & { _id?: unknown }, company?: ICompany & { _id?: unknown }) {
  return {
    id: String(employee._id),
    company: company
      ? { id: String(company._id), legalName: company.legalName, operatingName: company.operatingName, customerId: company.customerId }
      : undefined,
    employeeNumber: employee.employeeNumber,
    legalFirstName: employee.legalFirstName,
    middleName: employee.middleName,
    legalLastName: employee.legalLastName,
    salutation: employee.salutation,
    preferredFirstName: employee.preferredFirstName,
    preferredLastName: employee.preferredLastName,
    citizenship: employee.citizenship,
    sin: maskSin(employee.sinEncrypted),
    birthDate: employee.birthDate,
    addresses: employee.addresses,
    phones: employee.phones,
    companyEmail: employee.companyEmail || 'No Information',
    personalEmail: employee.personalEmail,
    notificationEmailPreference: employee.notificationEmailPreference,
    emergencyContacts: employee.emergencyContacts,
    occupation: employee.occupation,
    startDate: employee.startDate,
    seniorityDate: employee.seniorityDate,
    primaryEarningCode: employee.primaryEarningCode,
    payGroup: employee.payGroup,
    taxProvince: employee.taxProvince,
    wcbNumber: employee.wcbNumber,
    personalTaxCredits: employee.personalTaxCredits
      ? {
          federalClaimAmount: serializeMoney(employee.personalTaxCredits.federalClaimAmount),
          provincialClaimAmount: serializeMoney(employee.personalTaxCredits.provincialClaimAmount)
        }
      : undefined,
    payStatementPreference: employee.payStatementPreference
  };
}
