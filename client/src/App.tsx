import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import clsx from 'clsx';
import DeductionsPage from './DeductionsPage';
import GovernmentFilingsPage from './GovernmentFilingsPage';

type Page =
  'home' | 'pay' | 'payDetail' | 'documents' | 'taxForms' | 'profile' | 'help' | 'notifications';
type LoginMode = 'email' | 'customer';
type Portal = 'super-admin' | 'employer' | 'employee';
type Lang = 'en' | 'fr' | 'hi' | 'gu' | 'pa' | 'es';
type T = (key: string) => string;
type CompanyChoice = {
  employeeId: string;
  companyId: string;
  companyName: string;
  customerId: string;
};
type EmployerCompanyChoice = { id: string; legalName: string; customerId: string };
type AdminProfile = Record<
  'personal' | 'employment' | 'compensation' | 'tax' | 'vacation' | 'benefits' | 'banking',
  Record<string, string>
>;
type EmployeeProfile = {
  id: string;
  legalFirstName: string;
  middleName?: string;
  legalLastName: string;
  sin: string;
  employeeNumber: string;
  company?: { legalName: string; customerId: string };
  addresses: Array<{ street: string; city: string; province: string; postalCode: string }>;
  occupation?: string;
  startDate?: string;
  seniorityDate?: string;
  primaryEarningCode?: string;
  payGroup?: string;
  taxProvince?: string;
  wcbNumber?: string;
  personalTaxCredits?: { federalClaimAmount: string; provincialClaimAmount: string };
  personalEmail?: string;
  adminProfile?: AdminProfile;
};
type PayStatement = {
  id: string;
  payDate: string;
  payPeriodNumber: number;
  payPeriodYear: number;
  type: string;
  grossPay: string;
  netPay: string;
  yearToDateNetPay: string;
  deductionsTotal: string;
  grossEarnings: Array<{ code: string; description: string; amount: string }>;
  deductions: Array<{ code: string; description: string; amount: string }>;
  additionalInfo: Array<{ key: string; value: string }>;
  periodStart?: string;
  periodEnd?: string;
  regularHours: number;
  overtimeHours: number;
  statePayHours: number;
  statePayBaseHours?: number;
  statePayProvince?: string;
  statePayExplanation?: string;
  hourlyRate: string;
  revision: number;
  changeSummary: string[];
  isUnread: boolean;
};
type TaxForm = { id: string; taxYear: number; formType: string };

function payStatementEarning(statement: PayStatement, code: string): string {
  return statement.grossEarnings.find((line) => line.code === code)?.amount || '0.00';
}

const normalizeFilterValue = (value: unknown) => String(value ?? '').trim().toLowerCase();
const filterEquals = (value: unknown, selected: string) =>
  normalizeFilterValue(value) === normalizeFilterValue(selected);
const filterContains = (value: unknown, query: string) =>
  normalizeFilterValue(value).includes(normalizeFilterValue(query));
const isAllFilter = (selected: string, allValue: string) => filterEquals(selected, allValue);
const matchesFilter = (value: unknown, selected: string, allValue: string) =>
  isAllFilter(selected, allValue) || filterEquals(value, selected);
type DisplayMoneyLine = { code?: string; description?: string; amount: string; ytd?: string };
const hiddenDeductionCodes = new Set(['CPP2', 'PTAX']);
const hiddenDeductionDescriptions = ['additional cpp', 'provincial income tax', 'other tax'];
const optionalEarningCodes = new Set(['BONUS', 'BON', 'COMM', 'COMMISSION', 'OTHER', 'OTH']);
const optionalEarningDescriptions = ['bonus', 'commission', 'other earning', 'other earnings'];
const moneyNumber = (value: unknown) => Number(String(value ?? '0').replace(/,/g, '')) || 0;
const moneySumText = (...values: unknown[]) =>
  values.reduce<number>((total, value) => total + moneyNumber(value), 0).toFixed(2);
const combinedIncomeTax = (row: { federalTax: number; provincialTax: number }) =>
  row.federalTax + row.provincialTax;
const lineMatchesAny = (line: { code?: string; description?: string }, values: string[]) => {
  const description = normalizeFilterValue(line.description);
  return values.some((value) => description.includes(value));
};
const displayEarningLines = <T extends DisplayMoneyLine>(lines: T[]) =>
  lines.filter((line) => {
    const optional =
      optionalEarningCodes.has(String(line.code || '').toUpperCase()) ||
      lineMatchesAny(line, optionalEarningDescriptions);
    return !optional || moneyNumber(line.amount) !== 0;
  });
const displayDeductionLines = <T extends DisplayMoneyLine>(lines: T[]) => {
  const provincial = lines.find(
    (line) =>
      String(line.code || '').toUpperCase() === 'PTAX' ||
      lineMatchesAny(line, ['provincial income tax'])
  );
  return lines
    .map((line) => {
      const code = String(line.code || '').toUpperCase();
      if (code !== 'FTAX') return line;
      return {
        ...line,
        description: line.description || 'Federal tax',
        amount: moneySumText(line.amount, provincial?.amount),
        ...(line.ytd !== undefined ? { ytd: moneySumText(line.ytd, provincial?.ytd) } : {})
      };
    })
    .filter((line) => {
      const code = String(line.code || '').toUpperCase();
      return !hiddenDeductionCodes.has(code) && !lineMatchesAny(line, hiddenDeductionDescriptions);
    });
};
type Bulletin = {
  id: string;
  title: string;
  body: string;
  postedAt: string;
  postedBy?: string;
  isRead: boolean;
};
type HelpContent = {
  brandName: string;
  heroTitle: string;
  searchPlaceholder: string;
  frequentlyAskedTitle: string;
  frequentlyAsked: Array<{ title: string }>;
  topicsTitle: string;
  topics: Array<{ title: string; icon: string; description: string }>;
  formTitle: string;
  formFields: Array<{ label: string; placeholder?: string; disabled?: boolean; options: string[] }>;
  resourcesTitle: string;
  resources: Array<{ title: string; description: string; icon: string; href?: string }>;
  contactTitle: string;
  contactLines: string[];
  employerName?: string;
  customerCareNumber?: string;
};
type EmployerDashboard = {
  user: { name: string; role: string };
  company: EmployerCompanyChoice;
  companies?: EmployerCompanyChoice[];
  metrics: {
    totalEmployees: number;
    employeeDelta: number;
    monthlyPayroll: number;
    payrollDeltaPercent: number;
    governmentLiabilities: number;
    actionRequired: number;
  };
  nextPayroll?: {
    periodStart: string;
    periodEnd: string;
    payDate: string;
    employeeCount: number;
    totalHours: number;
    estimatedGross: number;
    status: string;
  };
  chart: Array<{ label: string; amount: number }>;
  recentActivity: Array<[string, string]>;
  alerts: Array<[string, string, string]>;
};
type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  runType: string;
  payFrequency: 'weekly' | 'biweekly' | 'monthly';
  status: string;
  employeeCount: number;
  totalHours: number;
  estimatedGross: string;
  totalDeductions: string;
  totalNetPay: string;
  statePayEligible?: boolean;
  statePayDates?: string[];
  vacationAccrualRate?: string;
  canEditFinalized?: boolean;
  lines: Array<{
    employeeId: string;
    employeeName?: string;
    employeeNumber?: string;
    regularHours: number;
    overtimeHours: number;
    statePayHours: number;
    statePayBaseHours: number;
    statePayRegularDay: boolean;
    statePayAlternativeDayOff: boolean;
    statePayProvince?: string;
    statePayExplanation?: string;
    hourlyRate: string;
    bonus: string;
    commission: string;
    vacationPay: string;
    statePay: string;
    otherEarnings: string;
    reimbursement: string;
    preTaxDeductions: string;
    postTaxDeductions: string;
    cpp: string;
    cpp2: string;
    ei: string;
    federalTax: string;
    provincialTax: string;
    carryForwardAdjustment: string;
    carryForwardAdjustmentIds: string[];
    note: string;
    grossPay: string;
    deductionsTotal: string;
    netPay: string;
  }>;
};
type EmployerReportItem = { name: string; description: string; formats: string[] };
type EmployerReportGroup = {
  title: string;
  description: string;
  tone: string;
  reports: EmployerReportItem[];
};
type EmployerReportsData = {
  metrics: {
    totalReports: number;
    mostUsed: string;
    mostUsedCaption: string;
    scheduledReports: number;
    reportsGenerated: number;
  };
  groups: EmployerReportGroup[];
};
type EmployerPayrollSummaryReport = {
  metrics: {
    totalPayRuns: number;
    totalGrossPay: string;
    totalEmployeesPaid: number;
    lastPayRun: string;
    lastPayRunDate: string;
  };
  filters: {
    payPeriods: string[];
    departments: string[];
    employees: string[];
    payGroups: string[];
  };
  summary: {
    payPeriod: string;
    employeesPaid: number;
    totalHours: number;
    totalGrossPay: string;
    totalDeductions: string;
    totalNetPay: string;
    totalEmployerCosts: string;
  };
  rows: Array<{
    index: number;
    employeeName: string;
    employeeNumber: string;
    department: string;
    hours: number;
    grossPay: number;
    deductions: number;
    netPay: number;
    employerCosts: number;
    payGroup: string;
    payDate: string;
    status: string;
    statementId?: string;
    hourlyRate: number;
    regularHours: number;
    overtimeHours: number;
    statePayHours: number;
    vacationPay: number;
    statePay: number;
    otherEarnings: number;
    cpp: number;
    ei: number;
    federalTax: number;
    provincialTax: number;
    preTaxDeductions: number;
    postTaxDeductions: number;
  }>;
};
type EmployerHoursReport = {
  metrics: {
    totalEmployees: number;
    fullTime: number;
    partTime: number;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    averageHours: number;
    overtimePercent: number;
  };
  filters: {
    payPeriods: string[];
    departments: string[];
    payGroups: string[];
    employmentTypes: string[];
  };
  summary: {
    payPeriod: string;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    ptoHours: number;
    statHolidayHours: number;
    totalHours: number;
  };
  rows: Array<{
    index: number;
    employeeName: string;
    employeeNumber: string;
    department: string;
    payGroup: string;
    employmentType: string;
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    ptoHours: number;
    statHolidayHours: number;
    totalHours: number;
  }>;
};
type EmployerEarningsReport = {
  metrics: {
    totalEmployees: number;
    fullTime: number;
    partTime: number;
    totalEarnings: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    averageHourlyRate: number;
  };
  filters: {
    payPeriods: string[];
    departments: string[];
    payGroups: string[];
    employmentTypes: string[];
  };
  summary: { payPeriod: string; totalHours: number; totalEarnings: number };
  rows: Array<{
    index: number | null;
    employeeName: string;
    employeeNumber: string;
    department: string;
    payGroup: string;
    employmentType: string;
    earningType: string;
    rate: number | null;
    hours: number | null;
    amount: number;
  }>;
};
type EmployerEmployeeListReport = {
  metrics: {
    totalEmployees: number;
    fullTime: number;
    partTime: number;
    activeEmployees: number;
    onLeave: number;
    newHires: number;
    newHireDateRange: string;
    terminated: number;
    terminatedAsOf: string;
  };
  filters: {
    statuses: string[];
    departments: string[];
    employmentTypes: string[];
    payGroups: string[];
  };
  rows: Array<{
    index: number;
    employeeName: string;
    initials: string;
    employeeNumber: string;
    department: string;
    position: string;
    employmentType: string;
    payGroup: string;
    hireDate: string;
    status: string;
    email: string;
    phone: string;
    terminationDate: string;
    yearsOfService: number;
  }>;
};
type EmployerEmployeeDetailsReport = {
  employees: Array<{ id: string; label: string }>;
  payPeriods: Array<{ id: string; label: string }>;
  employee?: {
    id: string; name: string; initials: string; employeeNumber: string; status: string;
    position: string; department: string; employmentType: string; hireDate: string;
    email: string; phone: string; location: string; payGroup: string; standardHours: string;
    hourlyRate: number;
  };
  current?: {
    payPeriod: string; hours: number; regularHours: number; overtimeHours: number;
    grossPay: number; deductions: number; netPay: number; statementId?: string;
    earnings: Array<{ name: string; rate: number | null; hours: number; amount: number }>;
    deductionsRows: Array<{ name: string; employeeAmount: number; employerAmount: number }>;
  };
  ytd?: { hours: number; grossPay: number; deductions: number; netPay: number };
  payHistory?: Array<{ id: string; payDate: string; payPeriod: string; grossPay: number; deductions: number; netPay: number; statementId?: string }>;
};
type EmployerDeductionsReport = {
  metrics: { totalEmployees: number; fullTime: number; partTime: number; totalDeductions: string; averageDeductions: string; employeeDeductionsPercent: number };
  filters: { payPeriods: string[]; departments: string[]; payGroups: string[]; employmentTypes: string[] };
  summary: { payPeriod: string; grossPay: number; cpp: number; ei: number; federalTax: number; provincialTax: number; otherDeductions: number; totalDeductions: number };
  rows: Array<{ index: number; employeeName: string; employeeNumber: string; department: string; payGroup: string; employmentType: string; grossPay: number; cpp: number; ei: number; federalTax: number; provincialTax: number; otherDeductions: number; totalDeductions: number }>;
};
type EmployerHistoryReport = {
  metrics: { totalEmployees: number; fullTime: number; partTime: number; currentlyActive: number; onLeave: number; totalPositionChanges: number; averageTenure: number; asOf: string };
  filters: { employees: string[]; departments: string[]; employmentTypes: string[]; payGroups: string[]; statuses: string[] };
  rows: Array<{ index: number; employeeName: string; initials: string; employeeNumber: string; department: string; employmentType: string; payGroup: string; status: string; tenureYears: number; changes: Array<{ effectiveDate: string; changeType: string; details: string; previousValue: string; newValue: string; updatedBy: string }> }>;
};
type SuperAdminDashboard = {
  user: { name: string; organization: string };
  metrics: {
    employers: number;
    activeEmployers: number;
    pendingActivation: number;
    draftEmployers: number;
  };
  employers: Array<{
    id: string;
    legalName: string;
    operatingName?: string;
    customerId: string;
    status: string;
    businessNumber?: string;
    employeeCount: number;
    plan: string;
    primaryContact?: { name: string; email: string };
    createdAt: string;
  }>;
};

type AccessUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  employer: string;
  status: string;
  lastLogin: string;
  createdDate: string;
  phone: string;
  department: string;
  timeZone: string;
  twoFactor: string;
  loginMethod: string;
};
type AccessRoleItem = {
  id: string;
  name: string;
  type: string;
  description: string;
  users: number;
  status: string;
  createdDate: string;
  lastUpdated: string;
  permissions: Record<string, string[]>;
};
type AccessData = {
  metrics: Record<string, number>;
  modules: Array<{ name: string; caption: string; permissions: string[] }>;
  roles: AccessRoleItem[];
  users: AccessUser[];
  activityLogs: Array<{
    id: string;
    dateTime: string;
    user: string;
    employer: string;
    role: string;
    action: string;
    module: string;
    details: string;
    status: string;
    ipAddress: string;
    referenceId: string;
    device: string;
    location: string;
  }>;
  permissionMatrix: {
    role: {
      name: string;
      type: string;
      description: string;
      status: string;
      totalPermissions: number;
      modulesConfigured: string;
      createdDate: string;
      lastUpdated: string;
    };
    primaryModule: string;
    actions: string[];
    rows: Array<{ permission: string; description: string; grants: string[] }>;
    subModuleActions: string[];
    subModules: Array<{ name: string; description: string; grants: string[] }>;
    configuredModules: string[];
    nextSteps: string[];
  };
};
type PayrollAccount = {
  id: string;
  employer: string;
  location: string;
  businessNumber: string;
  rpAccountNumber: string;
  remitterType: string;
  frequency: string;
  nextRemittanceDue: string;
  currentCraLiability: string;
  status: string;
  province: string;
  lastUpdated: string;
  bankInstitution: string;
  accountType: string;
  accountNumber: string;
  usedFor: string;
  verificationStatus: string;
  bankStatus: string;
  payments: Array<Record<string, string | number>>;
  notes: Array<Record<string, string>>;
  remitterHistory: Array<Record<string, string>>;
  payrollRuns: Array<{
    id: string;
    period: string;
    payDate: string;
    totalDeductions: string;
    status: string;
  }>;
};
type PayrollAccountsData = {
  metrics: {
    totalAccounts: number;
    activeAccounts: number;
    actionRequired: number;
    dueSoon: number;
    totalOutstanding: number;
  };
  accounts: PayrollAccount[];
};
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const currentYear = new Date().getFullYear();
const fallbackHelpContent: HelpContent = {
  brandName: 'Payhours',
  heroTitle: 'How can we help?',
  searchPlaceholder: 'Search for a subject',
  frequentlyAskedTitle: 'Frequently asked',
  frequentlyAsked: [
    { title: 'Video: How do I use the ESS payroll application? (D)' },
    { title: 'How do I convert my account to log in with my email address?' },
    { title: 'Two-Factor Authentication' }
  ],
  topicsTitle: 'Find your solution by topic',
  topics: [
    {
      title: 'General Information',
      icon: 'i',
      description: 'General information on using the application and settings'
    },
    { title: 'Pay', icon: '$', description: 'Information on pay statements and tax forms' },
    {
      title: 'Time',
      icon: 'time',
      description:
        'Time off, Availability, Available shifts, Web time, Timesheets, Holiday Calendar'
    },
    {
      title: 'Calendar',
      icon: 'calendar',
      description: 'Schedules, Available shifts, Time off requests, and more.'
    },
    { title: 'Documents', icon: 'documents', description: 'Communications from your employer.' },
    {
      title: 'Profile',
      icon: 'profile',
      description: 'Managing personal information, log-in & password'
    },
    {
      title: 'Two-Factor Authentication',
      icon: 'security',
      description: 'Information about Two-Factor Authentication (2FA)'
    },
    {
      title: 'Product Bulletins',
      icon: 'bulletins',
      description: "Stay on top of what's new and next."
    }
  ],
  formTitle: 'Get the right help',
  formFields: [
    {
      label: 'What can we help you with?',
      placeholder: 'Choose a topic',
      disabled: false,
      options: ['Payroll and tax forms', 'Profile and security', 'Time and calendar']
    },
    { label: 'Tell us about your inquiry:', disabled: true, options: [] },
    { label: 'Choose a subject', disabled: true, options: [] }
  ],
  resourcesTitle: 'Resources',
  resources: [
    {
      title: 'E-Book: Security best practices',
      description: 'Resources to keep your personal information safe.',
      icon: 'security'
    }
  ],
  contactTitle: 'Still need help?',
  contactLines: [
    'If you still have unanswered questions',
    'please contact your payroll administrator',
    'or your manager.'
  ]
};
const languageNames: Record<Lang, string> = {
  en: 'English',
  fr: 'Francais',
  hi: 'Hindi',
  gu: 'Gujarati',
  pa: 'Punjabi',
  es: 'Espanol'
};
const localeByLang: Record<Lang, string> = {
  en: 'en-CA',
  fr: 'fr-CA',
  hi: 'hi-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  es: 'es-ES'
};

const messages: Record<Lang, Record<string, string>> = {
  en: {
    loginEmailTitle: 'Log in with an email address',
    loginCustomerTitle: 'Log in with Customer ID',
    email: 'Email',
    customerId: 'Customer ID',
    employeeNumber: 'Employee Number',
    password: 'Password',
    forgotPassword: 'Forgot your password?',
    view: 'View',
    rememberEmail: 'Remember email',
    login: 'Log in',
    or: 'OR',
    loginWithCustomerId: 'Log in with Customer ID',
    loginWithEmail: 'Log in with an email address',
    loginError: 'Login failed. Check the seeded credentials or run the seed script.',
    home: 'Home',
    pay: 'Pay',
    documents: 'Documents',
    profile: 'Profile',
    collapse: 'Collapse',
    notifications: 'Notifications',
    help: 'Help',
    logout: 'Logout',
    company: 'Company',
    loggedIntoPersonal: 'Logged into personal account',
    startEmailLogin: 'Start using the new email login',
    emailLogin: 'Email login',
    accountSwitcher: 'Account switcher - Navigate between multiple accounts',
    getStarted: 'Get started',
    hello: 'Hello',
    person: 'Person',
    mail: 'Mail',
    doc: 'Doc',
    lastPay: 'Last Pay',
    noPayStatements: 'No pay statements',
    taxForms: 'Tax Forms',
    companyBulletins: 'Company Bulletins',
    noBulletins: 'There are no bulletins at this time.',
    payStatements: 'PAY STATEMENTS',
    selectYear: 'Select Year',
    downloadSelected: 'Download Selected',
    payDate: 'Pay Date',
    payPeriod: 'Pay Period',
    type: 'Type',
    netPay: 'Net Pay',
    downloadPdf: 'Download PDF',
    hoverToView: 'Hover to view',
    payStatement: 'PAY STATEMENT',
    yearToDate: 'YEAR TO DATE',
    grossEarnings: 'Gross Earnings',
    deductions: 'Deductions',
    additionalInfo: 'Additional Statement Information',
    noDbPay: 'No pay statement data found in the database.',
    taxFormType: 'Tax Form Type',
    taxYear: 'Tax Year',
    reset: 'RESET',
    save: 'SAVE',
    personalInformation: 'Personal Information',
    emergencyContacts: 'Emergency Contacts',
    employeeInformation: 'Employee Information',
    loginInformation: 'Login Information',
    twoFactorAuthentication: 'Two-Factor Authentication',
    username: 'Username',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    passwordRules:
      'A strong password must contain: Seven characters. Must have (3) of the following (4): One uppercase letter / At least one lowercase letter / One number / One symbol [!@#$%^&*()_+]. Must NOT contain: Single or double quotes / Your username / The left angle-bracket character ("<") / The pipe character (|)',
    enableTwoFactor: 'Enable two-factor authentication',
    occupation: 'Occupation',
    startDate: 'Start Date',
    seniority: 'Seniority',
    primaryEarning: 'Primary Earning',
    payGroup: 'Pay Group',
    taxProvince: 'Tax Province',
    wcbNumber: 'WCB Number',
    federal: 'Federal',
    provincial: 'Provincial',
    legalFirstName: 'Legal First Name',
    middleName: 'Middle Name',
    legalLastName: 'Legal Last Name',
    streetAddress: 'Street Address',
    city: 'City',
    province: 'Province',
    postalCode: 'Postal Code',
    loadError:
      'Could not load data from the database. Make sure the server is running and seed data exists.'
  },
  fr: {
    loginEmailTitle: 'Connexion avec une adresse courriel',
    loginCustomerTitle: 'Connexion avec l->ID client',
    email: 'Courriel',
    customerId: 'ID client',
    employeeNumber: 'Numero d->employe',
    password: 'Mot de passe',
    forgotPassword: 'Mot de passe oublie?',
    view: 'Voir',
    rememberEmail: 'Memoriser le courriel',
    login: 'Connexion',
    or: 'OU',
    loginWithCustomerId: 'Connexion avec l->ID client',
    loginWithEmail: 'Connexion avec une adresse courriel',
    loginError: 'Connexion echouee. Verifiez les identifiants ou executez le script seed.',
    home: 'Accueil',
    pay: 'Paie',
    documents: 'Documents',
    profile: 'Profil',
    collapse: 'Reduire',
    notifications: 'Notifications',
    help: 'Aide',
    logout: 'Deconnexion',
    company: 'Entreprise',
    loggedIntoPersonal: 'Connecte au compte personnel',
    startEmailLogin: 'Commencer avec la nouvelle connexion courriel',
    emailLogin: 'Connexion courriel',
    accountSwitcher: 'Selecteur de compte - naviguer entre plusieurs comptes',
    getStarted: 'Commencer',
    hello: 'Bonjour',
    person: 'Personne',
    mail: 'Courrier',
    doc: 'Doc',
    lastPay: 'Derniere paie',
    noPayStatements: 'Aucun releve de paie',
    taxForms: 'Feuillets fiscaux',
    companyBulletins: 'Bulletins de l->entreprise',
    noBulletins: 'Il n->y a aucun bulletin pour le moment.',
    payStatements: 'RELEVES DE PAIE',
    selectYear: 'Choisir l->annee',
    downloadSelected: 'Telecharger la selection',
    payDate: 'Date de paie',
    payPeriod: 'Periode de paie',
    type: 'Type',
    netPay: 'Paie nette',
    downloadPdf: 'Telecharger PDF',
    hoverToView: 'Survoler pour voir',
    payStatement: 'RELEVE DE PAIE',
    yearToDate: 'CUMUL ANNUEL',
    grossEarnings: 'Gains bruts',
    deductions: 'Retenues',
    additionalInfo: 'Informations supplementaires',
    noDbPay: 'Aucun releve de paie trouve dans la base de donnees.',
    taxFormType: 'Type de feuillet',
    taxYear: 'Annee fiscale',
    reset: 'REINITIALISER',
    save: 'ENREGISTRER',
    personalInformation: 'Renseignements personnels',
    emergencyContacts: 'Contacts d->urgence',
    employeeInformation: 'Renseignements employe',
    loginInformation: 'Renseignements de connexion',
    twoFactorAuthentication: 'Authentification a deux facteurs',
    username: 'Nom d->utilisateur',
    currentPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmNewPassword: 'Confirmer le mot de passe',
    passwordRules:
      'Un mot de passe fort doit contenir: sept caracteres. Trois des quatre elements suivants: majuscule / minuscule / chiffre / symbole [!@#$%^&*()_+]. Ne doit PAS contenir: guillemets / votre nom d->utilisateur / le caractere "<" / le caractere |',
    enableTwoFactor: 'Activer l->authentification a deux facteurs',
    occupation: 'Profession',
    startDate: 'Date de debut',
    seniority: 'Anciennete',
    primaryEarning: 'Gain principal',
    payGroup: 'Groupe de paie',
    taxProvince: 'Province fiscale',
    wcbNumber: 'Numero WCB',
    federal: 'Federal',
    provincial: 'Provincial',
    legalFirstName: 'Prenom legal',
    middleName: 'Second prenom',
    legalLastName: 'Nom legal',
    streetAddress: 'Adresse',
    city: 'Ville',
    province: 'Province',
    postalCode: 'Code postal',
    loadError:
      'Impossible de charger les donnees. Assurez-vous que le serveur fonctionne et que les donnees seed existent.'
  },
  hi: {
    loginEmailTitle: 'à¤ˆà¤®à¥‡à¤² à¤ªà¤¤à¥‡ à¤¸à¥‡ à¤²à¥‰à¤— à¤‡à¤¨ à¤•à¤°à¥‡à¤‚',
    loginCustomerTitle: 'à¤•à¤¸à¥à¤Ÿà¤®à¤° ID à¤¸à¥‡ à¤²à¥‰à¤— à¤‡à¤¨ à¤•à¤°à¥‡à¤‚',
    email: 'à¤ˆà¤®à¥‡à¤²',
    customerId: 'à¤•à¤¸à¥à¤Ÿà¤®à¤° ID',
    employeeNumber: 'à¤•à¤°à¥à¤®à¤šà¤¾à¤°à¥€ à¤¨à¤‚à¤¬à¤°',
    password: 'à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡',
    forgotPassword: 'à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤­à¥‚à¤² à¤—à¤?',
    view: 'à¤¦à¥‡à¤–à¥‡à¤‚',
    rememberEmail: 'à¤ˆà¤®à¥‡à¤² à¤¯à¤¾à¤¦ à¤°à¤–à¥‡à¤‚',
    login: 'à¤²à¥‰à¤— à¤‡à¤¨',
    or: 'à¤¯à¤¾',
    loginWithCustomerId: 'à¤•à¤¸à¥à¤Ÿà¤®à¤° ID à¤¸à¥‡ à¤²à¥‰à¤— à¤‡à¤¨',
    loginWithEmail: 'à¤ˆà¤®à¥‡à¤² à¤ªà¤¤à¥‡ à¤¸à¥‡ à¤²à¥‰à¤— à¤‡à¤¨',
    loginError:
      'à¤²à¥‰à¤—à¤¿à¤¨ à¤µà¤¿à¤«à¤²à¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ seeded credentials à¤œà¤¾à¤‚à¤šà¥‡à¤‚ à¤¯à¤¾ seed script à¤šà¤²à¤¾à¤à¤‚à¥¤',
    home: 'à¤¹à¥‹à¤®',
    pay: 'à¤ªà¥‡',
    documents: 'à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œ',
    profile: 'à¤ªà¥à¤°à¥‹à¤«à¤¾à¤‡à¤²',
    collapse: 'à¤›à¥‹à¤Ÿà¤¾ à¤•à¤°à¥‡à¤‚',
    notifications: 'à¤¸à¥‚à¤šà¤¨à¤¾à¤à¤‚',
    help: 'à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾',
    logout: 'à¤²à¥‰à¤— à¤†à¤‰à¤Ÿ',
    company: 'à¤•à¤‚à¤ªà¤¨à¥€',
    loggedIntoPersonal: 'à¤µà¥à¤¯à¤•à¥à¤¤à¤¿à¤—à¤¤ à¤–à¤¾à¤¤à¥‡ à¤®à¥‡à¤‚ à¤²à¥‰à¤— à¤‡à¤¨',
    startEmailLogin: 'à¤¨à¤¯à¤¾ à¤ˆà¤®à¥‡à¤² à¤²à¥‰à¤—à¤¿à¤¨ à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚',
    emailLogin: 'à¤ˆà¤®à¥‡à¤² à¤²à¥‰à¤—à¤¿à¤¨',
    accountSwitcher:
      'à¤…à¤•à¤¾à¤‰à¤‚à¤Ÿ à¤¸à¥à¤µà¤¿à¤šà¤° - à¤•à¤ˆ à¤–à¤¾à¤¤à¥‹à¤‚ à¤®à¥‡à¤‚ à¤œà¤¾à¤à¤‚',
    getStarted: 'à¤¶à¥à¤°à¥‚ à¤•à¤°à¥‡à¤‚',
    hello: 'à¤¨à¤®à¤¸à¥à¤¤à¥‡',
    person: 'à¤µà¥à¤¯à¤•à¥à¤¤à¤¿',
    mail: 'à¤®à¥‡à¤²',
    doc: 'à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥‡à¤œ',
    lastPay: 'à¤…à¤‚à¤¤à¤¿à¤® à¤ªà¥‡',
    noPayStatements: 'à¤•à¥‹à¤ˆ payslip à¤¨à¤¹à¥€à¤‚',
    taxForms: 'à¤Ÿà¥ˆà¤•à¥à¤¸ à¤«à¥‰à¤°à¥à¤®',
    companyBulletins: 'à¤•à¤‚à¤ªà¤¨à¥€ à¤¬à¥à¤²à¥‡à¤Ÿà¤¿à¤¨',
    noBulletins: 'à¤‡à¤¸ à¤¸à¤®à¤¯ à¤•à¥‹à¤ˆ à¤¬à¥à¤²à¥‡à¤Ÿà¤¿à¤¨ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤',
    payStatements: 'à¤ªà¥‡ à¤¸à¥à¤Ÿà¥‡à¤Ÿà¤®à¥‡à¤‚à¤Ÿ',
    selectYear: 'à¤µà¤°à¥à¤· à¤šà¥à¤¨à¥‡à¤‚',
    downloadSelected: 'à¤šà¥à¤¨à¥‡ à¤¹à¥à¤ à¤¡à¤¾à¤‰à¤¨à¤²à¥‹à¤¡ à¤•à¤°à¥‡à¤‚',
    payDate: 'à¤ªà¥‡ à¤¤à¤¾à¤°à¥€à¤–',
    payPeriod: 'à¤ªà¥‡ à¤…à¤µà¤§à¤¿',
    type: 'à¤ªà¥à¤°à¤•à¤¾à¤°',
    netPay: 'à¤¨à¥‡à¤Ÿ à¤ªà¥‡',
    downloadPdf: 'PDF à¤¡à¤¾à¤‰à¤¨à¤²à¥‹à¤¡',
    hoverToView: 'à¤¦à¥‡à¤–à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ hover à¤•à¤°à¥‡à¤‚',
    payStatement: 'à¤ªà¥‡ à¤¸à¥à¤Ÿà¥‡à¤Ÿà¤®à¥‡à¤‚à¤Ÿ',
    yearToDate: 'à¤µà¤°à¥à¤·-à¤¸à¥‡-à¤…à¤¬ à¤¤à¤•',
    grossEarnings: 'à¤•à¥à¤² à¤•à¤®à¤¾à¤ˆ',
    deductions: 'à¤•à¤Ÿà¥Œà¤¤à¤¿à¤¯à¤¾à¤‚',
    additionalInfo: 'à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
    noDbPay:
      'à¤¡à¥‡à¤Ÿà¤¾à¤¬à¥‡à¤¸ à¤®à¥‡à¤‚ à¤•à¥‹à¤ˆ à¤ªà¥‡ à¤¸à¥à¤Ÿà¥‡à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤',
    taxFormType: 'à¤Ÿà¥ˆà¤•à¥à¤¸ à¤«à¥‰à¤°à¥à¤® à¤ªà¥à¤°à¤•à¤¾à¤°',
    taxYear: 'à¤Ÿà¥ˆà¤•à¥à¤¸ à¤µà¤°à¥à¤·',
    reset: 'à¤°à¥€à¤¸à¥‡à¤Ÿ',
    save: 'à¤¸à¥‡à¤µ',
    personalInformation: 'à¤µà¥à¤¯à¤•à¥à¤¤à¤¿à¤—à¤¤ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
    emergencyContacts: 'à¤†à¤ªà¤¾à¤¤à¤•à¤¾à¤²à¥€à¤¨ à¤¸à¤‚à¤ªà¤°à¥à¤•',
    employeeInformation: 'à¤•à¤°à¥à¤®à¤šà¤¾à¤°à¥€ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
    loginInformation: 'à¤²à¥‰à¤—à¤¿à¤¨ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€',
    twoFactorAuthentication: 'à¤Ÿà¥‚-à¤«à¥ˆà¤•à¥à¤Ÿà¤° à¤‘à¤¥à¥‡à¤‚à¤Ÿà¤¿à¤•à¥‡à¤¶à¤¨',
    username: 'à¤¯à¥‚à¤œà¤°à¤¨à¥‡à¤®',
    currentPassword: 'à¤µà¤°à¥à¤¤à¤®à¤¾à¤¨ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡',
    newPassword: 'à¤¨à¤¯à¤¾ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡',
    confirmNewPassword: 'à¤¨à¤¯à¤¾ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤ªà¥à¤·à¥à¤Ÿà¤¿ à¤•à¤°à¥‡à¤‚',
    passwordRules:
      'à¤®à¤œà¤¬à¥‚à¤¤ à¤ªà¤¾à¤¸à¤µà¤°à¥à¤¡ à¤®à¥‡à¤‚ à¤¸à¤¾à¤¤ à¤…à¤•à¥à¤·à¤° à¤”à¤° à¤‡à¤¨ à¤šà¤¾à¤° à¤®à¥‡à¤‚ à¤¸à¥‡ à¤¤à¥€à¤¨ à¤¹à¥‹à¤¨à¥‡ à¤šà¤¾à¤¹à¤¿à¤: uppercase / lowercase / number / symbol [!@#$%^&*()_+]. à¤‡à¤¸à¤®à¥‡à¤‚ quotes, username, "<", à¤¯à¤¾ | à¤¨à¤¹à¥€à¤‚ à¤¹à¥‹à¤¨à¤¾ à¤šà¤¾à¤¹à¤¿à¤à¥¤',
    enableTwoFactor:
      'à¤Ÿà¥‚-à¤«à¥ˆà¤•à¥à¤Ÿà¤° à¤‘à¤¥à¥‡à¤‚à¤Ÿà¤¿à¤•à¥‡à¤¶à¤¨ à¤šà¤¾à¤²à¥‚ à¤•à¤°à¥‡à¤‚',
    occupation: 'à¤ªà¥‡à¤¶à¤¾',
    startDate: 'à¤†à¤°à¤‚à¤­ à¤¤à¤¾à¤°à¥€à¤–',
    seniority: 'à¤¸à¥€à¤¨à¤¿à¤¯à¤°à¤¿à¤Ÿà¥€',
    primaryEarning: 'à¤®à¥à¤–à¥à¤¯ à¤•à¤®à¤¾à¤ˆ',
    payGroup: 'à¤ªà¥‡ à¤—à¥à¤°à¥à¤ª',
    taxProvince: 'à¤Ÿà¥ˆà¤•à¥à¤¸ à¤ªà¥à¤°à¤¾à¤‚à¤¤',
    wcbNumber: 'WCB à¤¨à¤‚à¤¬à¤°',
    federal: 'à¤«à¥‡à¤¡à¤°à¤²',
    provincial: 'à¤ªà¥à¤°à¤¾à¤‚à¤¤à¥€à¤¯',
    legalFirstName: 'à¤•à¤¾à¤¨à¥‚à¤¨à¥€ à¤ªà¤¹à¤²à¤¾ à¤¨à¤¾à¤®',
    middleName: 'à¤®à¤§à¥à¤¯ à¤¨à¤¾à¤®',
    legalLastName: 'à¤•à¤¾à¤¨à¥‚à¤¨à¥€ à¤…à¤‚à¤¤à¤¿à¤® à¤¨à¤¾à¤®',
    streetAddress: 'à¤¸à¤¡à¤¼à¤• à¤ªà¤¤à¤¾',
    city: 'à¤¶à¤¹à¤°',
    province: 'à¤ªà¥à¤°à¤¾à¤‚à¤¤',
    postalCode: 'à¤ªà¥‹à¤¸à¥à¤Ÿà¤² à¤•à¥‹à¤¡',
    loadError:
      'à¤¡à¥‡à¤Ÿà¤¾à¤¬à¥‡à¤¸ à¤¸à¥‡ à¤¡à¥‡à¤Ÿà¤¾ à¤²à¥‹à¤¡ à¤¨à¤¹à¥€à¤‚ à¤¹à¥à¤†à¥¤ à¤¸à¤°à¥à¤µà¤° à¤”à¤° seed data à¤œà¤¾à¤‚à¤šà¥‡à¤‚à¥¤'
  },
  gu: {
    loginEmailTitle: 'àª‡àª®à«‡àª‡àª² àª¸àª°àª¨àª¾àª®àª¾àª¥à«€ àª²à«‹àª— àª‡àª¨ àª•àª°à«‹',
    loginCustomerTitle: 'àª•àª¸à«àªŸàª®àª° ID àª¥à«€ àª²à«‹àª— àª‡àª¨ àª•àª°à«‹',
    email: 'àª‡àª®à«‡àª‡àª²',
    customerId: 'àª•àª¸à«àªŸàª®àª° ID',
    employeeNumber: 'àª•àª°à«àª®àªšàª¾àª°à«€ àª¨àª‚àª¬àª°',
    password: 'àªªàª¾àª¸àªµàª°à«àª¡',
    forgotPassword: 'àªªàª¾àª¸àªµàª°à«àª¡ àª­à«‚àª²à«€ àª—àª¯àª¾?',
    view: 'àªœà«àª“',
    rememberEmail: 'àª‡àª®à«‡àª‡àª² àª¯àª¾àª¦ àª°àª¾àª–à«‹',
    login: 'àª²à«‹àª— àª‡àª¨',
    or: 'àª…àª¥àªµàª¾',
    loginWithCustomerId: 'àª•àª¸à«àªŸàª®àª° ID àª¥à«€ àª²à«‹àª— àª‡àª¨',
    loginWithEmail: 'àª‡àª®à«‡àª‡àª²àª¥à«€ àª²à«‹àª— àª‡àª¨',
    loginError:
      'àª²à«‹àª—àª¿àª¨ àª¨àª¿àª·à«àª«àª³. seeded credentials àª¤àªªàª¾àª¸à«‹ àª…àª¥àªµàª¾ seed script àªšàª²àª¾àªµà«‹.',
    home: 'àª¹à«‹àª®',
    pay: 'àªªàª—àª¾àª°',
    documents: 'àª¦àª¸à«àª¤àª¾àªµà«‡àªœà«‹',
    profile: 'àªªà«àª°à«‹àª«àª¾àª‡àª²',
    collapse: 'àª¸àª‚àª•à«‹àªšà«‹',
    notifications: 'àª¸à«‚àªšàª¨àª¾àª“',
    help: 'àª®àª¦àª¦',
    logout: 'àª²à«‹àª— àª†àª‰àªŸ',
    company: 'àª•àª‚àªªàª¨à«€',
    loggedIntoPersonal: 'àªµà«àª¯àª•à«àª¤àª¿àª—àª¤ àª–àª¾àª¤àª¾àª®àª¾àª‚ àª²à«‹àª— àª‡àª¨',
    startEmailLogin: 'àª¨àªµà«àª‚ àª‡àª®à«‡àª‡àª² àª²à«‹àª—àª¿àª¨ àª¶àª°à«‚ àª•àª°à«‹',
    emailLogin: 'àª‡àª®à«‡àª‡àª² àª²à«‹àª—àª¿àª¨',
    accountSwitcher:
      'àªàª•àª¾àª‰àª¨à«àªŸ àª¸à«àªµàª¿àªšàª° - àª˜àª£àª¾ àªàª•àª¾àª‰àª¨à«àªŸ àªµàªšà«àªšà«‡ àªœàª¾àª“',
    getStarted: 'àª¶àª°à«‚ àª•àª°à«‹',
    hello: 'àª¨àª®àª¸à«àª¤à«‡',
    person: 'àªµà«àª¯àª•à«àª¤àª¿',
    mail: 'àª®à«‡àª‡àª²',
    doc: 'àª¦àª¸à«àª¤àª¾àªµà«‡àªœ',
    lastPay: 'àª›à«‡àª²à«àª²à«‹ àªªàª—àª¾àª°',
    noPayStatements: 'àª•à«‹àªˆ payslip àª¨àª¥à«€',
    taxForms: 'àªŸà«‡àª•à«àª¸ àª«à«‹àª°à«àª®à«àª¸',
    companyBulletins: 'àª•àª‚àªªàª¨à«€ àª¬à«àª²à«‡àªŸàª¿àª¨',
    noBulletins: 'àª¹àª¾àª²àª®àª¾àª‚ àª•à«‹àªˆ àª¬à«àª²à«‡àªŸàª¿àª¨ àª¨àª¥à«€.',
    payStatements: 'àªªàª—àª¾àª° àª¸à«àªŸà«‡àªŸàª®à«‡àª¨à«àªŸ',
    selectYear: 'àªµàª°à«àª· àªªàª¸àª‚àª¦ àª•àª°à«‹',
    downloadSelected: 'àªªàª¸àª‚àª¦ àª•àª°à«‡àª² àª¡àª¾àª‰àª¨àª²à«‹àª¡',
    payDate: 'àªªàª—àª¾àª° àª¤àª¾àª°à«€àª–',
    payPeriod: 'àªªàª—àª¾àª° àª…àªµàª§àª¿',
    type: 'àªªà«àª°àª•àª¾àª°',
    netPay: 'àª¨à«‡àªŸ àªªàª—àª¾àª°',
    downloadPdf: 'PDF àª¡àª¾àª‰àª¨àª²à«‹àª¡',
    hoverToView: 'àªœà«‹àªµàª¾ àª®àª¾àªŸà«‡ hover àª•àª°à«‹',
    payStatement: 'àªªàª—àª¾àª° àª¸à«àªŸà«‡àªŸàª®à«‡àª¨à«àªŸ',
    yearToDate: 'àªµàª°à«àª·àª¥à«€ àª†àªœ àª¸à«àª§à«€',
    grossEarnings: 'àª•à«àª² àª•àª®àª¾àª£à«€',
    deductions: 'àª•àªªàª¾àª¤',
    additionalInfo: 'àªµàª§àª¾àª°àª¾àª¨à«€ àª®àª¾àª¹àª¿àª¤à«€',
    noDbPay:
      'àª¡à«‡àªŸàª¾àª¬à«‡àªàª®àª¾àª‚ àª•à«‹àªˆ àªªàª—àª¾àª° àª¸à«àªŸà«‡àªŸàª®à«‡àª¨à«àªŸ àª®àª³à«àª¯à«àª‚ àª¨àª¥à«€.',
    taxFormType: 'àªŸà«‡àª•à«àª¸ àª«à«‹àª°à«àª® àªªà«àª°àª•àª¾àª°',
    taxYear: 'àªŸà«‡àª•à«àª¸ àªµàª°à«àª·',
    reset: 'àª°à«€àª¸à«‡àªŸ',
    save: 'àª¸à«‡àªµ',
    personalInformation: 'àªµà«àª¯àª•à«àª¤àª¿àª—àª¤ àª®àª¾àª¹àª¿àª¤à«€',
    emergencyContacts: 'àª‡àª®àª°àªœàª¨à«àª¸à«€ àª¸àª‚àªªàª°à«àª•à«‹',
    employeeInformation: 'àª•àª°à«àª®àªšàª¾àª°à«€ àª®àª¾àª¹àª¿àª¤à«€',
    loginInformation: 'àª²à«‹àª—àª¿àª¨ àª®àª¾àª¹àª¿àª¤à«€',
    twoFactorAuthentication: 'àªŸà«‚-àª«à«‡àª•à«àªŸàª° àª“àª¥à«‡àª¨à«àªŸàª¿àª•à«‡àª¶àª¨',
    username: 'àª¯à«àªàª°àª¨à«‡àª®',
    currentPassword: 'àªµàª°à«àª¤àª®àª¾àª¨ àªªàª¾àª¸àªµàª°à«àª¡',
    newPassword: 'àª¨àªµà«‹ àªªàª¾àª¸àªµàª°à«àª¡',
    confirmNewPassword: 'àª¨àªµà«‹ àªªàª¾àª¸àªµàª°à«àª¡ àª–àª¾àª¤àª°à«€ àª•àª°à«‹',
    passwordRules:
      'àª®àªœàª¬à«‚àª¤ àªªàª¾àª¸àªµàª°à«àª¡àª®àª¾àª‚ àª¸àª¾àª¤ àª…àª•à«àª·àª° àª…àª¨à«‡ àª† àªšàª¾àª°àª®àª¾àª‚àª¥à«€ àª¤à«àª°àª£ àª¹à«‹àªµàª¾ àªœà«‹àªˆàª: uppercase / lowercase / number / symbol [!@#$%^&*()_+]. quotes, username, "<", àª…àª¥àªµàª¾ | àª¨ àª¹à«‹àªµà«àª‚ àªœà«‹àªˆàª.',
    enableTwoFactor:
      'àªŸà«‚-àª«à«‡àª•à«àªŸàª° àª“àª¥à«‡àª¨à«àªŸàª¿àª•à«‡àª¶àª¨ àªšàª¾àª²à« àª•àª°à«‹',
    occupation: 'àªµà«àª¯àªµàª¸àª¾àª¯',
    startDate: 'àª¶àª°à«‚ àª¤àª¾àª°à«€àª–',
    seniority: 'àª¸à«€àª¨àª¿àª¯à«‹àª°àª¿àªŸà«€',
    primaryEarning: 'àª®à«àª–à«àª¯ àª•àª®àª¾àª£à«€',
    payGroup: 'àªªà«‡ àª—à«àª°à«àªª',
    taxProvince: 'àªŸà«‡àª•à«àª¸ àªªà«àª°àª¾àª‚àª¤',
    wcbNumber: 'WCB àª¨àª‚àª¬àª°',
    federal: 'àª«à«‡àª¡àª°àª²',
    provincial: 'àªªà«àª°à«‹àªµàª¿àª¨à«àª¶àª¿àª¯àª²',
    legalFirstName: 'àª•àª¾àª¨à«‚àª¨à«€ àªªà«àª°àª¥àª® àª¨àª¾àª®',
    middleName: 'àª®àª§à«àª¯ àª¨àª¾àª®',
    legalLastName: 'àª•àª¾àª¨à«‚àª¨à«€ àª›à«‡àª²à«àª²à«àª‚ àª¨àª¾àª®',
    streetAddress: 'àª¸àª°àª¨àª¾àª®à«àª‚',
    city: 'àª¶àª¹à«‡àª°',
    province: 'àªªà«àª°àª¾àª‚àª¤',
    postalCode: 'àªªà«‹àª¸à«àªŸàª² àª•à«‹àª¡',
    loadError:
      'àª¡à«‡àªŸàª¾àª¬à«‡àªàª®àª¾àª‚àª¥à«€ àª¡à«‡àªŸàª¾ àª²à«‹àª¡ àª¥àª¯à«‹ àª¨àª¥à«€. àª¸àª°à«àªµàª° àª…àª¨à«‡ seed data àª¤àªªàª¾àª¸à«‹.'
  },
  pa: {},
  es: {}
};
messages.pa = { ...messages.en };
messages.es = {
  ...messages.en,
  login: 'Iniciar sesion',
  home: 'Inicio',
  pay: 'Pago',
  documents: 'Documentos',
  profile: 'Perfil',
  logout: 'Salir',
  hello: 'Hola',
  downloadSelected: 'Descargar seleccionados',
  downloadPdf: 'Descargar PDF',
  taxForms: 'Formularios fiscales',
  payStatements: 'RECIBOS DE PAGO',
  hoverToView: 'Pasar para ver'
};

async function api<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch (cause) {
    const error = new Error(
      'Cannot reach the Payhours server. Start the backend and confirm MongoDB Atlas access.'
    ) as Error & { status?: number; cause?: unknown };
    error.status = 0;
    error.cause = cause;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(await response.text()) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

function formatDate(value: string, lang: Lang) {
  return new Date(value).toLocaleDateString(localeByLang[lang], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function loginErrorMessage(error: unknown, fallback: string) {
  return (error as { status?: number }).status === 0
    ? 'Cannot reach the Payhours server. Start the backend and confirm MongoDB Atlas access.'
    : fallback;
}

function LanguageSelect({ lang, setLang }: { lang: Lang; setLang: (lang: Lang) => void }) {
  return (
    <select
      className="language-select"
      value={lang}
      onChange={(event) => setLang(event.target.value as Lang)}
    >
      {Object.entries(languageNames).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}

function downloadPdf(path: string, token: string) {
  window.open(`${apiBase}${path}?token=${encodeURIComponent(token)}`, '_blank');
}

type ReportExportFormat = 'pdf' | 'excel' | 'csv';

function reportFilename(title: string, extension: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'report'}.${extension}`;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tableText(cell: HTMLTableCellElement) {
  return Array.from(cell.childNodes)
    .map((node) => node.textContent || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tableMatrix(table: HTMLTableElement) {
  return Array.from(table.rows).map((row) =>
    Array.from(row.cells).map((cell) => tableText(cell as HTMLTableCellElement))
  );
}

function elementText(element: Element | null) {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function reportDetailRows(container: Element | null, trigger: Element): Array<[string, string]> {
  if (!container) return [];
  const page = trigger.closest('.payroll-report-page') || container;
  const details: Array<[string, string]> = [];
  const add = (label: string, value: string) => {
    const cleanLabel = label.replace(/\s+/g, ' ').trim();
    const cleanValue = value.replace(/\s+/g, ' ').trim();
    if (cleanLabel && cleanValue && !details.some(([existingLabel]) => existingLabel === cleanLabel)) {
      details.push([cleanLabel, cleanValue]);
    }
  };

  const pageTitle = elementText(page.querySelector('.reports-head h1'));
  const pageDescription = elementText(page.querySelector('.reports-head p'));
  add('Report', pageTitle);
  add('Description', pageDescription);

  const employeeHero = page.querySelector('.employee-detail-hero');
  if (employeeHero) {
    add('Employee', elementText(employeeHero.querySelector('h2')));
    add('Employee details', elementText(employeeHero.querySelector('h2')?.parentElement?.querySelector('p') || null));
    add('Employment', elementText(employeeHero.querySelector('small')));
    Array.from(employeeHero.querySelectorAll('p')).forEach((item, index) => {
      const label = elementText(item.querySelector('b'));
      const value = label ? elementText(item).replace(label, '').trim() : elementText(item);
      add(label || ['Email', 'Phone', 'Location'][index] || 'Contact', value);
    });
  }

  Array.from(page.querySelectorAll('.payroll-report-filters label, .employee-detail-selectors label')).forEach((label) => {
    const clone = label.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('select').forEach((select) => {
      const selected = select as HTMLSelectElement;
      select.replaceWith(selected.selectedOptions[0]?.textContent || selected.value);
    });
    clone.querySelectorAll('input').forEach((input) => input.replaceWith((input as HTMLInputElement).value));
    const fieldLabel =
      Array.from(label.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join(' ')
        .trim() || elementText(label.firstElementChild);
    const value = elementText(clone).replace(fieldLabel, '').trim();
    add(fieldLabel || 'Filter', value);
  });

  Array.from(container.querySelectorAll('.payroll-summary-strip article')).forEach((article) => {
    add(elementText(article.querySelector('span')), elementText(article.querySelector('strong')));
  });

  return details;
}

function reportDetailsHtml(details: Array<[string, string]>) {
  if (!details.length) return '';
  return `<section class="report-details">${details
    .map(([label, value]) => `<p><strong>${htmlEscape(label)}</strong><span>${htmlEscape(value)}</span></p>`)
    .join('')}</section>`;
}

function exportReportTable(
  format: ReportExportFormat,
  title: string,
  event: MouseEvent<HTMLButtonElement>
) {
  const container = event.currentTarget.closest('.payroll-report-main');
  const tables = Array.from(container?.querySelectorAll('table') || []);
  if (!tables.length) return;
  const tableGroups = tables.map((table) => tableMatrix(table));
  const details = reportDetailRows(container, event.currentTarget);
  if (format === 'csv') {
    downloadTextFile(
      reportFilename(title, 'csv'),
      'text/csv;charset=utf-8',
      [
        details.map((row) => row.map(csvEscape).join(',')).join('\n'),
        tableGroups
        .map((rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\n'))
        .join('\n\n')
      ].filter(Boolean).join('\n\n')
    );
    return;
  }
  const tablesHtml = tableGroups
    .map((rows) => `<table><tbody>${rows.map((row, rowIndex) => `<tr>${row.map((cell) => rowIndex === 0 ? `<th>${htmlEscape(cell)}</th>` : `<td>${htmlEscape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0b2755}h1{font-size:22px;margin:0 0 14px}.report-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px;margin:0 0 18px;font-size:12px}.report-details p{margin:0;border:1px solid #d9e2ec;padding:8px}.report-details strong{display:block;color:#385577;font-size:11px;margin-bottom:3px}.report-details span{display:block;color:#0b2755}table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:18px}th,td{border:1px solid #cfd8e3;padding:8px;text-align:left;vertical-align:top}th{background:#edf4fb;font-weight:700}tfoot td,tr:last-child td{font-weight:600}@media print{.report-details{grid-template-columns:repeat(2,minmax(0,1fr))}}</style></head><body><h1>${htmlEscape(title)}</h1>${reportDetailsHtml(details)}${tablesHtml}${format === 'pdf' ? '<script>window.print()</script>' : ''}</body></html>`;
  if (format === 'excel') {
    downloadTextFile(reportFilename(title, 'xls'), 'application/vnd.ms-excel;charset=utf-8', html);
    return;
  }
  const popup = window.open('', '_blank');
  if (popup) {
    popup.document.write(html);
    popup.document.close();
  }
}

function ReportExportButtons({ title }: { title: string }) {
  return (
    <div className="report-export">
      <button type="button" onClick={(event) => exportReportTable('pdf', title, event)}>PDF</button>
      <button type="button" onClick={(event) => exportReportTable('excel', title, event)}>Excel</button>
      <button type="button" onClick={(event) => exportReportTable('csv', title, event)}>CSV</button>
    </div>
  );
}

async function downloadSelectedPayslips(ids: string[], token: string) {
  const response = await fetch(`${apiBase}/employee/pay-statements/download-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids })
  });
  if (!response.ok) throw new Error('Selected payslip download failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'payhours-selected-payslips.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Logo({ word = 'Payhours' }: { word?: string }) {
  return (
    <div className="logo" aria-label={word}>
      <span className="logo-mark" aria-hidden="true">
        <span />
      </span>
      <span>
        <span className="logo-word">{word}</span>
        <small>Payroll Made Simple</small>
      </span>
    </div>
  );
}

function HiddenAmount({ value, t }: { value: string; t: T }) {
  const [shown, setShown] = useState(false);
  return (
    <button
      className="hidden-amount"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onClick={() => setShown((current) => !current)}
    >
      {shown ? `$${value}` : t('hoverToView')}
    </button>
  );
}

function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={clsx('footer', compact && 'compact')}>
      EULA | Privacy | (c) Payhours Inc., {currentYear}
    </footer>
  );
}

function Login({
  onLogin,
  lang,
  setLang,
  t
}: {
  onLogin: (token: string, portal: Portal, employerCompanies?: EmployerCompanyChoice[]) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
}) {
  const [portal, setPortal] = useState<Portal>('employer');
  const [mode, setMode] = useState<LoginMode>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('admin@abcsolutions.ca');
  const [customerId, setCustomerId] = useState('ABC001');
  const [employeeNumber, setEmployeeNumber] = useState('E1001');
  const [password, setPassword] = useState('Payhours1!');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit() {
    try {
      setError('');
      let result: { token: string; companies?: EmployerCompanyChoice[] };
      if (portal === 'employer') {
        result = await api<{ token: string; companies?: EmployerCompanyChoice[] }>(
          '/employer/auth/login',
          undefined,
          { method: 'POST', body: JSON.stringify({ email, password }) }
        );
      } else {
        result =
          mode === 'email'
            ? await api<{ token: string }>('/auth/login', undefined, {
                method: 'POST',
                body: JSON.stringify({ email, password })
              })
            : await api<{ token: string }>('/auth/login-customer-id', undefined, {
                method: 'POST',
                body: JSON.stringify({ customerId, employeeNumber, password })
              });
      }
      localStorage.setItem('payhours-token', result.token);
      localStorage.setItem('payhours-portal', portal);
      onLogin(result.token, portal, portal === 'employer' ? result.companies : undefined);
    } catch (error) {
      setError(loginErrorMessage(error, t('loginError')));
    }
  }
  async function forgotPassword() {
    setError('');
    setNotice('');
    await api<{ message: string }>('/auth/forgot-password', undefined, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    setNotice('If that account exists, a reset email has been sent.');
  }
  return (
    <main className="employer-login">
      <section className="login-story">
        <Logo />
        <div>
          <h1>
            Simple Payroll.
            <br />
            Happier People.
          </h1>
          <p>
            Manage your team, hours, pay and compliance with an easy-to-use Canadian payroll
            solution.
          </p>
        </div>
        <ul>
          <li>
            <b>Employees</b>
            <span>Keep your team information organized</span>
          </li>
          <li>
            <b>Time & Attendance</b>
            <span>Track hours and manage leaves</span>
          </li>
          <li>
            <b>Payroll</b>
            <span>Accurate and on-time payments</span>
          </li>
          <li>
            <b>Compliance</b>
            <span>T4, ROE, government filings and more</span>
          </li>
        </ul>
        <p className="canada">Built for Canadian Businesses</p>
      </section>
      <section className="login-side">
        <div className="login-tools">
          <LanguageSelect lang={lang} setLang={setLang} />
        </div>
        <div className="employer-card">
          <h2>
            Welcome to
            <br />
            <strong>Payhours</strong>
          </h2>
          <p>Sign in to your account</p>
          <div className="portal-tabs">
            <button
              className={portal === 'employer' ? 'active' : ''}
              onClick={() => {
                setPortal('employer');
                setEmail('admin@abcsolutions.ca');
              }}
            >
              Employer
            </button>
            <button
              className={portal === 'employee' ? 'active' : ''}
              onClick={() => {
                setPortal('employee');
                setEmail('rahul.sharma@abcsolutions.ca');
              }}
            >
              Employee
            </button>
          </div>
          {portal === 'employee' && mode === 'customer' ? (
            <>
              <label>
                {t('customerId')}
                <input value={customerId} onChange={(event) => setCustomerId(event.target.value)} />
              </label>
              <label>
                {t('employeeNumber')}
                <input
                  value={employeeNumber}
                  onChange={(event) => setEmployeeNumber(event.target.value)}
                />
              </label>
            </>
          ) : (
            <label>
              Email address
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
          )}
          <div className="field-row">
            <span>{t('password')}</span>
            <button type="button" className="link-button" onClick={forgotPassword}>
              {t('forgotPassword')}
            </button>
          </div>
          <label className="password-input">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              View
            </button>
          </label>
          <label className="check">
            <input type="checkbox" />
            Remember me
          </label>
          {notice && <p className="success-note">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary blue" onClick={submit}>
            Sign In
          </button>
          {portal === 'employee' && (
            <button
              className="secondary"
              onClick={() => setMode(mode === 'email' ? 'customer' : 'email')}
            >
              {mode === 'email' ? t('loginWithCustomerId') : t('loginWithEmail')}
            </button>
          )}
          <p className="admin-contact">
            <a href="/payhours-admin">Payhours Super Admin Login</a>
          </p>
          <p className="admin-contact">
            Don't have an account? <b>Contact your administrator.</b>
          </p>
        </div>
        <Footer compact />
      </section>
    </main>
  );
}

function SuperAdminLogin({ onLogin }: { onLogin: (token: string, portal: Portal) => void }) {
  const [email, setEmail] = useState('superadmin@payhours.ca');
  const [password, setPassword] = useState('Payhours1!');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit() {
    try {
      setError('');
      const result = await api<{ token: string }>('/payhours-admin/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('payhours-token', result.token);
      localStorage.setItem('payhours-portal', 'super-admin');
      onLogin(result.token, 'super-admin');
    } catch (error) {
      setError(
        loginErrorMessage(
          error,
          'Super admin login failed. Check your Payhours administrator credentials.'
        )
      );
    }
  }
  async function forgotPassword() {
    setError('');
    setNotice('');
    await api<{ message: string }>('/auth/forgot-password', undefined, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    setNotice('If that account exists, a reset email has been sent.');
  }
  return (
    <main className="employer-login super-admin-login">
      <section className="login-story">
        <Logo />
        <div>
          <p className="super-eyebrow">Payhours Internal Access</p>
          <h1>Super Admin Portal</h1>
          <p>
            Manage platform users, roles, permissions, employers and compliance controls from a
            dedicated Payhours staff workspace.
          </p>
        </div>
        <ul>
          <li>
            <b>Platform Administration</b>
            <span>Manage Payhours roles and system access</span>
          </li>
          <li>
            <b>Users & Permissions</b>
            <span>Review staff, employer users and policies</span>
          </li>
          <li>
            <b>Audit Oversight</b>
            <span>Track activity and security events</span>
          </li>
          <li>
            <b>Employer Operations</b>
            <span>Support account setup and configuration</span>
          </li>
        </ul>
        <p className="canada">Restricted to Payhours administrators</p>
      </section>
      <section className="login-side">
        <form
          className="employer-card"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <h2>
            Super Admin
            <br />
            <strong>Sign In</strong>
          </h2>
          <p>Use your Payhours administrator account</p>
          <label>
            Email address
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <div className="field-row">
            <span>Password</span>
            <button type="button" className="link-button" onClick={forgotPassword}>
              Forgot your password?
            </button>
          </div>
          <label className="password-input">
            <input
              value={password}
              onChange={(event) => setPassword((event.target as HTMLInputElement).value)}
              type={showPassword ? 'text' : 'password'}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)}>
              View
            </button>
          </label>
          {notice && <p className="success-note">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary blue" type="submit">
            Enter Super Admin
          </button>
          <a className="regular-login-link" href="/">
            Employer / Employee Login
          </a>
        </form>
        <Footer compact />
      </section>
    </main>
  );
}

function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api<{ message: string }>('/auth/reset-password', undefined, {
        method: 'POST',
        body: JSON.stringify({ token, newPassword, confirmPassword })
      });
      setMessage('Password reset complete. You can sign in with your new password.');
    } catch {
      setError('Reset link is invalid, expired, or the password does not meet the rules.');
    }
  }
  return (
    <main className="employer-login">
      <section className="login-story">
        <Logo />
        <div>
          <h1>Reset Password</h1>
          <p>Choose a new password for your Payhours account.</p>
        </div>
      </section>
      <section className="login-side">
        <form className="employer-card" onSubmit={submit}>
          <h2>
            Set New
            <br />
            <strong>Password</strong>
          </h2>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          {message && <p className="success-note">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary blue" type="submit">
            Reset Password
          </button>
          <a className="regular-login-link" href="/">
            Back to sign in
          </a>
        </form>
        <Footer compact />
      </section>
    </main>
  );
}
function Shell({
  children,
  page,
  setPage,
  onBack,
  companies,
  current,
  bulletins,
  unreadNotificationCount,
  lang,
  setLang,
  onLogout,
  t
}: {
  children: React.ReactNode;
  page: Page;
  setPage: (page: Page) => void;
  onBack: () => void;
  companies: CompanyChoice[];
  current?: EmployeeProfile;
  bulletins: Bulletin[];
  unreadNotificationCount: number;
  lang: Lang;
  setLang: (lang: Lang) => void;
  onLogout: () => void;
  t: T;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const company = current?.company;
  const nav: Array<[Page, string]> = [
    ['home', 'home'],
    ['pay', 'pay'],
    ['documents', 'documents'],
    ['profile', 'profile']
  ];
  return (
    <div className="app-shell employee-shell">
      <aside className={clsx('sidebar', collapsed && 'collapsed')}>
        <Logo />
        {nav.map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>
            <span>{t(label).charAt(0)}</span>
            {!collapsed && t(label)}
          </button>
        ))}
        <button className="collapse" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '>' : `< ${t('collapse')}`}
        </button>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button title={t('notifications')} onClick={() => setPage('notifications')}>
            {t('notifications')}
            {unreadNotificationCount > 0 && (
              <span className="notification-count">{unreadNotificationCount}</span>
            )}
          </button>
          <button title={t('help')} onClick={() => setPage('help')}>
            {t('help')}
          </button>
          <LanguageSelect lang={lang} setLang={setLang} />
          <button className="company-pill" onClick={() => setSwitcher((value) => !value)}>
            {(company?.legalName || t('company')).slice(0, 13)}... v
          </button>
          <button title={t('logout')} onClick={onLogout}>
            {t('logout')}
          </button>
          {switcher && (
            <div className="switcher">
              <strong>
                {company?.legalName} - {company?.customerId} | {t('loggedIntoPersonal')}
              </strong>
              <h3>{t('startEmailLogin')}</h3>
              <p>{t('emailLogin')}</p>
              <p>{t('accountSwitcher')}</p>
              <a onClick={() => setPage('profile')}>{t('getStarted')}</a>
              {companies.map((choice) => (
                <button key={choice.employeeId}>
                  {choice.companyName} - {choice.customerId}
                </button>
              ))}
            </div>
          )}
        </header>
        <main className="content">
          {page !== 'home' && (
            <button className="employee-back" onClick={onBack}>
              Back
            </button>
          )}
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}

function Home({
  setPage,
  profile,
  payStatements,
  lang,
  t
}: {
  setPage: (page: Page) => void;
  profile?: EmployeeProfile;
  payStatements: PayStatement[];
  lang: Lang;
  t: T;
}) {
  const latest = payStatements[0];
  return (
    <div className="grid-home">
      <section className="hello-card">
        <p>
          {t('hello')}, <em>{profile?.legalFirstName || 'Employee'}</em>
        </p>
        <h1>
          {profile?.legalFirstName} {profile?.legalLastName}
        </h1>
      </section>
      <button className="tile" onClick={() => setPage('profile')}>
        <span>{t('person')}</span>
        <b>{t('profile')}</b>
      </button>
      <button className="tile pay-tile" onClick={() => setPage('payDetail')} disabled={!latest}>
        <span>
          {latest?.isUnread && <i>*</i>}
          {t('mail')}
        </span>
        <b>
          {t('lastPay')}: {latest ? formatDate(latest.payDate, lang) : t('noPayStatements')}
        </b>
      </button>
      <button className="tile" onClick={() => setPage('taxForms')}>
        <span>{t('doc')}</span>
        <b>{t('taxForms')}</b>
      </button>
    </div>
  );
}

function Notifications({
  bulletins,
  lang,
  t,
  onRead,
  onReadAll
}: {
  bulletins: Bulletin[];
  lang: Lang;
  t: T;
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  const unreadCount = bulletins.filter((bulletin) => !bulletin.isRead).length;
  return (
    <section className="panel notifications-page">
      <div className="toolbar">
        <h1>{t('notifications')}</h1>
        <button disabled={!unreadCount} onClick={onReadAll}>Mark all as read</button>
      </div>
      <h2>{t('companyBulletins')}</h2>
      {bulletins.length ? (
        <div className="notification-list">
          {bulletins.map((bulletin) => (
            <article className={bulletin.isRead ? 'read' : 'unread'} key={bulletin.id}>
              {!bulletin.isRead && <span className="unread-dot" aria-label="Unread" />}
              <strong>{bulletin.title}</strong>
              <p>{bulletin.body}</p>
              <small>
                {bulletin.postedBy || 'Payroll'} | {formatDate(bulletin.postedAt, lang)}
              </small>
              {!bulletin.isRead && <button onClick={() => onRead(bulletin.id)}>Mark as read</button>}
            </article>
          ))}
        </div>
      ) : (
        <p>{t('noBulletins')}</p>
      )}
    </section>
  );
}

function Toolbar({
  title,
  t,
  years = [2024],
  selectedYear,
  onYearChange
}: {
  title: string;
  t: T;
  years?: number[];
  selectedYear?: number;
  onYearChange?: (year: number) => void;
}) {
  return (
    <div className="toolbar">
      <h1>{title}</h1>
      <label>
        {t('selectYear')}
        <select
          value={selectedYear ?? years[0]}
          onChange={(event) => onYearChange?.(Number(event.target.value))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <button>...</button>
    </div>
  );
}

function Pay({
  setPage,
  onSelect,
  token,
  payStatements,
  lang,
  t
}: {
  setPage: (page: Page) => void;
  onSelect: (id: string) => void;
  token: string;
  payStatements: PayStatement[];
  lang: Lang;
  t: T;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const years = [...new Set(payStatements.map((statement) => statement.payPeriodYear))].sort(
    (a, b) => b - a
  );
  const [selectedYear, setSelectedYear] = useState<number>();
  useEffect(() => {
    if (years.length && !years.includes(selectedYear || 0)) setSelectedYear(years[0]);
  }, [payStatements, selectedYear, years]);
  const visibleStatements = selectedYear
    ? payStatements.filter((statement) => statement.payPeriodYear === selectedYear)
    : payStatements;
  const showStatePay = visibleStatements.some(
    (statement) => Number(payStatementEarning(statement, 'STATE')) > 0
  );
  const view = (id: string) => {
    onSelect(id);
    setPage('payDetail');
  };
  return (
    <section className="panel">
      <Toolbar
        title={t('payStatements')}
        t={t}
        years={years.length ? years : [new Date().getFullYear()]}
        selectedYear={selectedYear}
        onYearChange={(year) => {
          setSelectedYear(year);
          setSelected([]);
        }}
      />
      <button
        className="download-selected"
        disabled={!selected.length}
        onClick={() => downloadSelectedPayslips(selected, token)}
      >
        {t('downloadSelected')}
      </button>
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={
                  selected.length === visibleStatements.length && visibleStatements.length > 0
                }
                onChange={(event) =>
                  setSelected(event.target.checked ? visibleStatements.map((p) => p.id) : [])
                }
              />
            </th>
            <th>{t('payDate')}</th>
            <th>{t('payPeriod')}</th>
            <th>{t('type')}</th>
            <th>Vacation Pay</th>
            {showStatePay && <th>State Holiday Pay</th>}
            <th>{t('netPay')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visibleStatements.map((p) => (
            <tr key={p.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() =>
                    setSelected(
                      selected.includes(p.id)
                        ? selected.filter((id) => id !== p.id)
                        : [...selected, p.id]
                    )
                  }
                />
              </td>
              <td>
                <a onClick={() => view(p.id)}>{formatDate(p.payDate, lang)}</a>
              </td>
              <td>
                {p.periodStart && p.periodEnd
                  ? `${formatDate(p.periodStart, lang)} - ${formatDate(p.periodEnd, lang)}`
                  : p.payPeriodNumber}
              </td>
              <td>{p.type}</td>
              <td>{moneyText(payStatementEarning(p, 'VAC'))}</td>
              {showStatePay && <td>{moneyText(payStatementEarning(p, 'STATE'))}</td>}
              <td>
                <HiddenAmount value={p.netPay} t={t} />
              </td>
              <td>
                <button
                  onClick={() => downloadPdf(`/employee/pay-statements/${p.id}/download`, token)}
                >
                  {t('downloadPdf')}
                </button>
                <button onClick={() => view(p.id)}>{' >'.trim()}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PayDetail({
  token,
  payStatements,
  selectedId,
  onSelect,
  employee,
  lang,
  t
}: {
  token: string;
  payStatements: PayStatement[];
  selectedId?: string;
  onSelect: (id: string) => void;
  employee?: EmployeeProfile;
  lang: Lang;
  t: T;
}) {
  const [openSection, setOpenSection] = useState<string>('earnings');
  const statement = payStatements.find((item) => item.id === selectedId) || payStatements[0];
  if (!statement) return <section className="panel">{t('noDbPay')}</section>;
  const depositAccount = statement.additionalInfo.find(
    (line) => line.key === 'Deposit Account'
  )?.value;
  const otherAdditionalInfo = statement.additionalInfo.filter(
    (line) => line.key !== 'Deposit Account'
  );
  const vacationPay = payStatementEarning(statement, 'VAC');
  const stateHolidayPay = payStatementEarning(statement, 'STATE');
  const statePayExplanation = statement.additionalInfo.find(
    (line) => line.key === 'State Holiday Pay Rule'
  )?.value;
  const earningLines = displayEarningLines(statement.grossEarnings);
  const deductionLines = displayDeductionLines(statement.deductions);
  return (
    <section className="panel detail payslip-detail">
      <div className="payslip-brand-row">
        <Logo />
        <div>
          <b>{employee ? employeeName(employee) : 'Employee'}</b>
          <small>{employee?.employeeNumber || 'Not available'} | {employee?.adminProfile?.compensation?.payFrequency || employee?.payGroup || 'Not available'}</small>
        </div>
        <button
          onClick={() => downloadPdf(`/employee/pay-statements/${statement.id}/download`, token)}
        >
          {t('downloadPdf')}
        </button>
      </div>
      <div className="detail-head">
        <label>
          {t('payDate')}:
          <select value={statement.id} onChange={(event) => onSelect(event.target.value)}>
            {payStatements.map((p) => (
              <option key={p.id} value={p.id}>
                {formatDate(p.payDate, lang)} - {p.type}
              </option>
            ))}
          </select>
        </label>
        <div>
          <b>{t('netPay').toUpperCase()}</b>
          <strong>{moneyText(statement.netPay)}</strong>
        </div>
        <div>
          <b>{t('yearToDate')}</b>
          <strong>{moneyText(statement.yearToDateNetPay)}</strong>
        </div>
      </div>
      <div className="pay-detail-summary">
        <p>
          <span>Pay period</span>
          <b>
            {statement.periodStart && statement.periodEnd
              ? `${formatDate(statement.periodStart, lang)} - ${formatDate(statement.periodEnd, lang)}`
              : statement.payPeriodNumber}
          </b>
        </p>
        <p>
          <span>Regular hours</span>
          <b>{statement.regularHours}</b>
        </p>
        <p>
          <span>Overtime hours</span>
          <b>{statement.overtimeHours}</b>
        </p>
        {Number(stateHolidayPay) > 0 && (
          <p>
            <span>State holiday hours</span>
            <b>{statement.statePayHours}</b>
          </p>
        )}
        <p>
          <span>Hourly rate</span>
          <b>{moneyText(statement.hourlyRate)}</b>
        </p>
        <p>
          <span>Gross pay</span>
          <b>{moneyText(statement.grossPay)}</b>
        </p>
        <p>
          <span>Vacation pay</span>
          <b>{moneyText(vacationPay)}</b>
        </p>
        {Number(stateHolidayPay) > 0 && (
          <p>
            <span>State holiday pay</span>
            <b>{moneyText(stateHolidayPay)}</b>
          </p>
        )}
        <p>
          <span>Total deductions</span>
          <b>{moneyText(statement.deductionsTotal)}</b>
        </p>
        <p>
          <span>Net pay</span>
          <b>{moneyText(statement.netPay)}</b>
        </p>
        <p>
          <span>Payslip revision</span>
          <b>{statement.revision || 1}</b>
        </p>
        <p>
          <span>Deposit account</span>
          <b>{depositAccount || 'Not available'}</b>
        </p>
      </div>
      {Number(stateHolidayPay) > 0 && statePayExplanation && (
        <p className="state-pay-explanation">
          <b>How state holiday pay was calculated</b>
          {statePayExplanation}
        </p>
      )}
      <div className="employee-pay-sections">
        <section className={openSection === 'earnings' ? 'open' : ''}>
          <button
            className="employee-section-toggle"
            onClick={() => setOpenSection(openSection === 'earnings' ? '' : 'earnings')}
          >
            <span>
              {t('grossEarnings')}
              <small>{earningLines.length} earning lines</small>
            </span>
            <b>{openSection === 'earnings' ? '-' : '+'}</b>
          </button>
          {openSection === 'earnings' && (
            <div className="employee-section-content">
              <div className="pay-breakdown-head">
                <span>Code and description</span>
                <span>Current amount</span>
              </div>
              {earningLines.map((line) => (
                <p key={line.code}>
                  <span>
                    <b>{line.code || 'EARN'}</b>
                    {line.description || 'Payroll earnings'}
                  </span>
                  <strong>{moneyText(line.amount)}</strong>
                </p>
              ))}
            </div>
          )}
        </section>
        <section
          className={`deductions-section ${openSection === 'deductions' ? 'open' : ''}`}
        >
          <button
            className="employee-section-toggle"
            onClick={() => setOpenSection(openSection === 'deductions' ? '' : 'deductions')}
          >
            <span>
              {t('deductions')}
              <small>{deductionLines.length} deduction lines</small>
            </span>
            <b>{openSection === 'deductions' ? '-' : '+'}</b>
          </button>
          {openSection === 'deductions' && (
            <div className="employee-section-content">
              <div className="pay-breakdown-head">
                <span>Deduction and jurisdiction</span>
                <span>Current amount</span>
              </div>
              {deductionLines.map((line) => (
                <p className={line.code === 'TOTAL' ? 'total' : ''} key={line.code}>
                  <span>
                    <b>{line.code || 'DED'}</b>
                    {line.description || 'Payroll deduction'}
                  </span>
                  <strong>{moneyText(line.amount)}</strong>
                </p>
              ))}
            </div>
          )}
        </section>
        <section className={openSection === 'additional' ? 'open' : ''}>
          <button
            className="employee-section-toggle"
            onClick={() => setOpenSection(openSection === 'additional' ? '' : 'additional')}
          >
            <span>
              {t('additionalInfo')}
              <small>Payroll details, revision reason and adjustments</small>
            </span>
            <b>{openSection === 'additional' ? '-' : '+'}</b>
          </button>
          {openSection === 'additional' && (
            <div className="employee-section-content additional">
              {statement.changeSummary.length > 0 && (
                <div className="revision-changes">
                  <b>Why this payslip changed</b>
                  {statement.changeSummary.map((change) => (
                    <p key={change}>{change}</p>
                  ))}
                </div>
              )}
              <div className="additional-info-grid">
                {otherAdditionalInfo.map((line) => (
                  <p key={`${line.key}-${line.value}`}>
                    <span>{line.key}</span>
                    <b>{line.value}</b>
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function Documents({
  setPage,
  token,
  forms,
  t
}: {
  setPage: (page: Page) => void;
  token: string;
  forms: TaxForm[];
  t: T;
}) {
  return (
    <div className="documents">
      <aside>
        <b>{t('documents')}</b>
        <button onClick={() => setPage('taxForms')}>&gt; {t('taxForms')}</button>
      </aside>
      <TaxForms token={token} forms={forms} t={t} />
    </div>
  );
}

function TaxForms({ token, forms, t }: { token: string; forms: TaxForm[]; t: T }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <section className="panel">
      <Toolbar title={t('taxForms').toUpperCase()} t={t} />
      <button
        className="download-selected"
        disabled={!selected.length}
        onClick={() =>
          selected.forEach((id) => downloadPdf(`/employee/tax-forms/${id}/download`, token))
        }
      >
        {t('downloadSelected')}
      </button>
      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selected.length === forms.length && forms.length > 0}
                onChange={(event) =>
                  setSelected(event.target.checked ? forms.map((f) => f.id) : [])
                }
              />
            </th>
            <th>{t('taxFormType')}</th>
            <th>{t('taxYear')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {forms.map((form) => (
            <tr key={form.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(form.id)}
                  onChange={() => setSelected(selected.includes(form.id) ? [] : [form.id])}
                />
              </td>
              <td>{form.formType}</td>
              <td>{form.taxYear}</td>
              <td>
                <button
                  onClick={() => downloadPdf(`/employee/tax-forms/${form.id}/download`, token)}
                >
                  {t('downloadPdf')}
                </button>
                <button>&gt;</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Profile({ profile, t }: { profile?: EmployeeProfile; t: T }) {
  const [changed, setChanged] = useState(false);
  const sections = [
    'personalInformation',
    'emergencyContacts',
    'employeeInformation',
    'loginInformation',
    'twoFactorAuthentication'
  ];
  const [open, setOpen] = useState('');
  return (
    <section className="panel profile">
      <div className="toolbar">
        <h1>{t('profile').toUpperCase()}</h1>
        <button onClick={() => setChanged(false)}>{t('reset')}</button>
        <button disabled={!changed}>{t('save')}</button>
      </div>
      {sections.map((section) => (
        <section className="accordion" key={section}>
          <button onClick={() => setOpen(open === section ? '' : section)}>
            {open === section ? 'v' : '>'} {t(section)}
          </button>
          {open === section && (
            <ProfileSection
              name={section}
              profile={profile}
              onChange={() => setChanged(true)}
              t={t}
            />
          )}
        </section>
      ))}
    </section>
  );
}

function ProfileSection({
  name,
  profile,
  onChange,
  t
}: {
  name: string;
  profile?: EmployeeProfile;
  onChange: () => void;
  t: T;
}) {
  const address = profile?.addresses?.[0];
  if (name === 'loginInformation')
    return (
      <div className="form-grid">
        <label>
          {t('username')}
          <input readOnly value={profile?.employeeNumber || ''} />
        </label>
        <label>
          {t('currentPassword')}
          <input type="password" />
        </label>
        <div className="helper">{t('passwordRules')}</div>
        <label>
          {t('newPassword')}
          <input type="password" />
        </label>
        <label>
          {t('confirmNewPassword')}
          <input type="password" />
        </label>
      </div>
    );
  if (name === 'twoFactorAuthentication')
    return (
      <div>
        <label className="check">
          <input type="checkbox" onChange={onChange} />
          {t('enableTwoFactor')}
        </label>
        <div className="qr">QR</div>
      </div>
    );
  if (name === 'employeeInformation')
    return (
      <div className="form-grid">
        <label>
          {t('employeeNumber')}
          <input readOnly value={profile?.employeeNumber || ''} />
        </label>
        <label>
          {t('occupation')}
          <input readOnly value={profile?.occupation || ''} />
        </label>
        <label>
          {t('startDate')}
          <input readOnly value={profile?.startDate?.slice(0, 10) || ''} />
        </label>
        <label>
          {t('seniority')}
          <input readOnly value={profile?.seniorityDate?.slice(0, 10) || ''} />
        </label>
        <label>
          {t('primaryEarning')}
          <input readOnly value={profile?.primaryEarningCode || ''} />
        </label>
        <label>
          {t('payGroup')}
          <input readOnly value={profile?.payGroup || ''} />
        </label>
        <label>
          {t('taxProvince')}
          <input readOnly value={profile?.taxProvince || ''} />
        </label>
        <label>
          {t('wcbNumber')}
          <input readOnly value={profile?.wcbNumber || ''} />
        </label>
        <label>
          {t('federal')}
          <input readOnly value={`$${profile?.personalTaxCredits?.federalClaimAmount || ''}`} />
        </label>
        <label>
          {t('provincial')}
          <input readOnly value={`$${profile?.personalTaxCredits?.provincialClaimAmount || ''}`} />
        </label>
      </div>
    );
  return (
    <div className="form-grid">
      <label>
        {t('legalFirstName')}
        <input defaultValue={profile?.legalFirstName || ''} onChange={onChange} />
      </label>
      <label>
        {t('middleName')}
        <input defaultValue={profile?.middleName || ''} onChange={onChange} />
      </label>
      <label>
        {t('legalLastName')}
        <input defaultValue={profile?.legalLastName || ''} onChange={onChange} />
      </label>
      <label>
        SIN
        <input readOnly value={profile?.sin || ''} />
      </label>
      <label>
        {t('streetAddress')}
        <input defaultValue={address?.street || ''} onChange={onChange} />
      </label>
      <label>
        {t('city')}
        <input defaultValue={address?.city || ''} onChange={onChange} />
      </label>
      <label>
        {t('province')}
        <input defaultValue={address?.province || ''} onChange={onChange} />
      </label>
      <label>
        {t('postalCode')}
        <input defaultValue={address?.postalCode || ''} onChange={onChange} />
      </label>
    </div>
  );
}

function helpIcon(icon: string) {
  const icons: Record<string, string> = {
    time: 'Time',
    calendar: 'Cal',
    documents: 'Doc',
    profile: 'User',
    security: 'Sec',
    bulletins: 'News'
  };
  return icons[icon] || icon;
}

function OldEmployerDashboard({
  data,
  onLogout
}: {
  data?: EmployerDashboard;
  onLogout: () => void;
}) {
  const nav = [
    'Dashboard',
    'Employees',
    'Time & Attendance',
    'Payroll',
    'Paystubs',
    'Benefits',
    'Deductions',
    'Government Filings',
    'Reports',
    'Documents',
    'Company',
    'Settings'
  ];
  const reportSubNav = [
    'All Reports',
    'Payroll Reports',
    'Employee Reports',
    'Tax & Compliance',
    'Benefits & Deductions',
    'Custom Reports',
    'Scheduled Reports'
  ];
  const reportPages = [
    'Reports',
    ...reportSubNav,
    'Hours Report',
    'Earnings Report',
    'Employee Details Report',
    'Deductions Report',
    'Employee History Report'
  ];
  const max = Math.max(1, ...(data?.chart.map((point) => point.amount) || []));
  const money = (value = 0) => `$ ${value.toLocaleString('en-CA')}`;
  const next = data?.nextPayroll;
  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        {nav.map((item, index) => (
          <button className={index === 0 ? 'active' : ''} key={item}>
            <span>{item.charAt(0)}</span>
            {item}
          </button>
        ))}
        <div className="built-canada">Built for Canadian Businesses</div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <label className="admin-search">
            <span>Search</span>
            <input placeholder="Search employees, payroll, reports..." />
          </label>
          <button>
            Alerts<i>3</i>
          </button>
          <button>?</button>
          <div className="admin-profile">
            <b>{data?.user.name || 'Admin User'}</b>
            <span>{data?.company.legalName || 'ABC Solutions Inc.'}</span>
          </div>
          <button onClick={onLogout}>Logout</button>
        </header>
        <section className="admin-content">
          <div className="admin-title">
            <div>
              <h1>Good morning, Admin!</h1>
              <p>Here's what's happening with your payroll today.</p>
            </div>
            <label>
              Company
              <select value={data?.company.customerId || ''} onChange={() => undefined}>
                <option>{data?.company.legalName || 'ABC Solutions Inc.'}</option>
              </select>
            </label>
            <b>{todayLabel}</b>
          </div>
          <div className="metric-grid">
            <article>
              <span>Employees</span>
              <p>Total Employees</p>
              <strong>{data?.metrics.totalEmployees || 0}</strong>
              <small>{data?.metrics.employeeDelta || 0} total records</small>
            </article>
            <article>
              <span>Payroll</span>
              <p>This Month's Payroll</p>
              <strong>{money(data?.metrics.monthlyPayroll || 0)}</strong>
              <small>{data?.metrics.payrollDeltaPercent || 0}% vs last month</small>
            </article>
            <article>
              <span>Calendar</span>
              <p>Next Pay Run</p>
              <strong>{next ? formatDate(next.payDate, 'en') : '-'}</strong>
              <small>{next?.status || 'No run found'}</small>
            </article>
            <article>
              <span>Docs</span>
              <p>Government Liabilities (Upcoming)</p>
              <strong>{money(data?.metrics.governmentLiabilities || 0)}</strong>
              <small>Open filings</small>
            </article>
            <article>
              <span>Alert </span>
              <p>Action Required</p>
              <strong>{data?.metrics.actionRequired || 0}</strong>
              <small>View Tasks</small>
            </article>
          </div>
          <div className="admin-grid">
            <section className="admin-panel chart-panel">
              <h2>Payroll Summary (Last 6 Months)</h2>
              <div className="bar-chart">
                {data?.chart.map((point) => (
                  <div key={point.label}>
                    <span style={{ height: `${(point.amount / max) * 170}px` }} />
                    <small>{point.label}</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="admin-panel next-payroll">
              <h2>Next Payroll</h2>
              <div className="payroll-band">
                <b>
                  {next
                    ? `${formatDate(next.periodStart, 'en')} - ${formatDate(next.periodEnd, 'en')}`
                    : 'No payroll run found'}
                </b>
                <span>{next?.status || 'No run found'}</span>
                <small>Pay Date: {next ? formatDate(next.payDate, 'en') : '-'}</small>
              </div>
              <div className="payroll-stats">
                <p>
                  Employees<b>{next?.employeeCount || 0}</b>
                </p>
                <p>
                  Total Hours<b>{next?.totalHours.toLocaleString('en-CA') || '0'}</b>
                </p>
                <p>
                  Estimated Gross<b>{money(next?.estimatedGross || 0)}</b>
                </p>
              </div>
              <button className="run-payroll">Run Payroll</button>
              <a>Calendar View Payroll Calendar</a>
            </section>
            <section className="admin-panel">
              <h2>
                Recent Activity <a>View All</a>
              </h2>
              {data?.recentActivity.map(([text, when]) => (
                <p className="activity-row" key={text}>
                  <span>{text}</span>
                  <small>{when}</small>
                </p>
              ))}
            </section>
            <section className="admin-panel">
              <h2>
                Tasks & Alerts <a>View All</a>
              </h2>
              {data?.alerts.map(([text, action, tone]) => (
                <p className={`alert-row ${tone}`} key={text}>
                  <span>{text}</span>
                  <button>{action}</button>
                </p>
              ))}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

const suggestedAdminProfile: AdminProfile = {
  personal: {
    firstName: 'Rahul',
    middleName: '',
    lastName: 'Sharma',
    preferredName: 'Rahul',
    birthDate: '1990-05-15',
    gender: 'Male',
    maritalStatus: 'Single',
    languagePreference: 'English',
    sin: '123456789',
    sinExpiryDate: '',
    emailAddress: 'rahul.sharma@example.com',
    phoneNumber: '+1 587 438 3340',
    address: '123, Main Street',
    apartment: 'Unit 4',
    city: 'Calgary',
    province: 'Alberta',
    postalCode: 'T2A 1B3'
  },
  employment: {
    employmentStatus: 'Active',
    employmentType: 'Full-Time',
    hireDate: '2025-04-15',
    originalHireDate: '2025-04-15',
    jobTitle: 'Restaurant Manager',
    department: 'Operations',
    location: 'Calgary - Main Branch',
    manager: 'Amit Patel',
    provinceOfEmployment: 'Alberta',
    standardWeeklyHours: '40',
    standardDailyHours: '8',
    workSchedule: 'Day Shift (9 AM - 5 PM)',
    expectedEndDate: '',
    probationPeriodMonths: '3',
    unionMember: 'No',
    employeeGroup: 'Management',
    employeeNumber: 'E011',
    costCentre: ''
  },
  compensation: {
    payType: 'Hourly',
    hourlyRate: '22.50',
    standardHoursPerWeek: '40',
    standardHoursPerDay: '8',
    overtimeEligible: 'Yes',
    overtimeAfter: '44',
    overtimeRateMultiplier: '1.5x',
    payFrequency: 'Biweekly',
    nextPayDate: '2025-04-30'
  },
  tax: {
    provinceOfResidence: 'Alberta',
    cityRegion: 'Calgary',
    residencyStatus: 'Resident of Canada',
    sin: '123456789',
    sinExpiryDate: '',
    craTd1Form: 'Completed',
    claimPersonalAmount: 'Yes (Standard)',
    additionalTaxToDeduct: '0.00',
    cppExempt: 'No',
    eiExempt: 'No'
  },
  vacation: {
    vacationPolicy: 'Accrue by Percentage (4%)',
    vacationAccrualRate: '4.00',
    accrualFrequency: 'Biweekly',
    vacationStartDate: '2025-04-15',
    carryForwardUnusedVacation: 'As per provincial rules',
    vacationPayoutOnTermination: 'As per provincial rules',
    province: 'Alberta',
    sickLeave: '5 days per year',
    personalLeave: '3 days per year'
  },
  benefits: {
    extendedHealthCare: 'Single',
    dentalCare: 'Single',
    groupLifeInsurance: '$50,000',
    accidentalDeath: 'Not Enrolled',
    employeeAssistance: 'Included',
    rrspContribution: '5%',
    unionDues: '$25.00 (Fixed)',
    healthSpendingAccount: 'Not Enrolled',
    parking: 'Not Enrolled',
    benefitsEnrollmentDate: '2025-04-15',
    deductionsStartDate: '2025-04-15'
  },
  banking: {
    directDeposit: 'Enabled',
    bankInstitution: 'Royal Bank of Canada (RBC)',
    transitNumber: '003',
    institutionNumber: '000',
    accountNumber: '1234567',
    accountType: 'Chequing',
    accountNickname: 'Primary Account'
  }
};

function blankAdminProfile(profile: AdminProfile): AdminProfile {
  return Object.fromEntries(
    Object.entries(profile).map(([section, values]) => [
      section,
      Object.fromEntries(Object.keys(values).map((key) => [key, '']))
    ])
  ) as AdminProfile;
}

const emptyAdminProfile: AdminProfile = blankAdminProfile(suggestedAdminProfile);

function cloneAdminProfile(profile: AdminProfile): AdminProfile {
  return {
    personal: { ...profile.personal },
    employment: { ...profile.employment },
    compensation: { ...profile.compensation },
    tax: { ...profile.tax },
    vacation: { ...profile.vacation },
    benefits: { ...profile.benefits },
    banking: { ...profile.banking }
  };
}

function profileForEmployee(employee?: EmployeeProfile): AdminProfile {
  if (!employee) return cloneAdminProfile(emptyAdminProfile);
  const address = employee.addresses?.[0];
  return {
    personal: {
      ...emptyAdminProfile.personal,
      ...(employee.adminProfile?.personal || {}),
      firstName: employee.legalFirstName || '',
      middleName: employee.middleName || '',
      lastName: employee.legalLastName || '',
      preferredName: employee.legalFirstName || '',
      sin: employee.sin || '',
      emailAddress: employee.personalEmail || '',
      address: address?.street || employee.adminProfile?.personal?.address || '',
      city: address?.city || employee.adminProfile?.personal?.city || '',
      province: address?.province || employee.adminProfile?.personal?.province || '',
      postalCode: address?.postalCode || employee.adminProfile?.personal?.postalCode || ''
    },
    employment: {
      ...emptyAdminProfile.employment,
      ...(employee.adminProfile?.employment || {}),
      employeeNumber: employee.employeeNumber || '',
      jobTitle: employee.occupation || '',
      hireDate: employee.startDate
        ? employee.startDate.slice(0, 10)
        : employee.adminProfile?.employment?.hireDate || '',
      originalHireDate: employee.seniorityDate
        ? employee.seniorityDate.slice(0, 10)
        : employee.adminProfile?.employment?.originalHireDate || '',
      provinceOfEmployment:
        employee.taxProvince ||
        employee.adminProfile?.employment?.provinceOfEmployment ||
        emptyAdminProfile.employment.provinceOfEmployment
    },
    compensation: {
      ...emptyAdminProfile.compensation,
      ...(employee.adminProfile?.compensation || {}),
      payType:
        employee.primaryEarningCode ||
        employee.adminProfile?.compensation?.payType ||
        emptyAdminProfile.compensation.payType,
      payFrequency:
        employee.payGroup ||
        employee.adminProfile?.compensation?.payFrequency ||
        emptyAdminProfile.compensation.payFrequency
    },
    tax: {
      ...emptyAdminProfile.tax,
      ...(employee.adminProfile?.tax || {}),
      provinceOfResidence:
        employee.taxProvince ||
        employee.adminProfile?.tax?.provinceOfResidence ||
        emptyAdminProfile.tax.provinceOfResidence,
      sin: employee.sin || employee.adminProfile?.tax?.sin || ''
    },
    vacation: { ...emptyAdminProfile.vacation, ...(employee.adminProfile?.vacation || {}) },
    benefits: { ...emptyAdminProfile.benefits, ...(employee.adminProfile?.benefits || {}) },
    banking: { ...emptyAdminProfile.banking, ...(employee.adminProfile?.banking || {}) }
  };
}

function isDateField(label: string) {
  return /\bdate\b/i.test(label);
}

function AdminInput({
  label,
  value,
  onChange,
  type,
  placeholder,
  disabled = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputType = type || (isDateField(label) ? 'date' : 'text');
  const dateProps =
    inputType === 'date' ? { placeholder: 'yyyy-mm-dd', pattern: '\\d{4}-\\d{2}-\\d{2}' } : {};
  const inputPlaceholder = placeholder || dateProps.placeholder;
  return (
    <label>
      {label}
      <input
        type={inputType}
        value={value}
        placeholder={inputPlaceholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        {...(inputType === 'date' ? { pattern: dateProps.pattern } : {})}
      />
      {inputType === 'date' && <small className="date-format-hint">format: yyyy-mm-dd</small>}
    </label>
  );
}

function OldAddEmployee({
  token,
  onSaved,
  onCancel
}: {
  token: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<AdminProfile>(emptyAdminProfile);
  const steps = [
    'Personal Information',
    'Employment Details',
    'Compensation',
    'Tax Information',
    'Vacation & Leave',
    'Benefits & Deductions',
    'Banking Details',
    'Review & Save'
  ];
  const order = Object.keys(profile) as Array<keyof AdminProfile>;
  const part = order[Math.min(step - 1, 6)];
  const update = (section: keyof AdminProfile, key: string, value: string) =>
    setProfile((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  async function save() {
    await api('/employer/employees', token, { method: 'POST', body: JSON.stringify(profile) });
    onSaved();
  }
  return (
    <section className="employee-wizard">
      <div className="admin-title">
        <div>
          <h1>Add Employee</h1>
          <p>Create a new employee profile</p>
        </div>
        <button onClick={onCancel}>Back to Employees</button>
      </div>
      <div className="steps">
        {steps.map((name, index) => (
          <button
            key={name}
            className={index + 1 <= step ? 'active' : ''}
            onClick={() => setStep(index + 1)}
          >
            <b>{index + 1 < step ? 'Done' : index + 1}</b>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="wizard-card">
        <h2>
          {step}. {steps[step - 1]}
        </h2>
        {step < 8 ? (
          <div className="wizard-grid">
            {Object.entries(profile[part]).map(([key, value]) => (
              <AdminInput
                key={key}
                label={key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, (letter) => letter.toUpperCase())}
                value={value}
                placeholder={suggestedAdminProfile[part][key]}
                onChange={(next) => update(part, key, next)}
              />
            ))}
            <aside>
              <b>{steps[step - 1]}</b>
              <p>Fetched defaults are editable, then saved to MongoDB Atlas.</p>
            </aside>
          </div>
        ) : (
          <div className="review-grid">
            {order.map((section) => (
              <article key={section}>
                <h3>{section.replace(/^./, (letter) => letter.toUpperCase())}</h3>
                {Object.entries(profile[section]).map(([key, value]) => (
                  <p key={key}>
                    <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                    <b>{value || '-'}</b>
                  </p>
                ))}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="wizard-actions">
        <button onClick={() => setStep(Math.max(1, step - 1))}>Previous</button>
        <span />
        <button onClick={onCancel}>Cancel</button>
        <button className="run-payroll" onClick={step === 8 ? save : () => setStep(step + 1)}>
          {step === 8 ? 'Create Employee' : 'Save & Next'}
        </button>
      </div>
    </section>
  );
}

function AdminSelect({
  label,
  value,
  onChange,
  options,
  className = ''
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  className?: string;
}) {
  return (
    <label className={className}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function WizardCheck({
  label,
  caption,
  checked = false
}: {
  label: string;
  caption?: string;
  checked?: boolean;
}) {
  return (
    <label className="wizard-check">
      <input type="checkbox" defaultChecked={checked} />
      <span>
        <b>{label}</b>
        {caption && <small>{caption}</small>}
      </span>
    </label>
  );
}

function AddEmployee({
  token,
  onSaved,
  onCancel,
  employee,
  onDelete
}: {
  token: string;
  onSaved: (result?: {
    employee?: EmployeeProfile;
    temporaryPassword?: string;
    emailSent?: boolean;
    emailError?: string;
  }) => void;
  onCancel: () => void;
  employee?: EmployeeProfile;
  onDelete?: (employee: EmployeeProfile) => void;
}) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<AdminProfile>(() => profileForEmployee(employee));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isEdit = Boolean(employee);
  const steps = [
    'Personal Information',
    'Employment Details',
    'Compensation',
    'Tax Information',
    'Vacation & Leave',
    'Benefits & Deductions',
    'Banking Details',
    'Review & Save'
  ];
  const update = (section: keyof AdminProfile, key: string, value: string) =>
    setProfile((current) => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const v = (section: keyof AdminProfile, key: string) => profile[section][key] || '';
  const input = (section: keyof AdminProfile, key: string, label: string) => (
    <AdminInput
      key={`${section}.${key}`}
      label={label}
      value={v(section, key)}
      placeholder={suggestedAdminProfile[section][key]}
      onChange={(next) => update(section, key, next)}
    />
  );
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await api<{
        employee?: EmployeeProfile;
        temporaryPassword?: string;
        emailSent?: boolean;
        emailError?: string;
      }>(
        isEdit && employee ? `/employer/employees/${employee.id}` : '/employer/employees',
        token,
        { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(profile) }
      );
      setMessage(
        isEdit
          ? 'Employee details saved.'
          : response.emailSent === false && response.emailError
            ? `Employee created. Welcome email was not sent: ${response.emailError}`
            : 'Employee created successfully.'
      );
      onSaved(response);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not ${isEdit ? 'save' : 'create'} employee. Check required fields and try again.`
      );
    } finally {
      setBusy(false);
    }
  }
  const personal = (
    <div className="personal-layout">
      <div className="photo-box">
        <div>Photo</div>
        <b>Upload Photo</b>
        <small>JPG, PNG (Max 2MB)</small>
      </div>
      <div className="wizard-fields four">
        {input('personal', 'firstName', 'First Name *')}
        {input('personal', 'middleName', 'Middle Name')}
        {input('personal', 'lastName', 'Last Name *')}
        {input('personal', 'preferredName', 'Preferred Name')}
        {input('personal', 'birthDate', 'Date of Birth *')}
        <AdminSelect
          label="Gender *"
          value={v('personal', 'gender')}
          onChange={(next) => update('personal', 'gender', next)}
          options={['Male', 'Female', 'Other']}
        />
        <AdminSelect
          label="Marital Status"
          value={v('personal', 'maritalStatus')}
          onChange={(next) => update('personal', 'maritalStatus', next)}
          options={['Single', 'Married', 'Common-Law']}
        />
        <AdminSelect
          label="Language Preference"
          value={v('personal', 'languagePreference')}
          onChange={(next) => update('personal', 'languagePreference', next)}
          options={['English', 'French']}
        />
        {input('personal', 'sin', 'Social Insurance Number (SIN) *')}
        {input('personal', 'sinExpiryDate', 'SIN Expiry Date')}
        {input('personal', 'emailAddress', 'Email Address *')}
        {input('personal', 'phoneNumber', 'Phone Number *')}
        {input('personal', 'address', 'Address *')}
        {input('personal', 'apartment', 'Apartment / Unit')}
        {input('personal', 'city', 'City *')}
        <AdminSelect
          label="Province *"
          value={v('personal', 'province')}
          onChange={(next) => update('personal', 'province', next)}
          options={['Alberta', 'Ontario', 'British Columbia', 'Quebec']}
        />
        {input('personal', 'postalCode', 'Postal Code *')}
      </div>
    </div>
  );
  const employment = (
    <>
      <div className="wizard-fields four">
        <AdminSelect
          label="Employment Status *"
          value={v('employment', 'employmentStatus')}
          onChange={(next) => update('employment', 'employmentStatus', next)}
          options={['Active', 'On Leave', 'Terminated']}
        />
        <AdminSelect
          label="Employment Type *"
          value={v('employment', 'employmentType')}
          onChange={(next) => update('employment', 'employmentType', next)}
          options={['Full-Time', 'Part-Time', 'Casual']}
        />
        {input('employment', 'hireDate', 'Hire Date *')}
        {input('employment', 'originalHireDate', 'Original Hire Date')}
        {input('employment', 'jobTitle', 'Job Title *')}
        <AdminSelect
          label="Department *"
          value={v('employment', 'department')}
          onChange={(next) => update('employment', 'department', next)}
          options={['Operations', 'Payroll', 'Administration']}
        />
        <AdminSelect
          label="Location *"
          value={v('employment', 'location')}
          onChange={(next) => update('employment', 'location', next)}
          options={['Calgary - Main Branch', 'Calgary - Main', 'Medicine Hat']}
        />
        <AdminSelect
          label="Manager"
          value={v('employment', 'manager')}
          onChange={(next) => update('employment', 'manager', next)}
          options={['Amit Patel', 'Store Owner', 'Admin User']}
        />
      </div>
      <div className="subpanel">
        <h3>Work Information</h3>
        <div className="wizard-fields four">
          <AdminSelect
            label="Province of Employment *"
            value={v('employment', 'provinceOfEmployment')}
            onChange={(next) => update('employment', 'provinceOfEmployment', next)}
            options={['Alberta', 'Ontario', 'British Columbia']}
          />
          {input('employment', 'standardWeeklyHours', 'Standard Weekly Hours *')}
          {input('employment', 'standardDailyHours', 'Standard Daily Hours')}
          <AdminSelect
            label="Work Schedule"
            value={v('employment', 'workSchedule')}
            onChange={(next) => update('employment', 'workSchedule', next)}
            options={['Day Shift (9 AM - 5 PM)', 'Evening Shift', 'Rotating']}
          />
          {input('employment', 'expectedEndDate', 'Expected End Date')}
          {input('employment', 'probationPeriodMonths', 'Probation Period (Months)')}
          <AdminSelect
            label="Union Member"
            value={v('employment', 'unionMember')}
            onChange={(next) => update('employment', 'unionMember', next)}
            options={['No', 'Yes']}
          />
          <AdminSelect
            label="Employee Group"
            value={v('employment', 'employeeGroup')}
            onChange={(next) => update('employment', 'employeeGroup', next)}
            options={['Management', 'Hourly Staff']}
          />
        </div>
      </div>
      <div className="subpanel">
        <h3>Additional Information</h3>
        <div className="wizard-fields four">
          {input('employment', 'employeeNumber', 'Employee Number')}
          <AdminSelect
            label="Cost Centre"
            value={v('employment', 'costCentre')}
            onChange={(next) => update('employment', 'costCentre', next)}
            options={['', 'Operations', 'Head Office']}
          />
          <button className="upload-btn">Upload File</button>
          <label>
            Notes
            <textarea placeholder="Add any additional notes here..." />
          </label>
        </div>
      </div>
    </>
  );
  const compensation = (
    <div className="with-side">
      <div>
        <h4>Pay Type *</h4>
        <div className="pay-type-row">
          {['Hourly', 'Salary', 'Commission', 'Hourly + Commission', 'Salary + Commission'].map(
            (payType) => (
              <button
                key={payType}
                className={v('compensation', 'payType') === payType ? 'selected' : ''}
                onClick={() => update('compensation', 'payType', payType)}
              >
                {payType}
                <small>
                  {payType === 'Hourly'
                    ? 'Paid by the hour'
                    : payType === 'Salary'
                      ? 'Fixed annual salary'
                      : 'Commission only'}
                </small>
              </button>
            )
          )}
        </div>
        <div className="subpanel">
          <h3>Hourly Pay Details</h3>
          <div className="wizard-fields three">
            {input('compensation', 'hourlyRate', 'Hourly Rate (CAD) *')}
            {input('compensation', 'standardHoursPerWeek', 'Standard Hours per Week *')}
            {input('compensation', 'standardHoursPerDay', 'Standard Hours per Day')}
            <AdminSelect
              label="Overtime Eligible *"
              value={v('compensation', 'overtimeEligible')}
              onChange={(next) => update('compensation', 'overtimeEligible', next)}
              options={['Yes', 'No']}
            />
            {input('compensation', 'overtimeAfter', 'Overtime After (hours per week) *')}
            <AdminSelect
              label="Overtime Rate Multiplier *"
              value={v('compensation', 'overtimeRateMultiplier')}
              onChange={(next) => update('compensation', 'overtimeRateMultiplier', next)}
              options={['1.5x', '2x']}
            />
          </div>
        </div>
        <div className="subpanel">
          <h3>
            Additional Pay <small>(Optional)</small>
          </h3>
          <div className="check-grid">
            <WizardCheck label="Commission" caption="Set commission plan in next step" />
            <WizardCheck label="Shift Premium" caption="Additional pay for specific shifts" />
            <WizardCheck label="Allowances" caption="E.g. car, phone, meals" />
            <WizardCheck label="Tips" caption="Include tips in earnings" />
          </div>
        </div>
        <div className="subpanel">
          <h3>Rate History</h3>
          <table>
            <tbody>
              <tr>
                <th>Effective From</th>
                <th>Effective To</th>
                <th>Rate (CAD)</th>
                <th>Reason</th>
                <th>Added By</th>
              </tr>
              <tr>
                <td>15/04/2025</td>
                <td>Ongoing</td>
                <td>${v('compensation', 'hourlyRate')}</td>
                <td>Initial rate</td>
                <td>Admin User</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <aside className="summary-side">
        <h3>Compensation Summary</h3>
        {[
          ['Pay Type', v('compensation', 'payType')],
          ['Hourly Rate', `$${v('compensation', 'hourlyRate')}`],
          ['Standard Hours / Week', v('compensation', 'standardHoursPerWeek')],
          ['Overtime Eligible', 'Yes (after 44 hrs)'],
          ['Overtime Rate', '1.5x'],
          ['Pay Frequency', v('compensation', 'payFrequency')],
          ['Next Pay Date', '30/04/2025']
        ].map(([label, value]) => (
          <p key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </p>
        ))}
        <div className="tip-card">
          Important<small>Overtime and other pay rules may vary by province.</small>
        </div>
      </aside>
    </div>
  );
  const tax = (
    <div className="with-side">
      <div>
        <div className="subpanel">
          <h3>Tax Residency</h3>
          <div className="wizard-fields three">
            <AdminSelect
              label="Province of Residence *"
              value={v('tax', 'provinceOfResidence')}
              onChange={(next) => update('tax', 'provinceOfResidence', next)}
              options={['Alberta', 'Ontario', 'British Columbia']}
            />
            <AdminSelect
              label="City / Region *"
              value={v('tax', 'cityRegion')}
              onChange={(next) => update('tax', 'cityRegion', next)}
              options={['Calgary', 'Medicine Hat', 'Toronto']}
            />
            <AdminSelect
              label="Residency Status *"
              value={v('tax', 'residencyStatus')}
              onChange={(next) => update('tax', 'residencyStatus', next)}
              options={['Resident of Canada', 'Non-Resident']}
            />
          </div>
        </div>
        <div className="subpanel">
          <h3>CRA Information</h3>
          <div className="wizard-fields three">
            {input('tax', 'sin', 'Social Insurance Number (SIN) *')}
            {input('tax', 'sinExpiryDate', 'SIN Expiry Date (if applicable)')}
            <AdminSelect
              label="CRA TD1 Form *"
              value={v('tax', 'craTd1Form')}
              onChange={(next) => update('tax', 'craTd1Form', next)}
              options={['Completed', 'Pending']}
            />
          </div>
        </div>
        <div className="subpanel">
          <h3>Additional Tax Options</h3>
          <div className="wizard-fields four">
            <AdminSelect
              label="Claim Personal Amount"
              value={v('tax', 'claimPersonalAmount')}
              onChange={(next) => update('tax', 'claimPersonalAmount', next)}
              options={['Yes (Standard)', 'No']}
            />
            {input('tax', 'additionalTaxToDeduct', 'Additional Tax to Deduct')}
            <WizardCheck label="CPP Exempt" caption="Only in specific cases." />
            <WizardCheck label="EI Exempt" caption="Only in specific cases." />
          </div>
          <h3>Special Tax Situations</h3>
          <div className="check-grid">
            <WizardCheck
              label="Non-Resident for Tax Purposes"
              caption="Employee is not a resident of Canada for tax."
            />
            <WizardCheck
              label="Quebec Resident (Additional Forms)"
              caption="Requires TP-1015.3-V form."
            />
            <WizardCheck label="Multiple Jobs" caption="Employee has more than one employer." />
            <WizardCheck label="Indigenous Employee" caption="May be eligible for exemptions." />
          </div>
        </div>
      </div>
      <aside className="summary-side">
        <h3>Tax Summary (Estimated)</h3>
        {['Federal Tax', 'Alberta Provincial Tax', 'CPP (Employee)', 'EI (Employee)'].map(
          (item) => (
            <p key={item}>
              <span>{item}</span>
              <b>---</b>
            </p>
          )
        )}
        <div className="tip-card">Actual deductions will be calculated during payroll.</div>
        <button className="upload-btn">Upload TD1 Form</button>
      </aside>
    </div>
  );
  const vacation = (
    <>
      <div className="wizard-fields four">
        <AdminSelect
          label="Vacation Policy *"
          value={v('vacation', 'vacationPolicy')}
          onChange={(next) => update('vacation', 'vacationPolicy', next)}
          options={['Accrue by Percentage (4%)', 'Accrue by Hours']}
        />
        {input('vacation', 'vacationAccrualRate', 'Vacation Accrual Rate *')}
        <AdminSelect
          label="Accrual Frequency *"
          value={v('vacation', 'accrualFrequency')}
          onChange={(next) => update('vacation', 'accrualFrequency', next)}
          options={['Biweekly', 'Monthly']}
        />
        <aside className="info-card">
          In most Canadian provinces, vacation accrual is based on a percentage of gross earnings.
        </aside>
        {input('vacation', 'vacationStartDate', 'Vacation Start Date *')}
        <AdminSelect
          label="Carry Forward Unused Vacation"
          value={v('vacation', 'carryForwardUnusedVacation')}
          onChange={(next) => update('vacation', 'carryForwardUnusedVacation', next)}
          options={['As per provincial rules', 'No carry forward']}
        />
        <AdminSelect
          label="Vacation Payout on Termination"
          value={v('vacation', 'vacationPayoutOnTermination')}
          onChange={(next) => update('vacation', 'vacationPayoutOnTermination', next)}
          options={['As per provincial rules', 'Do not payout']}
        />
      </div>
      <div className="subpanel holiday-panel">
        <h3>Statutory Holidays</h3>
        <AdminSelect
          label="Province *"
          value={v('vacation', 'province')}
          onChange={(next) => update('vacation', 'province', next)}
          options={['Alberta', 'Ontario', 'British Columbia']}
        />
        <div>
          <b>9</b>
          <span>Statutory Holidays (Alberta)</span>
          <button>View List</button>
        </div>
      </div>
      <div className="subpanel">
        <h3>
          Other Leave Entitlements <small>(Optional)</small>
          <button>+ Add Leave Type</button>
        </h3>
        <table>
          <tbody>
            <tr>
              <th>Leave Type</th>
              <th>Entitlement</th>
              <th>Paid / Unpaid</th>
              <th>Carry Forward</th>
              <th>Actions</th>
            </tr>
            <tr>
              <td>Sick Leave</td>
              <td>{v('vacation', 'sickLeave')}</td>
              <td>Paid</td>
              <td>No</td>
              <td>Edit Delete</td>
            </tr>
            <tr>
              <td>Personal Leave</td>
              <td>{v('vacation', 'personalLeave')}</td>
              <td>Paid</td>
              <td>No</td>
              <td>Edit Delete</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
  const benefits = (
    <>
      <div className="info-card">
        Deductions such as CPP, EI and Income Tax are calculated automatically based on the
        employee's information.
      </div>
      <div className="benefit-grid">
        <div className="subpanel">
          <h3>
            Benefits <small>(Optional)</small>
          </h3>
          {[
            [
              'Extended Health Care (EHC)',
              'Covers medical, dental, vision, etc.',
              'extendedHealthCare'
            ],
            ['Dental Care', 'Covers basic and major dental services.', 'dentalCare'],
            ['Group Life Insurance', 'Company provided life insurance.', 'groupLifeInsurance'],
            [
              'Accidental Death & Dismemberment (AD&D)',
              'Additional accident coverage.',
              'accidentalDeath'
            ],
            [
              'Employee Assistance Program (EAP)',
              'Mental health and counselling support.',
              'employeeAssistance'
            ]
          ].map(([label, caption, key], index) => (
            <div className="benefit-row" key={key}>
              <WizardCheck label={label} caption={caption} checked={index !== 3} />
              <AdminSelect
                label=""
                value={v('benefits', key)}
                onChange={(next) => update('benefits', key, next)}
                options={[v('benefits', key) || 'Single', 'Not Enrolled', 'Included']}
              />
            </div>
          ))}
        </div>
        <div className="subpanel">
          <h3>
            Deductions <small>(Optional)</small>
          </h3>
          {[
            ['RRSP Contribution', 'Registered Retirement Savings Plan.', 'rrspContribution'],
            ['Union Dues', 'Applicable if employee is a union member.', 'unionDues'],
            ['Health Spending Account (HSA)', 'Employee contribution.', 'healthSpendingAccount'],
            ['Parking', 'Monthly parking deduction.', 'parking']
          ].map(([label, caption, key], index) => (
            <div className="benefit-row" key={key}>
              <WizardCheck label={label} caption={caption} checked={index < 2} />
              {input('benefits', key, '')}
            </div>
          ))}
        </div>
        <div className="subpanel">
          <h3>Company Contributions</h3>
          {['Employer EI', 'Employer CPP', 'Health & Welfare (Employer Paid)'].map((item) => (
            <p className="contribution-row" key={item}>
              <span>
                {item}
                <small>Calculated automatically</small>
              </span>
              <b>$0.00</b>
            </p>
          ))}
        </div>
        <div className="subpanel">
          <h3>Other Settings</h3>
          <div className="wizard-fields two">
            {input('benefits', 'benefitsEnrollmentDate', 'Benefits Enrollment Date')}
            {input('benefits', 'deductionsStartDate', 'Deductions Start Date')}
          </div>
          <WizardCheck
            label="Send enrollment information to employee"
            caption="An email will be sent with benefit plan details after saving."
            checked
          />
        </div>
      </div>
    </>
  );
  const banking = (
    <div className="with-side">
      <div className="subpanel">
        <h3>Direct Deposit</h3>
        <label className="switch-row">
          <input type="checkbox" defaultChecked />
          Enable direct deposit<small>Pay the employee directly to their bank account.</small>
        </label>
        <div className="wizard-fields three">
          <AdminSelect
            className="span-3"
            label="Bank Institution *"
            value={v('banking', 'bankInstitution')}
            onChange={(next) => update('banking', 'bankInstitution', next)}
            options={['Royal Bank of Canada (RBC)', 'TD Canada Trust', 'Scotiabank']}
          />
          {input('banking', 'transitNumber', 'Transit Number *')}
          {input('banking', 'institutionNumber', 'Institution Number *')}
          {input('banking', 'accountNumber', 'Account Number *')}
          <AdminSelect
            className="span-3"
            label="Account Type *"
            value={v('banking', 'accountType')}
            onChange={(next) => update('banking', 'accountType', next)}
            options={['Chequing', 'Savings']}
          />
          {input('banking', 'accountNickname', 'Account Nickname (Optional)')}
        </div>
      </div>
      <aside>
        <div className="info-card">
          <b>Direct Deposit Information</b>
          <ul>
            <li>
              Enter account details exactly as they appear on the employee cheque or from their
              bank.
            </li>
            <li>Direct deposit is the fastest and most secure way to pay employees.</li>
          </ul>
        </div>
        <div className="cheque">
          <b>ROYAL BANK OF CANADA</b>
          <span>PAY TO THE ORDER OF</span>
          <strong>: 003 : 000 : 1234567 : 001</strong>
        </div>
        <div className="secure-card">Your employee's banking information is secure</div>
      </aside>
    </div>
  );
  const reviewRows = [
    [
      'Personal Information',
      [
        ['Full Name', `${v('personal', 'firstName')} ${v('personal', 'lastName')}`],
        ['Date of Birth', v('personal', 'birthDate')],
        ['Gender', v('personal', 'gender')],
        ['Phone', v('personal', 'phoneNumber')],
        ['Email', v('personal', 'emailAddress')],
        ['Address', `${v('personal', 'address')} ${v('personal', 'city')}`]
      ]
    ],
    [
      'Employment Details',
      [
        ['Employee ID', v('employment', 'employeeNumber')],
        ['Position', v('employment', 'jobTitle')],
        ['Department', v('employment', 'department')],
        ['Employment Type', v('employment', 'employmentType')],
        ['Start Date', v('employment', 'hireDate')],
        ['Reporting To', v('employment', 'manager')],
        ['Work Location', v('employment', 'location')],
        ['Standard Hours', `${v('employment', 'standardWeeklyHours')} hours per week`]
      ]
    ],
    [
      'Compensation',
      [
        ['Pay Type', v('compensation', 'payType')],
        ['Hourly Rate', `$${v('compensation', 'hourlyRate')}`],
        ['Standard Hours (Weekly)', v('compensation', 'standardHoursPerWeek')],
        ['Overtime Eligible', 'Yes (after 44 hrs)'],
        ['Overtime Rate', '1.5x'],
        ['Pay Frequency', v('compensation', 'payFrequency')],
        ['Next Pay Date', v('compensation', 'nextPayDate')]
      ]
    ],
    [
      'Tax Information',
      [
        ['Province of Residence', v('tax', 'provinceOfResidence')],
        ['City / Region', v('tax', 'cityRegion')],
        ['Residency Status', v('tax', 'residencyStatus')],
        ['SIN', v('tax', 'sin')],
        ['CRA TD1', v('tax', 'craTd1Form')],
        ['Claim Personal Amount', v('tax', 'claimPersonalAmount')],
        ['CPP Exempt', 'No'],
        ['EI Exempt', 'No']
      ]
    ],
    [
      'Vacation & Leave',
      [
        ['Vacation Policy', v('vacation', 'vacationPolicy')],
        ['Accrual Rate', `${v('vacation', 'vacationAccrualRate')}%`],
        ['Accrual Frequency', v('vacation', 'accrualFrequency')],
        ['Vacation Start Date', v('vacation', 'vacationStartDate')],
        ['Statutory Holidays', 'Alberta (9)'],
        ['Additional Leave Types', `Sick Leave (${v('vacation', 'sickLeave')})`]
      ]
    ],
    [
      'Benefits & Deductions',
      [
        ['Extended Health Care', v('benefits', 'extendedHealthCare')],
        ['Dental Care', v('benefits', 'dentalCare')],
        ['Group Life Insurance', v('benefits', 'groupLifeInsurance')],
        ['AD&D', v('benefits', 'accidentalDeath')],
        ['EAP', v('benefits', 'employeeAssistance')],
        ['RRSP Contribution', v('benefits', 'rrspContribution')],
        ['Union Dues', v('benefits', 'unionDues')]
      ]
    ],
    [
      'Banking Details',
      [
        ['Direct Deposit', v('banking', 'directDeposit')],
        ['Bank Institution', v('banking', 'bankInstitution')],
        ['Transit Number', v('banking', 'transitNumber')],
        ['Institution Number', v('banking', 'institutionNumber')],
        ['Account Number', v('banking', 'accountNumber')],
        ['Account Type', v('banking', 'accountType')],
        ['Account Nickname', v('banking', 'accountNickname')]
      ]
    ]
  ] as Array<[string, string[][]]>;
  const body =
    step === 1 ? (
      personal
    ) : step === 2 ? (
      employment
    ) : step === 3 ? (
      compensation
    ) : step === 4 ? (
      tax
    ) : step === 5 ? (
      vacation
    ) : step === 6 ? (
      benefits
    ) : step === 7 ? (
      banking
    ) : (
      <>
        <div className="success-note">
          <b>Almost done!</b>
          <span>
            Please review all information to ensure accuracy before creating the employee.
          </span>
        </div>
        <div className="review-grid">
          {reviewRows.map(([title, rows], index) => (
            <article key={title} className={index === 6 ? 'span-all' : ''}>
              <h3>
                {title}
                <button onClick={() => setStep(Math.min(index + 1, 7))}>Edit</button>
              </h3>
              {rows.map(([label, value]) => (
                <p key={label}>
                  <span>{label}</span>
                  <b>{value || '-'}</b>
                </p>
              ))}
            </article>
          ))}
        </div>
      </>
    );
  return (
    <section className="employee-wizard">
      <div className="admin-title">
        <div>
          <h1>{isEdit ? 'Employee Details' : 'Add Employee'}</h1>
          <p>
            {isEdit
              ? 'Edit the full employee profile saved in MongoDB.'
              : 'Create a new employee profile'}
          </p>
        </div>
        <button onClick={onCancel}>Back to Employees</button>
      </div>
      <div className="steps">
        {steps.map((name, index) => (
          <button
            key={name}
            className={index + 1 <= step ? 'active' : ''}
            onClick={() => setStep(index + 1)}
          >
            <b>{index + 1 < step ? 'Done' : index + 1}</b>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="wizard-card">
        <h2>
          {step}. {steps[step - 1]}
        </h2>
        {message && (
          <p className="success-note">
            <b>{message}</b>
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <p className="wizard-subtitle">
          {step === 1
            ? "Enter the employee's basic personal details."
            : step === 2
              ? "Enter the employee's job and employment information."
              : step === 3
                ? "Set up the employee's pay structure, rate and pay frequency."
                : step === 4
                  ? "Enter the employee's tax details for accurate payroll deductions."
                  : step === 5
                    ? "Set up the employee's vacation, statutory holidays and leave entitlements."
                    : step === 6
                      ? 'Select the benefits, deductions and other contributions for this employee.'
                      : step === 7
                        ? "Add the employee's bank account information for direct deposit of their pay."
                        : 'Review the employee information below. You can edit any section before saving.'}
        </p>
        {body}
      </div>
      <div className="wizard-actions">
        <button onClick={() => setStep(Math.max(1, step - 1))}>Previous</button>
        <span />
        {isEdit && employee && onDelete && (
          <button className="danger-button" disabled={busy} onClick={() => onDelete(employee)}>
            Delete Employee
          </button>
        )}
        <button onClick={onCancel}>Cancel</button>
        <button
          className="run-payroll"
          disabled={busy}
          onClick={step === 8 ? save : () => setStep(step + 1)}
        >
          {busy
            ? 'Saving...'
            : step === 8
              ? isEdit
                ? 'Save Employee'
                : 'Create Employee'
              : 'Save & Next'}
        </button>
      </div>
    </section>
  );
}

function EmployeesPage({
  employees,
  onAdd,
  onEdit,
  onDelete,
  onShowPassword,
  passwordNotice,
  resettingEmployeeId
}: {
  employees: EmployeeProfile[];
  onAdd: () => void;
  onEdit: (employee: EmployeeProfile) => void;
  onDelete: (employee: EmployeeProfile) => void;
  onShowPassword: (employee: EmployeeProfile) => void;
  passwordNotice?: {
    employeeName: string;
    login: string;
    temporaryPassword?: string;
    emailSent?: boolean;
    emailError?: string;
    error?: string;
  };
  resettingEmployeeId?: string;
}) {
  return (
    <section className="admin-panel employees-page">
      <div className="employee-head">
        <div>
          <h1>Employees</h1>
          <p>Showing employee data fetched from MongoDB.</p>
        </div>
        <button className="run-payroll" onClick={onAdd}>
          + Add Employee
        </button>
      </div>
      {passwordNotice && (
        <div className="success-note" role="status">
          <b>{passwordNotice.employeeName} password ready.</b>
          {passwordNotice.error ? (
            <span>{passwordNotice.error}</span>
          ) : (
            <span>
              Login: {passwordNotice.login} | Temporary password:{' '}
              {passwordNotice.temporaryPassword} | Email sent:{' '}
              {passwordNotice.emailSent ? 'Yes' : 'No'}
            </span>
          )}
          {!passwordNotice.emailSent && passwordNotice.emailError && (
            <span>Email error: {passwordNotice.emailError}</span>
          )}
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Employee #</th>
            <th>Position</th>
            <th>Location</th>
            <th>Email</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id || employee.employeeNumber}>
              <td>
                <b>
                  {employee.legalFirstName} {employee.legalLastName}
                </b>
              </td>
              <td>{employee.employeeNumber}</td>
              <td>{employee.occupation || '-'}</td>
              <td>
                {employee.adminProfile?.employment?.location ||
                  employee.addresses?.[0]?.city ||
                  '-'}
              </td>
              <td>{employee.personalEmail || '-'}</td>
              <td className="table-actions">
                <button type="button" onClick={() => onEdit(employee)}>
                  Edit
                </button>
                <button
                  type="button"
                  disabled={resettingEmployeeId === employee.id}
                  onClick={() => onShowPassword(employee)}
                >
                  {resettingEmployeeId === employee.id ? 'Resetting...' : 'Show Password'}
                </button>
                <button type="button" className="danger-button" onClick={() => onDelete(employee)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={6}>No employees found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  return status === 'finalized' || status === 'locked'
    ? 'paid'
    : status === 'draft'
      ? 'draft'
      : 'pending';
}

function PayrollPage({
  token,
  runs,
  employees,
  onRefresh,
  onNewRun
}: {
  token: string;
  runs: PayrollRun[];
  employees: EmployeeProfile[];
  onRefresh: () => void;
  onNewRun: () => void;
}) {
  const [tab, setTab] = useState('Payroll Runs');
  const [notice, setNotice] = useState('');
  const [editingRun, setEditingRun] = useState<PayrollRun>();
  const [payrollDialogMode, setPayrollDialogMode] = useState<'view' | 'edit'>('view');
  const [editLines, setEditLines] = useState<PayrollRun['lines']>([]);
  const [revisionReason, setRevisionReason] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);
  const [rejectingRun, setRejectingRun] = useState<PayrollRun>();
  const [rejectionReason, setRejectionReason] = useState('');
  const [savingRejection, setSavingRejection] = useState(false);
  const tabs = ['Payroll Runs', 'Paystubs', 'Reconciliation'];
  const activeRun = runs[0];
  const totals = runs.reduce(
    (sum, run) => ({
      employees: Math.max(sum.employees, run.employeeCount),
      gross: sum.gross + Number(run.estimatedGross || 0),
      deductions: sum.deductions + Number(run.totalDeductions || 0),
      net: sum.net + Number(run.totalNetPay || 0)
    }),
    { employees: 0, gross: 0, deductions: 0, net: 0 }
  );
  const showNotice = (message: string) => setNotice(message);
  function provincialVacationPay(
    line: PayrollRun['lines'][number],
    accrualRate: string | undefined
  ) {
    const hourlyRate = Number(line.hourlyRate || 0);
    const vacationableEarnings =
      hourlyRate * Number(line.regularHours || 0) +
      hourlyRate * 1.5 * Number(line.overtimeHours || 0) +
      hourlyRate * 1.5 * Number(line.statePayHours || 0) +
      Number(line.bonus || 0) +
      Number(line.commission || 0) +
      Number(line.otherEarnings || 0);
    return (vacationableEarnings * (Number(accrualRate || 0) / 100)).toFixed(2);
  }
  function openPayrollDialog(run: PayrollRun, mode: 'view' | 'edit') {
    setEditingRun(run);
    setPayrollDialogMode(mode);
    setRevisionReason('');
    setEditLines(
      run.lines.map((line) => {
        const employee = employees.find((item) => item.id === line.employeeId);
        return {
          ...line,
          vacationPay: provincialVacationPay(line, run.vacationAccrualRate),
          employeeName: line.employeeName || (employee ? employeeName(employee) : undefined),
          employeeNumber: line.employeeNumber || employee?.employeeNumber
        };
      })
    );
  }
  function beginRevision(run: PayrollRun) {
    openPayrollDialog(run, 'edit');
  }
  function updateRevisionLine(
    employeeId: string,
    field: keyof PayrollRun['lines'][number],
    value: string
  ) {
    setEditLines((lines) =>
      lines.map((line) => {
        if (line.employeeId !== employeeId) return line;
        const updated = {
          ...line,
          [field]: ['regularHours', 'overtimeHours', 'statePayHours'].includes(field)
            ? Number(value)
            : value
        };
        return {
          ...updated,
          vacationPay: provincialVacationPay(updated, editingRun?.vacationAccrualRate)
        };
      })
    );
  }
  async function saveRevision() {
    if (!editingRun) return;
    if (revisionReason.trim().length < 3) {
      showNotice('Enter a reason for editing this finalized payroll.');
      return;
    }
    setSavingRevision(true);
    try {
      const result = await api<{ message: string }>(
        `/employer/payroll-runs/${editingRun.id}/revise-finalized`,
        token,
        {
          method: 'PUT',
          body: JSON.stringify({
            periodStart: editingRun.periodStart,
            periodEnd: editingRun.periodEnd,
            payDate: editingRun.payDate,
            reason: revisionReason.trim(),
            lines: editLines.map(
              ({
                employeeId,
                regularHours,
                overtimeHours,
                statePayHours,
                hourlyRate,
                bonus,
                commission,
                otherEarnings,
                reimbursement,
                preTaxDeductions,
                postTaxDeductions,
                note
              }) => ({
                employeeId,
                regularHours,
                overtimeHours,
                statePayHours,
                hourlyRate,
                bonus,
                commission,
                otherEarnings,
                reimbursement,
                preTaxDeductions,
                postTaxDeductions,
                note
              })
            )
          })
        }
      );
      setEditingRun(undefined);
      showNotice(result.message);
      onRefresh();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Payroll revision failed.');
    } finally {
      setSavingRevision(false);
    }
  }
  async function transition(
    run: PayrollRun,
    action: 'submit-for-review' | 'approve' | 'finalize' | 'lock' | 'reverse'
  ) {
    try {
      const result = await api<{ message?: string }>(
        `/employer/payroll-runs/${run.id}/${action}`,
        token,
        { method: 'POST' }
      );
      showNotice(
        result.message || `${statusLabel(action)} completed for ${formatDate(run.payDate, 'en')}.`
      );
      onRefresh();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Payroll action failed.');
    }
  }
  async function rejectPayroll() {
    if (!rejectingRun) return;
    if (rejectionReason.trim().length < 3) {
      showNotice('Enter a reason for rejecting this payroll.');
      return;
    }
    setSavingRejection(true);
    try {
      const result = await api<{ message: string }>(
        `/employer/payroll-runs/${rejectingRun.id}/reject`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ reason: rejectionReason.trim() })
        }
      );
      setRejectingRun(undefined);
      setRejectionReason('');
      showNotice(result.message);
      onRefresh();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Payroll rejection failed.');
    } finally {
      setSavingRejection(false);
    }
  }
  function actionButton(run: PayrollRun) {
    if (run.status === 'draft')
      return <button onClick={() => transition(run, 'submit-for-review')}>Submit</button>;
    if (run.status === 'in_review')
      return (
        <div className="payroll-workflow-actions">
          <button className="reject-payroll" onClick={() => setRejectingRun(run)}>Reject</button>
          <button onClick={() => transition(run, 'approve')}>Approve</button>
        </div>
      );
    if (run.status === 'approved')
      return (
        <div className="payroll-workflow-actions">
          <button className="reject-payroll" onClick={() => setRejectingRun(run)}>Reject</button>
          <button onClick={() => transition(run, 'finalize')}>Finalize</button>
        </div>
      );
    if (run.status === 'finalized')
      return <button onClick={() => transition(run, 'lock')}>Lock</button>;
    if (run.status === 'locked')
      return <button onClick={() => transition(run, 'reverse')}>Reverse</button>;
    return <button disabled>{statusLabel(run.status)}</button>;
  }
  return (
    <section className="module-page">
      <div className="employee-head">
        <div>
          <h1>Payroll</h1>
          <p>Run payroll, manage pay periods and view pay history</p>
        </div>
        <button className="run-payroll" onClick={onNewRun}>
          + New Payroll Run
        </button>
      </div>
      <div className="module-tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      {notice && (
        <p className="success-note">
          <b>{notice}</b>
        </p>
      )}
      <div className="metric-grid payroll-metrics">
        <article>
          <span className="ui-icon calendar" aria-hidden="true"></span>
          <p>Current Pay Period</p>
          <strong>
            {activeRun
              ? `${formatDate(activeRun.periodStart, 'en')} - ${formatDate(activeRun.periodEnd, 'en')}`
              : '-'}
          </strong>
          <small>{activeRun ? statusLabel(activeRun.status) : 'No run found'}</small>
        </article>
        <article>
          <span className="ui-icon team" aria-hidden="true"></span>
          <p>Total Employees</p>
          <strong>{totals.employees}</strong>
          <small>From payroll run lines</small>
        </article>
        <article>
          <span className="ui-icon money" aria-hidden="true"></span>
          <p>Total Gross Pay</p>
          <strong>{moneyText(totals.gross)}</strong>
          <small>Calculated by backend</small>
        </article>
        <article>
          <span className="ui-icon tax" aria-hidden="true"></span>
          <p>Total Deductions</p>
          <strong>{moneyText(totals.deductions)}</strong>
          <small>Calculated by backend</small>
        </article>
        <article>
          <span className="ui-icon money" aria-hidden="true"></span>
          <p>Total Net Pay</p>
          <strong>{moneyText(totals.net)}</strong>
          <small>{activeRun ? `Pay date ${formatDate(activeRun.payDate, 'en')}` : '-'}</small>
        </article>
      </div>
      {tab === 'Payroll Runs' && (
        <section className="admin-panel">
          <div className="employee-head">
            <div>
              <h2>Payroll Runs</h2>
              <p>View and manage all payroll periods.</p>
            </div>
            <select>
              <option>{currentYear}</option>
            </select>
          </div>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Pay Period</th>
                <th>Pay Date</th>
                <th>Employees</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <input type="checkbox" />
                  </td>
                  <td>
                    {formatDate(run.periodStart, 'en')} - {formatDate(run.periodEnd, 'en')}
                  </td>
                  <td>{formatDate(run.payDate, 'en')}</td>
                  <td>{run.employeeCount}</td>
                  <td>{moneyText(run.estimatedGross)}</td>
                  <td>{moneyText(run.totalDeductions)}</td>
                  <td>{moneyText(run.totalNetPay)}</td>
                  <td>
                    <span className={`status ${statusClass(run.status)}`}>
                      {statusLabel(run.status)}
                    </span>
                  </td>
                  <td className="table-actions">
                    {run.canEditFinalized ? (
                      <div className="payroll-workflow-actions">
                        <button onClick={() => beginRevision(run)}>Edit</button>
                        <button onClick={() => transition(run, 'lock')}>Lock</button>
                      </div>
                    ) : (
                      actionButton(run)
                    )}
                    <button onClick={() => openPayrollDialog(run, 'view')}>View</button>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={9}>No payroll runs found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      {tab === 'Paystubs' && <PaystubsPage token={token} />}
      {tab === 'Reconciliation' && (
        <section className="admin-panel">
          <h2>Reconciliation</h2>
          <p>Compare payroll totals, deductions and payment files before closing the run.</p>
          <div className="paystub-actions">
            <button onClick={onRefresh}>Refresh Runs</button>
          </div>
        </section>
      )}
      <div className="admin-grid">
        <section className="admin-panel">
          <h2>Quick Actions</h2>
          <button onClick={onNewRun}>+ New Payroll Run</button>
          <button onClick={onRefresh}>Refresh Payroll</button>
          <button onClick={() => setTab('Paystubs')}>View Paystubs</button>
        </section>
        <section className="admin-panel">
          <h2>Workflow</h2>
          <p>Finalized payroll can be edited until the next payroll is created.</p>
          <p>A revision regenerates payslips and notifies employees.</p>
        </section>
        <section className="admin-panel">
          <h2>Upcoming Dates</h2>
          {runs.slice(0, 3).map((run) => (
            <p key={run.id}>{formatDate(run.payDate, 'en')} Pay Date</p>
          ))}
        </section>
      </div>
      {editingRun && (
        <div className="payroll-modal-backdrop">
          <section className="payroll-modal payroll-editor" role="dialog" aria-modal="true">
            <header>
              <div>
                <h2>
                  {payrollDialogMode === 'edit' ? 'Edit Finalized Payroll' : 'Payroll Details'}
                </h2>
                <p>
                  {payrollDialogMode === 'edit'
                    ? 'Revision updates payslips and notifies affected employees.'
                    : `${statusLabel(editingRun.status)} payroll for ${formatDate(editingRun.payDate, 'en')}`}
                </p>
              </div>
              <button aria-label="Close" onClick={() => setEditingRun(undefined)}>
                x
              </button>
            </header>
            <div className="payroll-modal-body">
              <section
                className={`payroll-editor-dates ${payrollDialogMode === 'view' ? 'readonly' : ''}`}
              >
                <AdminInput
                  label="Pay Period Start Date"
                  type="date"
                  value={editingRun.periodStart.slice(0, 10)}
                  disabled={payrollDialogMode === 'view'}
                  onChange={(value) =>
                    payrollDialogMode === 'edit' &&
                    setEditingRun({ ...editingRun, periodStart: value })
                  }
                />
                <AdminInput
                  label="Pay Period End Date"
                  type="date"
                  value={editingRun.periodEnd.slice(0, 10)}
                  disabled={payrollDialogMode === 'view'}
                  onChange={(value) =>
                    payrollDialogMode === 'edit' &&
                    setEditingRun({ ...editingRun, periodEnd: value })
                  }
                />
                <AdminInput
                  label="Pay Date"
                  type="date"
                  value={editingRun.payDate.slice(0, 10)}
                  disabled={payrollDialogMode === 'view'}
                  onChange={(value) =>
                    payrollDialogMode === 'edit' && setEditingRun({ ...editingRun, payDate: value })
                  }
                />
              </section>
              {payrollDialogMode === 'edit' && (
                <label className="payroll-revision-reason">
                  Reason for editing payroll <span>Required</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={revisionReason}
                    placeholder="Explain why this finalized payroll is being changed. Employees will see this reason on the revised payslip."
                    onChange={(event) => setRevisionReason(event.target.value)}
                  />
                </label>
              )}
              <div className="payroll-editor-list">
                {editLines.map((line, index) => {
                  const earningsFields: Array<[keyof typeof line, string]> = [
                    ['regularHours', 'Regular hours'],
                    ['overtimeHours', 'Overtime hours'],
                    ...(Number(line.statePay || 0) > 0 || Number(line.statePayHours || 0) > 0
                      ? ([['statePayHours', 'State holiday hours']] as Array<[
                          keyof typeof line,
                          string
                        ]>)
                      : []),
                    ['hourlyRate', 'Hourly rate'],
                    ['bonus', 'Bonus'],
                    ['commission', 'Commission'],
                    ['vacationPay', 'Vacation pay'],
                    ['otherEarnings', 'Other earnings']
                  ];
                  const deductionFields: Array<[keyof typeof line, string]> = [
                    ['preTaxDeductions', 'Pre-tax deductions'],
                    ['postTaxDeductions', 'Post-tax deductions'],
                    ['reimbursement', 'Reimbursement']
                  ];
                  const regularPay = Number(line.hourlyRate || 0) * Number(line.regularHours || 0);
                  const overtimePay =
                    Number(line.hourlyRate || 0) * 1.5 * Number(line.overtimeHours || 0);
                  const statePay =
                    Number(line.hourlyRate || 0) * 1.5 * Number(line.statePayHours || 0);
                  const estimatedGross =
                    regularPay +
                    overtimePay +
                    statePay +
                    Number(line.bonus || 0) +
                    Number(line.commission || 0) +
                    Number(line.vacationPay || 0) +
                    Number(line.otherEarnings || 0);
                  return (
                    <article className="payroll-employee-editor" key={line.employeeId}>
                      <div className="payroll-employee-heading">
                        <span>{index + 1}</span>
                        <div>
                          <h3>{line.employeeName || `Employee ${line.employeeId.slice(-6)}`}</h3>
                          <p>{line.employeeNumber || line.employeeId}</p>
                        </div>
                        <strong>Estimated gross {moneyText(estimatedGross)}</strong>
                      </div>
                      {Number(line.statePay) > 0 && line.statePayExplanation && (
                        <p className="state-pay-explanation">
                          <b>State holiday pay calculation</b>
                          {line.statePayExplanation}
                        </p>
                      )}
                      <h4>Earnings and hours</h4>
                      <div className="payroll-field-grid">
                        {earningsFields.map(([field, label]) => (
                          <label key={String(field)}>
                            {label}
                            <input
                              type="number"
                              min="0"
                              step={
                                field === 'regularHours' || field === 'overtimeHours'
                                  ? '0.25'
                                  : '0.01'
                              }
                              value={String(line[field] || 0)}
                              disabled={payrollDialogMode === 'view' || field === 'vacationPay'}
                              onChange={(event) =>
                                updateRevisionLine(line.employeeId, field, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <h4>Deductions and reimbursements</h4>
                      <div className="payroll-field-grid three">
                        {deductionFields.map(([field, label]) => (
                          <label key={String(field)}>
                            {label}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={String(line[field] || 0)}
                              disabled={payrollDialogMode === 'view'}
                              onChange={(event) =>
                                updateRevisionLine(line.employeeId, field, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="statutory-preview">
                        <span>Current statutory calculation</span>
                        <b>CPP {moneyText(line.cpp)}</b>
                        <b>CPP2 {moneyText(line.cpp2)}</b>
                        <b>EI {moneyText(line.ei)}</b>
                        <b>Federal tax {moneyText(moneyNumber(line.federalTax) + moneyNumber(line.provincialTax))}</b>
                        <b>Provincial tax {moneyText(0)}</b>
                        <b>Total gross {moneyText(line.grossPay)}</b>
                        <b>Total deductions {moneyText(line.deductionsTotal)}</b>
                        <b>Net pay {moneyText(line.netPay)}</b>
                        {Number(line.carryForwardAdjustment || 0) !== 0 && (
                          <b>Prior payroll adjustment {moneyText(line.carryForwardAdjustment)}</b>
                        )}
                      </div>
                      <label className="payroll-note">
                        Payroll note
                        <textarea
                          rows={2}
                          value={line.note || ''}
                          disabled={payrollDialogMode === 'view'}
                          placeholder="Reason or internal note for this employee"
                          onChange={(event) =>
                            updateRevisionLine(line.employeeId, 'note', event.target.value)
                          }
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            </div>
            <footer>
              <span>{editLines.length} employee payroll records</span>
              <button onClick={() => setEditingRun(undefined)}>
                {payrollDialogMode === 'edit' ? 'Cancel' : 'Close'}
              </button>
              {payrollDialogMode === 'view' && editingRun.canEditFinalized && (
                <button
                  className="payroll-edit-action"
                  onClick={() => setPayrollDialogMode('edit')}
                >
                  Edit Payroll
                </button>
              )}
              {payrollDialogMode === 'edit' && (
                <button className="run-payroll" disabled={savingRevision} onClick={saveRevision}>
                  {savingRevision ? 'Saving...' : 'Save & Regenerate Payslips'}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
      {rejectingRun && (
        <div className="payroll-modal-backdrop">
          <section className="payroll-modal payroll-reject-modal" role="dialog" aria-modal="true">
            <header>
              <div>
                <h2>Reject Payroll</h2>
                <p>{formatDate(rejectingRun.periodStart, 'en')} - {formatDate(rejectingRun.periodEnd, 'en')}</p>
              </div>
              <button aria-label="Close" onClick={() => setRejectingRun(undefined)}>x</button>
            </header>
            <div className="payroll-modal-body">
              <label className="payroll-revision-reason">
                Reason for rejection <span>Required</span>
                <textarea
                  autoFocus
                  rows={4}
                  maxLength={500}
                  value={rejectionReason}
                  placeholder="Explain what must be corrected before this payroll can be approved."
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </label>
              <p className="payroll-reject-help">The payroll will return to Draft so its hours, earnings and deductions can be corrected.</p>
            </div>
            <footer>
              <button onClick={() => setRejectingRun(undefined)}>Cancel</button>
              <button className="reject-payroll" disabled={savingRejection} onClick={rejectPayroll}>
                {savingRejection ? 'Rejecting...' : 'Reject Payroll'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

function moneyText(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function employeeName(employee: EmployeeProfile) {
  return `${employee.legalFirstName} ${employee.legalLastName}`.trim() || employee.employeeNumber;
}

function employeeHourlyRate(employee: EmployeeProfile) {
  return employee.adminProfile?.compensation?.hourlyRate || '25.00';
}

type PayrollFrequency = 'weekly' | 'biweekly' | 'monthly';

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function suggestedPayrollDates(periodStart: string, frequency: PayrollFrequency) {
  const parts = periodStart.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return undefined;

  const [year, month, day] = parts;
  const start = new Date(year, month - 1, day);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    return undefined;
  }

  const end = new Date(start);
  if (frequency === 'weekly') end.setDate(end.getDate() + 6);
  if (frequency === 'biweekly') end.setDate(end.getDate() + 13);
  if (frequency === 'monthly') end.setMonth(end.getMonth() + 1, 0);

  const payment = new Date(end);
  payment.setDate(payment.getDate() + 5);
  return { periodEnd: localIsoDate(end), payDate: localIsoDate(payment) };
}

function NewPayrollRun({
  token,
  employees,
  onDone,
  onCancel
}: {
  token: string;
  employees: EmployeeProfile[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [periodStart, setPeriodStart] = useState('2026-01-01');
  const [periodEnd, setPeriodEnd] = useState('2026-01-14');
  const [payDate, setPayDate] = useState('2026-01-19');
  const [payFrequency, setPayFrequency] = useState<PayrollFrequency>('biweekly');
  const [run, setRun] = useState<PayrollRun | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    employees.slice(0, 6).map((employee) => employee.employeeNumber)
  );
  const [hours, setHours] = useState<Record<string, string>>({});
  const [statePayHours, setStatePayHours] = useState<Record<string, string>>({});
  const [statePayBaseHours, setStatePayBaseHours] = useState<Record<string, string>>({});
  const [statePayRegularDay, setStatePayRegularDay] = useState<Record<string, boolean>>({});
  const [statePayAlternativeDayOff, setStatePayAlternativeDayOff] = useState<Record<string, boolean>>({});
  const [statePaySettings, setStatePaySettings] = useState<{
    enabled: boolean;
    holidays: Array<{ name: string; date: string }>;
    defaultHoursPerDay: number;
  }>({
    enabled: false,
    holidays: [],
    defaultHoursPerDay: 8
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selectedEmployees = employees.filter((employee) =>
    selectedIds.includes(employee.employeeNumber)
  );
  const calculatedLines = run?.lines || [];
  const regularHoursLimit = { weekly: 44, biweekly: 88, monthly: 176 }[payFrequency];
  function applySuggestedDates(start: string, frequency: PayrollFrequency) {
    const dates = suggestedPayrollDates(start, frequency);
    if (!dates) return;
    setPeriodEnd(dates.periodEnd);
    setPayDate(dates.payDate);
  }
  function updatePeriodStart(value: string) {
    setPeriodStart(value);
    applySuggestedDates(value, payFrequency);
  }
  useEffect(() => {
    api<{
      payFrequency: PayrollFrequency;
      statePay: {
        enabled: boolean;
        holidays: Array<{ name: string; date: string }>;
        defaultHoursPerDay: number;
      };
    }>(
      '/employer/company/state-pay', token
    )
      .then((result) => {
        setStatePaySettings(result.statePay);
        setPayFrequency(result.payFrequency);
        applySuggestedDates(periodStart, result.payFrequency);
      })
      .catch(() =>
        setStatePaySettings({ enabled: false, holidays: [], defaultHoursPerDay: 8 })
      );
  }, [token]);
  const matchingStatePayHolidays = statePaySettings.enabled
    ? statePaySettings.holidays.filter(
        (holiday) => holiday.date >= periodStart && holiday.date <= periodEnd
      )
    : [];
  const statePayEligible = matchingStatePayHolidays.length > 0;
  const defaultStatePayBaseHours =
    matchingStatePayHolidays.length * (statePaySettings.defaultHoursPerDay || 8);
  const table = (
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>Regular Hours</th>
          <th>OT Hours</th>
          {statePayEligible && <th>Holiday Entitlement Hours</th>}
          {statePayEligible && <th>Holiday Hours Worked</th>}
          <th>Rate</th>
          {statePayEligible && <th>State Pay</th>}
          <th>Vacation Pay</th>
          <th>Gross Pay</th>
          <th>Deductions</th>
          <th>Net Pay</th>
        </tr>
      </thead>
      <tbody>
        {selectedEmployees.map((employee) => {
          const line = calculatedLines.find((item) => item.employeeId === employee.id);
          return (
            <tr key={employee.employeeNumber}>
              <td>{employeeName(employee)}</td>
              <td>{line?.regularHours ?? hours[employee.employeeNumber] ?? regularHoursLimit}</td>
              <td>{line?.overtimeHours ?? 0}</td>
              {statePayEligible && (
                <td>{statePayBaseHours[employee.employeeNumber] ?? String(defaultStatePayBaseHours)}</td>
              )}
              {statePayEligible && (
                <td>{statePayHours[employee.employeeNumber] ?? '0'}</td>
              )}
              <td>{moneyText(employeeHourlyRate(employee))}</td>
              {statePayEligible && (
                <td>
                  {line ? moneyText(line.statePay) : '-'}
                  {line?.statePayExplanation && (
                    <small className="state-pay-table-note">{line.statePayExplanation}</small>
                  )}
                </td>
              )}
              <td>{line ? moneyText(line.vacationPay) : '-'}</td>
              <td>{line ? moneyText(line.grossPay) : '-'}</td>
              <td>{line ? moneyText(line.deductionsTotal) : '-'}</td>
              <td>
                {line ? (
                  <>
                    {moneyText(line.netPay)}
                    {Number(line.carryForwardAdjustment || 0) !== 0 && (
                      <small className="carry-forward-note">
                        Includes {moneyText(line.carryForwardAdjustment)} prior adjustment
                      </small>
                    )}
                  </>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  async function next() {
    setBusy(true);
    setMessage('');
    try {
      if (step === 1) {
        const result = await api<{ run: PayrollRun }>('/employer/payroll-runs', token, {
          method: 'POST',
          body: JSON.stringify({ periodStart, periodEnd, payDate })
        });
        setRun(result.run);
      }
      if (step === 2 && run) {
        const result = await api<{ run: PayrollRun }>(
          `/employer/payroll-runs/${run.id}/hours-earnings`,
          token,
          {
            method: 'PUT',
            body: JSON.stringify({
              lines: selectedEmployees.map((employee) => ({
                employeeId: employee.id,
                regularHours: hours[employee.employeeNumber] || regularHoursLimit,
                overtimeHours: 0,
                statePayHours: statePayEligible
                  ? statePayHours[employee.employeeNumber] ?? 0
                  : 0,
                statePayBaseHours: statePayEligible
                  ? statePayBaseHours[employee.employeeNumber] ?? defaultStatePayBaseHours
                  : 0,
                statePayRegularDay: statePayRegularDay[employee.employeeNumber] ?? true,
                statePayAlternativeDayOff:
                  statePayAlternativeDayOff[employee.employeeNumber] ?? false,
                hourlyRate: employeeHourlyRate(employee)
              }))
            })
          }
        );
        setRun(result.run);
      }
      if (step === 4 && run) {
        const result = await api<{ run: PayrollRun }>(
          `/employer/payroll-runs/${run.id}/submit-for-review`,
          token,
          { method: 'POST' }
        );
        setRun(result.run);
      }
      if (step === 5) {
        onDone();
        return;
      }
      setStep((value) => value + 1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payroll run action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="module-page">
      <p>Payroll &gt; New Payroll Run</p>
      <h1>New Payroll Run</h1>
      <p>
        {step === 5
          ? 'Draft run is ready for approval from the payroll list.'
          : 'Create a new payroll run from live employee data.'}
      </p>
      {message && (
        <p className="success-note">
          <b>{message}</b>
        </p>
      )}
      <div className="steps payroll-steps">
        {['Pay Period', 'Select Employees', 'Calculate', 'Preview', 'Submitted'].map(
          (name, index) => (
            <button
              key={name}
              className={index + 1 <= step ? 'active' : ''}
              onClick={() => setStep(index + 1)}
            >
              <b>{index + 1 < step ? 'Done' : index + 1}</b>
              <span>{name}</span>
            </button>
          )
        )}
      </div>
      {step === 1 && (
        <div className="wizard-card with-side">
          <div>
            <h2>1. Pay Period</h2>
            <div className="wizard-fields two">
              <div className="field-row">Pay Frequency: <b>{payFrequency}</b></div>
              <AdminInput
                label="Pay Period Start Date *"
                value={periodStart}
                onChange={updatePeriodStart}
              />
              <AdminInput label="Pay Period End Date *" value={periodEnd} onChange={setPeriodEnd} />
              <AdminInput label="Pay Date *" value={payDate} onChange={setPayDate} />
            </div>
          </div>
          <aside className="info-card">
            <b>Server workflow</b>
            <ul>
              <li>This creates a draft PayrollRun.</li>
              <li>Amounts are calculated by the backend.</li>
              <li>Finalizing generates employee pay statements.</li>
            </ul>
          </aside>
        </div>
      )}
      {step === 2 && (
        <div className="wizard-card">
          <h2>2. Select Employees</h2>
          {statePayEligible && (
            <p className="success-note">
              <b>State holiday pay applies:</b>{' '}
              {matchingStatePayHolidays
                .map((holiday) => `${holiday.name} (${formatDate(holiday.date, 'en')})`)
                .join(', ')}. Entitlement and worked-hours premiums are calculated using the employee's province.
            </p>
          )}
          <table>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.employeeNumber}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.employeeNumber)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, employee.employeeNumber]
                            : current.filter((id) => id !== employee.employeeNumber)
                        )
                      }
                    />
                  </td>
                  <td>{employeeName(employee)}</td>
                  <td>{employee.occupation || '-'}</td>
                  <td>{employee.adminProfile?.employment?.department || '-'}</td>
                  <td>{moneyText(employeeHourlyRate(employee))}</td>
                  <td>
                    <input
                      value={hours[employee.employeeNumber] ?? String(regularHoursLimit)}
                      onChange={(event) =>
                        setHours((current) => ({
                          ...current,
                          [employee.employeeNumber]: event.target.value
                        }))
                      }
                    />
                  </td>
                  {statePayEligible && (
                    <td>
                      <input
                        aria-label={`Holiday entitlement hours for ${employeeName(employee)}`}
                        type="number"
                        min="0"
                        value={
                          statePayBaseHours[employee.employeeNumber] ??
                          String(defaultStatePayBaseHours)
                        }
                        onChange={(event) =>
                          setStatePayBaseHours((current) => ({
                            ...current,
                            [employee.employeeNumber]: event.target.value
                          }))
                        }
                      />
                    </td>
                  )}
                  {statePayEligible && (
                    <td>
                      <input
                        aria-label={`Holiday hours worked for ${employeeName(employee)}`}
                        type="number"
                        min="0"
                        value={statePayHours[employee.employeeNumber] ?? '0'}
                        onChange={(event) =>
                          setStatePayHours((current) => ({
                            ...current,
                            [employee.employeeNumber]: event.target.value
                          }))
                        }
                      />
                      <label>
                        <input
                          type="checkbox"
                          checked={statePayRegularDay[employee.employeeNumber] ?? true}
                          onChange={(event) =>
                            setStatePayRegularDay((current) => ({
                              ...current,
                              [employee.employeeNumber]: event.target.checked
                            }))
                          }
                        />
                        Regular scheduled day
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={statePayAlternativeDayOff[employee.employeeNumber] ?? false}
                          onChange={(event) =>
                            setStatePayAlternativeDayOff((current) => ({
                              ...current,
                              [employee.employeeNumber]: event.target.checked
                            }))
                          }
                        />
                        Substitute paid day off
                      </label>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {step === 3 && (
        <div className="wizard-card">
          <h2>3. Calculated by Backend</h2>
          {table}
        </div>
      )}
      {step === 4 && (
        <div className="wizard-card">
          <h2>4. Preview & Submit</h2>
          <div className="metric-grid payroll-metrics">
            <article>
              <p>Pay Period</p>
              <strong>
                {formatDate(periodStart, 'en')} - {formatDate(periodEnd, 'en')}
              </strong>
            </article>
            <article>
              <p>Employees</p>
              <strong>{run?.employeeCount || selectedEmployees.length}</strong>
            </article>
            <article>
              <p>Total Hours</p>
              <strong>{run?.totalHours || 0}</strong>
            </article>
            <article>
              <p>Total Gross Pay</p>
              <strong>{moneyText(run?.estimatedGross || 0)}</strong>
            </article>
            <article>
              <p>Total Deductions</p>
              <strong>{moneyText(run?.totalDeductions || 0)}</strong>
            </article>
            <article>
              <p>Total Net Pay</p>
              <strong>{moneyText(run?.totalNetPay || 0)}</strong>
            </article>
          </div>
          {table}
          <WizardCheck
            label="I confirm that I have reviewed the payroll details and they are accurate."
            checked
          />
        </div>
      )}
      {step === 5 && (
        <div className="wizard-card complete-screen">
          <div>Done</div>
          <h2>Payroll Run Submitted</h2>
          <p>Status: {run ? statusLabel(run.status) : 'In Review'}</p>
          <div className="info-card">
            Use the payroll runs list to approve, finalize, lock or reverse this run according to
            your role permissions.
          </div>
        </div>
      )}
      <div className="wizard-actions">
        <button disabled={busy} onClick={step === 1 ? onCancel : () => setStep(step - 1)}>
          Back
        </button>
        <span />
        <button disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          disabled={busy || (step === 2 && selectedEmployees.length === 0)}
          className="run-payroll"
          onClick={next}
        >
          {step === 4 ? 'Submit for Review' : step === 5 ? 'View Payroll Runs' : 'Next'}
        </button>
      </div>
    </section>
  );
}

function StatePaySettings({ token }: { token: string }) {
  const [enabled, setEnabled] = useState(false);
  const [company, setCompany] = useState<{ legalName: string; customerId: string }>();
  const [holidays, setHolidays] = useState<Array<{ name: string; date: string }>>([]);
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<{
      company?: { legalName: string; customerId: string };
      statePay: { enabled: boolean; holidays: Array<{ name: string; date: string }> };
    }>(
      '/employer/company/state-pay', token
    )
      .then(({ company: selectedCompany, statePay }) => {
        setCompany(selectedCompany);
        setEnabled(statePay.enabled);
        setHolidays(statePay.holidays);
      })
      .catch(() => setMessage('Could not load state pay settings.'));
  }, [token]);
  async function save() {
    try {
      const result = await api<{
        statePay: { enabled: boolean; holidays: Array<{ name: string; date: string }> };
      }>(
        '/employer/company/state-pay',
        token,
        { method: 'PUT', body: JSON.stringify({ holidays }) }
      );
      setEnabled(result.statePay.enabled);
      setHolidays(result.statePay.holidays);
      setMessage('State pay settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save state pay settings.');
    }
  }
  return (
    <section className="module-page">
      <div className="employee-head">
        <div>
          <h1>State Pay Days</h1>
          <p>
            {company
              ? `${company.legalName} (${company.customerId})`
              : 'Manage statutory holiday dates used during payroll calculation.'}
          </p>
        </div>
        <button className="run-payroll" onClick={save}>Save Changes</button>
      </div>
      {message && <p className="success-note"><b>{message}</b></p>}
      <section className="admin-panel">
        {enabled && (
          <>
            <div className="field-row state-pay-date-entry">
              <AdminInput label="Holiday name" value={newName} onChange={setNewName} />
              <AdminInput label="Eligible holiday date" type="date" value={newDate} onChange={setNewDate} />
              <button
                type="button"
                disabled={!newName.trim() || !newDate || holidays.some((holiday) => holiday.date === newDate)}
                onClick={() => {
                  setHolidays((current) => [...current, { name: newName.trim(), date: newDate }].sort((left, right) => left.date.localeCompare(right.date)));
                  setNewName('');
                  setNewDate('');
                }}
              >Add Holiday</button>
            </div>
            <div className="state-pay-date-list">
              {holidays.map((holiday) => (
                <p key={holiday.date}>
                  <span><b>{holiday.name}</b><small>{formatDate(holiday.date, 'en')}</small></span>
                  <button type="button" onClick={() => setHolidays((current) => current.filter((item) => item.date !== holiday.date))}>Remove</button>
                </p>
              ))}
              {!holidays.length && <p>No state pay holidays selected.</p>}
            </div>
          </>
        )}
        {!enabled && (
          <p className="info-card">State holiday pay is not enabled for this employer. A super admin can enable it from the employer details.</p>
        )}
      </section>
    </section>
  );
}

type EmployerPaystub = {
  id: string;
  employeeName: string;
  employeeNumber?: string;
  position?: string;
  periodStart?: string;
  periodEnd?: string;
  payDate: string;
  grossPay: string;
  netPay: string;
  yearToDateGrossPay: string;
  yearToDateNetPay: string;
  vacationPay: string;
  statePay: string;
  statePayHours: number;
  statePayExplanation?: string;
  status: string;
  employeeId: string;
  payFrequency: string;
  deductionsTotal: string;
  deductionsTotalYtd: string;
  regularHours: number;
  overtimeHours: number;
  regularHoursYtd: number;
  overtimeHoursYtd: number;
  hourlyRate: string;
  earnings: Array<{ code: string; description: string; amount: string; ytd: string }>;
  deductions: Array<{ code: string; description: string; amount: string; ytd: string }>;
};

function PaystubsPage({ token }: { token: string }) {
  const [paystubs, setPaystubs] = useState<EmployerPaystub[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [notice, setNotice] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [employeeCount, setEmployeeCount] = useState(0);
  useEffect(() => {
    api<{ paystubs: EmployerPaystub[]; companyName: string; employeeCount: number }>('/employer/paystubs', token)
      .then((result) => {
        setPaystubs(result.paystubs);
        setCompanyName(result.companyName);
        setEmployeeCount(result.employeeCount);
        setSelectedId((current) =>
          result.paystubs.some((item) => item.id === current)
            ? current
            : result.paystubs[0]?.id || ''
        );
      })
      .catch(() => setPaystubs([]));
  }, [token]);
  const employees = Array.from(new Map(paystubs.map((item) => [item.employeeId, item.employeeName])).entries());
  const years = Array.from(new Set(paystubs.map((item) => item.payDate.slice(0, 4)))).sort().reverse();
  const periods = Array.from(new Set(paystubs.map((item) => `${item.periodStart || ''}|${item.periodEnd || ''}`)));
  const filtered = paystubs.filter((item) =>
    (!employeeFilter || filterEquals(item.employeeId, employeeFilter)) &&
    (!yearFilter || item.payDate.startsWith(yearFilter)) &&
    (!periodFilter || `${item.periodStart || ''}|${item.periodEnd || ''}` === periodFilter) &&
    (!statusFilter || filterEquals(item.status, statusFilter)) &&
    (!search.trim() ||
      [item.employeeName, item.employeeNumber, item.payFrequency, item.status]
        .some((value) => filterContains(value, search)))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const selectedIndex = filtered.findIndex((item) => item.id === selectedId);
  const selected = filtered[selectedIndex >= 0 ? selectedIndex : 0];
  const selectedPeriod = selected?.periodStart && selected?.periodEnd
    ? `${formatDate(selected.periodStart, 'en')} - ${formatDate(selected.periodEnd, 'en')}`
    : '-';
  const selectedEarnings = selected
    ? [
        { description: 'Regular Hours', hours: selected.regularHours, ytdHours: selected.regularHoursYtd, rate: selected.hourlyRate, amount: selected.earnings.find((line) => line.code === 'REG')?.amount || '0.00', ytd: selected.earnings.find((line) => line.code === 'REG')?.ytd || '0.00' },
        { description: 'Overtime Hours', hours: selected.overtimeHours, ytdHours: selected.overtimeHoursYtd, rate: moneyText(Number(selected.hourlyRate || 0) * 1.5), amount: selected.earnings.find((line) => line.code === 'OT')?.amount || '0.00', ytd: selected.earnings.find((line) => line.code === 'OT')?.ytd || '0.00' },
        ...displayEarningLines(selected.earnings)
          .filter((line) => !['REG', 'OT'].includes(line.code) && Number(line.amount) > 0)
          .map((line) => ({ description: line.description, hours: 0, ytdHours: 0, rate: '', amount: line.amount, ytd: line.ytd }))
      ].filter((line) => line.description && (line.hours > 0 || Number(line.amount) > 0))
    : [];
  const selectedDeductions = selected ? displayDeductionLines(selected.deductions) : [];
  async function download(ids: string[]) {
    if (!ids.length) return;
    try {
      const response = await fetch(`${apiBase}/employer/paystubs/download-selected`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ids })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(response.status === 401 ? 'Session expired. Sign in again to download paystubs.' : detail?.message || 'Download failed');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'paystubs.pdf'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Download failed'); }
  }
  async function downloadAll() {
    try {
      const response = await fetch(`${apiBase}/employer/paystubs/download-all`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(response.status === 401 ? 'Session expired. Sign in again to download paystubs.' : detail?.message || 'Download failed');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'all-paystubs.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Download failed'); }
  }
  async function send(ids: string[]) {
    if (!ids.length) return;
    try {
      const result = await api<{ sent: number; errors: string[] }>('/employer/paystubs/send-selected', token, {
        method: 'POST', body: JSON.stringify({ ids })
      });
      setNotice(`${result.sent} paystub notification${result.sent === 1 ? '' : 's'} sent.${result.errors.length ? ` Failed: ${result.errors.join('; ')}` : ''}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Send failed'); }
  }
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  return (
    <section className="module-page paystubs-page">
      <header className="paystubs-title"><h1>Paystubs</h1><p>View, download or send paystubs to your employees.</p></header>
      {notice && <p className="success-note" role="status">{notice}</p>}
      <div className="paystubs-metrics">
        <article><span>▤</span><div><small>Total Paystubs</small><strong>{paystubs.length}</strong><small>All time</small></div></article>
        <article><span>♙</span><div><small>Employees</small><strong>{employeeCount}</strong></div></article>
        <article><span>$</span><div><small>Total Gross Pay</small><strong>{moneyText(paystubs.reduce((total, item) => total + Number(item.grossPay), 0))}</strong><small>All time</small></div></article>
        <article><span>▣</span><div><small>Total Net Pay</small><strong>{moneyText(paystubs.reduce((total, item) => total + Number(item.netPay), 0))}</strong><small>All time</small></div></article>
      </div>
      <div className="paystubs-filters">
        <label>Employee<select value={employeeFilter} onChange={(event) => changeFilter(setEmployeeFilter, event.target.value)}><option value="">All Employees</option>{employees.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Year<select value={yearFilter} onChange={(event) => changeFilter(setYearFilter, event.target.value)}><option value="">All Years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Pay Period<select value={periodFilter} onChange={(event) => changeFilter(setPeriodFilter, event.target.value)}><option value="">All Periods</option>{periods.map((period) => {
          const [periodStart, periodEnd] = period.split('|');
          const label = periodStart && periodEnd
            ? `${formatDate(periodStart, 'en')} - ${formatDate(periodEnd, 'en')}`
            : '-';
          return <option key={period} value={period}>{label}</option>;
        })}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => changeFilter(setStatusFilter, event.target.value)}><option value="">All</option><option value="Paid">Paid</option><option value="Pending">Pending</option></select></label>
        <label>Search<input aria-label="Search by employee name" placeholder="Search by employee name..." value={search} onChange={(event) => changeFilter(setSearch, event.target.value)} /></label>
        <button onClick={() => { setEmployeeFilter(''); setYearFilter(''); setPeriodFilter(''); setStatusFilter(''); setSearch(''); setPage(1); }}>Clear Filters</button>
      </div>
      <div className="paystubs-bulk"><button disabled={!checked.length} onClick={() => download(checked)}>↓ Download Selected ({checked.length})</button><button disabled={!checked.length} onClick={() => send(checked)}>✉ Send Selected ({checked.length})</button><button className="paystubs-primary" onClick={downloadAll} disabled={!paystubs.length}>↓ Download All Paystubs</button></div>
      <div className="paystub-layout">
        <section className="paystubs-table-wrap">
          <table>
            <thead>
              <tr>
                <th><input aria-label="Select visible paystubs" type="checkbox" checked={visible.length > 0 && visible.every((item) => checked.includes(item.id))} onChange={(event) => setChecked(event.target.checked ? Array.from(new Set([...checked, ...visible.map((item) => item.id)])) : checked.filter((id) => !visible.some((item) => item.id === id)))} /></th>
                <th>#</th>
                <th>Employee</th>
                <th>Pay Period</th>
                <th>Pay Date</th>
                <th>Gross Pay</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((paystub, index) => (
                <tr key={paystub.id} className={selected?.id === paystub.id ? 'selected' : ''}>
                  <td><input aria-label={`Select ${paystub.employeeName}`} type="checkbox" checked={checked.includes(paystub.id)} onChange={(event) => setChecked(event.target.checked ? [...checked, paystub.id] : checked.filter((id) => id !== paystub.id))} /></td>
                  <td>{(Math.min(page, pages) - 1) * pageSize + index + 1}</td>
                  <td>
                    <span className="avatar-sm">{paystub.employeeName.charAt(0)}</span>
                    <span><b>{paystub.employeeName}</b><small>{paystub.employeeNumber}</small></span>
                  </td>
                  <td>
                    {paystub.periodStart && paystub.periodEnd
                      ? `${formatDate(paystub.periodStart, 'en')} - ${formatDate(paystub.periodEnd, 'en')}`
                      : '-'}
                  </td>
                  <td>{formatDate(paystub.payDate, 'en')}</td>
                  <td>{moneyText(paystub.grossPay)}</td>
                  <td>{moneyText(paystub.netPay)}</td>
                  <td>
                    <span className={`status ${paystub.status.toLowerCase()}`}>{paystub.status}</span>
                  </td>
                  <td className="table-actions">
                    <button onClick={() => setSelectedId(paystub.id)}>View</button>
                    <button aria-label={`Download ${paystub.employeeName}`} title="Download paystub" onClick={() => download([paystub.id])}>↓</button>
                  </td>
                </tr>
              ))}
              {!paystubs.length && (
                <tr>
                  <td colSpan={9}>No paystubs match the filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        {selected && <section className="paystub-preview">
          <div className="employee-head">
            <div>
              <span className="avatar-sm">{selected.employeeName.charAt(0)}</span>
              <span><b>{selected.employeeName}</b><small>{selected.employeeNumber} | {selected.payFrequency}</small></span>
            </div>
            <div><button title="Previous paystub" disabled={selectedIndex <= 0} onClick={() => setSelectedId(filtered[selectedIndex - 1].id)}>‹</button> {selectedIndex + 1} of {filtered.length} <button title="Next paystub" disabled={selectedIndex >= filtered.length - 1} onClick={() => setSelectedId(filtered[selectedIndex + 1].id)}>›</button></div>
          </div>
          <div className="paystub-preview-actions"><button onClick={() => download([selected.id])}>↓ Download</button><button onClick={() => send([selected.id])}>✉ Send to Employee</button></div>
          <article className="paystub-statement" aria-label={`Paystub details for ${selected.employeeName}`}>
            <header>
              <div>
                <strong>{companyName || 'Payhours'}</strong>
                <span>Earnings Statement</span>
              </div>
              <b>Payhours</b>
            </header>
            <dl className="paystub-statement-meta">
              <div><dt>Employee Name</dt><dd>{selected.employeeName}</dd></div>
              <div><dt>Employee ID</dt><dd>{selected.employeeNumber || '-'}</dd></div>
              <div><dt>Pay Period</dt><dd>{selectedPeriod}</dd></div>
              <div><dt>Pay Date</dt><dd>{formatDate(selected.payDate, 'en')}</dd></div>
              <div><dt>Position</dt><dd>{selected.position || '-'}</dd></div>
              <div><dt>Pay Frequency</dt><dd>{selected.payFrequency}</dd></div>
              <div><dt>Status</dt><dd>{selected.status}</dd></div>
              <div><dt>Employee Type</dt><dd>{selected.regularHours >= 70 ? 'Full Time' : 'Part Time'}</dd></div>
            </dl>
            <section className="paystub-statement-section">
              <h3>Gross Earnings</h3>
              <table>
                <thead><tr><th>Earnings</th><th>Hours</th><th>YTD Hours</th><th>Rate</th><th>Amount</th><th>YTD</th></tr></thead>
                <tbody>
                  {selectedEarnings.map((line) => (
                    <tr key={`${line.description}-${line.amount}`}><td>{line.description}</td><td>{line.hours ? line.hours.toFixed(2) : '-'}</td><td>{line.ytdHours ? line.ytdHours.toFixed(2) : '-'}</td><td>{line.rate || '-'}</td><td>{moneyText(line.amount)}</td><td>{moneyText(line.ytd)}</td></tr>
                  ))}
                  {!selectedEarnings.length && <tr><td colSpan={6}>No earning lines recorded.</td></tr>}
                  <tr className="paystub-statement-total"><th>Total Gross Earnings</th><th>{(selected.regularHours + selected.overtimeHours).toFixed(2)}</th><th>{(selected.regularHoursYtd + selected.overtimeHoursYtd).toFixed(2)}</th><th></th><th>{moneyText(selected.grossPay)}</th><th>{moneyText(selected.yearToDateGrossPay)}</th></tr>
                </tbody>
              </table>
            </section>
            <section className="paystub-statement-section">
              <h3>Deductions</h3>
              <table>
                <thead><tr><th>Deductions</th><th>Amount</th><th>YTD</th></tr></thead>
                <tbody>
                  {selectedDeductions.filter((line) => Number(line.amount) > 0).map((line) => (
                    <tr key={line.code || line.description}><td>{line.description}</td><td>{moneyText(line.amount)}</td><td>{moneyText(line.ytd)}</td></tr>
                  ))}
                  {!selectedDeductions.some((line) => Number(line.amount) > 0) && <tr><td colSpan={3}>No deductions recorded.</td></tr>}
                  <tr className="paystub-statement-total"><th>Total Deductions</th><th>{moneyText(selected.deductionsTotal)}</th><th>{moneyText(selected.deductionsTotalYtd)}</th></tr>
                </tbody>
              </table>
            </section>
            <div className="paystub-net-pay"><span>Net Pay</span><strong>{moneyText(selected.netPay)}</strong><span>YTD Net Pay</span><strong>{moneyText(selected.yearToDateNetPay)}</strong></div>
          </article>
        </section>}
      </div>
      <footer className="paystubs-pagination"><span>Showing {filtered.length ? (Math.min(page, pages) - 1) * pageSize + 1 : 0} - {Math.min(Math.min(page, pages) * pageSize, filtered.length)} of {filtered.length} paystubs</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{Math.min(page, pages)} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button><select aria-label="Paystubs per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select></div></footer>
    </section>
  );
}

type EmployerBulletin = {
  id: string;
  title: string;
  body: string;
  postedAt: string;
  postedBy: string;
  readCount: number;
  employeeCount: number;
  source?: 'company' | 'platform';
  audience?: 'employers' | 'employees' | 'both';
  isRead?: boolean;
};

function EmployerNotifications({
  token,
  onChanged
}: {
  token: string;
  onChanged: () => void;
}) {
  const [bulletins, setBulletins] = useState<EmployerBulletin[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<{
      bulletins: EmployerBulletin[];
      platformNotifications: EmployerBulletin[];
    }>('/employer/bulletins', token);
    setBulletins([
      ...result.platformNotifications.map((item) => ({ ...item, source: 'platform' as const })),
      ...result.bulletins.map((item) => ({ ...item, source: 'company' as const }))
    ].sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime()));
  }

  useEffect(() => {
    load().catch(() => setMessage('Could not load company notifications.'));
  }, [token]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await api('/employer/bulletins', token, {
        method: 'POST',
        body: JSON.stringify({ title, body })
      });
      setTitle('');
      setBody('');
      setMessage('Notification published to employees.');
      await load();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish notification.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(bulletin: EmployerBulletin) {
    if (!window.confirm(`Delete "${bulletin.title}"? Employees will no longer see it.`)) return;
    await api(`/employer/bulletins/${bulletin.id}`, token, { method: 'DELETE' });
    await load();
    onChanged();
  }

  async function markPlatformRead(bulletin: EmployerBulletin) {
    await api(`/employer/platform-notifications/${bulletin.id}/read`, token, { method: 'POST' });
    await load();
  }

  return (
    <section className="module-page employer-notifications-page">
      <div className="employee-head">
        <div>
          <h1>Employee Notifications</h1>
          <p>Publish company announcements to employee portals.</p>
        </div>
        <button type="button" onClick={() => load()}>Refresh</button>
      </div>
      <div className="employer-notification-layout">
        <form className="admin-panel notification-composer" onSubmit={publish}>
          <h2>New notification</h2>
          <label>
            Title
            <input
              maxLength={100}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Message
            <textarea
              maxLength={1000}
              required
              rows={7}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <small>{body.length}/1000 characters</small>
          <button className="run-payroll" disabled={busy || title.trim().length < 2 || body.trim().length < 2}>
            {busy ? 'Publishing...' : 'Publish notification'}
          </button>
          {message && <p className="success-note">{message}</p>}
        </form>
        <section className="admin-panel employer-notification-list">
          <h2>Published notifications</h2>
          {bulletins.map((bulletin) => (
            <article key={bulletin.id}>
              <div>
                <strong>{bulletin.title}</strong>
                <small>{formatDate(bulletin.postedAt, 'en')} by {bulletin.postedBy}</small>
              </div>
              <p>{bulletin.body}</p>
              <div className="notification-delivery">
                <span>{bulletin.source === 'platform' ? 'Payhours announcement' : 'Published'}</span>
                {bulletin.source === 'company' && <b>{bulletin.readCount} of {bulletin.employeeCount} read</b>}
                {bulletin.source === 'platform' && !bulletin.isRead && (
                  <button onClick={() => markPlatformRead(bulletin)}>Mark as read</button>
                )}
                {bulletin.source === 'company' && (
                  <button className="danger-button" onClick={() => remove(bulletin)}>Delete</button>
                )}
              </div>
            </article>
          ))}
          {!bulletins.length && <p>No notifications have been published.</p>}
        </section>
      </div>
    </section>
  );
}

function EmployerDashboard({
  data,
  token,
  onLogout,
  companies,
  onSwitchCompany
}: {
  data?: EmployerDashboard;
  token: string;
  onLogout: () => void;
  companies: EmployerCompanyChoice[];
  onSwitchCompany: (companyId: string) => void;
}) {
  const [adminPage, setAdminPage] = useState('Dashboard');
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | undefined>();
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [employerNotificationCount, setEmployerNotificationCount] = useState(0);
  const [employeePasswordNotice, setEmployeePasswordNotice] = useState<{
    employeeName: string;
    login: string;
    temporaryPassword?: string;
    emailSent?: boolean;
    emailError?: string;
    error?: string;
  }>();
  const [resettingEmployeeId, setResettingEmployeeId] = useState('');
  useEffect(() => {
    api<{ employees: EmployeeProfile[] }>('/employer/employees', token)
      .then((result) => setEmployees(result.employees))
      .catch(() => setEmployees([]));
  }, [token, refresh]);
  useEffect(() => {
    api<{ bulletins: EmployerBulletin[]; platformNotifications: EmployerBulletin[] }>('/employer/bulletins', token)
      .then((result) => setEmployerNotificationCount(
        result.bulletins.length + result.platformNotifications.filter((item) => !item.isRead).length
      ))
      .catch(() => setEmployerNotificationCount(0));
  }, [token, refresh]);
  useEffect(() => {
    api<{ runs: PayrollRun[] }>('/employer/payroll-runs', token)
      .then((result) => setPayrollRuns(result.runs))
      .catch(() => setPayrollRuns([]));
  }, [token, refresh]);
  const nav = [
    'Dashboard',
    'Employees',
    'Time & Attendance',
    'Payroll',
    'Paystubs',
    'Benefits',
    'Deductions',
    'Government Filings',
    'Reports',
    'Documents',
    'Notifications',
    'Company',
    'Settings'
  ];
  const reportSubNav = [
    'All Reports',
    'Payroll Reports',
    'Employee Reports',
    'Tax & Compliance',
    'Benefits & Deductions',
    'Custom Reports',
    'Scheduled Reports'
  ];
  const reportPages = [
    'Reports',
    ...reportSubNav,
    'Hours Report',
    'Earnings Report',
    'Employee Details Report',
    'Deductions Report',
    'Employee History Report'
  ];
  const max = Math.max(1, ...(data?.chart.map((point) => point.amount) || []));
  const money = (value = 0) => `$ ${value.toLocaleString('en-CA')}`;
  const next = data?.nextPayroll;
  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  async function editEmployee(employee: EmployeeProfile) {
    const result = await api<{ employee: EmployeeProfile }>(
      `/employer/employees/${employee.id}`,
      token
    );
    setEditingEmployee(result.employee);
    setAdminPage('Edit Employee');
  }
  async function deleteEmployee(employee: EmployeeProfile) {
    const name = employeeName(employee);
    if (
      !window.confirm(
        `Delete ${name}? This removes the employee profile and login, but payroll history stays in MongoDB.`
      )
    )
      return;
    await api(`/employer/employees/${employee.id}`, token, { method: 'DELETE' });
    if (editingEmployee?.id === employee.id) setEditingEmployee(undefined);
    setRefresh((value) => value + 1);
    setAdminPage('Employees');
  }
  async function showEmployeePassword(employee: EmployeeProfile) {
    if (!employee.id) return;
    setResettingEmployeeId(employee.id);
    try {
      const result = await api<{
        employee: EmployeeProfile;
        temporaryPassword: string;
        emailSent?: boolean;
        emailError?: string;
      }>(`/employer/employees/${employee.id}/reset-password`, token, { method: 'POST' });
      setEmployeePasswordNotice({
        employeeName: employeeName(result.employee),
        login: result.employee.personalEmail || employee.personalEmail || '-',
        temporaryPassword: result.temporaryPassword,
        emailSent: result.emailSent,
        emailError: result.emailError
      });
      setRefresh((value) => value + 1);
    } catch (caught) {
      setEmployeePasswordNotice({
        employeeName: employeeName(employee),
        login: employee.personalEmail || '-',
        emailSent: false,
        error: caught instanceof Error ? `Could not reset password: ${caught.message}` : 'Could not reset password'
      });
    } finally {
      setResettingEmployeeId('');
    }
  }
  const dashboard = (
    <>
      <div className="admin-title">
        <div>
          <h1>Good morning, Admin!</h1>
          <p>Here's what's happening with your payroll today.</p>
        </div>
        <label>
          Company
          <select
            value={data?.company.id || ''}
            onChange={(event) => onSwitchCompany(event.target.value)}
          >
            {companies.map((company) => (
              <option value={company.id} key={company.id}>
                {company.legalName}
              </option>
            ))}
          </select>
        </label>
        <b>{todayLabel}</b>
      </div>
      <div className="metric-grid">
        <article>
          <span className="ui-icon team" aria-hidden="true"></span>
          <p>Total Employees</p>
          <strong>{employees.length || data?.metrics.totalEmployees || 0}</strong>
          <small>From database</small>
        </article>
        <article>
          <span className="ui-icon money" aria-hidden="true"></span>
          <p>This Month's Payroll</p>
          <strong>{money(data?.metrics.monthlyPayroll || 0)}</strong>
          <small>Fetched from payroll records</small>
        </article>
        <article>
          <span className="ui-icon calendar" aria-hidden="true"></span>
          <p>Next Pay Run</p>
          <strong>{next ? formatDate(next.payDate, 'en') : '-'}</strong>
          <small>{next?.status || 'No run found'}</small>
        </article>
        <article>
          <span className="ui-icon tax" aria-hidden="true"></span>
          <p>Government Liabilities</p>
          <strong>{money(data?.metrics.governmentLiabilities || 0)}</strong>
          <small>Open filings</small>
        </article>
        <article>
          <span className="ui-icon alert" aria-hidden="true"></span>
          <p>Action Required</p>
          <strong>{data?.metrics.actionRequired || 0}</strong>
          <small>View Tasks</small>
        </article>
      </div>
      <div className="admin-grid">
        <section className="admin-panel chart-panel">
          <h2>Payroll Summary (Last 6 Months)</h2>
          <div className="bar-chart">
            {(data?.chart || []).map((point) => (
              <div key={point.label}>
                <span style={{ height: `${(point.amount / max) * 170}px` }} />
                <small>{point.label}</small>
              </div>
            ))}
            {!(data?.chart || []).length && <p className="report-empty">No payroll history yet.</p>}
          </div>
        </section>
        <section className="admin-panel next-payroll">
          <h2>Next Payroll</h2>
          <div className="payroll-band">
            <b>
              {next
                ? `${formatDate(next.periodStart, 'en')} - ${formatDate(next.periodEnd, 'en')}`
                : 'No payroll run found'}
            </b>
            <span>{next?.status || 'Pending'}</span>
            <small>Pay Date: {next ? formatDate(next.payDate, 'en') : '-'}</small>
          </div>
          <div className="payroll-stats">
            <p>
              Employees<b>{next?.employeeCount || employees.length}</b>
            </p>
            <p>
              Total Hours<b>{next?.totalHours.toLocaleString('en-CA') || '0'}</b>
            </p>
            <p>
              Estimated Gross<b>{money(next?.estimatedGross || 0)}</b>
            </p>
          </div>
          <button className="run-payroll">Run Payroll</button>
        </section>
        <section className="admin-panel">
          <h2>
            Recent Activity <a>View All</a>
          </h2>
          {data?.recentActivity.map(([text, when]) => (
            <p className="activity-row" key={text}>
              <span>{text}</span>
              <small>{when}</small>
            </p>
          ))}
          {!data?.recentActivity.length && <p className="report-empty">No recent activity yet.</p>}
        </section>
        <section className="admin-panel">
          <h2>
            Tasks & Alerts <a>View All</a>
          </h2>
          {data?.alerts.map(([text, action, tone]) => (
            <p className={`alert-row ${tone}`} key={text}>
              <span>{text}</span>
              <button>{action}</button>
            </p>
          ))}
          {!data?.alerts.length && <p className="report-empty">No open alerts.</p>}
        </section>
      </div>
    </>
  );
  const content =
    adminPage === 'Employees' ? (
      <EmployeesPage
        employees={employees}
        onAdd={() => {
          setEditingEmployee(undefined);
          setAdminPage('Add Employee');
        }}
        onEdit={editEmployee}
        onDelete={deleteEmployee}
        onShowPassword={showEmployeePassword}
        passwordNotice={employeePasswordNotice}
        resettingEmployeeId={resettingEmployeeId}
      />
    ) : adminPage === 'Add Employee' ? (
      <AddEmployee
        token={token}
        onCancel={() => setAdminPage('Employees')}
        onSaved={(result) => {
          if (result?.temporaryPassword && result.employee) {
            setEmployeePasswordNotice({
              employeeName: employeeName(result.employee),
              login: result.employee.personalEmail || '-',
              temporaryPassword: result.temporaryPassword,
              emailSent: result.emailSent,
              emailError: result.emailError
            });
          }
          setRefresh((value) => value + 1);
          setAdminPage('Employees');
        }}
      />
    ) : adminPage === 'Edit Employee' && editingEmployee ? (
      <AddEmployee
        token={token}
        employee={editingEmployee}
        onDelete={deleteEmployee}
        onCancel={() => setAdminPage('Employees')}
        onSaved={() => {
          setRefresh((value) => value + 1);
          setAdminPage('Employees');
        }}
      />
    ) : adminPage === 'Payroll' ? (
      <PayrollPage
        token={token}
        runs={payrollRuns}
        employees={employees}
        onRefresh={() => setRefresh((value) => value + 1)}
        onNewRun={() => setAdminPage('New Payroll Run')}
      />
    ) : adminPage === 'New Payroll Run' ? (
      <NewPayrollRun
        token={token}
        employees={employees}
        onCancel={() => setAdminPage('Payroll')}
        onDone={() => {
          setRefresh((value) => value + 1);
          setAdminPage('Payroll');
        }}
      />
    ) : adminPage === 'Paystubs' ? (
      <PaystubsPage token={token} />
    ) : adminPage === 'Deductions' ? (
      <DeductionsPage token={token} onEditEmployee={(employeeId) => {
        const employee = employees.find((item) => item.id === employeeId);
        if (employee) void editEmployee(employee);
      }} />
    ) : adminPage === 'Government Filings' ? (
      <GovernmentFilingsPage token={token} />
    ) : adminPage === 'Reports' ? (
      <EmployerReportsPage
        token={token}
        initialTab="All Reports"
        onOpenPayroll={() => setAdminPage('Payroll Reports')}
        onOpenHours={() => setAdminPage('Hours Report')}
        onOpenEarnings={() => setAdminPage('Earnings Report')}
        onOpenEmployees={() => setAdminPage('Employee Reports')}
        onOpenDeductions={() => setAdminPage('Deductions Report')}
        onOpenHistory={() => setAdminPage('Employee History Report')}
      />
    ) : ['All Reports', 'Tax & Compliance', 'Benefits & Deductions', 'Custom Reports', 'Scheduled Reports'].includes(adminPage) ? (
      <EmployerReportsPage
        token={token}
        initialTab={adminPage}
        onOpenPayroll={() => setAdminPage('Payroll Reports')}
        onOpenHours={() => setAdminPage('Hours Report')}
        onOpenEarnings={() => setAdminPage('Earnings Report')}
        onOpenEmployees={() => setAdminPage('Employee Reports')}
        onOpenDeductions={() => setAdminPage('Deductions Report')}
        onOpenHistory={() => setAdminPage('Employee History Report')}
      />
    ) : adminPage === 'Payroll Reports' ? (
      <EmployerPayrollReportsPage token={token} onBack={() => setAdminPage('Reports')} />
    ) : adminPage === 'Hours Report' ? (
      <EmployerHoursReportPage token={token} onBack={() => setAdminPage('Reports')} />
    ) : adminPage === 'Earnings Report' ? (
      <EmployerEarningsReportPage token={token} onBack={() => setAdminPage('Reports')} />
    ) : adminPage === 'Employee Details Report' ? (
      <EmployerEmployeeDetailsReportPage token={token} onBack={() => setAdminPage('Employee Reports')} />
    ) : adminPage === 'Deductions Report' ? (
      <EmployerDeductionsReportPage token={token} onBack={() => setAdminPage('Employee Reports')} />
    ) : adminPage === 'Employee History Report' ? (
      <EmployerHistoryReportPage token={token} onBack={() => setAdminPage('Employee Reports')} />
    ) : adminPage === 'Employee Reports' ? (
      <EmployerEmployeeListReportPage
        token={token}
        onBack={() => setAdminPage('Reports')}
        onOpenDetails={() => setAdminPage('Employee Details Report')}
        onOpenEarnings={() => setAdminPage('Earnings Report')}
        onOpenHours={() => setAdminPage('Hours Report')}
        onOpenDeductions={() => setAdminPage('Deductions Report')}
        onOpenHistory={() => setAdminPage('Employee History Report')}
      />
    ) : adminPage === 'Company' ? (
      <StatePaySettings token={token} />
    ) : adminPage === 'Notifications' ? (
      <EmployerNotifications
        token={token}
        onChanged={() => setRefresh((value) => value + 1)}
      />
    ) : (
      dashboard
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        {nav.map((item) => (
          <div className="sidebar-nav-group" key={item}>
          <button
            className={
              adminPage === item ||
              (adminPage === 'New Payroll Run' && item === 'Payroll') ||
              (reportPages.includes(adminPage) && item === 'Reports') ||
              ((adminPage === 'Add Employee' || adminPage === 'Edit Employee') &&
                item === 'Employees')
                ? 'active'
                : ''
            }
            onClick={() => setAdminPage(item)}
          >
            <span>{item.charAt(0)}</span>
            {item}
          </button>
          {item === 'Reports' && reportPages.includes(adminPage) && reportSubNav.map((subItem) => (
            <button
              className={`sub-nav-item ${adminPage === subItem || (subItem === 'All Reports' && adminPage === 'Reports') ? 'active' : ''}`}
              key={subItem}
              onClick={() => setAdminPage(subItem === 'All Reports' ? 'Reports' : subItem)}
            >
              <span>•</span>
              {subItem}
            </button>
          ))}
          </div>
        ))}
        <div className="built-canada">Proudly Built for Canadian Businesses</div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <label className="admin-search">
            <span className="top-icon search" aria-hidden="true"></span>
            <input placeholder="Search employees, payroll, reports..." />
          </label>
          <button
            title="Notifications"
            aria-label="Notifications"
            onClick={() => setAdminPage('Notifications')}
          >
            <span className="top-icon bell" aria-hidden="true"></span>
            {employerNotificationCount > 0 && <i>{employerNotificationCount}</i>}
          </button>
          <button title="Help" aria-label="Help">
            <span className="top-icon help" aria-hidden="true"></span>
          </button>
          <div className="admin-profile">
            <b>{data?.user.name || 'Admin User'}</b>
            <span>{data?.company.legalName || 'ABC Solutions Inc.'}</span>
          </div>
          <button title="Logout" aria-label="Logout" onClick={onLogout}>
            <span className="top-icon logout" aria-hidden="true"></span>
          </button>
        </header>
        <section className="admin-content">{content}</section>
      </main>
    </div>
  );
}

function EmployerReportsPage({
  token,
  initialTab = 'All Reports',
  onOpenPayroll,
  onOpenHours,
  onOpenEarnings,
  onOpenEmployees,
  onOpenDeductions,
  onOpenHistory
}: {
  token: string;
  initialTab?: string;
  onOpenPayroll: () => void;
  onOpenHours: () => void;
  onOpenEarnings: () => void;
  onOpenEmployees: () => void;
  onOpenDeductions: () => void;
  onOpenHistory: () => void;
}) {
  const [data, setData] = useState<EmployerReportsData>();
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All Categories');
  const [format, setFormat] = useState('All Formats');
  useEffect(() => {
    api<EmployerReportsData>('/employer/reports', token)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load reports from the database.');
      });
  }, [token]);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const tabs = ['All Reports', 'Payroll Reports', 'Employee Reports', 'Tax & Compliance', 'Benefits & Deductions', 'Custom Reports', 'Scheduled Reports'];
  const normalized = search.trim().toLowerCase();
  const visibleGroups = (data?.groups || [])
    .filter((group) => activeTab === 'All Reports' || group.title.startsWith(activeTab))
    .filter((group) => category === 'All Categories' || group.title === category)
    .map((group) => ({
      ...group,
      reports: group.reports.filter((report) => {
        const matchesSearch = !normalized || `${report.name} ${report.description}`.toLowerCase().includes(normalized);
        const matchesFormat = format === 'All Formats' || report.formats.includes(format);
        return matchesSearch && matchesFormat;
      })
    }))
    .filter((group) => group.reports.length);
  return (
    <section className="reports-page">
      <header className="reports-head">
        <div>
          <h1>Reports</h1>
          <p>Generate reports for payroll, employees, taxes, deductions and more.</p>
        </div>
        <button type="button" className="reports-primary"><span>+</span>Create Custom Report</button>
      </header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading reports...</p>}
      {data && (
      <>
      <div className="report-metrics">
        <article><span>doc</span><p>Total Reports</p><strong>{data.metrics.totalReports}</strong><small>Available Reports</small></article>
        <article><span>time</span><p>Most Used</p><strong>{data.metrics.mostUsed}</strong><small>{data.metrics.mostUsedCaption}</small></article>
        <article><span>cal</span><p>Scheduled Reports</p><strong>{data.metrics.scheduledReports}</strong><small>Active schedules</small></article>
        <article><span>down</span><p>Reports Generated</p><strong>{data.metrics.reportsGenerated}</strong><small>This Month</small></article>
      </div>
      <nav className="report-tabs">
        {tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </nav>
      <div className="report-filters">
        <label className="report-search"><span className="top-icon search" aria-hidden="true"></span><input placeholder="Search reports..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All Categories</option>{data.groups.map((group) => <option key={group.title}>{group.title}</option>)}</select></label>
        <label>Report Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option>All Formats</option><option>PDF</option><option>Excel</option><option>CSV</option></select></label>
        <button type="button" onClick={() => { setSearch(''); setCategory('All Categories'); setFormat('All Formats'); }}>Clear Filters</button>
      </div>
      <div className="report-grid">
        {visibleGroups.map((group) => (
          <article className={`report-card ${group.tone}`} key={group.title}>
            <header><span>{group.title.charAt(0)}</span><div><h2>{group.title}</h2><p>{group.description}</p></div></header>
            {group.reports.slice(0, 4).map((report) => (
              <button
                className="report-row"
                key={report.name}
                onClick={() => {
                  if (group.title === 'Payroll Reports') onOpenPayroll();
                  if (report.name === 'Employee List') onOpenEmployees();
                  if (report.name === 'Employee Hours Report') onOpenHours();
                  if (report.name === 'Employee Earnings Report') onOpenEarnings();
                  if (report.name === 'Employee Deduction Report') onOpenDeductions();
                  if (report.name === 'Employee Profile Audit') onOpenHistory();
                }}
              >
                <span className="report-doc">doc</span>
                <b>{report.name}</b>
                <small>{report.description}</small>
                <em>{report.formats.map((item) => <i key={item} className={item.toLowerCase()}>{item}</i>)}</em>
                <strong>&gt;</strong>
              </button>
            ))}
            <button
              className="report-view"
              onClick={() => {
                if (group.title === 'Payroll Reports') onOpenPayroll();
                if (group.title === 'Employee Reports') onOpenEmployees();
              }}
            >
              View All {group.title} ({group.reports.length}) <span>&gt;</span>
            </button>
          </article>
        ))}
        {!visibleGroups.length && <p className="report-empty">No reports match the selected filters.</p>}
      </div>
      </>
      )}
    </section>
  );
}

function EmployerPayrollReportsPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerPayrollSummaryReport>();
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [employee, setEmployee] = useState('All Employees');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [activeTab, setActiveTab] = useState('Payroll Details');
  const [expandedPayrollDetailKey, setExpandedPayrollDetailKey] = useState('');
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(10);
  useEffect(() => {
    api<EmployerPayrollSummaryReport>('/employer/reports/payroll-summary', token)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load payroll report data from the database.');
      });
  }, [token]);
  const moneyValue = (value: number) => `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const visibleRows = (data?.rows || [])
    .filter((row) => matchesFilter(row.department, department, 'All Departments'))
    .filter((row) => matchesFilter(row.employeeName, employee, 'All Employees'))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'));
  const reportPageCount = Math.max(1, Math.ceil(visibleRows.length / reportPageSize));
  const currentReportPage = Math.min(reportPage, reportPageCount);
  const payrollDetailRows = visibleRows.slice(
    (currentReportPage - 1) * reportPageSize,
    currentReportPage * reportPageSize
  );
  useEffect(() => {
    setReportPage(1);
  }, [department, employee, payGroup, activeTab, reportPageSize]);
  const payrollDetailKey = (row: EmployerPayrollSummaryReport['rows'][number]) =>
    row.employeeNumber || String(row.index);
  const activePayrollDetailKey =
    activeTab === 'Payroll Details'
      ? expandedPayrollDetailKey || (payrollDetailRows[0] ? payrollDetailKey(payrollDetailRows[0]) : '')
      : '';
  const filteredTotals = visibleRows.reduce((sum, row) => ({
    hours: sum.hours + row.hours,
    grossPay: sum.grossPay + row.grossPay,
    deductions: sum.deductions + row.deductions,
    netPay: sum.netPay + row.netPay,
    employerCosts: sum.employerCosts + row.employerCosts,
    regularHours: sum.regularHours + row.regularHours,
    overtimeHours: sum.overtimeHours + row.overtimeHours,
    statePayHours: sum.statePayHours + row.statePayHours,
    vacationPay: sum.vacationPay + row.vacationPay,
    statePay: sum.statePay + row.statePay,
    otherEarnings: sum.otherEarnings + row.otherEarnings,
    cpp: sum.cpp + row.cpp,
    ei: sum.ei + row.ei,
    federalTax: sum.federalTax + row.federalTax,
    provincialTax: sum.provincialTax + row.provincialTax,
    preTaxDeductions: sum.preTaxDeductions + row.preTaxDeductions,
    postTaxDeductions: sum.postTaxDeductions + row.postTaxDeductions
  }), {
    hours: 0, grossPay: 0, deductions: 0, netPay: 0, employerCosts: 0, regularHours: 0,
    overtimeHours: 0, statePayHours: 0, vacationPay: 0, statePay: 0, otherEarnings: 0,
    cpp: 0, ei: 0, federalTax: 0, provincialTax: 0, preTaxDeductions: 0, postTaxDeductions: 0
  });
  const reportTitle = activeTab === 'Payroll Summary'
    ? 'Payroll Summary Report'
    : activeTab;
  const reportDescription =
    activeTab === 'Payroll Details'
      ? 'Detailed line-by-line pay information from the selected payroll run.'
      : activeTab === 'Pay Run Comparison'
        ? 'Compare gross pay, deductions, net pay and employer costs for each employee in this run.'
        : activeTab === 'Earnings Report'
          ? 'Breakdown of regular, overtime, vacation, statutory holiday and other earnings.'
          : activeTab === 'Deductions Report'
            ? 'Detailed employee deductions including CPP, EI, tax and custom deductions.'
            : activeTab === 'Net Pay Report'
              ? 'Net pay calculation by employee for the selected pay period.'
              : activeTab === 'Year to Date Summary'
                ? 'Year to date totals currently available from finalized payroll data.'
                : 'Overview of total payroll costs, employee count and key amounts for the selected pay period.';
  const tabs = ['Payroll Summary', 'Payroll Details', 'Pay Run Comparison', 'Earnings Report', 'Deductions Report', 'Net Pay Report', 'Year to Date Summary'];
  return (
    <section className="payroll-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Payroll Reports <span>&gt;</span> {activeTab}</div>
      <header className="reports-head payroll-report-head">
        <div>
          <h1>{activeTab}</h1>
          <p>{activeTab === 'Payroll Details' ? 'Detailed breakdown of all employee earnings, hours, deductions and net pay for each pay run.' : 'Generate detailed payroll reports for pay runs, earnings, hours, deductions and net pay.'}</p>
        </div>
        <button type="button" className="reports-back" onClick={onBack}>Back</button>
      </header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading payroll report...</p>}
      {data && (
      <>
      <div className="report-metrics payroll-report-metrics">
        <article><span>doc</span><p>Total Pay Runs</p><strong>{data.metrics.totalPayRuns}</strong><small>This Year</small></article>
        <article><span>$</span><p>Total Gross Pay</p><strong>{data.metrics.totalGrossPay}</strong><small>This Year</small></article>
        <article><span>team</span><p>Total Employees Paid</p><strong>{data.metrics.totalEmployeesPaid}</strong><small>This Year</small></article>
        <article><span>cal</span><p>Last Pay Run</p><strong>{data.metrics.lastPayRun}</strong><small>{formatDate(data.metrics.lastPayRunDate, 'en')}</small></article>
      </div>
      <nav className="report-tabs payroll-report-tabs">
        {tabs.map((tab) => <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      </nav>
      <div className="payroll-report-filters">
        <label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}>{data.filters.payPeriods.concat(data.summary.payPeriod).filter((item, index, list) => item && list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Employee<select value={employee} onChange={(event) => setEmployee(event.target.value)}>{data.filters.employees.concat(data.rows.map((row) => row.employeeName)).filter((item, index, list) => item && list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button type="button" onClick={() => { setDepartment('All Departments'); setEmployee('All Employees'); setPayGroup('All Pay Groups'); }}>Clear Filters</button>
      </div>
      <div className="payroll-report-layout">
        <section className={activeTab === 'Payroll Details' ? 'payroll-report-main payroll-details-main' : 'payroll-report-main'}>
          <header>
            <div><h2>{reportTitle}</h2><p>{reportDescription}</p></div>
            <ReportExportButtons title={reportTitle} />
          </header>
          <div className="payroll-summary-strip">
            <article><strong>{visibleRows.length}</strong><span>Employees Paid</span></article>
            <article><strong>{filteredTotals.hours.toFixed(2)}</strong><span>Total Hours</span></article>
            <article><strong>{moneyValue(filteredTotals.grossPay)}</strong><span>Total Gross Pay</span></article>
            <article><strong>{moneyValue(filteredTotals.deductions)}</strong><span>Total Deductions</span></article>
            <article><strong>{moneyValue(filteredTotals.netPay)}</strong><span>Total Net Pay</span></article>
            <article><strong>{moneyValue(filteredTotals.employerCosts)}</strong><span>Total Employer Costs</span></article>
          </div>
          {activeTab === 'Payroll Summary' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Pay Group</th><th>Hours</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Employer Costs</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.payGroup || '-'}</td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td>{moneyValue(row.employerCosts)}</td></tr>)}{!visibleRows.length && <tr><td colSpan={10}>No payroll run data found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td></td><td></td><td></td><td>{filteredTotals.hours.toFixed(2)}</td><td>{moneyValue(filteredTotals.grossPay)}</td><td>{moneyValue(filteredTotals.deductions)}</td><td>{moneyValue(filteredTotals.netPay)}</td><td>{moneyValue(filteredTotals.employerCosts)}</td></tr></tfoot></table></div>}
          {activeTab === 'Payroll Details' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Pay Group</th><th>Hours</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Actions</th></tr></thead><tbody>{payrollDetailRows.flatMap((row) => { const rowKey = payrollDetailKey(row); const isExpanded = rowKey === activePayrollDetailKey; return [<tr key={rowKey} className={isExpanded ? 'selected-detail-row' : ''}><td>{row.index}</td><td>{row.employeeName}</td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.payGroup || '-'}</td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td><button className="row-expand-button" type="button" aria-label={`View details for ${row.employeeName}`} onClick={() => setExpandedPayrollDetailKey(rowKey)}>{isExpanded ? '^' : 'v'}</button></td></tr>, ...(isExpanded ? [<tr key={`detail-${rowKey}`} className="payroll-detail-panel-row"><td colSpan={10}><PayrollDetailPanel row={row} moneyValue={moneyValue} payPeriod={data.summary.payPeriod} /></td></tr>] : [])]; })}{!visibleRows.length && <tr><td colSpan={10}>No payroll run data found in the database.</td></tr>}</tbody></table></div>}
          {activeTab === 'Pay Run Comparison' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Current Gross</th><th>Current Deductions</th><th>Current Net</th><th>Employer Costs</th><th>Gross % of Run</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td>{moneyValue(row.employerCosts)}</td><td>{filteredTotals.grossPay ? `${(row.grossPay / filteredTotals.grossPay * 100).toFixed(1)}%` : '0.0%'}</td></tr>)}{!visibleRows.length && <tr><td colSpan={7}>No payroll run data found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td>{moneyValue(filteredTotals.grossPay)}</td><td>{moneyValue(filteredTotals.deductions)}</td><td>{moneyValue(filteredTotals.netPay)}</td><td>{moneyValue(filteredTotals.employerCosts)}</td><td>100.0%</td></tr></tfoot></table></div>}
          {activeTab === 'Earnings Report' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Regular Hours</th><th>Regular Pay</th><th>Overtime Hours</th><th>Overtime Pay</th><th>Vacation Pay</th><th>Stat Holiday Pay</th><th>Other Earnings</th><th>Total Earnings</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{row.regularHours.toFixed(2)}</td><td>{moneyValue(row.regularHours * row.hourlyRate)}</td><td>{row.overtimeHours.toFixed(2)}</td><td>{moneyValue(row.overtimeHours * row.hourlyRate * 1.5)}</td><td>{moneyValue(row.vacationPay)}</td><td>{moneyValue(row.statePay)}</td><td>{moneyValue(row.otherEarnings)}</td><td>{moneyValue(row.grossPay)}</td></tr>)}{!visibleRows.length && <tr><td colSpan={10}>No employee earnings found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td>{filteredTotals.regularHours.toFixed(2)}</td><td></td><td>{filteredTotals.overtimeHours.toFixed(2)}</td><td></td><td>{moneyValue(filteredTotals.vacationPay)}</td><td>{moneyValue(filteredTotals.statePay)}</td><td>{moneyValue(filteredTotals.otherEarnings)}</td><td>{moneyValue(filteredTotals.grossPay)}</td></tr></tfoot></table></div>}
          {activeTab === 'Deductions Report' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>CPP</th><th>EI</th><th>Federal Tax</th><th>Provincial Tax</th><th>Pre-tax</th><th>Post-tax</th><th>Total Deductions</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{moneyValue(row.cpp)}</td><td>{moneyValue(row.ei)}</td><td>{moneyValue(combinedIncomeTax(row))}</td><td>{moneyValue(0)}</td><td>{moneyValue(row.preTaxDeductions)}</td><td>{moneyValue(row.postTaxDeductions)}</td><td>{moneyValue(row.deductions)}</td></tr>)}{!visibleRows.length && <tr><td colSpan={9}>No employee deductions found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td>{moneyValue(filteredTotals.cpp)}</td><td>{moneyValue(filteredTotals.ei)}</td><td>{moneyValue(combinedIncomeTax(filteredTotals))}</td><td>{moneyValue(0)}</td><td>{moneyValue(filteredTotals.preTaxDeductions)}</td><td>{moneyValue(filteredTotals.postTaxDeductions)}</td><td>{moneyValue(filteredTotals.deductions)}</td></tr></tfoot></table></div>}
          {activeTab === 'Net Pay Report' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Gross Pay</th><th>Employee Deductions</th><th>Net Pay</th><th>Net % of Gross</th><th>Pay Date</th><th>Status</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td>{row.grossPay ? `${(row.netPay / row.grossPay * 100).toFixed(1)}%` : '0.0%'}</td><td>{row.payDate ? formatDate(row.payDate, 'en') : '-'}</td><td>{row.status || '-'}</td></tr>)}{!visibleRows.length && <tr><td colSpan={8}>No net pay records found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td>{moneyValue(filteredTotals.grossPay)}</td><td>{moneyValue(filteredTotals.deductions)}</td><td>{moneyValue(filteredTotals.netPay)}</td><td>{filteredTotals.grossPay ? `${(filteredTotals.netPay / filteredTotals.grossPay * 100).toFixed(1)}%` : '0.0%'}</td><td></td><td></td></tr></tfoot></table></div>}
          {activeTab === 'Year to Date Summary' && <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>YTD Hours</th><th>YTD Gross</th><th>YTD Deductions</th><th>YTD Net</th><th>Employer Costs</th></tr></thead><tbody>{payrollDetailRows.map((row) => <tr key={payrollDetailKey(row)}><td>{row.index}</td><td>{row.employeeName}</td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td>{moneyValue(row.employerCosts)}</td></tr>)}{!visibleRows.length && <tr><td colSpan={7}>No year to date payroll data found in the database.</td></tr>}</tbody><tfoot><tr><td>Total</td><td>{visibleRows.length} Employees</td><td>{filteredTotals.hours.toFixed(2)}</td><td>{moneyValue(filteredTotals.grossPay)}</td><td>{moneyValue(filteredTotals.deductions)}</td><td>{moneyValue(filteredTotals.netPay)}</td><td>{moneyValue(filteredTotals.employerCosts)}</td></tr></tfoot></table></div>}
          <footer>
            <span>
              Showing {visibleRows.length ? (currentReportPage - 1) * reportPageSize + 1 : 0} - {Math.min(currentReportPage * reportPageSize, visibleRows.length)} of {visibleRows.length} employees
            </span>
            <div>
              <button disabled={currentReportPage <= 1} onClick={() => setReportPage(currentReportPage - 1)}>&lt;</button>
              {Array.from({ length: reportPageCount }, (_, index) => index + 1).map((pageNumber) => (
                <button key={pageNumber} className={pageNumber === currentReportPage ? 'active' : ''} onClick={() => setReportPage(pageNumber)}>{pageNumber}</button>
              ))}
              <button disabled={currentReportPage >= reportPageCount} onClick={() => setReportPage(currentReportPage + 1)}>&gt;</button>
            </div>
            <select value={reportPageSize} onChange={(event) => setReportPageSize(Number(event.target.value))}>
              <option value="10">10 / page</option>
              <option value="25">25 / page</option>
            </select>
          </footer>
        </section>
        <aside className="payroll-report-options">
          <h2><span>gear</span>Report Options</h2>
          {[
            ['Report Type', activeTab],
            ['Pay Period', data.summary.payPeriod],
            ['Department', department],
            ['Employee', employee],
            ['Pay Group', payGroup]
          ].map(([label, value]) => <label key={label}>{label}<select value={value} onChange={() => undefined}><option>{value}</option></select></label>)}
          <b>Include in Report</b>
          {['Employee Details', 'Hours', 'Gross Pay', 'Deductions', 'Employer Costs'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}
          <label className="report-check"><input type="checkbox" />Page Break by Department</label>
          <button type="button">Generate Report</button>
        </aside>
      </div>
      </>
      )}
    </section>
  );
}

function PayrollDetailPanel({
  row,
  moneyValue,
  payPeriod
}: {
  row: EmployerPayrollSummaryReport['rows'][number];
  moneyValue: (value: number) => string;
  payPeriod: string;
}) {
  const [activeDetailTab, setActiveDetailTab] = useState('Earnings & Hours');
  const detailTabs = [
    'Earnings & Hours',
    'Deductions',
    'Taxes',
    'Employer Contributions',
    'Paystub Preview'
  ];
  const earnings = [
    ['Regular Hours', `${moneyValue(row.hourlyRate)} / hr`, row.regularHours.toFixed(2), moneyValue(row.regularHours * row.hourlyRate)],
    ['Overtime Hours', `${moneyValue(row.hourlyRate * 1.5)} / hr`, row.overtimeHours.toFixed(2), moneyValue(row.overtimeHours * row.hourlyRate * 1.5)],
    ['Vacation Pay', '', '-', moneyValue(row.vacationPay)],
    ['Statutory Holiday Pay', '', row.statePayHours.toFixed(2), moneyValue(row.statePay)],
    ['Other Earnings', '', '-', moneyValue(row.otherEarnings)]
  ];
  const deductions = [
    ['CPP (Employee)', row.cpp],
    ['EI (Employee)', row.ei],
    ['Income Tax (Federal)', combinedIncomeTax(row)],
    ['Income Tax (Provincial)', 0],
    ['Pre-tax Deductions', row.preTaxDeductions],
    ['Post-tax Deductions', row.postTaxDeductions]
  ];
  const taxes = [
    ['CPP', row.cpp],
    ['EI', row.ei],
    ['Federal tax', combinedIncomeTax(row)],
    ['Provincial Income Tax', 0]
  ];
  const employerCpp = row.cpp;
  const employerEi = Number((row.ei * 1.4).toFixed(2));
  const employerContributions = [
    ['CPP (Employer)', employerCpp],
    ['EI (Employer)', employerEi]
  ];
  return (
    <div className="payroll-detail-panel">
      <section>
        <nav>
          {detailTabs.map((tab) => (
            <button
              key={tab}
              className={tab === activeDetailTab ? 'active' : ''}
              type="button"
              onClick={() => setActiveDetailTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
        <div className="payroll-detail-tab-content">
          {activeDetailTab === 'Earnings & Hours' && (
            <article>
              <h3>Earnings & Hours</h3>
              <table><thead><tr><th>Earning Type</th><th>Rate / Amount</th><th>Hours</th><th>Amount</th></tr></thead><tbody>{earnings.map(([label, rate, hours, amount]) => <tr key={label}><td>{label}</td><td>{rate}</td><td>{hours}</td><td>{amount}</td></tr>)}</tbody><tfoot><tr><td>Total Earnings</td><td></td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.grossPay)}</td></tr></tfoot></table>
            </article>
          )}
          {activeDetailTab === 'Deductions' && (
            <article>
              <h3>Deductions</h3>
              <table><thead><tr><th>Deduction Type</th><th>Amount</th></tr></thead><tbody>{deductions.map(([label, amount]) => <tr key={String(label)}><td>{label}</td><td>{moneyValue(Number(amount))}</td></tr>)}</tbody><tfoot><tr><td>Total Deductions</td><td>{moneyValue(row.deductions)}</td></tr></tfoot></table>
            </article>
          )}
          {activeDetailTab === 'Taxes' && (
            <article>
              <h3>Taxes</h3>
              <table><thead><tr><th>Tax Type</th><th>Amount</th></tr></thead><tbody>{taxes.map(([label, amount]) => <tr key={String(label)}><td>{label}</td><td>{moneyValue(Number(amount))}</td></tr>)}</tbody><tfoot><tr><td>Total Taxes</td><td>{moneyValue(row.cpp + row.ei + row.federalTax + row.provincialTax)}</td></tr></tfoot></table>
            </article>
          )}
          {activeDetailTab === 'Employer Contributions' && (
            <article>
              <h3>Employer Contributions</h3>
              <table><thead><tr><th>Contribution Type</th><th>Amount</th></tr></thead><tbody>{employerContributions.map(([label, amount]) => <tr key={String(label)}><td>{label}</td><td>{moneyValue(Number(amount))}</td></tr>)}</tbody><tfoot><tr><td>Total Employer Contributions</td><td>{moneyValue(employerCpp + employerEi)}</td></tr></tfoot></table>
            </article>
          )}
          {activeDetailTab === 'Paystub Preview' && (
            <aside className="paystub-preview-panel">
            <div className="net-pay-box">
              <h3>Net Pay Calculation</h3>
              <p><span>Total Earnings</span><b>{moneyValue(row.grossPay)}</b></p>
              <p><span>Total Deductions</span><b>{moneyValue(row.deductions)}</b></p>
              <p><span>Net Pay</span><b>{moneyValue(row.netPay)}</b></p>
            </div>
            <div className="pay-run-box">
              <h3>Pay Run Information</h3>
              <p><span>Pay Period</span><b>{payPeriod || '-'}</b></p>
              <p><span>Pay Date</span><b>{row.payDate ? formatDate(row.payDate, 'en') : '-'}</b></p>
              <p><span>Pay Group</span><b>{row.payGroup || '-'}</b></p>
              <p><span>Status</span><b>{row.status || '-'}</b></p>
              {row.statementId && <a href={`${apiBase}/employer/paystubs/${row.statementId}/download`}>View Paystub</a>}
            </div>
            </aside>
          )}
        </div>
      </section>
    </div>
  );
}

function EmployerHoursReportPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerHoursReport>();
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [employmentType, setEmploymentType] = useState('All Types');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    api<EmployerHoursReport>('/employer/reports/hours', token)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load hours report data from the database.');
      });
  }, [token]);
  const visibleRows = (data?.rows || [])
    .filter((row) => matchesFilter(row.department, department, 'All Departments'))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'))
    .filter((row) => matchesFilter(row.employmentType, employmentType, 'All Types'));
  useEffect(() => {
    setPage(1);
  }, [department, payGroup, employmentType, pageSize]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totals = visibleRows.reduce(
    (sum, row) => ({
      regularHours: sum.regularHours + row.regularHours,
      overtimeHours: sum.overtimeHours + row.overtimeHours,
      doubleTimeHours: sum.doubleTimeHours + row.doubleTimeHours,
      ptoHours: sum.ptoHours + row.ptoHours,
      statHolidayHours: sum.statHolidayHours + row.statHolidayHours,
      totalHours: sum.totalHours + row.totalHours
    }),
    { regularHours: 0, overtimeHours: 0, doubleTimeHours: 0, ptoHours: 0, statHolidayHours: 0, totalHours: 0 }
  );
  return (
    <section className="payroll-report-page hours-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports <span>&gt;</span> Hours Report</div>
      <header className="reports-head payroll-report-head">
        <div><h1>Hours Report</h1><p>View and analyze employee hours including regular hours, overtime, double time, paid time off and total hours.</p></div>
        <button type="button" className="reports-back" onClick={onBack}>Back</button>
      </header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading hours report...</p>}
      {data && (
        <>
          <div className="report-metrics payroll-report-metrics">
            <article><span>time</span><p>Total Employees</p><strong>{visibleRows.length}</strong><small>{data.metrics.fullTime} Full Time | {data.metrics.partTime} Part Time</small></article>
            <article><span>clock</span><p>Total Hours</p><strong>{totals.totalHours.toFixed(2)}</strong><small>Regular: {totals.regularHours.toFixed(2)} | OT: {totals.overtimeHours.toFixed(2)}</small></article>
            <article><span>avg</span><p>Average Hours</p><strong>{visibleRows.length ? (totals.totalHours / visibleRows.length).toFixed(2) : '0.00'}</strong><small>Per Employee</small></article>
            <article><span>ot</span><p>Overtime Hours</p><strong>{totals.overtimeHours.toFixed(2)}</strong><small>{totals.totalHours ? (totals.overtimeHours / totals.totalHours * 100).toFixed(1) : '0.0'}% of total hours</small></article>
          </div>
          <div className="payroll-report-filters hours-report-filters">
            <label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}>{data.filters.payPeriods.concat(data.summary.payPeriod).filter((item, index, list) => item && list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button type="button" onClick={() => { setDepartment('All Departments'); setPayGroup('All Pay Groups'); setEmploymentType('All Types'); }}>Clear Filters</button>
          </div>
          <div className="payroll-report-layout">
            <section className="payroll-report-main">
              <header><div><h2>Hours Report</h2><p>Breakdown of employee hours for the selected period.</p></div><ReportExportButtons title="Hours Report" /></header>
              <div className="payroll-report-table-wrap">
                <table className="payroll-report-table hours-report-table">
                  <thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Regular Hours</th><th>Overtime Hours</th><th>Double Time Hours</th><th>PTO Hours</th><th>Stat Holiday Hours</th><th>Total Hours</th></tr></thead>
                  <tbody>
                    {pageRows.map((row, index) => <tr key={row.employeeNumber || row.index}><td>{(currentPage - 1) * pageSize + index + 1}</td><td>{row.employeeName}</td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.regularHours.toFixed(2)}</td><td>{row.overtimeHours.toFixed(2)}</td><td>{row.doubleTimeHours.toFixed(2)}</td><td>{row.ptoHours.toFixed(2)}</td><td>{row.statHolidayHours.toFixed(2)}</td><td>{row.totalHours.toFixed(2)}</td></tr>)}
                    {!visibleRows.length && <tr><td colSpan={10}>No employee hours found in the database.</td></tr>}
                  </tbody>
                  <tfoot><tr><td></td><td>Total</td><td></td><td></td><td>{totals.regularHours.toFixed(2)}</td><td>{totals.overtimeHours.toFixed(2)}</td><td>{totals.doubleTimeHours.toFixed(2)}</td><td>{totals.ptoHours.toFixed(2)}</td><td>{totals.statHolidayHours.toFixed(2)}</td><td>{totals.totalHours.toFixed(2)}</td></tr></tfoot>
                </table>
              </div>
              <footer><span>Showing {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, visibleRows.length)} of {visibleRows.length} employees</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>&lt;</button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => <button key={number} className={number === currentPage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>&gt;</button></div><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={25}>25 / page</option><option value={50}>50 / page</option></select></footer>
            </section>
            <aside className="payroll-report-options">
              <h2><span>gear</span>Report Options</h2>
              <label>Report Type<select defaultValue="Hours Report"><option>Hours Report</option></select></label>
              <label>Group By<select defaultValue="Employee"><option>Employee</option></select></label>
              <label>Date Range<select value={data.summary.payPeriod} onChange={() => undefined}><option>{data.summary.payPeriod}</option></select></label>
              <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <b>Include in Report</b>
              {['Regular Hours', 'Overtime Hours', 'Double Time Hours', 'PTO Hours', 'Statutory Holiday Hours', 'Total Hours'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}
              <label>Sort By<select defaultValue="Employee Name (A - Z)"><option>Employee Name (A - Z)</option><option>Total Hours</option><option>Overtime Hours</option></select></label>
              <button type="button">Generate Report</button>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function EmployerEarningsReportPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerEarningsReport>();
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [employmentType, setEmploymentType] = useState('All Types');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    api<EmployerEarningsReport>('/employer/reports/earnings', token)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load earnings report data from the database.');
      });
  }, [token]);
  const moneyValue = (value: number) => `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const visibleRows = (data?.rows || [])
    .filter((row) => isAllFilter(department, 'All Departments') || !row.department || filterEquals(row.department, department))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'))
    .filter((row) => matchesFilter(row.employmentType, employmentType, 'All Types'));
  useEffect(() => {
    setPage(1);
  }, [department, payGroup, employmentType, pageSize]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredEmployees = new Set(visibleRows.map((row) => row.employeeNumber || row.employeeName).filter(Boolean));
  const totalHours = visibleRows.reduce((sum, row) => sum + (row.hours || 0), 0);
  const totalAmount = visibleRows.reduce((sum, row) => sum + row.amount, 0);
  const filteredRegularHours = visibleRows
    .filter((row) => row.earningType === 'Regular Hours')
    .reduce((sum, row) => sum + (row.hours || 0), 0);
  const filteredOvertimeHours = visibleRows
    .filter((row) => row.earningType === 'Overtime Hours')
    .reduce((sum, row) => sum + (row.hours || 0), 0);
  const averageRateRows = visibleRows.filter((row) => row.rate != null);
  const averageHourlyRate = averageRateRows.length
    ? averageRateRows.reduce((sum, row) => sum + (row.rate || 0), 0) / averageRateRows.length
    : 0;
  return (
    <section className="payroll-report-page earnings-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports <span>&gt;</span> Earnings Report</div>
      <header className="reports-head payroll-report-head">
        <div><h1>Earnings Report</h1><p>View detailed employee earnings including regular hours, overtime, vacation, statutory pay and other earnings.</p></div>
        <button type="button" className="reports-back" onClick={onBack}>Back</button>
      </header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading earnings report...</p>}
      {data && (
        <>
          <div className="report-metrics payroll-report-metrics">
            <article><span>time</span><p>Total Employees</p><strong>{filteredEmployees.size}</strong><small>{data.metrics.fullTime} Full Time | {data.metrics.partTime} Part Time</small></article>
            <article><span>$</span><p>Total Earnings</p><strong>{moneyValue(totalAmount)}</strong><small>For selected period</small></article>
            <article><span>clock</span><p>Total Hours</p><strong>{totalHours.toFixed(2)}</strong><small>Regular: {filteredRegularHours.toFixed(2)} | OT: {filteredOvertimeHours.toFixed(2)}</small></article>
            <article><span>avg</span><p>Average Hourly Rate</p><strong>{moneyValue(averageHourlyRate)}</strong><small>&nbsp;</small></article>
          </div>
          <div className="payroll-report-filters hours-report-filters">
            <label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}>{data.filters.payPeriods.concat(data.summary.payPeriod).filter((item, index, list) => item && list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button type="button" onClick={() => { setDepartment('All Departments'); setPayGroup('All Pay Groups'); setEmploymentType('All Types'); }}>Clear Filters</button>
          </div>
          <div className="payroll-report-layout">
            <section className="payroll-report-main">
              <header><div><h2>Earnings Report</h2><p>Detailed breakdown of all earnings paid to employees for the selected period.</p></div><ReportExportButtons title="Earnings Report" /></header>
              <div className="payroll-report-table-wrap">
                <table className="payroll-report-table earnings-report-table">
                  <thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Earning Type</th><th>Rate</th><th>Hours</th><th>Amount</th></tr></thead>
                  <tbody>
                    {pageRows.map((row, index) => <tr key={`${row.employeeNumber}-${row.earningType}-${index}`}><td>{row.index || ''}</td><td>{row.employeeName}</td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.earningType}</td><td>{row.rate == null ? '-' : moneyValue(row.rate)}</td><td>{row.hours == null ? '-' : row.hours.toFixed(2)}</td><td>{moneyValue(row.amount)}</td></tr>)}
                    {!visibleRows.length && <tr><td colSpan={8}>No employee earnings found in the database.</td></tr>}
                  </tbody>
                  <tfoot><tr><td></td><td>Total</td><td></td><td></td><td></td><td></td><td>{totalHours.toFixed(2)}</td><td>{moneyValue(totalAmount)}</td></tr></tfoot>
                </table>
              </div>
              <footer><span>Showing {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, visibleRows.length)} of {visibleRows.length} rows</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>&lt;</button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => <button key={number} className={number === currentPage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>&gt;</button></div><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={25}>25 / page</option><option value={50}>50 / page</option></select></footer>
            </section>
            <aside className="payroll-report-options">
              <h2><span>gear</span>Report Options</h2>
              <label>Report Type<select defaultValue="Earnings Report"><option>Earnings Report</option></select></label>
              <label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}><option>{data.summary.payPeriod}</option></select></label>
              <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <b>Include Earnings</b>
              {['Regular Hours', 'Overtime Hours', 'Double Time', 'Vacation Pay', 'Statutory Holiday Pay', 'Other Earnings', 'Commissions', 'Bonuses', 'Shift Premium'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}
              <label>Sort By<select defaultValue="Employee Name (A - Z)"><option>Employee Name (A - Z)</option><option>Amount</option><option>Hours</option></select></label>
              <button type="button">Generate Report</button>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function EmployerEmployeeListReportPage({
  token,
  onBack,
  onOpenDetails,
  onOpenEarnings,
  onOpenHours,
  onOpenDeductions,
  onOpenHistory
}: {
  token: string;
  onBack: () => void;
  onOpenDetails: () => void;
  onOpenEarnings: () => void;
  onOpenHours: () => void;
  onOpenDeductions: () => void;
  onOpenHistory: () => void;
}) {
  const [data, setData] = useState<EmployerEmployeeListReport>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('All Statuses');
  const [department, setDepartment] = useState('All Departments');
  const [employmentType, setEmploymentType] = useState('All Types');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [search, setSearch] = useState('');
  const [hireFrom, setHireFrom] = useState('');
  const [hireTo, setHireTo] = useState('');
  const [terminationFrom, setTerminationFrom] = useState('');
  const [terminationTo, setTerminationTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeEmployeeReportTab, setActiveEmployeeReportTab] = useState('Employee List');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployerEmployeeListReport['rows'][number]>();
  useEffect(() => {
    api<EmployerEmployeeListReport>('/employer/reports/employees', token)
      .then((result) => {
        setData(result);
        setError('');
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load employee report data from the database.');
      });
  }, [token]);
  const normalized = search.trim().toLowerCase();
  const dateInRange = (value: string, from: string, to: string) => {
    if (!value) return !from && !to;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  };
  const visibleRows = (data?.rows || [])
    .filter((row) => matchesFilter(row.status, status, 'All Statuses'))
    .filter((row) => matchesFilter(row.department, department, 'All Departments'))
    .filter((row) => matchesFilter(row.employmentType, employmentType, 'All Types'))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'))
    .filter((row) => dateInRange(row.hireDate, hireFrom, hireTo))
    .filter((row) => dateInRange(row.terminationDate, terminationFrom, terminationTo))
    .filter((row) => !normalized || `${row.employeeName} ${row.employeeNumber} ${row.position}`.toLowerCase().includes(normalized));
  useEffect(() => {
    setPage(1);
  }, [status, department, employmentType, payGroup, search, hireFrom, hireTo, terminationFrom, terminationTo, pageSize]);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const terminatedRows = visibleRows.filter((row) => filterEquals(row.status, 'Terminated') || row.terminationDate);
  const turnoverRate = visibleRows.length ? terminatedRows.length / visibleRows.length * 100 : 0;
  const tabs = ['Employee List', 'Employee Details', 'Earnings Report', 'Hours Report', 'Deductions Report', 'Employee History', 'Turnover Report'];
  return (
    <section className="payroll-report-page employee-list-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports</div>
      <header className="reports-head payroll-report-head">
        <div><h1>Employee Reports</h1><p>Generate reports related to employee information, earnings, hours, deductions and history.</p></div>
        <button type="button" className="reports-back" onClick={onBack}>Back</button>
      </header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading employee report...</p>}
      {data && (
        <>
          <div className="report-metrics payroll-report-metrics">
            <article><span>team</span><p>Total Employees</p><strong>{data.metrics.totalEmployees}</strong><small>{data.metrics.fullTime} Full Time | {data.metrics.partTime} Part Time</small></article>
            <article><span>active</span><p>Active Employees</p><strong>{data.metrics.activeEmployees}</strong><small>{data.metrics.onLeave} on Leave</small></article>
            <article><span>new</span><p>New Hires (This Year)</p><strong>{data.metrics.newHires}</strong><small>{data.metrics.newHireDateRange || 'No hires this year'}</small></article>
            <article><span>exit</span><p>Terminated (This Year)</p><strong>{data.metrics.terminated}</strong><small>As of {formatDate(data.metrics.terminatedAsOf, 'en')}</small></article>
          </div>
          <nav className="report-tabs payroll-report-tabs">
            {tabs.map((tab) => <button key={tab} className={tab === activeEmployeeReportTab ? 'active' : ''} onClick={() => {
              setActiveEmployeeReportTab(tab);
              if (tab === 'Employee Details') onOpenDetails();
              if (tab === 'Earnings Report') onOpenEarnings();
              if (tab === 'Hours Report') onOpenHours();
              if (tab === 'Deductions Report') onOpenDeductions();
              if (tab === 'Employee History') onOpenHistory();
            }}>{tab}</button>)}
          </nav>
          <div className="employee-report-filters">
            <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{data.filters.statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="report-search"><span className="top-icon search" aria-hidden="true"></span><input placeholder="Search by employee name, ID or position..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <label>Hire Date From<input type="date" value={hireFrom} onChange={(event) => setHireFrom(event.target.value)} /></label>
            <label>Hire Date To<input type="date" value={hireTo} onChange={(event) => setHireTo(event.target.value)} /></label>
            <label>Termination Date From<input type="date" value={terminationFrom} onChange={(event) => setTerminationFrom(event.target.value)} /></label>
            <label>Termination Date To<input type="date" value={terminationTo} onChange={(event) => setTerminationTo(event.target.value)} /></label>
            <button type="button" onClick={() => { setStatus('All Statuses'); setDepartment('All Departments'); setEmploymentType('All Types'); setPayGroup('All Pay Groups'); setSearch(''); setHireFrom(''); setHireTo(''); setTerminationFrom(''); setTerminationTo(''); }}>Clear Filters</button>
            <button type="button" className="reports-primary">Generate Report</button>
          </div>
          <div className="payroll-report-layout">
            <section className="payroll-report-main">
              <header><div><h2>{activeEmployeeReportTab === 'Turnover Report' ? 'Turnover Report' : 'Employee List Report'}</h2><p>{activeEmployeeReportTab === 'Turnover Report' ? 'Employee movement, terminations and turnover indicators for the selected filters.' : 'Complete list of employees with key details including department, position, pay group, status and hire date.'}</p></div><ReportExportButtons title={activeEmployeeReportTab === 'Turnover Report' ? 'Turnover Report' : 'Employee List Report'} /></header>
              {activeEmployeeReportTab === 'Turnover Report' && <div className="payroll-summary-strip"><article><strong>{visibleRows.length}</strong><span>Employees in Scope</span></article><article><strong>{terminatedRows.length}</strong><span>Terminated</span></article><article><strong>{turnoverRate.toFixed(1)}%</strong><span>Turnover Rate</span></article><article><strong>{data.metrics.newHires}</strong><span>New Hires This Year</span></article></div>}
              <div className="payroll-report-table-wrap">
                <table className="payroll-report-table employee-list-table">
                  <thead>{activeEmployeeReportTab === 'Turnover Report' ? <tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Hire Date</th><th>Termination Date</th><th>Status</th><th>Years of Service</th></tr> : <tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>Position</th><th>Employment Type</th><th>Pay Group</th><th>Hire Date</th><th>Status</th><th>Actions</th></tr>}</thead>
                  <tbody>
                    {activeEmployeeReportTab === 'Turnover Report'
                      ? pageRows.map((row, index) => <tr key={row.employeeNumber || row.index}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><span className="employee-report-person"><b>{row.initials || '?'}</b>{row.employeeName}</span></td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.hireDate ? formatDate(row.hireDate, 'en') : '-'}</td><td>{row.terminationDate ? formatDate(row.terminationDate, 'en') : '-'}</td><td><span className={`employee-status ${row.status.toLowerCase().replace(/\s+/g, '-')}`}>{row.status || '-'}</span></td><td>{row.yearsOfService.toFixed(1)}</td></tr>)
                      : pageRows.map((row, index) => <tr key={row.employeeNumber || row.index}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><span className="employee-report-person"><b>{row.initials || '?'}</b>{row.employeeName}</span></td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{row.position || '-'}</td><td>{row.employmentType || '-'}</td><td>{row.payGroup || '-'}</td><td>{row.hireDate ? formatDate(row.hireDate, 'en') : '-'}</td><td><span className={`employee-status ${row.status.toLowerCase().replace(/\s+/g, '-')}`}>{row.status || '-'}</span></td><td><button className="row-more employee-view-button" type="button" onClick={() => setSelectedEmployee(row)}>View</button></td></tr>)}
                    {!visibleRows.length && <tr><td colSpan={activeEmployeeReportTab === 'Turnover Report' ? 8 : 10}>No employees found in the database.</td></tr>}
                  </tbody>
                </table>
              </div>
              <footer><span>Showing {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, visibleRows.length)} of {visibleRows.length} employees</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>&lt;</button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => <button key={number} className={number === currentPage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>&gt;</button></div><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10 / page</option><option value={25}>25 / page</option></select></footer>
            </section>
            <aside className="payroll-report-options">
              <h2><span>gear</span>Report Options</h2>
              <label>Report Type<select value={activeEmployeeReportTab} onChange={(event) => setActiveEmployeeReportTab(event.target.value)}><option>Employee List</option><option>Turnover Report</option></select></label>
              <b>Include in Report</b>
              {['Employee ID', 'Department', 'Position', 'Employment Type', 'Pay Group', 'Hire Date', 'Status', 'Email Address', 'Phone Number', 'Termination Date', 'Years of Service'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}
              <label>Sort By<select defaultValue="Employee Name (A - Z)"><option>Employee Name (A - Z)</option><option>Employee ID</option><option>Hire Date</option></select></label>
              <b>Additional Options</b>
              {['Include terminated employees', 'Show only new hires', 'Include custom fields'].map((item) => <label className="report-check" key={item}><input type="checkbox" />{item}</label>)}
            </aside>
          </div>
          {selectedEmployee && (
            <div className="payroll-modal-backdrop" onClick={() => setSelectedEmployee(undefined)}>
              <section className="payroll-modal employee-list-modal" role="dialog" aria-modal="true" aria-labelledby="employee-list-modal-title" onClick={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <h2 id="employee-list-modal-title">{selectedEmployee.employeeName}</h2>
                    <p>{selectedEmployee.employeeNumber || '-'} | {selectedEmployee.position || '-'}</p>
                  </div>
                  <button type="button" aria-label="Close employee details" onClick={() => setSelectedEmployee(undefined)}>×</button>
                </header>
                <div className="payroll-modal-body employee-list-modal-body">
                  <div className="employee-detail-hero employee-list-popup-hero">
                    <span>{selectedEmployee.initials || '?'}</span>
                    <div><h2>{selectedEmployee.employeeName} <em>{selectedEmployee.status || '-'}</em></h2><p>{selectedEmployee.position || '-'}</p><small>{selectedEmployee.department || '-'} | {selectedEmployee.employmentType || '-'}</small></div>
                  </div>
                  <dl className="employee-list-details">
                    <dt>Employee ID</dt><dd>{selectedEmployee.employeeNumber || '-'}</dd>
                    <dt>Department</dt><dd>{selectedEmployee.department || '-'}</dd>
                    <dt>Position</dt><dd>{selectedEmployee.position || '-'}</dd>
                    <dt>Employment Type</dt><dd>{selectedEmployee.employmentType || '-'}</dd>
                    <dt>Pay Group</dt><dd>{selectedEmployee.payGroup || '-'}</dd>
                    <dt>Hire Date</dt><dd>{selectedEmployee.hireDate ? formatDate(selectedEmployee.hireDate, 'en') : '-'}</dd>
                    <dt>Status</dt><dd><span className={`employee-status ${selectedEmployee.status.toLowerCase().replace(/\s+/g, '-')}`}>{selectedEmployee.status || '-'}</span></dd>
                    <dt>Email</dt><dd>{selectedEmployee.email || '-'}</dd>
                    <dt>Phone</dt><dd>{selectedEmployee.phone || '-'}</dd>
                    <dt>Termination Date</dt><dd>{selectedEmployee.terminationDate ? formatDate(selectedEmployee.terminationDate, 'en') : '-'}</dd>
                    <dt>Years of Service</dt><dd>{selectedEmployee.yearsOfService.toFixed(1)}</dd>
                  </dl>
                </div>
                <footer>
                  <button type="button" onClick={() => setSelectedEmployee(undefined)}>Close</button>
                </footer>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EmployerEmployeeDetailsReportPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerEmployeeDetailsReport>();
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [activeTab, setActiveTab] = useState('Overview');
  const moneyValue = (value = 0) => `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  useEffect(() => {
    const path = employeeId ? `/employer/reports/employee-details?employeeId=${employeeId}` : '/employer/reports/employee-details';
    api<EmployerEmployeeDetailsReport>(path, token)
      .then((result) => {
        setData(result);
        setError('');
        if (!employeeId && result.employee?.id) setEmployeeId(result.employee.id);
      })
      .catch(() => {
        setData(undefined);
        setError('Unable to load employee details report from the database.');
      });
  }, [token, employeeId]);
  const employee = data?.employee;
  const current = data?.current;
  const ytd = data?.ytd;
  const payHistory = data?.payHistory || [];
  const taxRows = (current?.deductionsRows || []).filter((row) => row.name.includes('Tax') || ['CPP', 'EI'].includes(row.name));
  const contributionRows = (current?.deductionsRows || []).filter((row) => row.employerAmount > 0);
  const tabs = ['Overview', 'Earnings & Hours', 'Deductions', 'Taxes', 'Employer Contributions', 'Pay History', 'YTD Summary', 'Time Off', 'Documents'];
  return (
    <section className="payroll-report-page employee-details-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports <span>&gt;</span> Employee Details</div>
      <header className="reports-head payroll-report-head"><div><h1>Employee Details</h1><p>View complete employee information, payroll history, earnings, deductions and year to date totals.</p></div><button type="button" className="reports-back" onClick={onBack}>Back</button></header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading employee details...</p>}
      {data && employee && (
        <>
          <div className="employee-detail-selectors">
            <button type="button">&lt;</button>
            <label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <button type="button">&gt;</button>
            <label>Pay Period<select value={current?.payPeriod || ''} onChange={() => undefined}>{data.payPeriods.map((item) => <option key={item.id}>{item.label}</option>)}</select></label>
            <button type="button" className="reports-primary">Generate Report</button>
          </div>
          <section className="employee-detail-hero">
            <span>{employee.initials || '?'}</span>
            <div><h2>{employee.name} <em>{employee.status}</em></h2><p>{employee.employeeNumber} | {employee.position || '-'}</p><small>{employee.department || '-'} | {employee.employmentType || '-'} | {employee.hireDate ? formatDate(employee.hireDate, 'en') : '-'}</small></div>
            <div><p>{employee.email || '-'}</p><p>{employee.phone || '-'}</p><p>{employee.location || '-'}</p></div>
            <div><p><b>Pay Group</b>{employee.payGroup || '-'}</p><p><b>Employment Type</b>{employee.employmentType || '-'}</p><p><b>Standard Hours</b>{employee.standardHours || '-'}</p><p><b>Hourly/Salary Rate</b>{moneyValue(employee.hourlyRate)} / hour</p></div>
          </section>
          <nav className="report-tabs payroll-report-tabs">{tabs.map((tab) => <button key={tab} className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
          <div className="payroll-report-layout">
            <section className="payroll-report-main">
              {activeTab === 'Overview' && <>
                <header><div><h2>Current Pay Period Summary</h2><p>{current?.payPeriod || 'No payroll run selected'}</p></div><div className="report-export">{current?.statementId && <a href={`${apiBase}/employer/paystubs/${current.statementId}/download`}>View Payslip</a>}<ReportExportButtons title="Current Pay Period Summary" /></div></header>
                <div className="payroll-summary-strip">
                  <article><strong>{(current?.hours || 0).toFixed(2)}</strong><span>Hours<br />Regular: {(current?.regularHours || 0).toFixed(2)}<br />OT: {(current?.overtimeHours || 0).toFixed(2)}</span></article>
                  <article><strong>{moneyValue(current?.grossPay)}</strong><span>Gross Pay</span></article>
                  <article><strong>{moneyValue(current?.deductions)}</strong><span>Total Deductions</span></article>
                  <article><strong>{moneyValue(current?.netPay)}</strong><span>Net Pay</span></article>
                </div>
                <div className="employee-detail-tables">
                  <article><h3>Earnings & Hours</h3><table><thead><tr><th>Earning Type</th><th>Rate</th><th>Hours</th><th>Amount</th></tr></thead><tbody>{(current?.earnings || []).map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.rate == null ? '-' : moneyValue(row.rate)}</td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.amount)}</td></tr>)}</tbody><tfoot><tr><td>Total Earnings</td><td></td><td>{(current?.hours || 0).toFixed(2)}</td><td>{moneyValue(current?.grossPay)}</td></tr></tfoot></table></article>
                  <article><h3>Deductions</h3><table><thead><tr><th>Deduction Type</th><th>Employee</th><th>Employer</th></tr></thead><tbody>{(current?.deductionsRows || []).map((row) => <tr key={row.name}><td>{row.name}</td><td>{moneyValue(row.employeeAmount)}</td><td>{moneyValue(row.employerAmount)}</td></tr>)}</tbody><tfoot><tr><td>Total Deductions</td><td>{moneyValue(current?.deductions)}</td><td></td></tr></tfoot></table></article>
                </div>
                <h2 className="ytd-heading">Year to Date Summary</h2>
                <div className="payroll-summary-strip">
                  <article><strong>{(ytd?.hours || 0).toFixed(2)}</strong><span>Total Hours</span></article>
                  <article><strong>{moneyValue(ytd?.grossPay)}</strong><span>Total Gross Pay</span></article>
                  <article><strong>{moneyValue(ytd?.deductions)}</strong><span>Total Deductions</span></article>
                  <article><strong>{moneyValue(ytd?.netPay)}</strong><span>Total Net Pay</span></article>
                </div>
              </>}
              {activeTab === 'Earnings & Hours' && <><header><div><h2>Earnings & Hours</h2><p>{current?.payPeriod || 'No payroll run selected'}</p></div><ReportExportButtons title="Earnings & Hours" /></header><div className="employee-detail-tables single"><article><table><thead><tr><th>Earning Type</th><th>Rate</th><th>Hours</th><th>Amount</th></tr></thead><tbody>{(current?.earnings || []).map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.rate == null ? '-' : moneyValue(row.rate)}</td><td>{row.hours.toFixed(2)}</td><td>{moneyValue(row.amount)}</td></tr>)}</tbody><tfoot><tr><td>Total Earnings</td><td></td><td>{(current?.hours || 0).toFixed(2)}</td><td>{moneyValue(current?.grossPay)}</td></tr></tfoot></table></article></div></>}
              {activeTab === 'Deductions' && <><header><div><h2>Deductions</h2><p>Employee and employer deduction amounts for the selected pay period.</p></div><ReportExportButtons title="Deductions" /></header><div className="employee-detail-tables single"><article><table><thead><tr><th>Deduction Type</th><th>Employee</th><th>Employer</th></tr></thead><tbody>{(current?.deductionsRows || []).map((row) => <tr key={row.name}><td>{row.name}</td><td>{moneyValue(row.employeeAmount)}</td><td>{moneyValue(row.employerAmount)}</td></tr>)}</tbody><tfoot><tr><td>Total Deductions</td><td>{moneyValue(current?.deductions)}</td><td>{moneyValue((current?.deductionsRows || []).reduce((sum, row) => sum + row.employerAmount, 0))}</td></tr></tfoot></table></article></div></>}
              {activeTab === 'Taxes' && <><header><div><h2>Taxes</h2><p>Statutory tax and payroll withholding amounts for the selected pay period.</p></div><ReportExportButtons title="Taxes" /></header><div className="employee-detail-tables single"><article><table><thead><tr><th>Tax Type</th><th>Employee Amount</th></tr></thead><tbody>{taxRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{moneyValue(row.employeeAmount)}</td></tr>)}</tbody><tfoot><tr><td>Total Taxes</td><td>{moneyValue(taxRows.reduce((sum, row) => sum + row.employeeAmount, 0))}</td></tr></tfoot></table></article></div></>}
              {activeTab === 'Employer Contributions' && <><header><div><h2>Employer Contributions</h2><p>Employer-paid contribution amounts recorded for this pay period.</p></div><ReportExportButtons title="Employer Contributions" /></header>{contributionRows.length ? <div className="employee-detail-tables single"><article><table><thead><tr><th>Contribution Type</th><th>Amount</th></tr></thead><tbody>{contributionRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{moneyValue(row.employerAmount)}</td></tr>)}</tbody><tfoot><tr><td>Total Employer Contributions</td><td>{moneyValue(contributionRows.reduce((sum, row) => sum + row.employerAmount, 0))}</td></tr></tfoot></table></article></div> : <p className="report-empty">No employer contribution records are available for this pay period.</p>}</>}
              {activeTab === 'Pay History' && <><header><div><h2>Pay History</h2><p>Finalized payslips recorded for this employee.</p></div><ReportExportButtons title="Pay History" /></header><div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>Pay Date</th><th>Pay Period</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Actions</th></tr></thead><tbody>{payHistory.map((row) => <tr key={row.id}><td>{formatDate(row.payDate, 'en')}</td><td>{row.payPeriod}</td><td>{moneyValue(row.grossPay)}</td><td>{moneyValue(row.deductions)}</td><td>{moneyValue(row.netPay)}</td><td>{row.statementId ? <a href={`${apiBase}/employer/paystubs/${row.statementId}/download`}>View Payslip</a> : '-'}</td></tr>)}{!payHistory.length && <tr><td colSpan={6}>No pay history found for this employee.</td></tr>}</tbody></table></div></>}
              {activeTab === 'YTD Summary' && <><header><div><h2>Year to Date Summary</h2><p>Totals from finalized pay statements in the current year.</p></div></header><div className="payroll-summary-strip"><article><strong>{(ytd?.hours || 0).toFixed(2)}</strong><span>Total Hours</span></article><article><strong>{moneyValue(ytd?.grossPay)}</strong><span>Total Gross Pay</span></article><article><strong>{moneyValue(ytd?.deductions)}</strong><span>Total Deductions</span></article><article><strong>{moneyValue(ytd?.netPay)}</strong><span>Total Net Pay</span></article></div></>}
              {activeTab === 'Time Off' && <><header><div><h2>Time Off</h2><p>Time-off values available from payroll records.</p></div></header><div className="payroll-summary-strip"><article><strong>{moneyValue(current?.earnings.find((row) => row.name === 'Vacation Pay')?.amount || 0)}</strong><span>Vacation Pay This Period</span></article><article><strong>{moneyValue(current?.earnings.find((row) => row.name === 'Statutory Holiday Pay')?.amount || 0)}</strong><span>Statutory Holiday Pay</span></article><article><strong>{(current?.earnings.find((row) => row.name === 'Statutory Holiday Pay')?.hours || 0).toFixed(2)}</strong><span>Statutory Holiday Hours</span></article></div><p className="report-empty">No separate time-off balance records are available in the database.</p></>}
              {activeTab === 'Documents' && <><header><div><h2>Documents</h2><p>Payslip documents generated for this employee.</p></div><ReportExportButtons title="Documents" /></header><div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>Document</th><th>Period</th><th>Date</th><th>Actions</th></tr></thead><tbody>{payHistory.map((row) => <tr key={row.id}><td>Payslip</td><td>{row.payPeriod}</td><td>{formatDate(row.payDate, 'en')}</td><td>{row.statementId ? <a href={`${apiBase}/employer/paystubs/${row.statementId}/download`}>Download</a> : '-'}</td></tr>)}{!payHistory.length && <tr><td colSpan={4}>No payroll documents found for this employee.</td></tr>}</tbody></table></div></>}
            </section>
            <aside className="payroll-report-options">
              <h2><span>gear</span>Report Options</h2>
              <label>Report Type<select defaultValue="Employee Details"><option>Employee Details</option></select></label>
              <label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>Date Range<select defaultValue="Current Pay Period"><option>Current Pay Period</option></select></label>
              <b>Include in Report</b>
              {['Employee Information', 'Earnings & Hours', 'Deductions', 'Taxes', 'Employer Contributions', 'Pay History', 'YTD Summary', 'Time Off Balances', 'Documents'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}
              <label>Output Format<select defaultValue="PDF"><option>PDF</option><option>Excel</option><option>CSV</option></select></label>
              <button type="button">Generate Report</button>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function EmployerDeductionsReportPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerDeductionsReport>();
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [employmentType, setEmploymentType] = useState('All Types');
  const moneyValue = (value = 0) => `$${value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  useEffect(() => {
    api<EmployerDeductionsReport>('/employer/reports/deductions-summary', token)
      .then((result) => { setData(result); setError(''); })
      .catch(() => { setData(undefined); setError('Unable to load deductions report data from the database.'); });
  }, [token]);
  const visibleRows = (data?.rows || [])
    .filter((row) => matchesFilter(row.department, department, 'All Departments'))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'))
    .filter((row) => matchesFilter(row.employmentType, employmentType, 'All Types'));
  const totals = visibleRows.reduce((sum, row) => ({
    cpp: sum.cpp + row.cpp, ei: sum.ei + row.ei, federalTax: sum.federalTax + row.federalTax,
    provincialTax: sum.provincialTax + row.provincialTax, otherDeductions: sum.otherDeductions + row.otherDeductions,
    totalDeductions: sum.totalDeductions + row.totalDeductions
  }), { cpp: 0, ei: 0, federalTax: 0, provincialTax: 0, otherDeductions: 0, totalDeductions: 0 });
  return (
    <section className="payroll-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports <span>&gt;</span> Deductions Report</div>
      <header className="reports-head payroll-report-head"><div><h1>Deductions Report</h1><p>View detailed breakdown of employee deductions including CPP, EI, Income Tax, benefits and other deductions.</p></div><button type="button" className="reports-back" onClick={onBack}>Back</button></header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading deductions report...</p>}
      {data && <>
        <div className="report-metrics payroll-report-metrics">
          <article><span>-</span><p>Total Employees</p><strong>{data.metrics.totalEmployees}</strong><small>{data.metrics.fullTime} Full Time | {data.metrics.partTime} Part Time</small></article>
          <article><span>$</span><p>Total Deductions</p><strong>{data.metrics.totalDeductions}</strong><small>For selected period</small></article>
          <article><span>%</span><p>Average Deductions</p><strong>{data.metrics.averageDeductions}</strong><small>Per Employee</small></article>
          <article><span>tax</span><p>Employee Deductions %</p><strong>{data.metrics.employeeDeductionsPercent}%</strong><small>Of Gross Pay</small></article>
        </div>
        <div className="payroll-report-filters hours-report-filters">
          <label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}>{data.filters.payPeriods.concat(data.summary.payPeriod).filter((item, index, list) => item && list.indexOf(item) === index).map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" onClick={() => { setDepartment('All Departments'); setPayGroup('All Pay Groups'); setEmploymentType('All Types'); }}>Clear Filters</button>
        </div>
        <div className="payroll-report-layout">
          <section className="payroll-report-main"><header><div><h2>Deductions Report</h2><p>Breakdown of all employee deductions for the selected period.</p></div><ReportExportButtons title="Deductions Report" /></header>
            <div className="payroll-report-table-wrap"><table className="payroll-report-table"><thead><tr><th>#</th><th>Employee</th><th>Employee ID</th><th>Department</th><th>CPP</th><th>EI</th><th>Income Tax (Federal)</th><th>Income Tax (Provincial)</th><th>Other Deductions</th><th>Total Deductions</th></tr></thead><tbody>
              {visibleRows.slice(0, 25).map((row) => <tr key={row.employeeNumber || row.index}><td>{row.index}</td><td>{row.employeeName}</td><td>{row.employeeNumber}</td><td>{row.department || '-'}</td><td>{moneyValue(row.cpp)}</td><td>{moneyValue(row.ei)}</td><td>{moneyValue(combinedIncomeTax(row))}</td><td>{moneyValue(0)}</td><td>{moneyValue(row.otherDeductions)}</td><td><b>{moneyValue(row.totalDeductions)}</b></td></tr>)}
              {!visibleRows.length && <tr><td colSpan={10}>No employee deductions found in the database.</td></tr>}
            </tbody><tfoot><tr><td>Total ({visibleRows.length} Employees)</td><td></td><td></td><td></td><td>{moneyValue(totals.cpp)}</td><td>{moneyValue(totals.ei)}</td><td>{moneyValue(combinedIncomeTax(totals))}</td><td>{moneyValue(0)}</td><td>{moneyValue(totals.otherDeductions)}</td><td>{moneyValue(totals.totalDeductions)}</td></tr></tfoot></table></div>
            <footer><span>Showing 1 - {Math.min(25, visibleRows.length)} of {visibleRows.length} employees</span><div><button>&lt;</button><button className="active">1</button><button>&gt;</button></div><select defaultValue="25"><option>25 / page</option></select></footer>
          </section>
          <aside className="payroll-report-options"><h2><span>gear</span>Report Options</h2><label>Report Type<select defaultValue="Deductions Report"><option>Deductions Report</option></select></label><label>Pay Period<select value={data.summary.payPeriod} onChange={() => undefined}><option>{data.summary.payPeriod}</option></select></label><b>Include in Report</b>{['CPP', 'EI', 'Income Tax (Federal)', 'Income Tax (Provincial)', 'Other Deductions', 'Total Deductions'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}<label>Sort By<select defaultValue="Employee Name (A - Z)"><option>Employee Name (A - Z)</option></select></label><button type="button">Generate Report</button></aside>
        </div>
      </>}
    </section>
  );
}

function EmployerHistoryReportPage({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<EmployerHistoryReport>();
  const [error, setError] = useState('');
  const [employee, setEmployee] = useState('All Employees');
  const [department, setDepartment] = useState('All Departments');
  const [employmentType, setEmploymentType] = useState('All Types');
  const [payGroup, setPayGroup] = useState('All Pay Groups');
  const [status, setStatus] = useState('All Statuses');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  useEffect(() => {
    api<EmployerHistoryReport>('/employer/reports/employee-history', token)
      .then((result) => {
        setData(result);
        setDateTo(result.metrics.asOf || '');
        setError('');
      })
      .catch(() => { setData(undefined); setError('Unable to load employee history report data from the database.'); });
  }, [token]);
  useEffect(() => {
    setPage(1);
  }, [employee, department, employmentType, payGroup, status, dateFrom, dateTo, pageSize]);
  const dateInRange = (value: string) => {
    if (!value) return true;
    if (dateFrom && value < dateFrom) return false;
    if (dateTo && value > dateTo) return false;
    return true;
  };
  const visibleRows = (data?.rows || [])
    .filter((row) => matchesFilter(row.employeeName, employee, 'All Employees'))
    .filter((row) => matchesFilter(row.department, department, 'All Departments'))
    .filter((row) => matchesFilter(row.employmentType, employmentType, 'All Types'))
    .filter((row) => matchesFilter(row.payGroup, payGroup, 'All Pay Groups'))
    .filter((row) => matchesFilter(row.status, status, 'All Statuses'))
    .map((row) => ({ ...row, changes: row.changes.filter((change) => dateInRange(change.effectiveDate)) }))
    .filter((row) => row.changes.length);
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const employeeOptions = ['All Employees', ...(data?.rows || []).map((row) => row.employeeName)];
  return (
    <section className="payroll-report-page employee-history-report-page">
      <div className="report-breadcrumb">Reports <span>&gt;</span> Employee Reports <span>&gt;</span> Employee History</div>
      <header className="reports-head payroll-report-head"><div><h1>Employee History</h1><p>View complete employment history including positions, departments, pay changes, status changes and key milestones.</p></div><button type="button" className="reports-back" onClick={onBack}>Back</button></header>
      {error && <p className="report-empty">{error}</p>}
      {!data && !error && <p className="report-empty">Loading employee history...</p>}
      {data && <>
        <div className="report-metrics payroll-report-metrics"><article><span>team</span><p>Total Employees</p><strong>{data.metrics.totalEmployees}</strong><small>{data.metrics.fullTime} Full Time | {data.metrics.partTime} Part Time</small></article><article><span>work</span><p>Currently Active</p><strong>{data.metrics.currentlyActive}</strong><small>{data.metrics.onLeave} on Leave</small></article><article><span>chg</span><p>Total Position Changes</p><strong>{data.metrics.totalPositionChanges}</strong><small>Across all employees</small></article><article><span>time</span><p>Average Tenure</p><strong>{data.metrics.averageTenure} years</strong><small>As of {formatDate(data.metrics.asOf, 'en')}</small></article></div>
        <div className="employee-report-filters">
          <label>Employee<select value={employee} onChange={(event) => setEmployee(event.target.value)}>{employeeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>{data.filters.departments.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Employment Type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}>{data.filters.employmentTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Pay Group<select value={payGroup} onChange={(event) => setPayGroup(event.target.value)}>{data.filters.payGroups.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{data.filters.statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Date From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>Date To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <button type="button" onClick={() => { setEmployee('All Employees'); setDepartment('All Departments'); setEmploymentType('All Types'); setPayGroup('All Pay Groups'); setStatus('All Statuses'); setDateFrom(''); setDateTo(data.metrics.asOf || ''); }}>Clear Filters</button>
          <button type="button" className="reports-primary">Generate Report</button>
        </div>
        <div className="payroll-report-layout">
          <section className="payroll-report-main"><header><div><h2>Employee History Report</h2><p>Complete history of employment changes for the selected period.</p></div><ReportExportButtons title="Employee History Report" /></header><div className="payroll-report-table-wrap"><table className="payroll-report-table employee-history-table"><thead><tr><th>#</th><th>Employee</th><th>Effective Date</th><th>Change Type</th><th>Details</th><th>Previous Value</th><th>New Value</th><th>Updated By</th></tr></thead><tbody>
            {pageRows.flatMap((row, rowIndex) => row.changes.map((change, changeIndex) => <tr key={`${row.employeeNumber}-${changeIndex}`}><td>{changeIndex === 0 ? (currentPage - 1) * pageSize + rowIndex + 1 : ''}</td><td>{changeIndex === 0 ? <span className="employee-report-person"><b>{row.initials || '?'}</b>{row.employeeName}<small>{row.employeeNumber}</small></span> : ''}</td><td>{change.effectiveDate ? formatDate(change.effectiveDate, 'en') : '-'}</td><td><span className={`history-chip ${change.changeType.toLowerCase().replace(/\s+/g, '-')}`}>{change.changeType}</span></td><td>{change.details}</td><td>{change.previousValue || '-'}</td><td>{change.newValue || '-'}</td><td>{change.updatedBy}</td></tr>))}
            {!visibleRows.length && <tr><td colSpan={8}>No employee history found for the selected filters.</td></tr>}
          </tbody></table></div><footer><span>Showing {visibleRows.length ? (currentPage - 1) * pageSize + 1 : 0} - {Math.min(currentPage * pageSize, visibleRows.length)} of {visibleRows.length} employees</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>&lt;</button>{Array.from({ length: Math.min(pageCount, 5) }, (_, index) => index + 1).map((number) => <button key={number} className={number === currentPage ? 'active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>&gt;</button></div><select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={5}>5 / page</option><option value={10}>10 / page</option><option value={25}>25 / page</option></select></footer></section>
          <aside className="payroll-report-options"><h2><span>gear</span>Report Options</h2><label>Report Type<select defaultValue="Employee History"><option>Employee History</option></select></label><b>Include in Report</b>{['Hire Records', 'Position Changes', 'Department Changes', 'Pay Changes', 'Status Changes (Active/Leave/Terminated)', 'Employment Type Changes', 'Manager Changes', 'Notes/Comments'].map((item) => <label className="report-check" key={item}><input type="checkbox" defaultChecked />{item}</label>)}<label>Group By<select defaultValue="Employee"><option>Employee</option></select></label><label>Sort By<select defaultValue="Employee Name (A - Z)"><option>Employee Name (A - Z)</option></select></label><label>Date Range<select defaultValue="Custom Range"><option>Custom Range</option><option>Current Year</option><option>All History</option></select></label><div className="report-date-range"><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div><label>Output Format<select defaultValue="PDF"><option>PDF</option><option>Excel</option><option>CSV</option></select></label><button type="button">Generate Report</button></aside>
        </div>
      </>}
    </section>
  );
}

const employerWizardSteps = [
  'Business Information',
  'Primary Contact',
  'CRA Payroll Information',
  'Payroll Configuration',
  'Banking & Funding',
  'Subscription & Billing',
  'Features & Permissions',
  'Review & Activate'
];
const provinceCities: Record<string, string[]> = {
  Alberta: ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'],
  'British Columbia': ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Kelowna'],
  Manitoba: ['Winnipeg', 'Brandon', 'Steinbach', 'Thompson', 'Portage la Prairie'],
  'New Brunswick': ['Fredericton', 'Moncton', 'Saint John', 'Miramichi', 'Dieppe'],
  'Newfoundland and Labrador': ["St. John's", 'Mount Pearl', 'Corner Brook', 'Gander', 'Labrador City'],
  'Nova Scotia': ['Halifax', 'Sydney', 'Dartmouth', 'Truro', 'New Glasgow'],
  'Northwest Territories': ['Yellowknife', 'Hay River', 'Inuvik', 'Fort Smith'],
  Nunavut: ['Iqaluit', 'Rankin Inlet', 'Arviat', 'Cambridge Bay'],
  Ontario: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London'],
  'Prince Edward Island': ['Charlottetown', 'Summerside', 'Stratford', 'Cornwall'],
  Quebec: ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Sherbrooke'],
  Saskatchewan: ['Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Swift Current'],
  Yukon: ['Whitehorse', 'Dawson City', 'Watson Lake', 'Haines Junction']
};
const provinceVacationRates: Record<string, string> = {
  Alberta: '4.00',
  'British Columbia': '4.00',
  Manitoba: '4.00',
  'New Brunswick': '4.00',
  'Newfoundland and Labrador': '4.00',
  'Nova Scotia': '4.00',
  'Northwest Territories': '4.00',
  Nunavut: '4.00',
  Ontario: '4.00',
  'Prince Edward Island': '4.00',
  Quebec: '4.00',
  Saskatchewan: '5.77',
  Yukon: '4.00'
};
const provinceNamesByCode: Record<string, string> = {
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
function parseStatePayHolidays(value: string): Array<{ name: string; date: string }> {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (holiday): holiday is { name: string; date: string } =>
            typeof holiday?.name === 'string' && typeof holiday?.date === 'string'
        )
      : [];
  } catch {
    return [];
  }
}
const defaultEmployerForm = {
  legalName: 'ABC Restaurant Ltd.',
  operatingName: 'ABC Restaurant',
  businessNumber: '123456789',
  businessType: 'Corporation',
  industry: 'Food Services and Drinking Places',
  naicsCode: '722511',
  employeeCount: '25',
  addressLine1: '123 Main Street',
  addressLine2: 'Unit 100',
  city: 'Calgary',
  province: 'Alberta',
  vacationPayRate: '4.00',
  postalCode: 'T2P 1J9',
  country: 'Canada',
  firstName: 'John',
  lastName: 'Smith',
  contactEmail: 'john.smith@abcrestaurant.ca',
  phone: '(403) 555-1234',
  jobTitle: 'Owner',
  payrollAccount: 'RP0001',
  accountSuffix: '0001',
  payFrequency: 'Biweekly',
  statePayEnabled: false,
  statePayDates: '',
  statePayHolidays: '[]',
  bankName: 'RBC Royal Bank',
  transitNumber: '003',
  institutionNumber: '003',
  accountNumber: '123456789',
  plan: 'Standard',
  billingFrequency: 'Monthly'
};

function Pill({ children, tone = 'blue' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`access-pill ${tone}`}>{children}</span>;
}

function AccessMetric({
  icon,
  label,
  value,
  note,
  tone = 'blue'
}: {
  icon: string;
  label: string;
  value: number | string;
  note: string;
  tone?: string;
}) {
  return (
    <article className="access-metric">
      <span className={`access-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{value}</strong>
        <b>{label}</b>
        <small>{note}</small>
      </div>
    </article>
  );
}

function PermissionSettingsView({
  access,
  onMode
}: {
  access: AccessData;
  onMode: (mode: string) => void;
}) {
  const matrix = access.permissionMatrix;
  return (
    <section className="module-page access-page permission-settings-page">
      <div className="sa-breadcrumb">
        Role Management &gt; Create Role &gt; <b>Permission Settings</b>
      </div>
      <h1>Permission Settings</h1>
      <p>Select and configure permissions for this role.</p>
      <div className="role-steps exact">
        <span className="done">
          <i aria-hidden="true"></i>
          <b>Role Details</b>
        </span>
        <span className="current">
          <i>2</i>
          <b>Permission Settings</b>
        </span>
        <span>
          <i>3</i>
          <b>Review & Save</b>
        </span>
      </div>
      <div className="permission-exact-grid">
        <aside className="module-rail">
          <h2>Modules</h2>
          {access.modules.map((module) => (
            <button
              key={module.name}
              className={module.name === matrix.primaryModule ? 'active' : ''}
            >
              <span className="module-icon">{module.name.charAt(0)}</span>
              {module.name}
            </button>
          ))}
        </aside>
        <main className="permission-center">
          <div className="permission-panel-head">
            <div>
              <h2>Employers Permissions</h2>
              <p>Manage employer accounts and onboarding.</p>
            </div>
            <div>
              <button>Select All</button>
              <button>Clear All</button>
            </div>
          </div>
          <table className="permission-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Description</th>
                {matrix.actions.map((action) => (
                  <th key={action}>{action}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.permission}>
                  <td>{row.permission}</td>
                  <td>{row.description}</td>
                  {matrix.actions.map((action) => (
                    <td key={action}>
                      <input type="checkbox" checked={row.grants.includes(action)} readOnly />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="permission-note">
            <b>i</b>
            <span>
              <strong>Permission Inheritance</strong>Some permissions may include access to related
              sub-modules and data. Review each module carefully before saving.
            </span>
          </div>
          <section className="submodule-panel">
            <h2>Sub-module Permissions (Optional)</h2>
            <p>Further refine access for this module.</p>
            <table className="permission-table">
              <thead>
                <tr>
                  <th></th>
                  <th></th>
                  {matrix.subModuleActions.map((action) => (
                    <th key={action}>{action}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.subModules.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.description}</td>
                    {matrix.subModuleActions.map((action) => (
                      <td key={action}>
                        <input type="checkbox" checked={row.grants.includes(action)} readOnly />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
        <aside className="permission-summary-side">
          <section>
            <div className="big-avatar">PM</div>
            <h2>{matrix.role.name}</h2>
            <Pill>{matrix.role.type} Role</Pill>
            <p>{matrix.role.description}</p>
            <dl>
              <dt>Status</dt>
              <dd>
                <Pill tone="green">{matrix.role.status}</Pill>
              </dd>
              <dt>Total Permissions</dt>
              <dd>{matrix.role.totalPermissions}</dd>
              <dt>Modules Configured</dt>
              <dd>{matrix.role.modulesConfigured}</dd>
              <dt>Created Date</dt>
              <dd>{matrix.role.createdDate}</dd>
              <dt>Last Updated</dt>
              <dd>{matrix.role.lastUpdated}</dd>
            </dl>
          </section>
          <section>
            <h3>Configured Modules</h3>
            {matrix.configuredModules.map((item) => (
              <p key={item}>
                <span className="check-dot" aria-hidden="true"></span>
                {item}
              </p>
            ))}
          </section>
          <section>
            <h3>Next Steps</h3>
            {matrix.nextSteps.map((item) => (
              <p key={item}>
                <span className="todo-dot" aria-hidden="true"></span>
                {item}
              </p>
            ))}
          </section>
          <div className="side-actions">
            <button onClick={() => onMode('Create Role')}>Back</button>
            <button className="run-payroll" onClick={() => onMode('Role Management')}>
              Next: Review & Save
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, mimeType: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportRows(
  format: 'csv' | 'pdf',
  filename: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
) {
  if (format === 'csv') {
    const csv = [
      columns.map(csvEscape).join(','),
      ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(','))
    ].join('\n');
    downloadTextFile(`${filename}.csv`, 'text/csv;charset=utf-8', csv);
    return;
  }

  const tableRows = rows
    .map(
      (row) =>
        `<tr>${columns.map((column) => `<td>${String(row[column] ?? '')}</td>`).join('')}</tr>`
    )
    .join('');
  const html = `<!doctype html><html><head><title>${filename}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#0b2755}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cfd8e3;padding:8px;text-align:left}th{background:#edf4fb}</style></head><body><h1>${filename}</h1><table><thead><tr>${columns.map((column) => `<th>${column}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table><script>window.print()</script></body></html>`;
  const popup = window.open('', '_blank');
  if (popup) {
    popup.document.write(html);
    popup.document.close();
  }
}

function ExportMenu({ onExport }: { onExport: (format: 'csv' | 'pdf') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="export-menu">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        Export
      </button>
      {open && (
        <div className="export-options">
          <button
            type="button"
            onClick={() => {
              onExport('csv');
              setOpen(false);
            }}
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => {
              onExport('pdf');
              setOpen(false);
            }}
          >
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
function SuperAdminAccess({
  token,
  mode,
  onMode
}: {
  token: string;
  mode: string;
  onMode: (mode: string) => void;
}) {
  const [access, setAccess] = useState<AccessData>();
  const [selectedRole, setSelectedRole] = useState('role-super-admin');
  const [selectedUser, setSelectedUser] = useState('user-js');
  const [selectedActivity, setSelectedActivity] = useState('act-1');
  const [roleName, setRoleName] = useState('');
  const [roleType, setRoleType] = useState<'System' | 'Custom'>('System');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(1);
  const [accessRefresh, setAccessRefresh] = useState(0);
  const [editingAccessUser, setEditingAccessUser] = useState(false);
  const [accessUserDraft, setAccessUserDraft] = useState<Partial<AccessUser>>({});
  const [editingRole, setEditingRole] = useState(false);
  const [roleDraft, setRoleDraft] = useState<Partial<AccessRoleItem>>({});
  const [accessUserSearch, setAccessUserSearch] = useState('');
  const [accessRoleFilter, setAccessRoleFilter] = useState('All Roles');
  const [accessStatusFilter, setAccessStatusFilter] = useState('All Statuses');
  const [activitySearch, setActivitySearch] = useState('');
  useEffect(() => {
    api<AccessData>('/super-admin/access', token)
      .then(setAccess)
      .catch(() => undefined);
  }, [token, accessRefresh]);
  if (!access)
    return (
      <section className="module-page">
        <h1>Users & Access</h1>
        <p>Loading access controls...</p>
      </section>
    );
  const tabs = [
    'All Users',
    'Role Management',
    'Permission Settings',
    'Activity Logs',
    'Login Policies'
  ];
  const activeRole = access.roles.find((role) => role.id === selectedRole) || access.roles[0];
  const activeUser = access.users.find((user) => user.id === selectedUser) || access.users[0];
  const activeActivity =
    access.activityLogs.find((log) => log.id === selectedActivity) || access.activityLogs[0];
  const accessRoleOptions = Array.from(new Set(access.users.map((user) => user.role).filter(Boolean))).sort();
  const filteredAccessUsers = access.users.filter((user) => {
    const matchesSearch =
      !accessUserSearch.trim() ||
      [user.name, user.email, user.role, user.employer].some((value) =>
        filterContains(value, accessUserSearch)
      );
    return (
      matchesSearch &&
      matchesFilter(user.role, accessRoleFilter, 'All Roles') &&
      matchesFilter(user.status, accessStatusFilter, 'All Statuses')
    );
  });
  const filteredActivityLogs = access.activityLogs.filter(
    (log) =>
      !activitySearch.trim() ||
      [
        log.user,
        log.action,
        log.referenceId,
        log.employer,
        log.role,
        log.module,
        log.details,
        log.status,
        log.ipAddress
      ].some((value) => filterContains(value, activitySearch))
  );
  const selectedPermissions = Object.fromEntries(
    access.modules
      .filter((module) => enabled[module.name])
      .map((module) => [module.name, module.permissions])
  );
  const allModulesEnabled =
    access.modules.length > 0 && access.modules.every((module) => enabled[module.name]);
  const realUserMetrics = {
    payhoursStaff: access.users.filter((user) => user.employer === 'Payhours Inc.').length,
    activePayhoursStaff: access.users.filter(
      (user) => user.employer === 'Payhours Inc.' && user.status === 'Active'
    ).length,
    employerUsers: access.users.filter((user) => user.employer !== 'Payhours Inc.').length,
    activeEmployerUsers: access.users.filter(
      (user) => user.employer !== 'Payhours Inc.' && user.status === 'Active'
    ).length
  };
  function startEditAccessUser(user: AccessUser) {
    setSelectedUser(user.id);
    setAccessUserDraft(user);
    setEditingAccessUser(true);
  }
  function updateAccessUserDraft(key: keyof AccessUser, value: string) {
    setAccessUserDraft((current) => ({ ...current, [key]: value }));
  }
  async function saveAccessUser() {
    const response = await api<{ user: AccessUser }>(
      `/super-admin/access/users/${encodeURIComponent(activeUser.id)}`,
      token,
      { method: 'PUT', body: JSON.stringify(accessUserDraft) }
    );
    setAccess(
      (current) =>
        current && {
          ...current,
          users: current.users.map((user) => (user.id === response.user.id ? response.user : user))
        }
    );
    setSelectedUser(response.user.id);
    setEditingAccessUser(false);
  }
  async function deleteAccessUser(user: AccessUser) {
    if (!window.confirm(`Delete ${user.name}? This removes the actual database user record.`))
      return;
    await api(`/super-admin/access/users/${encodeURIComponent(user.id)}`, token, {
      method: 'DELETE'
    });
    setEditingAccessUser(false);
    setAccessRefresh((value) => value + 1);
  }
  function startEditRole(role: AccessRoleItem) {
    setSelectedRole(role.id);
    setRoleDraft(role);
    setEditingRole(true);
  }
  function updateRoleDraft(key: keyof AccessRoleItem, value: string) {
    setRoleDraft((current) => ({ ...current, [key]: value }));
  }
  async function saveExistingRole() {
    const response = await api<{ role: AccessRoleItem }>(
      `/super-admin/roles/${activeRole.id}`,
      token,
      { method: 'PUT', body: JSON.stringify(roleDraft) }
    );
    setAccess(
      (current) =>
        current && {
          ...current,
          roles: current.roles.map((role) => (role.id === response.role.id ? response.role : role))
        }
    );
    setSelectedRole(response.role.id);
    setEditingRole(false);
  }
  async function deleteRole(role: AccessRoleItem) {
    if (!window.confirm(`Delete role ${role.name}?`)) return;
    await api(`/super-admin/roles/${role.id}`, token, { method: 'DELETE' });
    setEditingRole(false);
    setSelectedRole(access?.roles.find((item) => item.id !== role.id)?.id || '');
    setAccessRefresh((value) => value + 1);
  }
  async function saveRole() {
    const response = await api<{ role: AccessData['roles'][number] }>('/super-admin/roles', token, {
      method: 'POST',
      body: JSON.stringify({
        name: roleName || 'Payroll Manager',
        type: roleType,
        description,
        status: 'Active',
        permissions: selectedPermissions
      })
    });
    setAccess(
      (current) =>
        current && {
          ...current,
          roles: current.roles.concat(response.role),
          metrics: {
            ...current.metrics,
            totalRoles: current.metrics.totalRoles + 1,
            activeRoles: current.metrics.activeRoles + 1
          }
        }
    );
    setSelectedRole(response.role.id);
    onMode('Role Management');
  }
  const exportUsers = (format: 'csv' | 'pdf') =>
    exportRows(
      format,
      'payhours-users',
      ['name', 'email', 'role', 'employer', 'status', 'lastLogin', 'createdDate'],
      access.users
    );
  const exportActivities = (format: 'csv' | 'pdf') =>
    exportRows(
      format,
      'payhours-activity-logs',
      [
        'dateTime',
        'user',
        'employer',
        'role',
        'action',
        'module',
        'details',
        'status',
        'ipAddress',
        'referenceId'
      ],
      access.activityLogs
    );
  const accessTabs = (
    <div className="access-tabs">
      {tabs.map((tab) => (
        <button key={tab} className={mode === tab ? 'active' : ''} onClick={() => onMode(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
  if (mode === 'Permission Settings')
    return <PermissionSettingsView access={access} onMode={onMode} />;
  if (mode === 'Create Role')
    return (
      <section className="module-page access-page">
        <div className="sa-breadcrumb">Role Management &gt; Create Role</div>
        <h1>Create Role</h1>
        <p>Define the role details and select permissions for the Payhours platform.</p>
        <div className="access-create-grid">
          <section className="access-workspace">
            <div className="role-form">
              <label>
                Role Name *
                <input
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                  placeholder="e.g. Payroll Manager"
                />
              </label>
              <div>
                <b>Role Type *</b>
                <div className="radio-row">
                  <label>
                    <input
                      type="radio"
                      checked={roleType === 'System'}
                      onChange={() => setRoleType('System')}
                    />
                    System Role<small>Used for Payhours internal staff</small>
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={roleType === 'Custom'}
                      onChange={() => setRoleType('Custom')}
                    />
                    Custom Role<small>Create a custom role</small>
                  </label>
                </div>
              </div>
              <label className="switch-row">
                <input type="checkbox" defaultChecked />
                Active<small>Inactive roles cannot be assigned to users.</small>
              </label>
              <label className="span-all">
                Description
                <textarea
                  maxLength={250}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Enter a short description of this role and its purpose..."
                />
              </label>
            </div>
            <div className="employee-head">
              <div>
                <h2>Module Permissions</h2>
                <p>Select the modules and permissions this role will have access to.</p>
              </div>
              <button
                className="run-payroll"
                onClick={() =>
                  setEnabled(
                    allModulesEnabled
                      ? {}
                      : Object.fromEntries(access.modules.map((module) => [module.name, true]))
                  )
                }
              >
                {allModulesEnabled ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="permission-cards">
              {access.modules.map((module) => (
                <article key={module.name}>
                  <label>
                    <span>
                      <b>{module.name}</b>
                      <small>{module.caption}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(enabled[module.name])}
                      onChange={(event) =>
                        setEnabled((current) => ({
                          ...current,
                          [module.name]: event.target.checked
                        }))
                      }
                    />
                  </label>
                  {module.permissions.slice(0, 5).map((permission) => (
                    <p key={permission}>
                      <input type="checkbox" checked={Boolean(enabled[module.name])} readOnly />
                      {permission}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          </section>
          <aside className="access-detail">
            <div className="big-avatar">
              {(roleName || 'New Role')
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </div>
            <h2>{roleName || 'New Role'}</h2>
            <Pill>{roleType} Role</Pill>
            <p>{description || 'No description added yet.'}</p>
            <dl>
              <dt>Status</dt>
              <dd>
                <Pill tone="green">Active</Pill>
              </dd>
              <dt>Total Permissions</dt>
              <dd>{Object.values(selectedPermissions).flat().length}</dd>
              <dt>Modules Selected</dt>
              <dd>
                {Object.keys(selectedPermissions).length} / {access.modules.length}
              </dd>
            </dl>
            <div className="info-card">
              <b>{roleType} Role</b>
              <span>This role will be available for assignment to Payhours staff users.</span>
            </div>
            <div className="side-actions">
              <button onClick={() => onMode('Role Management')}>Cancel</button>
              <button className="run-payroll" onClick={() => onMode('Permission Settings')}>
                Create Role
              </button>
            </div>
          </aside>
        </div>
      </section>
    );
  if (mode === 'Activity Logs')
    return (
      <section className="module-page access-page">
        <div className="employee-head">
          <div>
            <h1>Activity Logs</h1>
            <p>Track and monitor user activity across all employers in the Payhours platform.</p>
          </div>
          <ExportMenu onExport={exportActivities} />
        </div>
        {accessTabs}
        <div className="metric-grid four">
          <AccessMetric
            icon="L"
            label="Total Activities"
            value={access.metrics.activities}
            note="From MongoDB audit log"
          />
          <AccessMetric
            icon="U"
            label="Active Users"
            value={access.metrics.activeActivityUsers}
            note="Across all employers"
            tone="purple"
          />
          <AccessMetric
            icon="E"
            label="Employers"
            value={access.metrics.employersWithActivity}
            note="With user activity"
          />
          <AccessMetric
            icon="S"
            label="Security Issues"
            value={access.metrics.securityIssues}
            note="No suspicious activity"
            tone="green"
          />
        </div>
        <div className="access-grid">
          <section className="admin-panel">
            <div className="filter-row">
              <input
                value={activitySearch}
                onChange={(event) => setActivitySearch(event.target.value)}
                placeholder="Search by user, action, reference ID..."
              />
              <button className="run-payroll" onClick={() => setActivitySearch(activitySearch.trim())}>Search</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>User</th>
                  <th>Employer</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Module</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivityLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedActivity(log.id)}
                    className={log.id === activeActivity.id ? 'selected-row' : ''}
                  >
                    <td>{log.dateTime}</td>
                    <td>{log.user}</td>
                    <td>{log.employer}</td>
                    <td>{log.role}</td>
                    <td>{log.action}</td>
                    <td>{log.module}</td>
                    <td>{log.details}</td>
                    <td>
                      <Pill tone="green">{log.status}</Pill>
                    </td>
                    <td>{log.ipAddress}</td>
                  </tr>
                ))}
                {!filteredActivityLogs.length && (
                  <tr>
                    <td colSpan={9}>No activity logs match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          <aside className="access-detail">
            <button className="close-button">x</button>
            <div className="big-avatar">JS</div>
            <h2>{activeActivity.user}</h2>
            <Pill>{activeActivity.role}</Pill>
            <dl>
              {[
                'dateTime',
                'action',
                'module',
                'employer',
                'referenceId',
                'status',
                'ipAddress',
                'device',
                'location'
              ].map((key) => (
                <>
                  <dt>{key}</dt>
                  <dd>{String((activeActivity as unknown as Record<string, string>)[key])}</dd>
                </>
              ))}
            </dl>
            <div className="info-card">
              <b>Details</b>
              <span>{activeActivity.details}</span>
            </div>
            <button>View Full Audit Trail</button>
          </aside>
        </div>
      </section>
    );
  if (mode === 'All Users')
    return (
      <section className="module-page access-page">
        <div className="employee-head">
          <div>
            <h1>Users & Access</h1>
            <p>Manage real user accounts fetched from MongoDB.</p>
          </div>
          <div className="head-actions">
            <ExportMenu onExport={exportUsers} />
          </div>
        </div>
        {accessTabs}
        <div className="metric-grid five">
          <AccessMetric
            icon="U"
            label="Total Users"
            value={access.metrics.totalUsers}
            note={`Payhours Staff ${realUserMetrics.payhoursStaff} | Employer/Employee Users ${realUserMetrics.employerUsers}`}
          />
          <AccessMetric
            icon="A"
            label="Active Users"
            value={access.metrics.activeUsers}
            note={`Payhours Staff ${realUserMetrics.activePayhoursStaff} | Employer/Employee Users ${realUserMetrics.activeEmployerUsers}`}
            tone="green"
          />
          <AccessMetric
            icon="I"
            label="Inactive Users"
            value={access.metrics.inactiveUsers}
            note="Only database users are counted"
            tone="red"
          />
          <AccessMetric
            icon="R"
            label="User Roles"
            value={access.metrics.userRoles}
            note="Distinct roles in MongoDB"
          />
          <AccessMetric
            icon="P"
            label="Pending Invitations"
            value={access.metrics.pendingInvitations}
            note="From database status"
            tone="yellow"
          />
        </div>
        <div className="access-grid">
          <section className="admin-panel">
            <div className="filter-row">
              <input
                value={accessUserSearch}
                onChange={(event) => setAccessUserSearch(event.target.value)}
                placeholder="Search by name, email, role or employer..."
              />
              <select
                value={accessRoleFilter}
                onChange={(event) => setAccessRoleFilter(event.target.value)}
              >
                <option>All Roles</option>
                {accessRoleOptions.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              <select
                value={accessStatusFilter}
                onChange={(event) => setAccessStatusFilter(event.target.value)}
              >
                <option>All Statuses</option>
                <option>Active</option>
                <option>Inactive</option>
                <option>Pending</option>
              </select>
              <button
                onClick={() => {
                  setAccessUserSearch('');
                  setAccessRoleFilter('All Roles');
                  setAccessStatusFilter('All Statuses');
                }}
              >
                Clear Filters
              </button>
            </div>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Employer</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccessUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user.id);
                      setEditingAccessUser(false);
                    }}
                    className={user.id === activeUser.id ? 'selected-row' : ''}
                  >
                    <td>
                      <input type="checkbox" onClick={(event) => event.stopPropagation()} />
                    </td>
                    <td>
                      <span className="avatar-sm">
                        {user.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)}
                      </span>
                      {user.name}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <Pill tone={user.role.includes('Super Admin') ? 'purple' : 'blue'}>
                        {user.role}
                      </Pill>
                    </td>
                    <td>{user.employer}</td>
                    <td>
                      <Pill tone={user.status === 'Active' ? 'green' : 'red'}>{user.status}</Pill>
                    </td>
                    <td>{user.lastLogin}</td>
                    <td>{user.createdDate}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditAccessUser(user);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteAccessUser(user);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredAccessUsers.length && (
                  <tr>
                    <td colSpan={9}>No users match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          {activeUser && (
            <aside className="access-detail">
              <button className="close-button" onClick={() => setEditingAccessUser(false)}>
                x
              </button>
              <div className="big-avatar">
                {activeUser.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <h2>{activeUser.name}</h2>
              <p>{activeUser.email}</p>
              <Pill tone={activeUser.role.includes('Super Admin') ? 'purple' : 'blue'}>
                {activeUser.role}
              </Pill>
              {editingAccessUser ? (
                <div className="edit-details-stack">
                  <label>
                    Name
                    <input
                      value={accessUserDraft.name || ''}
                      onChange={(event) => updateAccessUserDraft('name', event.target.value)}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      value={accessUserDraft.email || ''}
                      onChange={(event) => updateAccessUserDraft('email', event.target.value)}
                    />
                  </label>
                  <label>
                    Role
                    <input
                      value={accessUserDraft.role || ''}
                      disabled={
                        activeUser.role === 'Employee' || activeUser.role.includes('Super Admin')
                      }
                      onChange={(event) => updateAccessUserDraft('role', event.target.value)}
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={accessUserDraft.phone || ''}
                      onChange={(event) => updateAccessUserDraft('phone', event.target.value)}
                    />
                  </label>
                  <label>
                    Department / Job Title
                    <input
                      value={accessUserDraft.department || ''}
                      onChange={(event) => updateAccessUserDraft('department', event.target.value)}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={accessUserDraft.status || activeUser.status}
                      onChange={(event) => updateAccessUserDraft('status', event.target.value)}
                    >
                      <option>Active</option>
                      <option>Inactive</option>
                    </select>
                  </label>
                  <div className="side-actions">
                    <button onClick={() => setEditingAccessUser(false)}>Cancel</button>
                    <button className="run-payroll" onClick={saveAccessUser}>
                      Save User
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => startEditAccessUser(activeUser)}>Edit User</button>
                  <dl>
                    {[
                      'name',
                      'email',
                      'role',
                      'phone',
                      'department',
                      'timeZone',
                      'status',
                      'lastLogin',
                      'createdDate',
                      'twoFactor',
                      'loginMethod'
                    ].map((key) => (
                      <>
                        <dt>{key}</dt>
                        <dd>{String((activeUser as unknown as Record<string, string>)[key])}</dd>
                      </>
                    ))}
                  </dl>
                  <div className="side-actions">
                    <button
                      onClick={() => startEditAccessUser({ ...activeUser, status: 'Active' })}
                    >
                      Activate User
                    </button>
                    <button className="danger-button" onClick={() => deleteAccessUser(activeUser)}>
                      Delete User
                    </button>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      </section>
    );
  if (mode === 'Role Management')
    return (
      <section className="module-page access-page">
        <div className="employee-head">
          <div>
            <h1>Role Management</h1>
            <p>Create and manage user roles and their permissions for the Payhours platform.</p>
          </div>
          <button className="run-payroll" onClick={() => onMode('Create Role')}>
            Create Role
          </button>
        </div>
        <div className="access-tabs">
          <button className="active">Payhours Roles</button>
        </div>
        <div className="metric-grid four">
          <AccessMetric
            icon="U"
            label="Total Roles"
            value={access.metrics.totalRoles}
            note="System and custom roles"
          />
          <AccessMetric
            icon="S"
            label="Active Roles"
            value={access.metrics.activeRoles}
            note="Can be assigned to users"
            tone="green"
          />
          <AccessMetric
            icon="I"
            label="Inactive Role"
            value={access.metrics.inactiveRoles}
            note="Not available for assignment"
            tone="yellow"
          />
          <AccessMetric
            icon="G"
            label="Users Assigned"
            value={access.metrics.usersAssigned}
            note="Across all roles"
          />
        </div>
        <div className="access-grid">
          <section className="admin-panel">
            <h2>Roles</h2>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Role Name</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Users</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {access.roles.map((role) => (
                  <tr
                    key={role.id}
                    onClick={() => {
                      setSelectedRole(role.id);
                      setEditingRole(false);
                    }}
                    className={role.id === activeRole.id ? 'selected-row' : ''}
                  >
                    <td>
                      <input type="checkbox" onClick={(event) => event.stopPropagation()} />
                    </td>
                    <td>
                      <b>{role.name}</b>
                    </td>
                    <td>
                      <Pill>{role.type}</Pill>
                    </td>
                    <td>{role.description}</td>
                    <td>{role.users}</td>
                    <td>
                      <Pill tone={role.status === 'Active' ? 'green' : 'red'}>{role.status}</Pill>
                    </td>
                    <td className="table-actions">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditRole(role);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={role.type === 'System' || role.users > 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteRole(role);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="access-detail">
            <div className="employee-head">
              <h2>{activeRole.name}</h2>
              <Pill tone={activeRole.status === 'Active' ? 'green' : 'red'}>
                {activeRole.type} Role
              </Pill>
            </div>
            <div className="big-avatar">
              {activeRole.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </div>
            {editingRole ? (
              <div className="edit-details-stack">
                <label>
                  Role Name
                  <input
                    value={roleDraft.name || ''}
                    onChange={(event) => updateRoleDraft('name', event.target.value)}
                  />
                </label>
                <label>
                  Role Type
                  <select
                    value={roleDraft.type || activeRole.type}
                    onChange={(event) => updateRoleDraft('type', event.target.value)}
                  >
                    <option>System</option>
                    <option>Custom</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={roleDraft.status || activeRole.status}
                    onChange={(event) => updateRoleDraft('status', event.target.value)}
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    value={roleDraft.description || ''}
                    onChange={(event) => updateRoleDraft('description', event.target.value)}
                  />
                </label>
                <div className="side-actions">
                  <button onClick={() => setEditingRole(false)}>Cancel</button>
                  <button className="run-payroll" onClick={saveExistingRole}>
                    Save Role
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p>{activeRole.description}</p>
                <dl>
                  <dt>Role Type</dt>
                  <dd>{activeRole.type} Role</dd>
                  <dt>Status</dt>
                  <dd>
                    <Pill tone={activeRole.status === 'Active' ? 'green' : 'red'}>
                      {activeRole.status}
                    </Pill>
                  </dd>
                  <dt>Created Date</dt>
                  <dd>{activeRole.createdDate}</dd>
                  <dt>Last Updated</dt>
                  <dd>{activeRole.lastUpdated}</dd>
                  <dt>Total Users</dt>
                  <dd>{activeRole.users}</dd>
                </dl>
                <div className="info-card">
                  <b>{activeRole.type} Role</b>
                  <span>
                    {activeRole.type === 'System'
                      ? 'System roles can be edited or deactivated, but cannot be deleted.'
                      : 'Custom roles can be edited and deleted when no users are assigned.'}
                  </span>
                </div>
                <div className="side-actions">
                  <button onClick={() => startEditRole(activeRole)}>Edit Role</button>
                  <button
                    className="danger-button"
                    disabled={activeRole.type === 'System' || activeRole.users > 0}
                    onClick={() => deleteRole(activeRole)}
                  >
                    Delete Role
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
        <section className="admin-panel permission-summary">
          <h2>Permission Summary</h2>
          <p>Overview of key permissions for this role.</p>
          <div>
            {access.modules.slice(0, 7).map((module) => (
              <article key={module.name}>
                <b>{module.name}</b>
                {(activeRole.permissions[module.name] || module.permissions.slice(0, 3))
                  .slice(0, 3)
                  .map((permission) => (
                    <span key={permission} className="summary-permission">
                      <i aria-hidden="true"></i>
                      {permission}
                    </span>
                  ))}
              </article>
            ))}
          </div>
        </section>
      </section>
    );
  if (mode === 'All Users')
    return (
      <section className="module-page access-page">
        <div className="employee-head">
          <div>
            <h1>Users & Access</h1>
            <p>Manage user accounts, roles, permissions and access for the Payhours platform.</p>
          </div>
          <div className="head-actions">
            <ExportMenu onExport={exportUsers} />
          </div>
        </div>
        {accessTabs}
        <div className="metric-grid five">
          <AccessMetric
            icon="U"
            label="Total Users"
            value={access.metrics.totalUsers}
            note="Payhours Staff 12 | Employer Users 74"
          />
          <AccessMetric
            icon="A"
            label="Active Users"
            value={access.metrics.activeUsers}
            note="Payhours Staff 11 | Employer Users 67"
            tone="green"
          />
          <AccessMetric
            icon="I"
            label="Inactive Users"
            value={access.metrics.inactiveUsers}
            note="Payhours Staff 1 | Employer Users 7"
            tone="red"
          />
          <AccessMetric
            icon="R"
            label="User Roles"
            value={6}
            note="Super Admin, Admin, Support, Employer Admin, Manager, Employee"
          />
          <AccessMetric
            icon="P"
            label="Pending Invitations"
            value={5}
            note="Invites not yet accepted"
            tone="yellow"
          />
        </div>
        <div className="access-grid">
          <section className="admin-panel">
            <div className="filter-row">
              <input placeholder="Search by name, email, role or employer..." />
              <select>
                <option>All Roles</option>
              </select>
              <select>
                <option>All Statuses</option>
              </select>
              <button>Clear Filters</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Employer</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {access.users.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUser(user.id)}
                    className={user.id === activeUser.id ? 'selected-row' : ''}
                  >
                    <td>
                      <input type="checkbox" />
                    </td>
                    <td>
                      <span className="avatar-sm">
                        {user.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      {user.name}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <Pill tone={user.role === 'Super Admin' ? 'purple' : 'blue'}>
                        {user.role}
                      </Pill>
                    </td>
                    <td>{user.employer}</td>
                    <td>
                      <Pill tone={user.status === 'Active' ? 'green' : 'red'}>{user.status}</Pill>
                    </td>
                    <td>{user.lastLogin}</td>
                    <td>{user.createdDate}</td>
                    <td>...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="access-detail">
            <button className="close-button">x</button>
            <div className="big-avatar">
              {activeUser.name
                .split(' ')
                .map((part) => part[0])
                .join('')}
            </div>
            <h2>{activeUser.name}</h2>
            <p>{activeUser.email}</p>
            <Pill tone="purple">{activeUser.role}</Pill>
            <button>Edit User</button>
            <dl>
              {[
                'name',
                'email',
                'role',
                'phone',
                'department',
                'timeZone',
                'status',
                'lastLogin',
                'createdDate',
                'twoFactor',
                'loginMethod'
              ].map((key) => (
                <>
                  <dt>{key}</dt>
                  <dd>{String((activeUser as unknown as Record<string, string>)[key])}</dd>
                </>
              ))}
            </dl>
            <div className="side-actions">
              <button>Reset Password</button>
              <button>Deactivate User</button>
            </div>
          </aside>
        </div>
      </section>
    );
  return (
    <section className="module-page access-page">
      <div className="employee-head">
        <div>
          <h1>Role Management</h1>
          <p>Create and manage user roles and their permissions for the Payhours platform.</p>
        </div>
        <button className="run-payroll" onClick={() => onMode('Create Role')}>
          Create Role
        </button>
      </div>
      <div className="access-tabs">
        <button className="active">Payhours Roles</button>
      </div>
      <div className="metric-grid four">
        <AccessMetric
          icon="U"
          label="Total Roles"
          value={access.metrics.totalRoles}
          note="System and custom roles"
        />
        <AccessMetric
          icon="S"
          label="Active Roles"
          value={access.metrics.activeRoles}
          note="Can be assigned to users"
          tone="green"
        />
        <AccessMetric
          icon="I"
          label="Inactive Role"
          value={access.metrics.inactiveRoles}
          note="Not available for assignment"
          tone="yellow"
        />
        <AccessMetric
          icon="G"
          label="Users Assigned"
          value={access.metrics.usersAssigned}
          note="Across all roles"
        />
      </div>
      <div className="access-grid">
        <section className="admin-panel">
          <h2>Roles</h2>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Role Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Users</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {access.roles.map((role) => (
                <tr
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={role.id === activeRole.id ? 'selected-row' : ''}
                >
                  <td>
                    <input type="checkbox" />
                  </td>
                  <td>
                    <b>{role.name}</b>
                  </td>
                  <td>
                    <Pill>{role.type}</Pill>
                  </td>
                  <td>{role.description}</td>
                  <td>{role.users}</td>
                  <td>
                    <Pill tone={role.status === 'Active' ? 'green' : 'red'}>{role.status}</Pill>
                  </td>
                  <td>...</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="access-detail">
          <div className="employee-head">
            <h2>{activeRole.name}</h2>
            <Pill tone="green">{activeRole.type} Role</Pill>
          </div>
          <div className="big-avatar">
            {activeRole.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </div>
          <p>{activeRole.description}</p>
          <dl>
            <dt>Role Type</dt>
            <dd>{activeRole.type} Role</dd>
            <dt>Status</dt>
            <dd>
              <Pill tone="green">{activeRole.status}</Pill>
            </dd>
            <dt>Created Date</dt>
            <dd>{activeRole.createdDate}</dd>
            <dt>Last Updated</dt>
            <dd>{activeRole.lastUpdated}</dd>
            <dt>Total Users</dt>
            <dd>{activeRole.users}</dd>
          </dl>
          <div className="info-card">
            <b>{activeRole.type} Role</b>
            <span>
              This is a default system role. Some permissions may be required and cannot be removed.
            </span>
          </div>
          <button>Deactivate Role</button>
        </aside>
      </div>
      <section className="admin-panel permission-summary">
        <h2>Permission Summary</h2>
        <p>Overview of key permissions for this role.</p>
        <div>
          {access.modules.slice(0, 7).map((module) => (
            <article key={module.name}>
              <b>{module.name}</b>
              {(activeRole.permissions[module.name] || module.permissions.slice(0, 3))
                .slice(0, 3)
                .map((permission) => (
                  <span key={permission} className="summary-permission">
                    <i aria-hidden="true"></i>
                    {permission}
                  </span>
                ))}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
function SuperAdminPayrollAccounts({
  token,
  mode,
  onMode
}: {
  token: string;
  mode: string;
  onMode: (mode: string) => void;
}) {
  const [data, setData] = useState<PayrollAccountsData>();
  const [selectedId, setSelectedId] = useState('');
  const [menuId, setMenuId] = useState('');
  const [notice, setNotice] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [remitterFilter, setRemitterFilter] = useState('All');
  const [provinceFilter, setProvinceFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [accountPage, setAccountPage] = useState(1);
  const [accountPageSize, setAccountPageSize] = useState(10);
  const [addStep, setAddStep] = useState(1);
  const [addError, setAddError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [employerOptions, setEmployerOptions] = useState<
    Array<{ id: string; legalName: string; customerId: string; status: string }>
  >([]);
  const [loadingEmployer, setLoadingEmployer] = useState(false);
  const [workflow, setWorkflow] = useState<{ type: string; account: PayrollAccount }>();
  const [workflowError, setWorkflowError] = useState('');
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    referenceNumber: '',
    method: 'Online banking',
    documentName: ''
  });
  const [bankDraft, setBankDraft] = useState({
    bankName: '',
    accountType: 'Business Chequing',
    accountNumber: '',
    usedFor: 'Payroll, CRA',
    verificationStatus: 'Pending',
    status: 'Active',
    isDefault: false
  });
  const [remitterDraft, setRemitterDraft] = useState({
    remitterType: 'Regular',
    effectiveDate: new Date().toISOString().slice(0, 10),
    note: ''
  });
  const [noteDraft, setNoteDraft] = useState('');
  const [documentDraft, setDocumentDraft] = useState({ name: '', type: '', data: '' });
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      eventType: string;
      action: string;
      module: string;
      createdAt: string;
      ipAddress: string;
    }>
  >([]);
  const emptyPayrollAccount = {
    companyId: '',
    legalName: '',
    operatingName: '',
    businessNumber: '',
    payrollAccount: '',
    province: 'Alberta',
    remitterType: 'Regular',
    frequency: 'Monthly',
    nextRemittanceDue: '',
    contactName: '',
    phone: '',
    email: ''
  };
  const [draft, setDraft] = useState(emptyPayrollAccount);
  const load = () =>
    api<PayrollAccountsData>('/super-admin/payroll-accounts', token).then((payload) => {
      setData(payload);
      setSelectedId((current) => current || payload.accounts[0]?.id || '');
    });
  useEffect(() => {
    load().catch(() =>
      setData({
        metrics: {
          totalAccounts: 0,
          activeAccounts: 0,
          actionRequired: 0,
          dueSoon: 0,
          totalOutstanding: 0
        },
        accounts: []
      })
    );
  }, [token]);
  useEffect(() => {
    api<SuperAdminDashboard>('/super-admin/dashboard', token)
      .then((payload) =>
        setEmployerOptions(
          payload.employers.map((employer) => ({
            id: employer.id,
            legalName: employer.legalName,
            customerId: employer.customerId,
            status: employer.status
          }))
        )
      )
      .catch(() => setEmployerOptions([]));
  }, [token]);
  const accounts = data?.accounts || [];
  const selected = accounts.find((account) => account.id === selectedId) || accounts[0];
  const provinces = Array.from(
    new Set(accounts.map((account) => account.province).filter(Boolean))
  ).sort();
  const remitterTypes = Array.from(
    new Set(accounts.map((account) => account.remitterType).filter(Boolean))
  ).sort();
  const filteredAccounts = accounts.filter((account) => {
    const query = accountSearch.trim();
    const matchesSearch =
      !query ||
      [account.employer, account.businessNumber, account.rpAccountNumber].some((value) =>
        filterContains(value, query)
      );
    return (
      matchesSearch &&
      matchesFilter(account.remitterType, remitterFilter, 'All') &&
      matchesFilter(account.province, provinceFilter, 'All') &&
      matchesFilter(account.status, statusFilter, 'All')
    );
  });
  useEffect(() => {
    setAccountPage(1);
  }, [accountSearch, remitterFilter, provinceFilter, statusFilter, accountPageSize, mode]);
  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / accountPageSize));
  const visibleAccounts = filteredAccounts.slice(
    (Math.min(accountPage, pageCount) - 1) * accountPageSize,
    Math.min(accountPage, pageCount) * accountPageSize
  );
  const actions =
    mode === 'CRA Remittances'
      ? [
          'View Details',
          'Record Payment',
          'View Payment History',
          'Upload Document',
          'View Payroll Runs',
          'Add Note',
          'View Audit Log'
        ]
      : mode === 'Remittance Schedule'
        ? [
            'View Schedule',
            'Edit Remitter Type',
            'View Due Dates',
            'View CRA Remittances',
            'View Account',
            'Add Note',
            'View Change History'
          ]
        : [
            'View Details',
            'Edit Account',
            'Upload Document',
            'Set as Default',
            'Deactivate',
            'View Audit Log'
          ];
  async function quickAction(account: PayrollAccount, action: string) {
    setMenuId('');
    if (action === 'payment')
      await api(`/super-admin/payroll-accounts/${account.id}/remittance-payment`, token, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(account.currentCraLiability) || 0,
          paymentDate: new Date().toISOString().slice(0, 10),
          referenceNumber: `CRA-${Date.now().toString().slice(-6)}`,
          method: 'Online banking'
        })
      });
    if (action === 'note' || action === 'document')
      await api(`/super-admin/payroll-accounts/${account.id}/note`, token, {
        method: 'POST',
        body: JSON.stringify({
          note:
            action === 'document'
              ? 'Supporting CRA document uploaded/linked.'
              : 'Internal Payhours administrative note added.',
          documentName: action === 'document' ? 'CRA receipt.pdf' : undefined
        })
      });
    if (action === 'remitter')
      await api(`/super-admin/payroll-accounts/${account.id}/remitter-type`, token, {
        method: 'POST',
        body: JSON.stringify({
          remitterType: 'Accelerated Threshold 1',
          effectiveDate: new Date().toISOString().slice(0, 10),
          note: 'Effective-dated change from super admin.'
        })
      });
    setNotice(`${action.replace('-', ' ')} saved for ${account.employer}.`);
    await load();
  }
  async function openWorkflow(type: string, account?: PayrollAccount) {
    const target = account || selected || accounts[0];
    if (!target) {
      setNotice('Create or select a payroll account first.');
      return;
    }
    setWorkflowError('');
    setPaymentDraft({
      amount: target.currentCraLiability || '',
      paymentDate: new Date().toISOString().slice(0, 10),
      referenceNumber: '',
      method: 'Online banking',
      documentName: ''
    });
    setBankDraft({
      bankName: target.bankInstitution === '-' ? '' : target.bankInstitution,
      accountType: target.accountType || 'Business Chequing',
      accountNumber: '',
      usedFor: target.usedFor || 'Payroll, CRA',
      verificationStatus: target.verificationStatus || 'Pending',
      status: target.bankStatus || 'Active',
      isDefault: false
    });
    setRemitterDraft({
      remitterType: target.remitterType || 'Regular',
      effectiveDate: new Date().toISOString().slice(0, 10),
      note: ''
    });
    setNoteDraft('');
    setDocumentDraft({ name: '', type: '', data: '' });
    setWorkflow({ type, account: target });
    if (type === 'audit') {
      try {
        const response = await api<{ logs: typeof auditLogs }>(
          `/super-admin/payroll-accounts/${target.id}/audit`,
          token
        );
        setAuditLogs(response.logs);
      } catch (error) {
        setWorkflowError(error instanceof Error ? error.message : 'Unable to load audit history.');
      }
    }
  }
  async function updateBank(
    account: PayrollAccount,
    changes: Partial<typeof bankDraft>,
    message: string
  ) {
    setWorkflowBusy(true);
    try {
      await api(`/super-admin/payroll-accounts/${account.id}/banking`, token, {
        method: 'PATCH',
        body: JSON.stringify(changes)
      });
      setNotice(message);
      setWorkflow(undefined);
      await load();
    } catch (error) {
      setWorkflowError(
        error instanceof Error ? error.message : 'Unable to update banking details.'
      );
    } finally {
      setWorkflowBusy(false);
    }
  }
  async function submitWorkflow() {
    if (!workflow) return;
    setWorkflowBusy(true);
    setWorkflowError('');
    try {
      if (workflow.type === 'payment') {
        if (!(Number(paymentDraft.amount) > 0) || !paymentDraft.referenceNumber.trim())
          throw new Error('Enter a payment amount and CRA confirmation/reference number.');
        await api(
          `/super-admin/payroll-accounts/${workflow.account.id}/remittance-payment`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ ...paymentDraft, amount: Number(paymentDraft.amount) })
          }
        );
      } else if (workflow.type === 'bank') {
        if (!bankDraft.bankName.trim() || !bankDraft.accountNumber.trim())
          throw new Error('Enter the bank institution and account number.');
        await api(`/super-admin/payroll-accounts/${workflow.account.id}/banking`, token, {
          method: 'PATCH',
          body: JSON.stringify(bankDraft)
        });
      } else if (workflow.type === 'remitter') {
        await api(`/super-admin/payroll-accounts/${workflow.account.id}/remitter-type`, token, {
          method: 'POST',
          body: JSON.stringify(remitterDraft)
        });
      } else if (workflow.type === 'note') {
        if (!noteDraft.trim()) throw new Error('Enter an internal note.');
        await api(`/super-admin/payroll-accounts/${workflow.account.id}/note`, token, {
          method: 'POST',
          body: JSON.stringify({ note: noteDraft })
        });
      } else if (workflow.type === 'document') {
        if (!documentDraft.data || !documentDraft.name)
          throw new Error('Choose a document to upload.');
        await api(`/super-admin/payroll-accounts/${workflow.account.id}/note`, token, {
          method: 'POST',
          body: JSON.stringify({
            note: 'Supporting payroll account document uploaded.',
            documentName: documentDraft.name,
            documentType: documentDraft.type,
            documentData: documentDraft.data
          })
        });
      }
      setNotice(
        `${workflow.type === 'bank' ? 'Bank account' : workflow.type === 'remitter' ? 'Remittance schedule' : workflow.type === 'payment' ? 'CRA payment' : workflow.type === 'document' ? 'Document' : 'Note'} saved for ${workflow.account.employer}.`
      );
      setWorkflow(undefined);
      await load();
    } catch (error) {
      setWorkflowError(error instanceof Error ? error.message : 'Unable to save changes.');
    } finally {
      setWorkflowBusy(false);
    }
  }
  async function selectExistingEmployer(companyId: string) {
    setAddError('');
    if (!companyId) {
      setDraft(emptyPayrollAccount);
      return;
    }
    setLoadingEmployer(true);
    try {
      const response = await api<{
        employer: {
          id: string;
          legalName: string;
          operatingName?: string;
          businessNumber?: string;
          address?: { province?: string };
          craPayroll?: Record<string, unknown>;
          primaryContact?: {
            firstName?: string;
            lastName?: string;
            email?: string;
            phone?: string;
          };
        };
      }>(`/super-admin/employers/${companyId}`, token);
      const employer = response.employer;
      const cra = employer.craPayroll || {};
      const contact =
        cra.contact && typeof cra.contact === 'object'
          ? (cra.contact as Record<string, unknown>)
          : {};
      const value = (input: unknown, fallback = '') =>
        typeof input === 'string' ? input : fallback;
      const dueDate = value(cra.nextRemittanceDue);
      const storedBusinessNumber = employer.businessNumber || '';
      const businessNumber =
        storedBusinessNumber.match(/^\d{9}/)?.[0] ||
        storedBusinessNumber.replace(/\D/g, '').slice(0, 9);
      const storedRpAccount = /^\d{9}RP\d{4}$/i.test(storedBusinessNumber)
        ? storedBusinessNumber
        : '';
      setDraft({
        companyId: employer.id,
        legalName: employer.legalName || '',
        operatingName: employer.operatingName || '',
        businessNumber,
        payrollAccount: value(
          cra.payrollAccount,
          storedRpAccount || (businessNumber ? `${businessNumber}RP0001` : '')
        ),
        province: employer.address?.province || value(cra.province, 'Alberta'),
        remitterType: value(cra.remitterType, 'Regular'),
        frequency: value(cra.frequency, 'Monthly'),
        nextRemittanceDue: /^\d{4}-\d{2}-\d{2}/.test(dueDate) ? dueDate.slice(0, 10) : '',
        contactName: value(
          contact.name,
          [employer.primaryContact?.firstName, employer.primaryContact?.lastName]
            .filter(Boolean)
            .join(' ')
        ),
        phone: value(contact.phone, employer.primaryContact?.phone || ''),
        email: value(contact.email, employer.primaryContact?.email || '')
      });
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Unable to load employer details.');
    } finally {
      setLoadingEmployer(false);
    }
  }
  async function saveAccount() {
    setAddError('');
    if (draft.legalName.trim().length < 2) return setAddError('Enter the legal employer name.');
    if (!/^\d{9}$/.test(draft.businessNumber.trim()))
      return setAddError('Business Number must contain exactly 9 digits.');
    if (!/^\d{9}RP\d{4}$/i.test(draft.payrollAccount.trim()))
      return setAddError('RP account number must use the format 123456789RP0001.');
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email))
      return setAddError('Enter a valid CRA contact email address.');
    setSavingAccount(true);
    try {
      const response = await api<{ account: PayrollAccount }>(
        '/super-admin/payroll-accounts',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            ...draft,
            businessNumber: draft.businessNumber.trim(),
            payrollAccount: draft.payrollAccount.trim().toUpperCase()
          })
        }
      );
      setNotice(`Payroll account saved for ${response.account.employer}.`);
      setDraft(emptyPayrollAccount);
      setAddStep(1);
      await load();
      onMode('All Payroll Accounts');
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Unable to save the payroll account.');
    } finally {
      setSavingAccount(false);
    }
  }
  const workflowTitle: Record<string, string> = {
    details: 'Payroll Account Details',
    payment: 'Record CRA Payment',
    history: 'Payment History',
    document: 'Upload Supporting Document',
    payroll: 'Payroll Runs Included',
    note: 'Add Internal Note',
    audit: 'Audit Log',
    bank: 'Bank Account',
    remitter: 'Edit Remitter Type',
    dueDates: 'Upcoming Due Dates',
    changeHistory: 'Remitter Change History'
  };
  const actionDialog = workflow ? (
    <div
      className="payroll-modal-backdrop"
      role="presentation"
      onMouseDown={() => setWorkflow(undefined)}
    >
      <section
        className="payroll-modal"
        role="dialog"
        aria-modal="true"
        aria-label={workflowTitle[workflow.type] || 'Payroll account action'}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>{workflowTitle[workflow.type] || 'Payroll Account'}</h2>
            <p>
              {workflow.account.employer} · {workflow.account.rpAccountNumber}
            </p>
          </div>
          <button aria-label="Close" onClick={() => setWorkflow(undefined)}>
            ×
          </button>
        </header>
        {workflowError && <p className="payroll-modal-error">{workflowError}</p>}
        <div className="payroll-modal-body">
          {workflow.type === 'details' && (
            <dl className="workflow-details">
              <dt>Legal Employer</dt>
              <dd>{workflow.account.employer}</dd>
              <dt>Business Number</dt>
              <dd>{workflow.account.businessNumber}</dd>
              <dt>RP Account</dt>
              <dd>{workflow.account.rpAccountNumber}</dd>
              <dt>Remitter Type</dt>
              <dd>{workflow.account.remitterType}</dd>
              <dt>Frequency</dt>
              <dd>{workflow.account.frequency}</dd>
              <dt>Next Remittance Due</dt>
              <dd>{workflow.account.nextRemittanceDue}</dd>
              <dt>Outstanding Liability</dt>
              <dd>{moneyText(Number(workflow.account.currentCraLiability) || 0)}</dd>
              <dt>Status</dt>
              <dd>{workflow.account.status}</dd>
            </dl>
          )}
          {workflow.type === 'payment' && (
            <div className="workflow-form two">
              <label>
                Amount *
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentDraft.amount}
                  onChange={(event) =>
                    setPaymentDraft({ ...paymentDraft, amount: event.target.value })
                  }
                />
              </label>
              <AdminInput
                label="Payment Date *"
                type="date"
                value={paymentDraft.paymentDate}
                onChange={(next) => setPaymentDraft({ ...paymentDraft, paymentDate: next })}
              />
              <label>
                CRA Confirmation / Reference *
                <input
                  value={paymentDraft.referenceNumber}
                  onChange={(event) =>
                    setPaymentDraft({ ...paymentDraft, referenceNumber: event.target.value })
                  }
                />
              </label>
              <label>
                Payment Method
                <select
                  value={paymentDraft.method}
                  onChange={(event) =>
                    setPaymentDraft({ ...paymentDraft, method: event.target.value })
                  }
                >
                  <option>Online banking</option>
                  <option>Pre-authorized debit</option>
                  <option>Wire transfer</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
          )}
          {workflow.type === 'bank' && (
            <div className="workflow-form two">
              <label>
                Bank Institution *
                <input
                  value={bankDraft.bankName}
                  onChange={(event) => setBankDraft({ ...bankDraft, bankName: event.target.value })}
                />
              </label>
              <label>
                Account Type
                <select
                  value={bankDraft.accountType}
                  onChange={(event) =>
                    setBankDraft({ ...bankDraft, accountType: event.target.value })
                  }
                >
                  <option>Business Chequing</option>
                  <option>Business Savings</option>
                </select>
              </label>
              <label>
                Account Number *
                <input
                  value={bankDraft.accountNumber}
                  onChange={(event) =>
                    setBankDraft({
                      ...bankDraft,
                      accountNumber: event.target.value.replace(/\D/g, '')
                    })
                  }
                  placeholder="Full number is encrypted"
                />
              </label>
              <label>
                Used For
                <select
                  value={bankDraft.usedFor}
                  onChange={(event) => setBankDraft({ ...bankDraft, usedFor: event.target.value })}
                >
                  <option>Payroll</option>
                  <option>CRA</option>
                  <option>Payroll, CRA</option>
                </select>
              </label>
              <label>
                Verification Status
                <select
                  value={bankDraft.verificationStatus}
                  onChange={(event) =>
                    setBankDraft({ ...bankDraft, verificationStatus: event.target.value })
                  }
                >
                  <option>Pending</option>
                  <option>Verified</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={bankDraft.status}
                  onChange={(event) => setBankDraft({ ...bankDraft, status: event.target.value })}
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
              <label className="workflow-check">
                <input
                  type="checkbox"
                  checked={bankDraft.isDefault}
                  onChange={(event) =>
                    setBankDraft({ ...bankDraft, isDefault: event.target.checked })
                  }
                />
                Default funding account
              </label>
            </div>
          )}
          {workflow.type === 'remitter' && (
            <div className="workflow-form">
              <label>
                Remitter Type
                <select
                  value={remitterDraft.remitterType}
                  onChange={(event) =>
                    setRemitterDraft({ ...remitterDraft, remitterType: event.target.value })
                  }
                >
                  <option>Regular</option>
                  <option>Quarterly</option>
                  <option>Accelerated Threshold 1</option>
                  <option>Accelerated Threshold 2</option>
                </select>
              </label>
              <AdminInput
                label="Effective Date"
                type="date"
                value={remitterDraft.effectiveDate}
                onChange={(next) => setRemitterDraft({ ...remitterDraft, effectiveDate: next })}
              />
              <label>
                Reason / Note
                <textarea
                  value={remitterDraft.note}
                  onChange={(event) =>
                    setRemitterDraft({ ...remitterDraft, note: event.target.value })
                  }
                />
              </label>
            </div>
          )}
          {workflow.type === 'note' && (
            <div className="workflow-form">
              <label>
                Internal Payhours Note
                <textarea
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Visible to authorized Payhours administrators only"
                />
              </label>
            </div>
          )}
          {workflow.type === 'document' && (
            <div className="workflow-form">
              <label>
                Supporting Document
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 3_000_000) {
                      setWorkflowError('Document must be smaller than 3 MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () =>
                      setDocumentDraft({
                        name: file.name,
                        type: file.type,
                        data: String(reader.result || '')
                      });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {documentDraft.name && (
                <p className="selected-document">Selected: {documentDraft.name}</p>
              )}
            </div>
          )}
          {workflow.type === 'history' && (
            <div className="workflow-list">
              {workflow.account.payments.length ? (
                workflow.account.payments.map((payment, index) => (
                  <article key={index}>
                    <b>{moneyText(Number(payment.amount) || 0)}</b>
                    <span>
                      {String(payment.paymentDate || '-')} · {String(payment.method || '-')}
                    </span>
                    <small>Reference: {String(payment.referenceNumber || '-')}</small>
                  </article>
                ))
              ) : (
                <p>No CRA payments have been recorded.</p>
              )}
            </div>
          )}
          {workflow.type === 'payroll' && (
            <div className="workflow-list">
              {workflow.account.payrollRuns.length ? (
                workflow.account.payrollRuns.map((run) => (
                  <article key={run.id}>
                    <b>{run.period}</b>
                    <span>Pay date: {run.payDate}</span>
                    <small>
                      Deductions: {moneyText(Number(run.totalDeductions) || 0)} · {run.status}
                    </small>
                  </article>
                ))
              ) : (
                <p>No finalized payroll runs are included.</p>
              )}
            </div>
          )}
          {workflow.type === 'changeHistory' && (
            <div className="workflow-list">
              {workflow.account.remitterHistory.map((item, index) => (
                <article key={index}>
                  <b>{String(item.remitterType || 'Regular')}</b>
                  <span>Effective {String(item.effectiveDate || item.changedAt || '-')}</span>
                  <small>
                    {String(item.changedBy || 'System')} {item.note ? `· ${String(item.note)}` : ''}
                  </small>
                </article>
              ))}
            </div>
          )}
          {workflow.type === 'dueDates' && (
            <div className="workflow-list">
              <article>
                <b>{workflow.account.nextRemittanceDue}</b>
                <span>{workflow.account.frequency} remittance</span>
                <small>Current remitter type: {workflow.account.remitterType}</small>
              </article>
            </div>
          )}
          {workflow.type === 'audit' && (
            <div className="workflow-list">
              {auditLogs.length ? (
                auditLogs.map((log) => (
                  <article key={log.id}>
                    <b>{log.action}</b>
                    <span>{new Date(log.createdAt).toLocaleString('en-CA')}</span>
                    <small>
                      {log.eventType} · IP {log.ipAddress}
                    </small>
                  </article>
                ))
              ) : (
                <p>No payroll-account audit events found.</p>
              )}
            </div>
          )}
        </div>
        {['payment', 'bank', 'remitter', 'note', 'document'].includes(workflow.type) && (
          <footer>
            <button onClick={() => setWorkflow(undefined)}>Cancel</button>
            <button className="payroll-primary" disabled={workflowBusy} onClick={submitWorkflow}>
              {workflowBusy ? 'Saving...' : 'Save'}
            </button>
          </footer>
        )}
      </section>
    </div>
  ) : null;
  if (mode === 'All Payroll Accounts') {
    const activeAccount =
      filteredAccounts.find((account) => account.id === selectedId) ||
      filteredAccounts[0] ||
      selected;
    const clearAccountFilters = () => {
      setAccountSearch('');
      setRemitterFilter('All');
      setProvinceFilter('All');
      setStatusFilter('All');
      setAccountPage(1);
    };
    return (
      <section className="module-page payroll-section payroll-accounts-page">
        <div className="payroll-page-head">
          <div>
            <h1>Payroll Accounts</h1>
            <p>Manage employers' CRA payroll deductions program (RP) accounts.</p>
          </div>
          <button className="payroll-primary" onClick={() => onMode('Add Payroll Account')}>
            <span>+</span> Add Payroll Account
          </button>
        </div>
        {notice && (
          <div className="success-note">
            <b>Saved</b>
            <span>{notice}</span>
          </div>
        )}
        <div className="payroll-kpis">
          <article>
            <span className="payroll-kpi-icon bank">▦</span>
            <div>
              <strong>{data?.metrics.totalAccounts || 0}</strong>
              <b>Total RP Accounts</b>
              <small>
                <i>↑ 12%</i> vs last month
              </small>
            </div>
          </article>
          <article>
            <span className="payroll-kpi-icon active">✓</span>
            <div>
              <strong>{data?.metrics.activeAccounts || 0}</strong>
              <b>Active Accounts</b>
              <small>
                {data?.metrics.totalAccounts
                  ? `${Math.round(((data?.metrics.activeAccounts || 0) / data.metrics.totalAccounts) * 1000) / 10}% of total`
                  : '0% of total'}
              </small>
            </div>
          </article>
          <article>
            <span className="payroll-kpi-icon alert">!</span>
            <div>
              <strong>{data?.metrics.actionRequired || 0}</strong>
              <b>Action Required</b>
              <small>Setup incomplete or inactive</small>
            </div>
          </article>
          <article>
            <span className="payroll-kpi-icon calendar">▣</span>
            <div>
              <strong>{data?.metrics.dueSoon || 0}</strong>
              <b>Remittances Due Soon</b>
              <small>Next 30 days</small>
            </div>
          </article>
        </div>
        <div className="payroll-workspace">
          <div className="payroll-list-column">
            <div className="payroll-account-filters">
              <label className="payroll-search">
                <span>⌕</span>
                <input
                  value={accountSearch}
                  onChange={(event) => {
                    setAccountSearch(event.target.value);
                    setAccountPage(1);
                  }}
                  placeholder="Search by employer name, BN, or RP account number..."
                />
              </label>
              <select
                aria-label="Remitter type"
                value={remitterFilter}
                onChange={(event) => {
                  setRemitterFilter(event.target.value);
                  setAccountPage(1);
                }}
              >
                <option value="All">Remitter Type</option>
                {remitterTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <select
                aria-label="Province"
                value={provinceFilter}
                onChange={(event) => {
                  setProvinceFilter(event.target.value);
                  setAccountPage(1);
                }}
              >
                <option value="All">Province</option>
                {provinces.map((province) => (
                  <option key={province}>{province}</option>
                ))}
              </select>
              <select
                aria-label="Status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setAccountPage(1);
                }}
              >
                <option value="All">Status</option>
                <option>Active</option>
                <option>Setup Required</option>
                <option>Inactive</option>
              </select>
              <button className="filter-chevron" aria-label="More filters">
                ⌄
              </button>
              <button className="clear-payroll-filters" onClick={clearAccountFilters}>
                Clear Filters
              </button>
            </div>
            <div className="payroll-account-table-wrap">
              <table className="payroll-account-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>
                      Employer <span>↕</span>
                    </th>
                    <th>
                      Business
                      <br />
                      Number (BN)
                    </th>
                    <th>
                      RP Account
                      <br />
                      Number
                    </th>
                    <th>Remitter Type</th>
                    <th>
                      Next Remittance
                      <br />
                      Due
                    </th>
                    <th>
                      Current CRA
                      <br />
                      Liability
                    </th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map((account, index) => (
                    <tr
                      key={account.id}
                      className={activeAccount?.id === account.id ? 'selected-row' : ''}
                      onClick={() => setSelectedId(account.id)}
                    >
                      <td>
                        {(Math.min(accountPage, pageCount) - 1) * accountPageSize + index + 1}
                      </td>
                      <td>
                        <b>{account.employer}</b>
                        <small>{account.location}</small>
                      </td>
                      <td>{account.businessNumber || '-'}</td>
                      <td>{account.rpAccountNumber || '-'}</td>
                      <td>{account.remitterType || '-'}</td>
                      <td>{account.nextRemittanceDue || '-'}</td>
                      <td>{moneyText(Number(account.currentCraLiability) || 0)}</td>
                      <td>
                        <span
                          className={`account-status ${account.status.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <i>{account.status === 'Active' ? '✓' : '!'}</i>
                          {account.status}
                        </span>
                      </td>
                      <td className="account-action-cell">
                        <button
                          aria-label={`Actions for ${account.employer}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(account.id);
                            setMenuId(menuId === account.id ? '' : account.id);
                          }}
                        >
                          •••
                        </button>
                        {menuId === account.id && (
                          <div className="row-menu">
                            <button onClick={() => openWorkflow('details', account)}>
                              View Account
                            </button>
                            <button onClick={() => openWorkflow('remitter', account)}>
                              Edit Account
                            </button>
                            <button onClick={() => openWorkflow('note', account)}>Add Note</button>
                            <button onClick={() => openWorkflow('audit', account)}>
                              View Audit Log
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!visibleAccounts.length && (
                    <tr>
                      <td colSpan={9} className="payroll-empty">
                        No payroll accounts match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="payroll-pagination">
              <b>
                Showing{' '}
                {filteredAccounts.length
                  ? (Math.min(accountPage, pageCount) - 1) * accountPageSize + 1
                  : 0}{' '}
                –{' '}
                {Math.min(
                  Math.min(accountPage, pageCount) * accountPageSize,
                  filteredAccounts.length
                )}{' '}
                of {filteredAccounts.length} payroll accounts
              </b>
              <div>
                <button
                  disabled={accountPage <= 1}
                  onClick={() => setAccountPage((page) => Math.max(1, page - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map(
                  (page) => (
                    <button
                      key={page}
                      className={accountPage === page ? 'active' : ''}
                      onClick={() => setAccountPage(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  disabled={accountPage >= pageCount}
                  onClick={() => setAccountPage((page) => Math.min(pageCount, page + 1))}
                >
                  ›
                </button>
                <select
                  value={accountPageSize}
                  onChange={(event) => {
                    setAccountPageSize(Number(event.target.value));
                    setAccountPage(1);
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          </div>
          {activeAccount && (
            <aside className="payroll-account-summary">
              <h2>Account Summary</h2>
              <div className="account-summary-name">
                <span>
                  {activeAccount.employer
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <div>
                  <b>{activeAccount.employer}</b>
                  <small>{activeAccount.location}</small>
                </div>
                <span className="account-status active">
                  <i>✓</i>
                  {activeAccount.status}
                </span>
              </div>
              <dl>
                <dt>Legal Employer</dt>
                <dd>{activeAccount.employer}</dd>
                <dt>Business Number (BN)</dt>
                <dd>{activeAccount.businessNumber}</dd>
                <dt>CRA Program</dt>
                <dd>RP — Payroll Deductions</dd>
                <dt>RP Account Number</dt>
                <dd>{activeAccount.rpAccountNumber}</dd>
                <dt>Remitter Type</dt>
                <dd>{activeAccount.remitterType}</dd>
                <dt>Province</dt>
                <dd>{activeAccount.province}</dd>
                <dt>Account Status</dt>
                <dd>
                  <span className="account-status active">
                    <i>●</i>
                    {activeAccount.status}
                  </span>
                </dd>
                <dt>Next Remittance Due</dt>
                <dd>{activeAccount.nextRemittanceDue}</dd>
                <dt>Current CRA Liability</dt>
                <dd>
                  {moneyText(Number(activeAccount.currentCraLiability) || 0)}{' '}
                  <span className="summary-info">i</span>
                </dd>
                <dt>Last Updated</dt>
                <dd>{activeAccount.lastUpdated || '-'}</dd>
              </dl>
              <div className="summary-buttons">
                <button
                  className="payroll-primary"
                  onClick={() => openWorkflow('details', activeAccount)}
                >
                  View Account
                </button>
                <button onClick={() => openWorkflow('remitter', activeAccount)}>
                  ✎ &nbsp; Edit
                </button>
              </div>
              <div className="payroll-account-help">
                <span>i</span>
                <div>
                  <b>What this account is for</b>
                  <p>
                    This CRA payroll program (RP) account is used to remit payroll source deductions
                    and contributions to the Canada Revenue Agency, including:
                  </p>
                  <ul>
                    <li>Employee income tax</li>
                    <li>Canada Pension Plan (CPP) – employee and employer portions</li>
                    <li>Employment Insurance (EI) – employee and employer portions</li>
                  </ul>
                  <p>
                    PD7A is a remittance voucher/statement for certain remitters. It is not a
                    separate account.
                  </p>
                  <a
                    href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Learn more about CRA payroll accounts ↗
                  </a>
                </div>
              </div>
            </aside>
          )}
        </div>
        {actionDialog}
      </section>
    );
  }
  if (mode === 'Add Payroll Account') {
    const requiredChecks = [
      ['Legal employer name', draft.legalName.trim().length >= 2],
      ['9-digit Business Number (BN)', /^\d{9}$/.test(draft.businessNumber.trim())],
      ['RP payroll account number', /^\d{9}RP\d{4}$/i.test(draft.payrollAccount.trim())],
      ['Remittance frequency', Boolean(draft.frequency)],
      ['Province / Territory', Boolean(draft.province)]
    ] as Array<[string, boolean]>;
    const advanceAccount = () => {
      if (addStep < 4) {
        setAddStep((step) => step + 1);
        return;
      }
      saveAccount();
    };
    return (
      <section className="module-page payroll-section payroll-accounts-page payroll-add-page">
        <div className="add-payroll-breadcrumb">
          <button onClick={() => onMode('All Payroll Accounts')}>Payroll Accounts</button>
          <span>›</span>
          <b>Add Payroll Account</b>
        </div>
        <div className="add-payroll-title">
          <h1>Add Payroll Account</h1>
          <p>Add the employer's CRA payroll program (RP) account details.</p>
        </div>
        <div className="add-payroll-steps">
          {[
            'Account Information',
            'Remittance Details',
            'CRA Contact (Optional)',
            'Review & Save'
          ].map((item, index) => (
            <button
              type="button"
              className={index + 1 <= addStep ? 'active' : ''}
              key={item}
              onClick={() => setAddStep(index + 1)}
            >
              <b>{index + 1}</b>
              <span>{item}</span>
            </button>
          ))}
        </div>
        {addError && <p className="add-payroll-error">{addError}</p>}
        <div className="add-payroll-layout">
          <div className="add-payroll-form">
            <section className="employer-picker">
              <div>
                <h2>Select Existing Employer</h2>
                <p>
                  Choose an employer to automatically load its registered business, CRA and contact
                  information.
                </p>
              </div>
              <label>
                Employer
                <select
                  value={draft.companyId}
                  disabled={loadingEmployer}
                  onChange={(event) => selectExistingEmployer(event.target.value)}
                >
                  <option value="">Select an employer...</option>
                  {employerOptions.map((employer) => (
                    <option key={employer.id} value={employer.id}>
                      {employer.legalName} ({employer.customerId}) — {employer.status}
                    </option>
                  ))}
                </select>
              </label>
              {loadingEmployer && <span>Loading employer details...</span>}
            </section>
            <section className="add-payroll-card">
              <div className="add-card-title">
                <b>1</b>
                <div>
                  <h2>Employer Information</h2>
                  <p>Enter the legal business information as registered with CRA.</p>
                </div>
              </div>
              <div className="add-field-grid two">
                <label>
                  Legal Employer Name <em>*</em>
                  <input
                    value={draft.legalName}
                    onChange={(event) => setDraft({ ...draft, legalName: event.target.value })}
                    placeholder="Maple Foods Inc."
                  />
                  <small>Enter the legal name as registered with CRA.</small>
                </label>
                <label>
                  Operating Name (Optional)
                  <input
                    value={draft.operatingName}
                    onChange={(event) => setDraft({ ...draft, operatingName: event.target.value })}
                    placeholder="Maple Foods"
                  />
                  <small>If different from the legal name.</small>
                </label>
                <label>
                  Business Number (BN) <em>*</em>
                  <input
                    inputMode="numeric"
                    maxLength={9}
                    value={draft.businessNumber}
                    onChange={(event) =>
                      setDraft({ ...draft, businessNumber: event.target.value.replace(/\D/g, '') })
                    }
                    placeholder="123456789"
                  />
                  <small>9-digit business number (no spaces).</small>
                </label>
                <label>
                  Province / Territory <em>*</em>
                  <select
                    value={draft.province}
                    onChange={(event) => setDraft({ ...draft, province: event.target.value })}
                  >
                    {[
                      'Alberta',
                      'British Columbia',
                      'Manitoba',
                      'New Brunswick',
                      'Newfoundland and Labrador',
                      'Nova Scotia',
                      'Ontario',
                      'Prince Edward Island',
                      'Quebec',
                      'Saskatchewan',
                      'Northwest Territories',
                      'Nunavut',
                      'Yukon'
                    ].map((province) => (
                      <option key={province}>{province}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="add-payroll-card">
              <div className="add-card-title">
                <b>2</b>
                <div>
                  <h2>CRA Payroll Program Account</h2>
                  <p>Enter the employer's payroll program (RP) account information.</p>
                </div>
              </div>
              <div className="add-field-grid two">
                <label>
                  Program Type
                  <select disabled>
                    <option>RP — Payroll Deductions</option>
                  </select>
                </label>
                <label>
                  RP Account Number <em>*</em>
                  <input
                    maxLength={15}
                    value={draft.payrollAccount}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        payrollAccount: event.target.value.toUpperCase().replace(/[^0-9RP]/g, '')
                      })
                    }
                    placeholder="123456789RP0001"
                  />
                  <small>Format: 9 digits + RP + 4 digits (e.g. 123456789RP0001).</small>
                </label>
              </div>
            </section>
            <section className="add-payroll-card">
              <div className="add-card-title">
                <b>3</b>
                <div>
                  <h2>Remittance Details</h2>
                  <p>Select the employer's CRA remittance frequency.</p>
                </div>
              </div>
              <div className="add-field-grid two">
                <label>
                  Remittance Frequency <em>*</em>
                  <select
                    value={draft.frequency}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        frequency: event.target.value,
                        remitterType:
                          event.target.value === 'Monthly' ? 'Regular' : event.target.value
                      })
                    }
                  >
                    <option>Monthly</option>
                    <option>Quarterly</option>
                    <option>Accelerated Threshold 1</option>
                    <option>Accelerated Threshold 2</option>
                  </select>
                </label>
                <label>
                  Next Remittance Due Date (Optional)
                  <input
                    type="date"
                    value={draft.nextRemittanceDue}
                    onChange={(event) =>
                      setDraft({ ...draft, nextRemittanceDue: event.target.value })
                    }
                    placeholder="yyyy-mm-dd"
                    pattern="\d{4}-\d{2}-\d{2}"
                  />
                  <small className="date-format-hint">format: yyyy-mm-dd</small>
                  <small>Based on CRA schedule. You can adjust this later.</small>
                </label>
              </div>
            </section>
            <section className="add-payroll-card">
              <div className="add-card-title">
                <b>4</b>
                <div>
                  <h2>CRA Contact (Optional)</h2>
                  <p>Add a contact person at the employer for CRA-related matters.</p>
                </div>
              </div>
              <div className="add-field-grid three">
                <label>
                  Contact Name
                  <input
                    value={draft.contactName}
                    onChange={(event) => setDraft({ ...draft, contactName: event.target.value })}
                    placeholder="John Smith"
                  />
                </label>
                <label>
                  Phone Number
                  <input
                    value={draft.phone}
                    onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                    placeholder="(403) 555-1234"
                  />
                </label>
                <label>
                  Email Address
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                    placeholder="john.smith@maplefoods.ca"
                  />
                </label>
              </div>
            </section>
          </div>
          <aside className="add-payroll-aside">
            <section className="cra-about">
              <div className="aside-heading">
                <span>i</span>
                <h2>About CRA Payroll Accounts</h2>
              </div>
              <p>
                Use the employer's CRA payroll program (RP) account to remit source deductions to
                the Canada Revenue Agency, including:
              </p>
              <ul>
                <li>Employee income tax</li>
                <li>Canada Pension Plan (CPP) – employee and employer portions</li>
                <li>Employment Insurance (EI) – employee and employer portions</li>
              </ul>
              <p>
                A PD7A is a remittance voucher/statement for certain remitters. It is not a separate
                account.
              </p>
              <a
                href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html"
                target="_blank"
                rel="noreferrer"
              >
                Learn more about CRA payroll accounts ↗
              </a>
            </section>
            <section className="required-information">
              <div className="aside-heading">
                <span>▤</span>
                <h2>Required Information</h2>
              </div>
              {requiredChecks.map(([label, complete]) => (
                <p key={label} className={complete ? 'complete' : ''}>
                  <i>{complete ? '✓' : '○'}</i>
                  {label}
                </p>
              ))}
            </section>
            <section className="cra-help">
              <div className="aside-heading">
                <span>!</span>
                <h2>Need Help?</h2>
              </div>
              <p>
                You can find your RP account number on CRA documents such as your Notice to Remit or
                PD7A statement.
              </p>
              <a
                href="https://www.canada.ca/en/revenue-agency.html"
                target="_blank"
                rel="noreferrer"
              >
                Visit CRA website ↗
              </a>
            </section>
          </aside>
        </div>
        <div className="add-payroll-actions">
          <button onClick={() => onMode('All Payroll Accounts')}>Cancel</button>
          <button className="payroll-primary" disabled={savingAccount} onClick={advanceAccount}>
            {savingAccount
              ? 'Saving...'
              : addStep < 4
                ? 'Next: Remittance Details →'
                : 'Review & Save →'}
          </button>
        </div>
      </section>
    );
  }
  if (mode === 'CRA Remittances') {
    const today = new Date();
    const remittanceRows = accounts
      .filter((account) => {
        const query = accountSearch.trim();
        return (
          (!query ||
            [account.employer, account.businessNumber, account.rpAccountNumber].some((value) =>
              filterContains(value, query)
            )) &&
          matchesFilter(account.remitterType, remitterFilter, 'All') &&
          matchesFilter(account.province, provinceFilter, 'All')
        );
      })
      .map((account) => {
        const latestPayment = account.payments.length
          ? account.payments[account.payments.length - 1]
          : undefined;
        const dueDate = new Date(account.nextRemittanceDue);
        const liability = Number(account.currentCraLiability) || 0;
        const status =
          latestPayment && liability === 0
            ? 'Paid'
            : !Number.isNaN(dueDate.getTime()) && dueDate < today && liability > 0
              ? 'Overdue'
              : 'Pending';
        return { ...account, liability, latestPayment, remittanceStatus: status };
      });
    const overdue = remittanceRows.filter((account) => account.remittanceStatus === 'Overdue');
    const dueSoon = remittanceRows.filter((account) => account.remittanceStatus === 'Pending');
    const paidTotal = remittanceRows.reduce(
      (total, account) =>
        total + account.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      0
    );
    const filteredRemittanceRows = remittanceRows.filter((account) =>
      matchesFilter(account.remittanceStatus, statusFilter, 'All')
    );
    const remittancePageCount = Math.max(
      1,
      Math.ceil(filteredRemittanceRows.length / accountPageSize)
    );
    const remittancePage = Math.min(accountPage, remittancePageCount);
    const visibleRemittanceRows = filteredRemittanceRows.slice(
      (remittancePage - 1) * accountPageSize,
      remittancePage * accountPageSize
    );
    const runCraAction = (action: string, account: PayrollAccount) =>
      openWorkflow(
        action === 'View Details'
          ? 'details'
          : action === 'Record Payment'
            ? 'payment'
            : action === 'View Payment History'
              ? 'history'
              : action === 'Upload Document'
                ? 'document'
                : action === 'View Payroll Runs'
                  ? 'payroll'
                  : action === 'Add Note'
                    ? 'note'
                    : 'audit',
        account
      );
    return (
      <section className="module-page payroll-section payroll-accounts-page remittance-page">
        <div className="payroll-page-head">
          <div>
            <h1>CRA Remittances</h1>
            <p>Track and manage payroll source deduction remittances for all employers.</p>
          </div>
          <button className="payroll-primary" onClick={() => openWorkflow('payment')}>
            <span>+</span> Record Payment
          </button>
        </div>
        {notice && (
          <div className="success-note">
            <b>CRA Remittances</b>
            <span>{notice}</span>
          </div>
        )}
        <div className="remittance-kpis four">
          <article>
            <span className="remit-icon blue">$</span>
            <div>
              <strong>{moneyText(data?.metrics.totalOutstanding || 0)}</strong>
              <b>Total Outstanding</b>
              <small>All employers</small>
            </div>
          </article>
          <article>
            <span className="remit-icon red">!</span>
            <div>
              <strong>{overdue.length}</strong>
              <b>Overdue Remittances</b>
              <small>
                Total: {moneyText(overdue.reduce((sum, account) => sum + account.liability, 0))}
              </small>
            </div>
          </article>
          <article>
            <span className="remit-icon yellow">◷</span>
            <div>
              <strong>{dueSoon.length}</strong>
              <b>Due in Next 30 Days</b>
              <small>
                Total: {moneyText(dueSoon.reduce((sum, account) => sum + account.liability, 0))}
              </small>
            </div>
          </article>
          <article>
            <span className="remit-icon green">✓</span>
            <div>
              <strong>{moneyText(paidTotal)}</strong>
              <b>Paid (YTD)</b>
              <small>Recorded CRA payments</small>
            </div>
          </article>
        </div>
        <div className="remittance-filters">
          <label className="payroll-search">
            <span>⌕</span>
            <input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search by employer name, BN, or RP account..."
            />
          </label>
          <label>
            <span>Year</span>
            <select>
              <option>{currentYear}</option>
              <option>{currentYear - 1}</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="All">All</option>
              <option>Pending</option>
              <option>Paid</option>
              <option>Overdue</option>
            </select>
          </label>
          <label>
            <span>Remitter Type</span>
            <select
              value={remitterFilter}
              onChange={(event) => setRemitterFilter(event.target.value)}
            >
              <option value="All">All</option>
              {remitterTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Province</span>
            <select
              value={provinceFilter}
              onChange={(event) => setProvinceFilter(event.target.value)}
            >
              <option value="All">All</option>
              {provinces.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setAccountSearch('');
              setStatusFilter('All');
              setRemitterFilter('All');
              setProvinceFilter('All');
            }}
          >
            Clear Filters
          </button>
        </div>
        <div className="remittance-table-wrap">
          <table className="remittance-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Employer</th>
                <th>Business Number (BN)</th>
                <th>RP Account Number</th>
                <th>Remitter Type</th>
                <th>Current Period</th>
                <th>Due Date</th>
                <th>Total Liability</th>
                <th>Status</th>
                <th>Last Payment Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRemittanceRows.map((account, index) => (
                <tr key={account.id}>
                  <td>{(remittancePage - 1) * accountPageSize + index + 1}</td>
                  <td>
                    <b>{account.employer}</b>
                  </td>
                  <td>{account.businessNumber}</td>
                  <td>{account.rpAccountNumber}</td>
                  <td>{account.remitterType}</td>
                  <td>
                    {account.frequency === 'Quarterly'
                      ? `Q${Math.ceil((today.getMonth() + 1) / 3)} ${today.getFullYear()}`
                      : today.toLocaleString('en-CA', { month: 'short', year: 'numeric' })}
                  </td>
                  <td>{account.nextRemittanceDue}</td>
                  <td>{moneyText(account.liability)}</td>
                  <td>
                    <span className={`remittance-status ${account.remittanceStatus.toLowerCase()}`}>
                      <i>●</i>
                      {account.remittanceStatus}
                    </span>
                  </td>
                  <td>{String(account.latestPayment?.paymentDate || '-')}</td>
                  <td className="remittance-actions">
                    <button onClick={() => openWorkflow('details', account)}>View</button>
                    <button onClick={() => setMenuId(menuId === account.id ? '' : account.id)}>
                      •••
                    </button>
                    {menuId === account.id && (
                      <div className="row-menu">
                        {actions.map((action) => (
                          <button key={action} onClick={() => runCraAction(action, account)}>
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="payroll-pagination">
          <b>
            Showing {filteredRemittanceRows.length ? (remittancePage - 1) * accountPageSize + 1 : 0}{' '}
            – {Math.min(remittancePage * accountPageSize, filteredRemittanceRows.length)} of{' '}
            {filteredRemittanceRows.length} remittances
          </b>
          <div>
            <button
              disabled={remittancePage <= 1}
              onClick={() => setAccountPage(remittancePage - 1)}
            >
              ‹
            </button>
            {Array.from({ length: Math.min(remittancePageCount, 3) }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  className={page === remittancePage ? 'active' : ''}
                  onClick={() => setAccountPage(page)}
                >
                  {page}
                </button>
              )
            )}
            <button
              disabled={remittancePage >= remittancePageCount}
              onClick={() => setAccountPage(remittancePage + 1)}
            >
              ›
            </button>
            <select
              value={accountPageSize}
              onChange={(event) => {
                setAccountPageSize(Number(event.target.value));
                setAccountPage(1);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
            </select>
          </div>
        </div>
        {actionDialog}
      </section>
    );
  }
  if (mode === 'Banking & Funding') {
    const bankRows = accounts.filter((account) => {
      const query = accountSearch.trim();
      return (
        (!query ||
          [
            account.employer,
            account.businessNumber,
            account.bankInstitution,
            account.accountNumber
          ].some((value) => filterContains(value, query))) &&
        matchesFilter(account.province, provinceFilter, 'All') &&
        matchesFilter(account.bankStatus, statusFilter, 'All')
      );
    });
    const activeBanks = accounts.filter((account) => filterEquals(account.bankStatus, 'Active')).length;
    const pendingBanks = accounts.filter(
      (account) => filterEquals(account.verificationStatus, 'Pending')
    ).length;
    const inactiveBanks = accounts.filter((account) => filterEquals(account.bankStatus, 'Inactive')).length;
    const accountTypes = Array.from(
      new Set(accounts.map((account) => account.accountType).filter(Boolean))
    ).sort();
    const bankPageCount = Math.max(1, Math.ceil(bankRows.length / accountPageSize));
    const bankPage = Math.min(accountPage, bankPageCount);
    const visibleBankRows = bankRows.slice(
      (bankPage - 1) * accountPageSize,
      bankPage * accountPageSize
    );
    const runBankAction = (action: string, account: PayrollAccount) => {
      setMenuId('');
      if (action === 'View Details') openWorkflow('details', account);
      else if (action === 'Edit Account') openWorkflow('bank', account);
      else if (action === 'Upload Document') openWorkflow('document', account);
      else if (action === 'Set as Default')
        updateBank(
          account,
          { isDefault: true },
          `${account.employer} bank account set as default.`
        );
      else if (action === 'Deactivate')
        updateBank(
          account,
          { status: 'Inactive' },
          `${account.employer} bank account deactivated.`
        );
      else openWorkflow('audit', account);
    };
    return (
      <section className="module-page payroll-section payroll-accounts-page banking-page">
        <div className="add-payroll-breadcrumb">
          <button onClick={() => onMode('All Payroll Accounts')}>Payroll Accounts</button>
          <span>›</span>
          <b>Banking &amp; Funding</b>
        </div>
        <div className="payroll-page-head">
          <div>
            <h1>Banking &amp; Funding</h1>
            <p>Manage bank accounts and funding information for all employers.</p>
          </div>
          <button className="payroll-primary" onClick={() => openWorkflow('bank')}>
            <span>+</span> Add Bank Account
          </button>
        </div>
        {notice && (
          <div className="success-note">
            <b>Banking &amp; Funding</b>
            <span>{notice}</span>
          </div>
        )}
        <div className="banking-kpis">
          <article>
            <span className="remit-icon blue">▦</span>
            <div>
              <strong>{accounts.length}</strong>
              <b>Total Bank Accounts</b>
              <small>Across all employers</small>
            </div>
          </article>
          <article>
            <span className="remit-icon green">✓</span>
            <div>
              <strong>{activeBanks}</strong>
              <b>Active Accounts</b>
            </div>
          </article>
          <article>
            <span className="remit-icon yellow">◷</span>
            <div>
              <strong>{pendingBanks}</strong>
              <b>Pending Verification</b>
            </div>
          </article>
          <article>
            <span className="remit-icon red">!</span>
            <div>
              <strong>{inactiveBanks}</strong>
              <b>Inactive Account</b>
            </div>
          </article>
        </div>
        <div className="banking-workspace">
          <div>
            <div className="banking-filters">
              <label className="payroll-search">
                <span>⌕</span>
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="Search by employer name, BN, or account..."
                />
              </label>
              <label>
                <span>Province</span>
                <select
                  value={provinceFilter}
                  onChange={(event) => setProvinceFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  {provinces.map((province) => (
                    <option key={province}>{province}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Account Type</span>
                <select>
                  <option>All</option>
                  {accountTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
              <button
                onClick={() => {
                  setAccountSearch('');
                  setProvinceFilter('All');
                  setStatusFilter('All');
                }}
              >
                Clear Filters
              </button>
            </div>
            <div className="banking-table-wrap">
              <table className="banking-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employer</th>
                    <th>Bank Institution</th>
                    <th>Account Type</th>
                    <th>Account Number</th>
                    <th>Used For</th>
                    <th>Verification Status</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBankRows.map((account, index) => (
                    <tr key={account.id}>
                      <td>{(bankPage - 1) * accountPageSize + index + 1}</td>
                      <td>
                        <b>{account.employer}</b>
                      </td>
                      <td>{account.bankInstitution || '-'}</td>
                      <td>{account.accountType || '-'}</td>
                      <td>
                        <b className="masked-bank">{account.accountNumber || '••••----'}</b>
                      </td>
                      <td>
                        <div className="usage-chips">
                          {(account.usedFor || 'Payroll').split(/[,/&]+/).map((usage) => (
                            <span key={usage.trim()}>{usage.trim()}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`bank-verification ${account.verificationStatus.toLowerCase()}`}
                        >
                          <i>●</i>
                          {account.verificationStatus}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`remittance-status ${account.bankStatus === 'Active' ? 'paid' : 'overdue'}`}
                        >
                          <i>●</i>
                          {account.bankStatus}
                        </span>
                      </td>
                      <td className="remittance-actions">
                        <button onClick={() => openWorkflow('details', account)}>View</button>
                        <button onClick={() => setMenuId(menuId === account.id ? '' : account.id)}>
                          •••
                        </button>
                        {menuId === account.id && (
                          <div className="row-menu banking-menu">
                            {[
                              'View Details',
                              'Edit Account',
                              'Upload Document',
                              'Set as Default',
                              'Deactivate',
                              'View Audit Log'
                            ].map((action) => (
                              <button
                                className={action === 'Deactivate' ? 'danger-menu-item' : ''}
                                key={action}
                                onClick={() => runBankAction(action, account)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="payroll-pagination">
              <b>
                Showing {bankRows.length ? (bankPage - 1) * accountPageSize + 1 : 0} –{' '}
                {Math.min(bankPage * accountPageSize, bankRows.length)} of {bankRows.length} bank
                accounts
              </b>
              <div>
                <button disabled={bankPage <= 1} onClick={() => setAccountPage(bankPage - 1)}>
                  ‹
                </button>
                {Array.from({ length: Math.min(bankPageCount, 3) }, (_, index) => index + 1).map(
                  (page) => (
                    <button
                      key={page}
                      className={page === bankPage ? 'active' : ''}
                      onClick={() => setAccountPage(page)}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  disabled={bankPage >= bankPageCount}
                  onClick={() => setAccountPage(bankPage + 1)}
                >
                  ›
                </button>
                <select
                  value={accountPageSize}
                  onChange={(event) => {
                    setAccountPageSize(Number(event.target.value));
                    setAccountPage(1);
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                </select>
              </div>
            </div>
          </div>
          <aside className="banking-guidance">
            <section className="cra-about">
              <div className="aside-heading">
                <span>i</span>
                <h2>About Banking &amp; Funding</h2>
              </div>
              <p>
                Store and manage your organization's bank accounts used for payroll funding, direct
                deposits and CRA remittances.
              </p>
              <ul>
                <li>Keep bank details secure and encrypted</li>
                <li>Support multiple accounts per employer</li>
                <li>Track verification status</li>
                <li>Set default accounts for payroll and CRA payments</li>
              </ul>
              <a
                href="https://www.canada.ca/en/financial-consumer-agency/services/banking.html"
                target="_blank"
                rel="noreferrer"
              >
                Learn more about banking setup ↗
              </a>
            </section>
            <section className="cra-help banking-important">
              <div className="aside-heading">
                <span>!</span>
                <h2>Important</h2>
              </div>
              <p>
                Payhours does not store full bank account numbers. Account numbers are encrypted and
                partially masked for security.
              </p>
            </section>
            <section className="account-usage">
              <h2>Account Usage</h2>
              <b className="usage-payroll">✓ &nbsp; Payroll (Direct Deposit)</b>
              <p>Used to fund employee direct deposits.</p>
              <b className="usage-cra">● &nbsp; CRA Remittances</b>
              <p>Used for CRA payroll source deduction payments (if applicable).</p>
              <b className="usage-both">● &nbsp; Both</b>
              <p>This account is used for both payroll and CRA remittances.</p>
            </section>
          </aside>
        </div>
        <section className="banking-security">
          <span>▣</span>
          <div>
            <h2>Security</h2>
            <p>
              All bank information is stored using industry-standard encryption. Payhours follows
              PCI DSS and Canadian privacy requirements to keep your data secure.
            </p>
          </div>
          <button
            onClick={() =>
              setNotice('Security details are available to authorized administrators.')
            }
          >
            View Security Details
          </button>
        </section>
        {actionDialog}
      </section>
    );
  }
  if (mode === 'Remittance Schedule') {
    const scheduleRows = filteredAccounts;
    const schedulePageCount = Math.max(1, Math.ceil(scheduleRows.length / accountPageSize));
    const schedulePage = Math.min(accountPage, schedulePageCount);
    const visibleScheduleRows = scheduleRows.slice(
      (schedulePage - 1) * accountPageSize,
      schedulePage * accountPageSize
    );
    const countType = (term: string) =>
      accounts.filter((account) => filterContains(account.remitterType, term)).length;
    const runScheduleAction = (action: string, account: PayrollAccount) =>
      openWorkflow(
        action === 'View Schedule' || action === 'View Account'
          ? 'details'
          : action === 'Edit Remitter Type'
            ? 'remitter'
            : action === 'View Due Dates'
              ? 'dueDates'
              : action === 'View CRA Remittances'
                ? 'history'
                : action === 'Add Note'
                  ? 'note'
                  : 'changeHistory',
        account
      );
    return (
      <section className="module-page payroll-section payroll-accounts-page remittance-page schedule-page">
        <div className="payroll-page-head">
          <div>
            <h1>Remittance Schedule</h1>
            <p>
              Manage CRA remitter types and view upcoming remittance due dates for all employers.
            </p>
          </div>
          <button className="payroll-primary" onClick={() => openWorkflow('remitter')}>
            <span>+</span> Add Schedule
          </button>
        </div>
        {notice && (
          <div className="success-note">
            <b>Remittance Schedule</b>
            <span>{notice}</span>
          </div>
        )}
        <div className="remittance-kpis five">
          <article>
            <span className="remit-icon blue">▦</span>
            <div>
              <strong>{accounts.length}</strong>
              <b>Total Employers</b>
              <small>With RP accounts</small>
            </div>
          </article>
          <article>
            <span className="remit-icon blue">♢</span>
            <div>
              <strong>{countType('regular')}</strong>
              <b>Regular Remitters</b>
              <small>Monthly</small>
            </div>
          </article>
          <article>
            <span className="remit-icon blue">◷</span>
            <div>
              <strong>{countType('quarter')}</strong>
              <b>Quarterly Remitters</b>
              <small>Quarterly</small>
            </div>
          </article>
          <article>
            <span className="remit-icon green">♙</span>
            <div>
              <strong>{countType('threshold 1')}</strong>
              <b>Accelerated (T1)</b>
              <small>Twice per month</small>
            </div>
          </article>
          <article>
            <span className="remit-icon red">♙</span>
            <div>
              <strong>{countType('threshold 2')}</strong>
              <b>Accelerated (T2)</b>
              <small>Weekly</small>
            </div>
          </article>
        </div>
        <div className="schedule-workspace">
          <div>
            <div className="schedule-filters">
              <label className="payroll-search">
                <span>⌕</span>
                <input
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="Search by employer name, BN, or RP account..."
                />
              </label>
              <label>
                <span>Remitter Type</span>
                <select
                  value={remitterFilter}
                  onChange={(event) => setRemitterFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  {remitterTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Province</span>
                <select
                  value={provinceFilter}
                  onChange={(event) => setProvinceFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  {provinces.map((province) => (
                    <option key={province}>{province}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="All">All</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </label>
              <button
                onClick={() => {
                  setAccountSearch('');
                  setStatusFilter('All');
                  setRemitterFilter('All');
                  setProvinceFilter('All');
                }}
              >
                Clear Filters
              </button>
            </div>
            <div className="remittance-table-wrap">
              <table className="remittance-table schedule-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Employer</th>
                    <th>Business Number (BN)</th>
                    <th>RP Account Number</th>
                    <th>Remitter Type</th>
                    <th>Frequency</th>
                    <th>Effective Date</th>
                    <th>Next Remittance Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleScheduleRows.map((account, index) => (
                    <tr key={account.id}>
                      <td>{(schedulePage - 1) * accountPageSize + index + 1}</td>
                      <td>
                        <b>{account.employer}</b>
                      </td>
                      <td>{account.businessNumber}</td>
                      <td>{account.rpAccountNumber}</td>
                      <td>{account.remitterType}</td>
                      <td>{account.frequency}</td>
                      <td>
                        {String(
                          account.remitterHistory[account.remitterHistory.length - 1]
                            ?.effectiveDate || '-'
                        )}
                      </td>
                      <td>{account.nextRemittanceDue}</td>
                      <td>
                        <span className="remittance-status paid">
                          <i>●</i>
                          {account.status}
                        </span>
                      </td>
                      <td className="remittance-actions">
                        <button onClick={() => openWorkflow('details', account)}>View</button>
                        <button onClick={() => setMenuId(menuId === account.id ? '' : account.id)}>
                          •••
                        </button>
                        {menuId === account.id && (
                          <div className="row-menu">
                            {actions.map((action) => (
                              <button
                                key={action}
                                onClick={() => runScheduleAction(action, account)}
                              >
                                {action}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="payroll-pagination">
              <b>
                Showing {scheduleRows.length ? (schedulePage - 1) * accountPageSize + 1 : 0} –{' '}
                {Math.min(schedulePage * accountPageSize, scheduleRows.length)} of{' '}
                {scheduleRows.length} schedules
              </b>
              <div>
                <button
                  disabled={schedulePage <= 1}
                  onClick={() => setAccountPage(schedulePage - 1)}
                >
                  ‹
                </button>
                {Array.from(
                  { length: Math.min(schedulePageCount, 3) },
                  (_, index) => index + 1
                ).map((page) => (
                  <button
                    key={page}
                    className={page === schedulePage ? 'active' : ''}
                    onClick={() => setAccountPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  disabled={schedulePage >= schedulePageCount}
                  onClick={() => setAccountPage(schedulePage + 1)}
                >
                  ›
                </button>
                <select
                  value={accountPageSize}
                  onChange={(event) => {
                    setAccountPageSize(Number(event.target.value));
                    setAccountPage(1);
                  }}
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                </select>
              </div>
            </div>
          </div>
          <aside className="schedule-guidance">
            <section className="cra-about">
              <div className="aside-heading">
                <span>i</span>
                <h2>About Remitter Types</h2>
              </div>
              <p>The CRA assigns a remitter type based on your total payroll deductions.</p>
              <ul>
                <li>Regular – monthly</li>
                <li>Quarterly – quarterly</li>
                <li>Accelerated Threshold 1 – twice per month</li>
                <li>Accelerated Threshold 2 – weekly</li>
              </ul>
              <a
                href="https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll.html"
                target="_blank"
                rel="noreferrer"
              >
                Learn more on the CRA website ↗
              </a>
            </section>
            <section className="cra-help">
              <div className="aside-heading">
                <span>!</span>
                <h2>Need Help?</h2>
              </div>
              <p>
                Not sure which remitter type applies? Review your latest CRA correspondence or PD7A
                statement.
              </p>
              <a
                href="https://www.canada.ca/en/revenue-agency.html"
                target="_blank"
                rel="noreferrer"
              >
                View CRA Guidelines ↗
              </a>
            </section>
          </aside>
        </div>
        {actionDialog}
      </section>
    );
  }
  const tableRows = accounts.map((account, index) => (
    <tr
      key={account.id}
      onClick={() => setSelectedId(account.id)}
      className={selected?.id === account.id ? 'selected-row' : ''}
    >
      <td>{index + 1}</td>
      <td>
        <b>{account.employer}</b>
        <small>{account.location}</small>
      </td>
      <td>{account.businessNumber}</td>
      <td>{account.rpAccountNumber}</td>
      <td>{account.remitterType}</td>
      <td>
        {mode === 'Banking & Funding'
          ? account.bankInstitution
          : mode === 'Remittance Schedule'
            ? account.frequency
            : account.nextRemittanceDue}
      </td>
      <td>
        {mode === 'Banking & Funding' ? account.accountNumber : `$${account.currentCraLiability}`}
      </td>
      <td>
        <Pill
          tone={
            (mode === 'Banking & Funding' ? account.bankStatus : account.status) === 'Active'
              ? 'green'
              : 'yellow'
          }
        >
          {mode === 'Banking & Funding' ? account.bankStatus : account.status}
        </Pill>
      </td>
      <td className="table-actions action-cell">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(account.id);
          }}
        >
          View
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setMenuId(menuId === account.id ? '' : account.id);
          }}
        >
          ...
        </button>
        {menuId === account.id && (
          <div className="row-menu">
            {actions.map((action) => (
              <button
                key={action}
                onClick={(event) => {
                  event.stopPropagation();
                  quickAction(
                    account,
                    action.toLowerCase().includes('payment')
                      ? 'payment'
                      : action.toLowerCase().includes('document')
                        ? 'document'
                        : action.toLowerCase().includes('note')
                          ? 'note'
                          : action.toLowerCase().includes('remitter')
                            ? 'remitter'
                            : 'view'
                  );
                }}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </td>
    </tr>
  ));
  return (
    <section className="module-page payroll-section">
      <div className="employee-head">
        <div>
          <h1>{mode}</h1>
          <p>
            {mode === 'CRA Remittances'
              ? 'Track and manage payroll source deduction remittances for all employers.'
              : mode === 'Banking & Funding'
                ? 'Manage bank accounts and funding information for all employers.'
                : mode === 'Remittance Schedule'
                  ? 'Manage CRA remitter types and upcoming remittance due dates.'
                  : 'Manage employers CRA payroll deductions program accounts.'}
          </p>
        </div>
        <button
          className="run-payroll"
          onClick={() =>
            onMode(
              mode === 'CRA Remittances'
                ? 'CRA Remittances'
                : mode === 'Banking & Funding'
                  ? 'Banking & Funding'
                  : mode === 'Remittance Schedule'
                    ? 'Remittance Schedule'
                    : 'Add Payroll Account'
            )
          }
        >
          {mode === 'CRA Remittances'
            ? 'Record Payment'
            : mode === 'Banking & Funding'
              ? 'Add Bank Account'
              : mode === 'Remittance Schedule'
                ? 'Add Schedule'
                : 'Add Payroll Account'}
        </button>
      </div>
      {notice && (
        <div className="success-note">
          <b>Saved</b>
          <span>{notice}</span>
        </div>
      )}
      <div className="metric-grid four">
        <AccessMetric
          icon="B"
          label={mode === 'Banking & Funding' ? 'Total Bank Accounts' : 'Total RP Accounts'}
          value={data?.metrics.totalAccounts || 0}
          note="Across all employers"
        />
        <AccessMetric
          icon="A"
          label="Active Accounts"
          value={data?.metrics.activeAccounts || 0}
          note="Connected employer records"
          tone="green"
        />
        <AccessMetric
          icon="!"
          label={mode === 'CRA Remittances' ? 'Overdue Remittances' : 'Action Required'}
          value={data?.metrics.actionRequired || 0}
          note="Setup incomplete or inactive"
          tone="red"
        />
        <AccessMetric
          icon="$"
          label={mode === 'CRA Remittances' ? 'Total Outstanding' : 'Due Soon'}
          value={
            mode === 'CRA Remittances'
              ? `$${(data?.metrics.totalOutstanding || 0).toLocaleString()}`
              : data?.metrics.dueSoon || 0
          }
          note="Calculated from employer data"
          tone="yellow"
        />
      </div>
      <div className="payroll-layout">
        <section className="admin-panel payroll-table">
          <div className="filter-row payroll-filter">
            <input placeholder="Search by employer name, BN, or RP account..." />
            <select>
              <option>All Statuses</option>
            </select>
            <select>
              <option>All Provinces</option>
            </select>
            <button>Clear Filters</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employer</th>
                <th>Business Number (BN)</th>
                <th>RP Account Number</th>
                <th>Remitter Type</th>
                <th>
                  {mode === 'Banking & Funding'
                    ? 'Bank Institution'
                    : mode === 'Remittance Schedule'
                      ? 'Frequency'
                      : 'Next Remittance Due'}
                </th>
                <th>{mode === 'Banking & Funding' ? 'Account Number' : 'Current CRA Liability'}</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>{tableRows}</tbody>
          </table>
        </section>
        {selected && (
          <aside className="access-detail payroll-summary">
            <div className="big-avatar">
              {selected.employer
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </div>
            <h2>{selected.employer}</h2>
            <p>{selected.location}</p>
            <Pill tone={selected.status === 'Active' ? 'green' : 'yellow'}>{selected.status}</Pill>
            <dl>
              <dt>Business Number</dt>
              <dd>{selected.businessNumber}</dd>
              <dt>RP Account</dt>
              <dd>{selected.rpAccountNumber}</dd>
              <dt>Remitter Type</dt>
              <dd>{selected.remitterType}</dd>
              <dt>Next Remittance Due</dt>
              <dd>{selected.nextRemittanceDue}</dd>
              <dt>Current CRA Liability</dt>
              <dd>${selected.currentCraLiability}</dd>
              <dt>Bank</dt>
              <dd>
                {selected.bankInstitution} {selected.accountNumber}
              </dd>
            </dl>
            <div className="side-actions">
              <button className="run-payroll" onClick={() => quickAction(selected, 'payment')}>
                Record Payment
              </button>
              <button onClick={() => quickAction(selected, 'note')}>Add Note</button>
            </div>
            <div className="info-card">
              <b>Payroll runs included</b>
              <span>
                {selected.payrollRuns.length
                  ? selected.payrollRuns
                      .map((run) => `${run.period}: $${run.totalDeductions}`)
                      .join(' | ')
                  : 'No finalized payroll run liability yet.'}
              </span>
            </div>
            <div className="info-card">
              <b>Change history</b>
              <span>
                {selected.remitterHistory
                  .map(
                    (item) =>
                      `${item.remitterType || 'Regular'} effective ${item.effectiveDate || item.changedAt || '-'}`
                  )
                  .join(' | ')}
              </span>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

type SuperAdminPayrollRun = {
  id: string;
  employerId: string;
  employer: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employeeCount: number;
  totalHours: number;
  grossPay: string;
  deductions: string;
  netPay: string;
  status: string;
};

function SuperAdminPayrollRuns({ token }: { token: string }) {
  const [payload, setPayload] = useState<{
    metrics: { totalRuns: number; inProgress: number; completed: number; actionRequired: number };
    runs: SuperAdminPayrollRun[];
  }>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<SuperAdminPayrollRun>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<typeof payload>('/super-admin/payroll-runs', token)
      .then((response) => {
        setPayload(response);
        setSelected(response?.runs[0]);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Unable to load payroll runs.')
      );
  }, [token]);
  const runs = (payload?.runs || []).filter((run) => {
    const query = search.trim();
    return (
      (!query ||
        [run.employer, run.customerId, run.id].some((value) =>
          filterContains(value, query)
        )) &&
      matchesFilter(run.status, status, 'All')
    );
  });
  const pageCount = Math.max(1, Math.ceil(runs.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRuns = runs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const statusText = (value: string) =>
    value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  return (
    <section className="module-page payroll-accounts-page super-payroll-runs">
      <div className="payroll-page-head">
        <div>
          <h1>Payroll Runs</h1>
          <p>Monitor and review payroll processing across all employers.</p>
        </div>
      </div>
      {error && <p className="add-payroll-error">{error}</p>}
      <div className="payroll-kpis">
        <article>
          <span className="payroll-kpi-icon bank">▦</span>
          <div>
            <strong>{payload?.metrics.totalRuns || 0}</strong>
            <b>Total Payroll Runs</b>
            <small>Across all employers</small>
          </div>
        </article>
        <article>
          <span className="payroll-kpi-icon calendar">◷</span>
          <div>
            <strong>{payload?.metrics.inProgress || 0}</strong>
            <b>In Progress</b>
            <small>Draft, review or approved</small>
          </div>
        </article>
        <article>
          <span className="payroll-kpi-icon active">✓</span>
          <div>
            <strong>{payload?.metrics.completed || 0}</strong>
            <b>Completed</b>
            <small>Finalized and locked</small>
          </div>
        </article>
        <article>
          <span className="payroll-kpi-icon alert">!</span>
          <div>
            <strong>{payload?.metrics.actionRequired || 0}</strong>
            <b>Action Required</b>
            <small>Review payroll workflow</small>
          </div>
        </article>
      </div>
      <div className="payroll-runs-filters">
        <label className="payroll-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by employer, customer ID, or run ID..."
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option>All</option>
            {['draft', 'in_review', 'approved', 'finalized', 'locked', 'reversed', 'adjusted'].map(
              (value) => (
                <option key={value} value={value}>
                  {statusText(value)}
                </option>
              )
            )}
          </select>
        </label>
        <button
          onClick={() => {
            setSearch('');
            setStatus('All');
            setPage(1);
          }}
        >
          Clear Filters
        </button>
      </div>
      <div className="payroll-runs-layout">
        <div>
          <div className="remittance-table-wrap">
            <table className="remittance-table payroll-runs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Employer</th>
                  <th>Pay Period</th>
                  <th>Pay Date</th>
                  <th>Employees</th>
                  <th>Total Hours</th>
                  <th>Gross Pay</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((run, index) => (
                  <tr
                    key={run.id}
                    className={selected?.id === run.id ? 'selected-run' : ''}
                    onClick={() => setSelected(run)}
                  >
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>
                      <b>{run.employer}</b>
                      <small>{run.customerId}</small>
                    </td>
                    <td>
                      {run.periodStart} – {run.periodEnd}
                    </td>
                    <td>{run.payDate}</td>
                    <td>{run.employeeCount}</td>
                    <td>{run.totalHours}</td>
                    <td>{moneyText(run.grossPay)}</td>
                    <td>{moneyText(run.deductions)}</td>
                    <td>{moneyText(run.netPay)}</td>
                    <td>
                      <span className={`run-status ${run.status}`}>{statusText(run.status)}</span>
                    </td>
                    <td className="remittance-actions">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(run);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!visibleRuns.length && (
                  <tr>
                    <td colSpan={11} className="payroll-empty">
                      No payroll runs match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="payroll-pagination">
            <b>
              Showing {runs.length ? (currentPage - 1) * pageSize + 1 : 0} –{' '}
              {Math.min(currentPage * pageSize, runs.length)} of {runs.length} payroll runs
            </b>
            <div>
              <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                ‹
              </button>
              {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map(
                (number) => (
                  <button
                    key={number}
                    className={number === currentPage ? 'active' : ''}
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                )
              )}
              <button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                ›
              </button>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
              </select>
            </div>
          </div>
        </div>
        {selected && (
          <aside className="payroll-run-summary">
            <h2>Payroll Run Summary</h2>
            <div className="run-employer">
              <span>
                {selected.employer
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <div>
                <b>{selected.employer}</b>
                <small>{selected.customerId}</small>
              </div>
            </div>
            <dl>
              <dt>Pay Period</dt>
              <dd>
                {selected.periodStart} – {selected.periodEnd}
              </dd>
              <dt>Pay Date</dt>
              <dd>{selected.payDate}</dd>
              <dt>Employees</dt>
              <dd>{selected.employeeCount}</dd>
              <dt>Total Hours</dt>
              <dd>{selected.totalHours}</dd>
              <dt>Gross Pay</dt>
              <dd>{moneyText(selected.grossPay)}</dd>
              <dt>Deductions</dt>
              <dd>{moneyText(selected.deductions)}</dd>
              <dt>Net Pay</dt>
              <dd>{moneyText(selected.netPay)}</dd>
              <dt>Status</dt>
              <dd>
                <span className={`run-status ${selected.status}`}>
                  {statusText(selected.status)}
                </span>
              </dd>
            </dl>
            <div className="cra-about">
              <div className="aside-heading">
                <span>i</span>
                <h2>Super Admin View</h2>
              </div>
              <p>
                Payroll processing actions remain with the employer portal. This view provides
                platform-wide monitoring and audit visibility.
              </p>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

type PlatformNotificationItem = {
  id: string;
  title: string;
  body: string;
  audience: 'employers' | 'employees' | 'both';
  postedAt: string;
  postedBy: string;
  employeeReadCount: number;
  employerReadCount: number;
};

function SuperAdminNotifications({ token }: { token: string }) {
  const [items, setItems] = useState<PlatformNotificationItem[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'employers' | 'employees' | 'both'>('both');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    const result = await api<{ notifications: PlatformNotificationItem[] }>('/super-admin/notifications', token);
    setItems(result.notifications);
  }
  useEffect(() => { load().catch(() => setMessage('Could not load notifications.')); }, [token]);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api('/super-admin/notifications', token, {
        method: 'POST', body: JSON.stringify({ title, body, audience })
      });
      setTitle(''); setBody(''); setMessage('Platform notification published.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish notification.');
    } finally { setBusy(false); }
  }
  async function remove(item: PlatformNotificationItem) {
    if (!window.confirm(`Delete "${item.title}" from all recipient portals?`)) return;
    await api(`/super-admin/notifications/${item.id}`, token, { method: 'DELETE' });
    await load();
  }
  const audienceLabel = (value: PlatformNotificationItem['audience']) =>
    value === 'both' ? 'Employees and employers' : value === 'employees' ? 'Employees only' : 'Employers only';
  return (
    <section className="module-page employer-notifications-page">
      <div className="employee-head"><div><h1>Platform Notifications</h1><p>Publish announcements across Payhours portals.</p></div></div>
      <div className="employer-notification-layout">
        <form className="admin-panel notification-composer" onSubmit={publish}>
          <h2>New platform notification</h2>
          <label>Visible to
            <select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}>
              <option value="employers">Employers only</option>
              <option value="both">Employees and employers</option>
              <option value="employees">Employees only</option>
            </select>
          </label>
          <label>Title<input required minLength={2} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Message<textarea required minLength={2} maxLength={1000} rows={7} value={body} onChange={(event) => setBody(event.target.value)} /></label>
          <small>{body.length}/1000 characters</small>
          <button className="run-payroll" disabled={busy || title.trim().length < 2 || body.trim().length < 2}>{busy ? 'Publishing...' : 'Publish notification'}</button>
          {message && <p className="success-note">{message}</p>}
        </form>
        <section className="admin-panel employer-notification-list">
          <h2>Publication history</h2>
          {items.map((item) => (
            <article key={item.id}>
              <div><strong>{item.title}</strong><small>{formatDate(item.postedAt, 'en')} by {item.postedBy}</small></div>
              <p>{item.body}</p>
              <div className="notification-delivery">
                <span>{audienceLabel(item.audience)}</span>
                <b>{item.employerReadCount} employer / {item.employeeReadCount} employee reads</b>
                <button className="danger-button" onClick={() => remove(item)}>Delete</button>
              </div>
            </article>
          ))}
          {!items.length && <p>No platform notifications have been published.</p>}
        </section>
      </div>
    </section>
  );
}

type SuperAdminDeductionType = {
  id: string; code: string; name: string; description: string;
  kind: 'statutory' | 'custom'; employerId: string; provinces: string[];
  mandatory: boolean; calculationMethod: 'tax_table' | 'cra_rules' | 'fixed' | 'percentage';
  value: string; status: 'active' | 'inactive'; customType: 'voluntary' | 'custom'; category: string;
  employmentType: string; payFrequency: string; employeeScope: string;
  defaultForNewEmployees: boolean; showOnPaystub: boolean; includeInCraReports: boolean;
};

type CustomDeductionForm = {
  code: string; name: string; description: string; employerId: string; provinces: string[];
  calculationMethod: 'fixed' | 'percentage'; value: string; status: 'active' | 'inactive';
  customType: 'voluntary' | 'custom'; category: string; employmentType: string;
  payFrequency: string; employeeScope: string; defaultForNewEmployees: boolean;
  showOnPaystub: boolean; includeInCraReports: boolean;
};

function SuperAdminDeductionTypes({ token }: { token: string }) {
  const [items, setItems] = useState<SuperAdminDeductionType[]>([]);
  const [employers, setEmployers] = useState<Array<{ id: string; name: string; customerId: string; province: string }>>([]);
  const [editing, setEditing] = useState<SuperAdminDeductionType>();
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const emptyForm = (employerId = ''): CustomDeductionForm => ({ code: '', name: '', description: '', employerId, provinces: ['AB'], calculationMethod: 'fixed', value: '', status: 'active', customType: 'voluntary', category: 'Health & Insurance', employmentType: 'all', payFrequency: 'all', employeeScope: 'all', defaultForNewEmployees: false, showOnPaystub: true, includeInCraReports: false });
  const [form, setForm] = useState<CustomDeductionForm>(() => emptyForm());
  const provinceOptions = ['AB', 'BC', 'MB', 'SK', 'ON'];

  const load = () => api<{ deductionTypes: SuperAdminDeductionType[]; employers: typeof employers }>('/super-admin/deduction-types', token)
    .then((result) => { setItems(result.deductionTypes); setEmployers(result.employers); })
    .catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load deduction types.'));
  useEffect(() => { void load(); }, [token]);

  function openCreate() {
    setEditing(undefined);
    setForm(emptyForm(employers[0]?.id || ''));
    setShowForm(true);
    setNotice('');
  }

  function openEdit(item: SuperAdminDeductionType) {
    setEditing(item);
    setForm({ code: item.code, name: item.name, description: item.description, employerId: item.employerId, provinces: item.provinces, calculationMethod: item.calculationMethod as 'fixed' | 'percentage', value: item.value, status: item.status, customType: item.customType, category: item.category, employmentType: item.employmentType, payFrequency: item.payFrequency, employeeScope: item.employeeScope, defaultForNewEmployees: item.defaultForNewEmployees, showOnPaystub: item.showOnPaystub, includeInCraReports: item.includeInCraReports });
    setShowForm(true);
    setNotice('');
  }

  async function save() {
    setSaving(true);
    setNotice('');
    try {
      await api(`/super-admin/deduction-types${editing ? `/${editing.id}` : ''}`, token, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, value: Number(form.value || 0) })
      });
      setShowForm(false);
      setNotice(`Custom deduction type ${editing ? 'updated' : 'created'}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save deduction type.');
    } finally {
      setSaving(false);
    }
  }

  if (showForm) {
    const displayAmount = form.calculationMethod === 'percentage' ? `${Number(form.value || 0).toFixed(2)}%` : moneyText(form.value || 0);
    return <section className="sa-deduction-editor">
      <header className="deduction-editor-title"><p>Deductions <b>›</b> Deduction Types <b>›</b> {editing ? 'Edit' : 'Add'} Deduction Type</p><h1>{editing ? 'Edit' : 'Add'} Deduction Type</h1><span>{editing ? 'Update this employer deduction type and its payroll rules.' : 'Create a new deduction type to use in payroll.'}</span></header>
      {notice && <p className="success-note"><b>{notice}</b></p>}
      <div className="deduction-editor-layout">
        <div className="deduction-editor-sections">
          <section><h2>Basic Information</h2><div className="deduction-editor-grid">
            <label>Deduction Name *<input placeholder="e.g. Group Health Insurance" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Deduction Code *<input placeholder="e.g. HLTH" maxLength={15} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /><small>Short code for reports and paystubs (max 15 characters)</small></label>
            <label>Type *<select value={form.customType} onChange={(event) => setForm({ ...form, customType: event.target.value as CustomDeductionForm['customType'] })}><option value="voluntary">Voluntary</option><option value="custom">Custom</option></select></label>
            <label>Category *<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Health &amp; Insurance</option><option>Retirement &amp; Savings</option><option>Union &amp; Professional</option><option>Garnishment</option><option>Meals &amp; Uniforms</option><option>Other</option></select></label>
          </div></section>
          <section><h2>Calculation Settings</h2><div className="deduction-editor-grid">
            <label>Calculation Method *<select value={form.calculationMethod} onChange={(event) => setForm({ ...form, calculationMethod: event.target.value as CustomDeductionForm['calculationMethod'] })}><option value="fixed">Fixed Amount</option><option value="percentage">Percentage of Gross Pay</option></select></label>
            <label>Default {form.calculationMethod === 'percentage' ? 'Percentage' : 'Amount'} *<div className="deduction-amount-input"><span>{form.calculationMethod === 'percentage' ? '%' : '$'}</span><input type="number" min="0" step="0.01" value={form.value} placeholder="0.00" onChange={(event) => setForm({ ...form, value: event.target.value })} /></div></label>
          </div><p className="deduction-method-note"><b>{form.calculationMethod === 'fixed' ? 'Fixed Amount:' : 'Percentage:'}</b> {form.calculationMethod === 'fixed' ? "A set amount will be deducted from the employee's pay each payroll period." : "A percentage of the employee's gross pay will be deducted each payroll period."}</p></section>
          <section><h2>Applicability</h2><div className="deduction-editor-grid">
            <label>Employer *<select value={form.employerId} onChange={(event) => setForm({ ...form, employerId: event.target.value })}><option value="">Select employer</option>{employers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.customerId})</option>)}</select></label>
            <label>Apply To Employment Type<select value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value })}><option value="all">All Types</option><option value="full_time">Full Time</option><option value="part_time">Part Time</option><option value="contract">Contract</option><option value="seasonal">Seasonal</option></select></label>
            <label>Apply To Pay Frequency<select value={form.payFrequency} onChange={(event) => setForm({ ...form, payFrequency: event.target.value })}><option value="all">All Pay Frequencies</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option></select></label>
            <label>Apply To Employees<select value={form.employeeScope} onChange={(event) => setForm({ ...form, employeeScope: event.target.value })}><option value="all">All Employees</option></select></label>
          </div><fieldset className="deduction-provinces"><legend>Applicable Provinces *</legend>{provinceOptions.map((province) => <label key={province}><input type="checkbox" checked={form.provinces.includes(province)} onChange={(event) => setForm({ ...form, provinces: event.target.checked ? [...form.provinces, province] : form.provinces.filter((item) => item !== province) })} /> {province}</label>)}</fieldset><label className="deduction-editor-check"><input type="checkbox" checked={form.defaultForNewEmployees} onChange={(event) => setForm({ ...form, defaultForNewEmployees: event.target.checked })} /> Set as Default for New Employees</label></section>
          <section><h2>Payroll &amp; Reporting</h2><div className="deduction-reporting-options">
            <label><span>Show on Employee Paystub</span><b><input type="checkbox" checked={form.showOnPaystub} onChange={(event) => setForm({ ...form, showOnPaystub: event.target.checked })} /> Yes (visible to employees)</b></label>
            <label><span>Include in CRA Reports (if applicable)</span><b><input type="checkbox" checked={form.includeInCraReports} onChange={(event) => setForm({ ...form, includeInCraReports: event.target.checked })} /> Yes</b></label>
          </div><label className="deduction-description">Description<textarea maxLength={500} placeholder="Enter description for this deduction type (optional)..." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><small>{form.description.length} / 500</small></label></section>
        </div>
        <aside className="deduction-editor-aside"><section><h2>Preview</h2><div className="deduction-editor-preview"><b>Employee Paystub Preview</b><span>Deductions</span><p><strong>{form.name || 'Deduction Name'}</strong><strong>{displayAmount}</strong></p><p><strong>Total Deductions</strong><strong>{displayAmount}</strong></p></div></section><section className="deduction-editor-info"><h2>Important Information</h2><ul><li>Use Statutory deductions for government-required items such as EI, CPP and income tax.</li><li>Use Voluntary deductions for employee-selected benefits, insurance or savings.</li><li>Use Custom deductions for employer-specific costs such as uniforms or meals.</li><li>Deduction codes should be short and unique.</li><li>The default amount can be overridden during payroll preparation.</li></ul></section></aside>
      </div>
      <footer className="deduction-editor-actions"><button onClick={() => { setShowForm(false); setEditing(undefined); }}>Cancel</button><button disabled={saving || !form.employerId || !form.name || !form.code || !form.category || !form.provinces.length} onClick={save}>{saving ? 'Saving...' : editing ? 'Update Deduction Type' : 'Save Deduction Type'}</button></footer>
    </section>;
  }

  const employerName = (id: string) => employers.find((item) => item.id === id)?.name || 'All employers';
  return (
    <section className="sa-deduction-page">
      <header className="employee-head">
        <div><h1>Deduction Types</h1><p>Manage mandatory statutory deductions and employer-specific custom deductions.</p></div>
        <button className="run-payroll" onClick={openCreate}>+ Custom Deduction</button>
      </header>
      {notice && <p className="success-note" role="status"><b>{notice}</b></p>}
      <div className="deduction-admin-summary">
        <article><small>Statutory</small><strong>{items.filter((item) => item.kind === 'statutory').length}</strong><span>Mandatory and system managed</span></article>
        <article><small>Custom</small><strong>{items.filter((item) => item.kind === 'custom').length}</strong><span>Assigned to individual employers</span></article>
        <article><small>Active</small><strong>{items.filter((item) => item.status === 'active').length}</strong><span>Available in payroll configuration</span></article>
      </div>
      <section className="admin-panel deduction-admin-table">
        <table><thead><tr><th>Name</th><th>Code</th><th>Scope</th><th>Province</th><th>Calculation</th><th>Required</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.description}</small></td><td>{item.code}</td><td>{item.kind === 'statutory' ? 'All employers' : employerName(item.employerId)}</td><td>{item.provinces.join(', ')}</td><td>{item.calculationMethod === 'percentage' ? `${item.value}%` : item.calculationMethod === 'fixed' ? moneyText(item.value) : item.calculationMethod.replace('_', ' ')}</td><td>{item.mandatory ? 'Mandatory' : 'Optional'}</td><td><span className={`status ${item.status === 'active' ? 'paid' : 'draft'}`}>{item.status}</span></td><td>{item.kind === 'custom' ? <button onClick={() => openEdit(item)}>Edit</button> : <span className="locked-setting">Locked</span>}</td></tr>)}</tbody>
        </table>
      </section>
    </section>
  );
}

function SuperAdminT4({ token }: { token: string }) {
  const [employers, setEmployers] = useState<Array<{ id: string; name: string; customerId: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; companyId: string; name: string; employeeNumber: string; years: number[] }>>([]);
  const [companyId, setCompanyId] = useState('');
  const [year, setYear] = useState('');
  const [employeeId, setEmployeeId] = useState('all');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api<{ employers: typeof employers; employees: typeof employees }>('/super-admin/t4/options', token)
      .then((result) => {
        setEmployers(result.employers);
        setEmployees(result.employees);
        setCompanyId((current) => current || result.employers[0]?.id || '');
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load T4 options.'));
  }, [token]);

  const companyEmployees = employees.filter((employee) => employee.companyId === companyId);
  const years = [...new Set(companyEmployees.flatMap((employee) => employee.years))].sort((a, b) => b - a);
  const selectedYear = year && years.includes(Number(year)) ? year : String(years[0] || '');
  const eligibleEmployees = companyEmployees.filter((employee) => employee.years.includes(Number(selectedYear)));

  async function generate() {
    if (!companyId || !selectedYear) return;
    setGenerating(true);
    setNotice('');
    try {
      const response = await fetch(`${apiBase}/super-admin/t4/generate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, year: Number(selectedYear), employeeId })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined);
        throw new Error(detail?.message || 'T4 generation failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `T4-${selectedYear}-${employeeId === 'all' ? 'all-employees' : eligibleEmployees.find((employee) => employee.id === employeeId)?.employeeNumber || 'employee'}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice(`${employeeId === 'all' ? eligibleEmployees.length : 1} T4 form${employeeId === 'all' && eligibleEmployees.length !== 1 ? 's' : ''} generated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'T4 generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  return <section className="sa-deduction-page">
    <header className="employee-head"><div><h1>Year End (T4)</h1><p>Generate T4 slips for completed calendar years from finalized payroll records.</p></div></header>
    {notice && <p className="success-note"><b>{notice}</b></p>}
    <section className="admin-panel t4-generator">
      <div className="t4-generator-fields super-admin-t4-fields">
        <label>Employer<select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setYear(''); setEmployeeId('all'); }}>{employers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.customerId})</option>)}</select></label>
        <label>Year<select value={selectedYear} onChange={(event) => { setYear(event.target.value); setEmployeeId('all'); }}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Employee Name<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={!eligibleEmployees.length}><option value="all">All employees</option>{eligibleEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeNumber})</option>)}</select></label>
        <button disabled={!companyId || !selectedYear || !eligibleEmployees.length || generating} onClick={generate}>{generating ? 'Generating...' : 'Generate T4'}</button>
      </div>
      {!years.length ? <p>T4 generation becomes available after December has ended for a year with finalized payslips.</p> : !eligibleEmployees.length && <p>No employees with payslips are available for this employer and year.</p>}
    </section>
  </section>;
}

function SuperAdminRoe({ token }: { token: string }) {
  const [employers, setEmployers] = useState<Array<{ id: string; name: string; customerId: string }>>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; companyId: string; name: string; employeeNumber: string }>>([]);
  const [companyId, setCompanyId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [lastDayPaid, setLastDayPaid] = useState('');
  const [finalPayPeriodEnd, setFinalPayPeriodEnd] = useState('');
  const [reason, setReason] = useState('A|Shortage of work / End of contract or season');
  const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false);
  const reasons = [
    ['A', 'Shortage of work / End of contract or season'], ['D', 'Illness or injury'],
    ['E', 'Quit'], ['G', 'Retirement'], ['K', 'Other'], ['M', 'Dismissal'],
    ['N', 'Leave of absence'], ['P', 'Parental'], ['Z', 'Compassionate care / Family caregiver']
  ];

  useEffect(() => {
    api<{ employers: typeof employers; employees: Array<{ id: string; companyId: string; name: string; employeeNumber: string; years: number[] }> }>('/super-admin/t4/options', token)
      .then((result) => {
        setEmployers(result.employers); setEmployees(result.employees);
        const firstCompany = result.employers[0]?.id || '';
        setCompanyId(firstCompany);
        setEmployeeId(result.employees.find((employee) => employee.companyId === firstCompany)?.id || '');
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Unable to load ROE options.'));
  }, [token]);

  const companyEmployees = employees.filter((employee) => employee.companyId === companyId);

  async function generate() {
    const [reasonCode, reasonDescription] = reason.split('|');
    setGenerating(true); setNotice('');
    try {
      const response = await fetch(`${apiBase}/super-admin/roe/generate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, employeeId, lastDayPaid, finalPayPeriodEnd, reasonCode, reasonDescription })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined);
        throw new Error(detail?.message || 'ROE generation failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const employee = companyEmployees.find((item) => item.id === employeeId);
      const link = document.createElement('a'); link.href = url;
      link.download = `ROE-${employee?.employeeNumber || 'employee'}-${lastDayPaid}.pdf`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      setNotice('ROE draft generated. The official serial number is assigned only after Service Canada accepts the submission.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ROE generation failed.');
    } finally { setGenerating(false); }
  }

  return <section className="sa-deduction-page">
    <header className="employee-head"><div><h1>Record of Employment (ROE)</h1><p>Generate a Service Canada-style ROE draft from payroll records.</p></div></header>
    {notice && <p className="success-note"><b>{notice}</b></p>}
    <section className="admin-panel roe-generator">
      <div className="roe-generator-fields">
        <label>Employer<select value={companyId} onChange={(event) => { const id = event.target.value; setCompanyId(id); setEmployeeId(employees.find((employee) => employee.companyId === id)?.id || ''); }}>{employers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.customerId})</option>)}</select></label>
        <label>Employee<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{companyEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeNumber})</option>)}</select></label>
        <label>Last day for which paid *<input type="date" value={lastDayPaid} onChange={(event) => setLastDayPaid(event.target.value)} /></label>
        <label>Final pay period ending date *<input type="date" value={finalPayPeriodEnd} onChange={(event) => setFinalPayPeriodEnd(event.target.value)} /></label>
        <label className="full-width">Reason for issuing this ROE *<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map(([code, description]) => <option key={code} value={`${code}|${description}`}>{description}</option>)}</select></label>
      </div>
      <p className="roe-serial-note"><b>Serial number:</b> Electronic ROE serial numbers are assigned by Service Canada after successful submission. This generated document is a draft.</p>
      <footer><button disabled={!companyId || !employeeId || !lastDayPaid || !finalPayPeriodEnd || generating} onClick={generate}>{generating ? 'Generating...' : 'Generate ROE Draft'}</button></footer>
    </section>
  </section>;
}

function SuperAdminDashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [data, setData] = useState<SuperAdminDashboard>();
  const [page, setPage] = useState('All Payroll Accounts');
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultEmployerForm);
  const [editingEmployerId, setEditingEmployerId] = useState('');
  const [editingStatus, setEditingStatus] = useState<
    'draft' | 'pending_activation' | 'active' | 'suspended'
  >('active');
  const [result, setResult] = useState<{
    emailSent: boolean;
    emailError?: string;
    temporaryPassword: string;
    employer: { legalName: string; customerId: string; primaryContactEmail: string };
  }>();
  const [error, setError] = useState('');
  const [savingEmployer, setSavingEmployer] = useState(false);
  const [employerNotice, setEmployerNotice] = useState('');
  const [resendingEmployerId, setResendingEmployerId] = useState('');
  const nav = [
    { label: 'Dashboard' },
    { label: 'Employers' },
    { label: 'Employees' },
    { label: 'Payroll Runs' },
    { label: 'Payroll Accounts' },
    { label: 'All Payroll Accounts', section: 'payroll' },
    { label: 'Add Payroll Account', section: 'payroll' },
    { label: 'CRA Remittances', section: 'payroll' },
    { label: 'Banking & Funding', section: 'payroll' },
    { label: 'Remittance Schedule', section: 'payroll' },
    { label: 'Reports' },
    { label: 'Compliance & Tax' },
    { label: 'Deduction Types' },
    { label: 'Year End (T4)' },
    { label: 'ROE' },
    { label: 'Notifications' },
    { label: 'Users & Access' },
    { label: 'Settings' }
  ];
  const enabledModules = [
    'Employees',
    'Payroll',
    'HR & People Management',
    'Government & Tax',
    'Time & Attendance',
    'Compliance',
    'Reports',
    'Benefits & Deductions',
    'Documents',
    'Company Settings'
  ];
  const update = (key: keyof typeof defaultEmployerForm, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    api<SuperAdminDashboard>('/super-admin/dashboard', token)
      .then(setData)
      .catch(() => setData(undefined));
  }, [token, result]);
  async function save(status: 'draft' | 'pending_activation' = 'pending_activation') {
    setError('');
    try {
      const response = await api<typeof result>('/super-admin/employers', token, {
        method: 'POST',
        body: JSON.stringify({
          legalName: form.legalName,
          operatingName: form.operatingName,
          businessNumber: form.businessNumber,
          businessType: form.businessType,
          industry: form.industry,
          naicsCode: form.naicsCode,
          employeeCount: Number(form.employeeCount) || 0,
          address: {
            street: form.addressLine1,
            line2: form.addressLine2,
            city: form.city,
            province: form.province,
            postalCode: form.postalCode,
            country: form.country
          },
          primaryContact: {
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.contactEmail,
            phone: form.phone,
            jobTitle: form.jobTitle
          },
          craPayroll: {
            payrollAccount: form.payrollAccount,
            accountSuffix: form.accountSuffix,
            remitterType: 'Regular',
            remittanceFrequency: 'Monthly'
          },
          payrollConfiguration: {
            payFrequency: form.payFrequency,
            currency: 'CAD',
            standardHoursPerWeek: 40,
            defaultHoursPerDay: 8,
            vacation: {
              vacationAccrualRate: form.vacationPayRate
            },
            statePay: {
              enabled: form.statePayEnabled,
              dates: form.statePayDates ? form.statePayDates.split(',').filter(Boolean) : [],
              holidays: parseStatePayHolidays(form.statePayHolidays),
              overtimeMultiplier: 1.5
            }
          },
          banking: {
            bankName: form.bankName,
            transitNumber: form.transitNumber,
            institutionNumber: form.institutionNumber,
            accountNumber: form.accountNumber,
            accountType: 'Business Chequing'
          },
          subscription: {
            plan: form.plan,
            billingFrequency: form.billingFrequency,
            startDate: '2026-09-01'
          },
          features: Object.fromEntries(enabledModules.map((module) => [module, true])),
          status,
          sendEmail: status !== 'draft'
        })
      });
      setResult(response);
      setPage('Employers');
    } catch {
      setError('Could not create employer. Check required fields and try again.');
    }
  }
  async function resendActivationEmail(employerId: string) {
    setError('');
    setResendingEmployerId(employerId);
    try {
      const response = await api<typeof result>(
        `/super-admin/employers/${employerId}/resend-activation`,
        token,
        { method: 'POST' }
      );
      setResult(response);
    } catch {
      setError('Could not resend activation email. Check employer status and try again.');
    } finally {
      setResendingEmployerId('');
    }
  }
  async function editEmployer(employer: SuperAdminDashboard['employers'][number]) {
    setError('');
    setEmployerNotice('');
    try {
      const response = await api<{
        employer: {
          id: string;
          legalName: string;
          operatingName: string;
          businessNumber: string;
          businessType: string;
          industry: string;
          naicsCode: string;
          employeeCount: number;
          status: 'draft' | 'pending_activation' | 'active' | 'suspended';
          address: Record<string, string>;
          craPayroll: Record<string, unknown>;
          payrollConfiguration: Record<string, unknown>;
          banking: Record<string, unknown>;
          subscription: Record<string, string>;
          primaryContact?: {
            firstName: string;
            lastName: string;
            email: string;
            phone: string;
            jobTitle: string;
          };
        };
      }>('/super-admin/employers/' + employer.id, token);
      const detail = response.employer;
      const provinceName =
        provinceNamesByCode[String(detail.address.province || '').toUpperCase()] ||
        detail.address.province ||
        '';
      setEditingEmployerId(detail.id);
      setEditingStatus(detail.status);
      setForm({
        legalName: detail.legalName,
        operatingName: detail.operatingName,
        businessNumber: detail.businessNumber,
        businessType: detail.businessType || 'Corporation',
        industry: detail.industry,
        naicsCode: detail.naicsCode,
        employeeCount: String(detail.employeeCount || 0),
        addressLine1: detail.address.street || '',
        addressLine2: detail.address.line2 || '',
        city: detail.address.city || '',
        province: provinceName,
        vacationPayRate: provinceVacationRates[provinceName] || '4.00',
        postalCode: detail.address.postalCode || '',
        country: detail.address.country || 'Canada',
        firstName: detail.primaryContact?.firstName || '',
        lastName: detail.primaryContact?.lastName || '',
        jobTitle: detail.primaryContact?.jobTitle || '',
        contactEmail: detail.primaryContact?.email || '',
        phone: detail.primaryContact?.phone || '',
        payrollAccount: String(detail.craPayroll.payrollAccount || ''),
        accountSuffix: String(detail.craPayroll.accountSuffix || ''),
        payFrequency: String(detail.payrollConfiguration.payFrequency || 'Biweekly'),
        statePayEnabled: Boolean(
          (detail.payrollConfiguration.statePay as { enabled?: boolean } | undefined)?.enabled
        ),
        statePayDates: (
          (detail.payrollConfiguration.statePay as { dates?: string[] } | undefined)?.dates || []
        ).join(','),
        statePayHolidays: JSON.stringify(
          (
            detail.payrollConfiguration.statePay as
              | { holidays?: Array<{ name: string; date: string }> }
              | undefined
          )?.holidays || []
        ),
        bankName: String(detail.banking.bankName || ''),
        transitNumber: String(detail.banking.transitNumber || ''),
        institutionNumber: String(detail.banking.institutionNumber || ''),
        accountNumber: String(detail.banking.accountNumber || ''),
        plan: detail.subscription.plan || employer.plan || 'Standard',
        billingFrequency: detail.subscription.billingFrequency || 'Monthly'
      });
      setPage('Edit Employer');
    } catch {
      setError('Could not load employer details. Please try again.');
    }
  }
  async function saveEmployerDetails() {
    if (!editingEmployerId || savingEmployer) return;
    setError('');
    setEmployerNotice('');
    setSavingEmployer(true);
    try {
      const response = await api<{ employer: Partial<SuperAdminDashboard['employers'][number]> }>(
        '/super-admin/employers/' + editingEmployerId,
        token,
        {
          method: 'PUT',
          body: JSON.stringify({
            legalName: form.legalName,
            operatingName: form.operatingName,
            businessNumber: form.businessNumber,
            businessType: form.businessType,
            industry: form.industry,
            naicsCode: form.naicsCode,
            employeeCount: Number(form.employeeCount) || 0,
            address: {
              street: form.addressLine1,
              line2: form.addressLine2,
              city: form.city,
              province: form.province,
              postalCode: form.postalCode,
              country: form.country
            },
            primaryContact: {
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.contactEmail,
              phone: form.phone,
              jobTitle: form.jobTitle
            },
            craPayroll: {
              payrollAccount: form.payrollAccount,
              accountSuffix: form.accountSuffix,
              remitterType: 'Regular',
              remittanceFrequency: 'Monthly'
            },
            payrollConfiguration: {
              payFrequency: form.payFrequency,
              currency: 'CAD',
              standardHoursPerWeek: 40,
            defaultHoursPerDay: 8,
            vacation: {
              vacationAccrualRate: form.vacationPayRate
            },
              statePay: {
                enabled: form.statePayEnabled,
                dates: form.statePayDates ? form.statePayDates.split(',').filter(Boolean) : [],
                holidays: parseStatePayHolidays(form.statePayHolidays),
                overtimeMultiplier: 1.5
              }
            },
            banking: {
              bankName: form.bankName,
              transitNumber: form.transitNumber,
              institutionNumber: form.institutionNumber,
              accountNumber: form.accountNumber,
              accountType: 'Business Chequing'
            },
            subscription: {
              plan: form.plan,
              billingFrequency: form.billingFrequency,
              startDate: '2026-09-01'
            },
            features: Object.fromEntries(enabledModules.map((module) => [module, true])),
            status: editingStatus
          })
        }
      );
      setData(
        (current) =>
          current && {
            ...current,
            employers: current.employers.map((item) =>
              item.id === editingEmployerId
                ? {
                    ...item,
                    ...response.employer,
                    plan: String(response.employer.plan || form.plan),
                    primaryContact: {
                      name: `${form.firstName} ${form.lastName}`.trim(),
                      email: form.contactEmail
                    }
                  }
                : item
            ),
            metrics: {
              ...current.metrics,
              activeEmployers: current.employers
                .map((item) =>
                  item.id === editingEmployerId ? { ...item, status: editingStatus } : item
                )
                .filter((item) => item.status === 'active').length,
              pendingActivation: current.employers
                .map((item) =>
                  item.id === editingEmployerId ? { ...item, status: editingStatus } : item
                )
                .filter((item) => item.status === 'pending_activation').length,
              draftEmployers: current.employers
                .map((item) =>
                  item.id === editingEmployerId ? { ...item, status: editingStatus } : item
                )
                .filter((item) => item.status === 'draft').length
            }
          }
      );
      setEmployerNotice(`${form.legalName} was saved successfully.`);
      setPage('Employers');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not update employer. Check required fields and try again.'
      );
    } finally {
      setSavingEmployer(false);
    }
  }
  async function deleteEmployer(employer: SuperAdminDashboard['employers'][number]) {
    if (
      !window.confirm(
        'Delete ' +
          employer.legalName +
          '? This removes the employer account and linked employer login.'
      )
    )
      return;
    setError('');
    try {
      await api<{ deleted: boolean }>('/super-admin/employers/' + employer.id, token, {
        method: 'DELETE'
      });
      setData((current) => {
        if (!current) return current;
        const employers = current.employers.filter((item) => item.id !== employer.id);
        return {
          ...current,
          employers,
          metrics: {
            ...current.metrics,
            employers: employers.length,
            activeEmployers: employers.filter((item) => item.status !== 'draft').length,
            pendingActivation: employers.filter((item) => item.status === 'pending_activation')
              .length,
            draftEmployers: employers.filter((item) => item.status === 'draft').length
          }
        };
      });
    } catch {
      setError('Could not delete employer. Please try again.');
    }
  }
  const field = (key: keyof typeof defaultEmployerForm, label: string) => (
    <label>
      {label}
      <input value={String(form[key])} onChange={(event) => update(key, event.target.value)} />
    </label>
  );
  const stepBody = [
    <>
      <h2>Business Information</h2>
      <div className="sa-section">
        <h3>Legal Information</h3>
        <div className="wizard-fields four">
          {field('legalName', 'Legal Business Name *')}
          {field('operatingName', 'Operating / Trade Name *')}
          {field('businessType', 'Business Type *')}
          {field('businessNumber', 'CRA Business Number (BN) *')}
          {field('industry', 'Industry *')}
          {field('naicsCode', 'NAICS Code')}
          {field('employeeCount', 'Number of Employees *')}
        </div>
      </div>
      <div className="sa-section">
        <h3>Business Address</h3>
        <div className="wizard-fields business-address-fields">
          {field('addressLine1', 'Address Line 1 *')}
          {field('addressLine2', 'Address Line 2')}
          <AdminSelect
            label="Province *"
            value={form.province}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                province: value,
                city: provinceCities[value]?.[0] || '',
                vacationPayRate: provinceVacationRates[value] || '4.00'
              }))
            }
            options={Object.keys(provinceCities)}
          />
          <AdminSelect
            label="City *"
            value={form.city}
            onChange={(value) => update('city', value)}
            options={[
              ...new Set([...(provinceCities[form.province] || []), ...(form.city ? [form.city] : [])])
            ]}
          />
          <label>
            Vacation Pay Rate (2026) *
            <input readOnly value={`${form.vacationPayRate}%`} />
            <small>Automatically set from the selected province or territory.</small>
          </label>
          {field('postalCode', 'Postal Code *')}
          {field('country', 'Country *')}
        </div>
        <div className="business-address-settings">
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={form.statePayEnabled}
              onChange={(event) => update('statePayEnabled', event.target.checked)}
            />
            <span>
              <b>Enable State Holiday Pay</b>
              <small>Employer can select eligible holiday dates paid at 1.5x.</small>
            </span>
          </label>
          <div className="success-note business-address-rules">
            <b>{form.province || 'Select a province'} payroll rules</b>
            <span>Provincial deductions and vacation-pay defaults use this company province.</span>
          </div>
        </div>
      </div>
    </>,
    <>
      <h2>Primary Contact Information</h2>
      <div className="wizard-fields four">
        {field('firstName', 'First Name *')}
        {field('lastName', 'Last Name *')}
        {field('jobTitle', 'Job Title *')}
        {field('contactEmail', 'Business Email *')}
        {field('phone', 'Mobile Phone *')}
        <AdminSelect
          label="Account Role *"
          value="Employer Owner"
          onChange={() => undefined}
          options={['Employer Owner']}
        />
      </div>
      <div className="sa-section split">
        <WizardCheck label="Create Payhours Login for this user" checked />
        <WizardCheck label="Send activation email after account creation" checked />
        <WizardCheck label="Require password setup on first login" checked />
      </div>
    </>,
    <>
      <h2>CRA Payroll Program Account</h2>
      <div className="wizard-fields four">
        {field('businessNumber', 'CRA Business Number (BN) *')}
        {field('payrollAccount', 'Payroll Program Account Number (RP) *')}
        {field('accountSuffix', 'Account Suffix *')}
        <AdminSelect
          label="Remittance Frequency *"
          value="Monthly"
          onChange={() => undefined}
          options={['Monthly']}
        />
      </div>
      <div className="success-note">
        <b>Information Looks Valid</b>
        <span>We will verify this account with CRA during onboarding.</span>
      </div>
    </>,
    <>
      <h2>Payroll Schedule</h2>
      <div className="wizard-fields four">
        <AdminSelect
          label="Pay Frequency *"
          value={form.payFrequency}
          onChange={(value) => update('payFrequency', value)}
          options={['Weekly', 'Biweekly', 'Monthly']}
        />
        <AdminInput label="Payroll Year Start *" value="2026-01-01" onChange={() => undefined} />
        <AdminInput label="Standard Hours Per Week *" value="40" onChange={() => undefined} />
        <AdminInput label="Default Hours Per Day *" value="8" onChange={() => undefined} />
      </div>
      <div className="check-grid">
        <WizardCheck label="Enable Direct Deposit" checked />
        <WizardCheck label="Enable Employee Self-Service" checked />
        <WizardCheck label="Enable CPP" checked />
        <WizardCheck label="Enable EI" checked />
      </div>
    </>,
    <>
      <h2>Primary Payroll Funding Account</h2>
      <div className="wizard-fields four">
        {field('bankName', 'Bank Name *')}
        {field('transitNumber', 'Transit Number *')}
        {field('institutionNumber', 'Institution Number *')}
        {field('accountNumber', 'Account Number *')}
      </div>
      <div className="success-note">
        <b>Bank account added</b>
        <span>Account details look valid. Verification pending.</span>
      </div>
    </>,
    <>
      <h2>Subscription Plan</h2>
      <div className="plan-grid">
        {['Starter', 'Standard', 'Professional', 'Enterprise'].map((plan) => (
          <button
            key={plan}
            className={form.plan === plan ? 'selected' : ''}
            onClick={() => update('plan', plan)}
          >
            <b>{plan}</b>
            <strong>
              $
              {plan === 'Starter'
                ? 29
                : plan === 'Standard'
                  ? 59
                  : plan === 'Professional'
                    ? 99
                    : 199}
            </strong>
            <span>/ month</span>
          </button>
        ))}
      </div>
      <div className="wizard-fields three">
        {field('billingFrequency', 'Billing Frequency')}
        {field('contactEmail', 'Billing Email *')}
        <AdminInput label="Payment Method" value="Credit Card" onChange={() => undefined} />
      </div>
    </>,
    <>
      <h2>Module Access</h2>
      <div className="module-access">
        {enabledModules.concat(['Integrations', 'API Access']).map((module, index) => (
          <label key={module}>
            <span>
              <b>{module}</b>
              <small>{index < 10 ? 'Enabled for this employer' : 'Optional add-on access'}</small>
            </span>
            <input type="checkbox" defaultChecked={index < 10} />
          </label>
        ))}
      </div>
      <h2>Default User Roles & Permissions</h2>
      <div className="role-grid">
        {[
          'Owner',
          'Payroll Administrator',
          'HR Administrator',
          'Time Administrator',
          'Read Only'
        ].map((role, index) => (
          <button className={index === 0 ? 'selected' : ''} key={role}>
            {role}
            <small>
              {index === 0 ? 'Full access to all modules' : 'Limited permissions template'}
            </small>
          </button>
        ))}
      </div>
    </>,
    <>
      <h2>Review & Activate</h2>
      <div className="review-grid">
        <article>
          <h3>1. Business Information</h3>
          <p>
            <span>Legal Business Name</span>
            <b>{form.legalName}</b>
          </p>
          <p>
            <span>BN</span>
            <b>{form.businessNumber}</b>
          </p>
          <p>
            <span>Employees</span>
            <b>{form.employeeCount}</b>
          </p>
        </article>
        <article>
          <h3>2. Primary Contact</h3>
          <p>
            <span>Name</span>
            <b>
              {form.firstName} {form.lastName}
            </b>
          </p>
          <p>
            <span>Email</span>
            <b>{form.contactEmail}</b>
          </p>
        </article>
        <article>
          <h3>6. Subscription</h3>
          <p>
            <span>Plan</span>
            <b>{form.plan}</b>
          </p>
          <p>
            <span>Billing</span>
            <b>{form.billingFrequency}</b>
          </p>
        </article>
        <article className="span-all">
          <h3>8. Review & Activate</h3>
          <div className="success-note">
            <b>All required information has been completed.</b>
            <span>You can now activate the employer account.</span>
          </div>
        </article>
      </div>
    </>
  ];
  const editDetails = (
    <section className="module-page super-create">
      <div className="sa-breadcrumb">Employers &gt; Edit Employer</div>
      <div className="employee-head">
        <div>
          <h1>Company Details</h1>
          <p>
            Edit the full employer profile, contact, payroll, banking, subscription and feature
            setup.
          </p>
        </div>
        <button onClick={() => setPage('Employers')}>Back to Employers</button>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="wizard-card">
        <h2>Account Status</h2>
        <div className="wizard-fields four">
          <AdminSelect
            label="Status"
            value={editingStatus}
            onChange={(next) => setEditingStatus(next as typeof editingStatus)}
            options={['draft', 'pending_activation', 'active', 'suspended']}
          />
          {field('employeeCount', 'Number of Employees *')}
          {field('plan', 'Subscription Plan')}
          {field('billingFrequency', 'Billing Frequency')}
        </div>
      </div>
      <div className="edit-details-stack">
        <div className="wizard-card">{stepBody[0]}</div>
        <div className="wizard-card">{stepBody[1]}</div>
        <div className="wizard-card">{stepBody[2]}</div>
        <div className="wizard-card">{stepBody[3]}</div>
        <div className="wizard-card">{stepBody[4]}</div>
        <div className="wizard-card">{stepBody[5]}</div>
        <div className="wizard-card">{stepBody[6]}</div>
      </div>
      <div className="wizard-actions">
        <button disabled={savingEmployer} onClick={() => setPage('Employers')}>Cancel</button>
        <span />
        <button className="run-payroll" disabled={savingEmployer} onClick={saveEmployerDetails}>
          {savingEmployer ? 'Saving...' : 'Save Company Details'}
        </button>
      </div>
    </section>
  );
  const employers = (
    <section className="module-page">
      <div className="employee-head">
        <div>
          <h1>Employers</h1>
          <p>Manage employer accounts created by Payhours.</p>
        </div>
        <button
          className="run-payroll"
          onClick={() => {
            setPage('Create Employer');
            setStep(1);
          }}
        >
          Create Employer
        </button>
      </div>
      {employerNotice && (
        <div className="success-note" role="status">
          <b>{employerNotice}</b>
        </div>
      )}
      {result && (
        <div className="success-note">
          <b>{result.employer.legalName} email ready.</b>
          <span>
            Email sent: {result.emailSent ? 'Yes' : 'No'} | Login:{' '}
            {result.employer.primaryContactEmail} | Temporary password: {result.temporaryPassword}
          </span>
          {!result.emailSent && result.emailError && (
            <span>Email error: {result.emailError}</span>
          )}
        </div>
      )}
      <div className="metric-grid">
        <article>
          <p>Total Employers</p>
          <strong>{data?.metrics.employers || 0}</strong>
        </article>
        <article>
          <p>Active</p>
          <strong>{data?.metrics.activeEmployers || 0}</strong>
        </article>
        <article>
          <p>Pending</p>
          <strong>{data?.metrics.pendingActivation || 0}</strong>
        </article>
        <article>
          <p>Drafts</p>
          <strong>{data?.metrics.draftEmployers || 0}</strong>
        </article>
      </div>
      <section className="admin-panel">
        <table>
          <thead>
            <tr>
              <th>Employer</th>
              <th>Customer ID</th>
              <th>Primary Contact</th>
              <th>Employees</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.employers.map((employer) => (
              <tr key={employer.id}>
                <td>
                  <b>{employer.legalName}</b>
                  <small>{employer.operatingName}</small>
                </td>
                <td>{employer.customerId}</td>
                <td>
                  <b>{employer.primaryContact?.name || '-'}</b>
                  <small>{employer.primaryContact?.email || 'No contact email'}</small>
                </td>
                <td>{employer.employeeCount}</td>
                <td>{employer.plan}</td>
                <td>
                  <span className="status paid">{employer.status}</span>
                </td>
                <td className="table-actions">
                  <button type="button" onClick={() => editEmployer(employer)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deleteEmployer(employer)}>
                    Delete
                  </button>
                  {employer.status === 'pending_activation' && (
                    <button
                      type="button"
                      onClick={() => resendActivationEmail(employer.id)}
                      disabled={resendingEmployerId === employer.id}
                    >
                      {resendingEmployerId === employer.id ? 'Sending...' : 'Resend Email'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
  const create = (
    <section className="module-page super-create">
      <div className="sa-breadcrumb">Employers &gt; Create Employer</div>
      <div className="employee-head">
        <div>
          <h1>Create Employer</h1>
          <p>
            Set up a new employer account. Complete all required information to create the employer
            and activate access.
          </p>
        </div>
        <button onClick={() => save('draft')}>Save as Draft</button>
      </div>
      <div className="steps">
        {employerWizardSteps.map((name, index) => (
          <button
            key={name}
            className={index + 1 <= step ? 'active' : ''}
            onClick={() => setStep(index + 1)}
          >
            <b>{index + 1 < step ? 'Done' : index + 1}</b>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="sa-create-layout">
        <aside>
          <div className="sa-step-icon">{step}</div>
          <h3>
            Step {step} of 8<br />
            {employerWizardSteps[step - 1]}
          </h3>
          <p>
            {step === 8
              ? 'Review all information before activating the employer account.'
              : 'Enter and confirm the employer setup details for this step.'}
          </p>
        </aside>
        <div className="wizard-card">{stepBody[step - 1]}</div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="wizard-actions">
        <button onClick={() => setStep(Math.max(1, step - 1))}>Previous</button>
        <span />
        <button onClick={() => setPage('Employers')}>Cancel</button>
        <button
          className="run-payroll"
          onClick={() => (step === 8 ? save('pending_activation') : setStep(step + 1))}
        >
          {step === 8 ? 'Activate Employer' : 'Next'}
        </button>
      </div>
    </section>
  );
  const payrollPages = [
    'Payroll Accounts',
    'All Payroll Accounts',
    'Add Payroll Account',
    'CRA Remittances',
    'Banking & Funding',
    'Remittance Schedule'
  ];
  return (
    <div className="admin-shell super-admin-shell">
      <aside className="admin-sidebar">
        <Logo />
        {nav.map((item) => (
          <button
            key={item.label}
            className={`${page === item.label || (['Create Employer', 'Edit Employer'].includes(page) && item.label === 'Employers') || (page === 'Create Role' && item.label === 'Role Management') || (payrollPages.includes(page) && item.label === 'Payroll Accounts') ? 'active' : ''} ${item.section ? 'sub-nav-item' : ''}`}
            onClick={() =>
              setPage(item.label === 'Payroll Accounts' ? 'All Payroll Accounts' : item.label)
            }
          >
            <span>{item.label.charAt(0)}</span>
            {item.label}
          </button>
        ))}
        <div className="built-canada">
          Need Help?
          <br />
          support@payhours.ca
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <b>Super Admin</b>
          <label className="admin-search">
            <span>Search</span>
            <input placeholder="Search employers, users, payroll runs..." />
          </label>
          <button onClick={() => setPage('Notifications')}>
            Alerts
          </button>
          <button>Help</button>
          <div className="admin-profile">
            <b>Super Admin</b>
            <span>Payhours Inc.</span>
          </div>
          <button onClick={onLogout}>Logout</button>
        </header>
        <section className="admin-content">
          {[
            'Users & Access',
            'All Users',
            'Role Management',
            'Permission Settings',
            'Activity Logs',
            'Login Policies',
            'Create Role'
          ].includes(page) ? (
            <SuperAdminAccess
              token={token}
              mode={page === 'Users & Access' ? 'All Users' : page}
              onMode={setPage}
            />
          ) : page === 'Payroll Runs' ? (
            <SuperAdminPayrollRuns token={token} />
          ) : page === 'Notifications' ? (
            <SuperAdminNotifications token={token} />
          ) : page === 'Deduction Types' ? (
            <SuperAdminDeductionTypes token={token} />
          ) : page === 'Year End (T4)' ? (
            <SuperAdminT4 token={token} />
          ) : page === 'ROE' ? (
            <SuperAdminRoe token={token} />
          ) : payrollPages.includes(page) ? (
            <SuperAdminPayrollAccounts
              token={token}
              mode={page === 'Payroll Accounts' ? 'All Payroll Accounts' : page}
              onMode={setPage}
            />
          ) : page === 'Create Employer' ? (
            create
          ) : page === 'Edit Employer' ? (
            editDetails
          ) : (
            employers
          )}
        </section>
      </main>
    </div>
  );
}

function Help({ token }: { token: string }) {
  const [content, setContent] = useState<HelpContent>(fallbackHelpContent);
  useEffect(() => {
    api<HelpContent>('/employee/help', token)
      .then(setContent)
      .catch(() => setContent(fallbackHelpContent));
  }, []);

  return (
    <section className="help-page">
      <div className="help-brand">
        <Logo word={content.brandName} />
      </div>
      <header className="help-hero">
        <h1>{content.heroTitle}</h1>
        <label className="help-search" aria-label="Search help">
          <span>Search</span>
          <input placeholder={content.searchPlaceholder} />
        </label>
      </header>
      <section className="help-faq">
        <h2>{content.frequentlyAskedTitle}</h2>
        <div className="faq-list">
          {content.frequentlyAsked.map((item) => (
            <button key={item.title}>
              {item.title}
              <span>&gt;</span>
            </button>
          ))}
        </div>
      </section>
      <section className="help-topics">
        <h2>{content.topicsTitle}</h2>
        <div className="topic-grid">
          {content.topics.map((topic) => (
            <button className="topic-card" key={topic.title}>
              <strong>{topic.title}</strong>
              <span aria-hidden="true">{helpIcon(topic.icon)}</span>
              <p>{topic.description}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="help-form">
        <h2>{content.formTitle}</h2>
        <form>
          {content.formFields.map((field) => (
            <label key={field.label}>
              {field.label}
              <select defaultValue="" disabled={field.disabled}>
                <option value="" disabled>
                  {field.placeholder || ''}
                </option>
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
        </form>
      </section>
      <section className="help-resources">
        <h2>{content.resourcesTitle}</h2>
        {content.resources.map((resource) => (
          <button className="resource-card" key={resource.title}>
            <span className="resource-icon">{helpIcon(resource.icon)}</span>
            {resource.href && <span className="external-icon">Open</span>}
            <strong>{resource.title}</strong>
            <p>{resource.description}</p>
          </button>
        ))}
      </section>
      <footer className="help-contact">
        <div aria-hidden="true">?</div>
        <h2>{content.contactTitle}</h2>
        <p>
          {content.contactLines.map((line) => (
            <span key={line}>
              {line}
              <br />
            </span>
          ))}
        </p>
        {content.customerCareNumber && (
          <a href={`tel:${content.customerCareNumber.replace(/[^+\d]/g, '')}`}>
            {content.employerName ? `${content.employerName}: ` : ''}
            {content.customerCareNumber}
          </a>
        )}
      </footer>
    </section>
  );
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(
    (localStorage.getItem('payhours-lang') as Lang) || 'en'
  );
  const [token, setToken] = useState(localStorage.getItem('payhours-token') || '');
  const [portal, setPortal] = useState<Portal>(
    (localStorage.getItem('payhours-portal') as Portal) || 'employer'
  );
  const [page, setPage] = useState<Page>('home');
  const [pageHistory, setPageHistory] = useState<Page[]>([]);
  const [employerDashboard, setEmployerDashboard] = useState<EmployerDashboard>();
  const [employerCompanies, setEmployerCompanies] = useState<EmployerCompanyChoice[]>([]);
  const [profile, setProfile] = useState<EmployeeProfile>();
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [payStatements, setPayStatements] = useState<PayStatement[]>([]);
  const [selectedPayStatementId, setSelectedPayStatementId] = useState<string>();
  const [forms, setForms] = useState<TaxForm[]>([]);
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [loadError, setLoadError] = useState('');
  const t: T = (key) => (lang === 'en' ? messages.en[key] : messages.en[key]) || key;
  const isResetPassword = window.location.pathname === '/reset-password';
  function setLang(next: Lang) {
    setLangState(next);
    localStorage.setItem('payhours-lang', next);
    document.documentElement.lang = next;
  }

  function handleAuthFailure(error: unknown) {
    if ((error as { status?: number }).status === 401) {
      localStorage.removeItem('payhours-token');
      setToken('');
      setLoadError('');
      return;
    }
    setLoadError(t('loadError'));
  }

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!token) return;
    if (portal === 'super-admin') {
      api<SuperAdminDashboard>('/super-admin/dashboard', token)
        .then(() => {
          setLoadError('');
        })
        .catch(handleAuthFailure);
      return;
    }
    if (portal === 'employer') {
      api<EmployerDashboard>('/employer/dashboard', token)
        .then((dashboard) => {
          setEmployerDashboard(dashboard);
          setEmployerCompanies(
            dashboard.companies || (dashboard.company ? [dashboard.company] : [])
          );
          setLoadError('');
        })
        .catch(handleAuthFailure);
      return;
    }
    Promise.all([
      api<{ employee: EmployeeProfile; companies: CompanyChoice[] }>('/employee/context', token),
      api<{ statements: PayStatement[] }>('/employee/pay-statements', token),
      api<{ forms: TaxForm[] }>('/employee/tax-forms?year=2024', token),
      api<Bulletin[]>('/employee/bulletins', token)
    ])
      .then(([context, pay, tax, companyBulletins]) => {
        setProfile(context.employee);
        setCompanies(context.companies);
        setPayStatements(pay.statements);
        setForms(tax.forms);
        setBulletins(companyBulletins);
        setLoadError('');
      })
      .catch(handleAuthFailure);
  }, [token, portal]);

  useEffect(() => {
    if (!token || portal !== 'employee') return;
    const refreshBulletins = () => {
      if (document.visibilityState !== 'visible') return;
      api<Bulletin[]>('/employee/bulletins', token)
        .then(setBulletins)
        .catch(handleAuthFailure);
    };
    window.addEventListener('focus', refreshBulletins);
    document.addEventListener('visibilitychange', refreshBulletins);
    const interval = window.setInterval(refreshBulletins, 15000);
    return () => {
      window.removeEventListener('focus', refreshBulletins);
      document.removeEventListener('visibilitychange', refreshBulletins);
      window.clearInterval(interval);
    };
  }, [token, portal]);

  async function markBulletinRead(id: string) {
    setBulletins((current) =>
      current.map((bulletin) => (bulletin.id === id ? { ...bulletin, isRead: true } : bulletin))
    );
    try {
      await api(`/employee/bulletins/${id}/read`, token, { method: 'POST' });
    } catch (error) {
      const refreshed = await api<Bulletin[]>('/employee/bulletins', token);
      setBulletins(refreshed);
      handleAuthFailure(error);
    }
  }

  async function markAllBulletinsRead() {
    setBulletins((current) => current.map((bulletin) => ({ ...bulletin, isRead: true })));
    try {
      await api('/employee/bulletins/read-all', token, { method: 'POST' });
    } catch (error) {
      const refreshed = await api<Bulletin[]>('/employee/bulletins', token);
      setBulletins(refreshed);
      handleAuthFailure(error);
    }
  }

  useEffect(() => {
    if (!token || portal !== 'employee') return;
    const refreshPayStatements = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ statements: PayStatement[] }>('/employee/pay-statements', token)
        .then((pay) => setPayStatements(pay.statements))
        .catch(handleAuthFailure);
    };
    window.addEventListener('focus', refreshPayStatements);
    document.addEventListener('visibilitychange', refreshPayStatements);
    const interval = window.setInterval(refreshPayStatements, 30000);
    return () => {
      window.removeEventListener('focus', refreshPayStatements);
      document.removeEventListener('visibilitychange', refreshPayStatements);
      window.clearInterval(interval);
    };
  }, [token, portal]);

  function handleLogin(
    nextToken: string,
    nextPortal: Portal,
    nextEmployerCompanies?: EmployerCompanyChoice[]
  ) {
    setToken(nextToken);
    setPortal(nextPortal);
    if (nextEmployerCompanies) setEmployerCompanies(nextEmployerCompanies);
    setLoadError('');
  }

  async function switchEmployerCompany(companyId: string) {
    const result = await api<{ token: string; company: EmployerCompanyChoice }>(
      '/employer/companies/switch',
      token,
      { method: 'POST', body: JSON.stringify({ companyId }) }
    );
    localStorage.setItem('payhours-token', result.token);
    setToken(result.token);
    setEmployerDashboard(undefined);
  }

  function logout() {
    localStorage.removeItem('payhours-token');
    setToken('');
    setEmployerDashboard(undefined);
    setProfile(undefined);
    setCompanies([]);
    setPayStatements([]);
    setSelectedPayStatementId(undefined);
    setForms([]);
    setBulletins([]);
    setPage('home');
    setPageHistory([]);
    setLoadError('');
  }

  function navigateEmployee(nextPage: Page) {
    if (nextPage === page) return;
    setPageHistory((history) => [...history, page]);
    setPage(nextPage);
  }

  function backEmployee() {
    const previous = pageHistory[pageHistory.length - 1] || 'home';
    setPageHistory((history) => history.slice(0, -1));
    setPage(previous);
  }

  const screen = useMemo(() => {
    if (loadError) return <section className="panel error">{loadError}</section>;
    if (page === 'home')
      return (
        <Home
          setPage={navigateEmployee}
          profile={profile}
          payStatements={payStatements}
          lang={lang}
          t={t}
        />
      );
    if (page === 'pay')
      return (
        <Pay
          setPage={navigateEmployee}
          onSelect={setSelectedPayStatementId}
          token={token}
          payStatements={payStatements}
          lang={lang}
          t={t}
        />
      );
    if (page === 'payDetail')
      return (
        <PayDetail
          token={token}
          payStatements={payStatements}
          selectedId={selectedPayStatementId}
          onSelect={setSelectedPayStatementId}
          employee={profile}
          lang={lang}
          t={t}
        />
      );
    if (page === 'documents')
      return <Documents setPage={navigateEmployee} token={token} forms={forms} t={t} />;
    if (page === 'taxForms') return <TaxForms token={token} forms={forms} t={t} />;
    if (page === 'help') return <Help token={token} />;
    if (page === 'notifications')
      return (
        <Notifications
          bulletins={bulletins}
          lang={lang}
          t={t}
          onRead={markBulletinRead}
          onReadAll={markAllBulletinsRead}
        />
      );
    return <Profile profile={profile} t={t} />;
  }, [
    bulletins,
    forms,
    lang,
    loadError,
    page,
    payStatements,
    profile,
    selectedPayStatementId,
    token
  ]);

  if (isResetPassword) return <ResetPasswordPage />;
  if (!token) {
    const isSuperAdminLogin = ['/payhours-admin', '/super-admin-login'].includes(
      window.location.pathname
    );
    return isSuperAdminLogin ? (
      <SuperAdminLogin onLogin={handleLogin} />
    ) : (
      <Login onLogin={handleLogin} lang={lang} setLang={setLang} t={t} />
    );
  }
  if (portal === 'super-admin')
    return loadError ? (
      <section className="panel error">{loadError}</section>
    ) : (
      <SuperAdminDashboard token={token} onLogout={logout} />
    );
  if (portal === 'employer')
    return loadError ? (
      <section className="panel error">{loadError}</section>
    ) : (
      <EmployerDashboard
        data={employerDashboard}
        token={token}
        onLogout={logout}
        companies={employerCompanies}
        onSwitchCompany={switchEmployerCompany}
      />
    );
  return (
    <Shell
      page={page}
      setPage={navigateEmployee}
      onBack={backEmployee}
      companies={companies}
      current={profile}
      bulletins={bulletins}
      unreadNotificationCount={bulletins.filter((bulletin) => !bulletin.isRead).length}
      lang={lang}
      setLang={setLang}
      onLogout={logout}
      t={t}
    >
      {screen}
    </Shell>
  );
}
