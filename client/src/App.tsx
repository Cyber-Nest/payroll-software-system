import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';

type Page = 'home' | 'pay' | 'payDetail' | 'documents' | 'taxForms' | 'profile';
type LoginMode = 'email' | 'customer';
type CompanyChoice = { employeeId: string; companyId: string; companyName: string; customerId: string };
type EmployeeProfile = {
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
  isUnread: boolean;
};
type TaxForm = { id: string; taxYear: number; formType: string };

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const currentYear = new Date().getFullYear();

async function api<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function downloadPdf(path: string, token: string) {
  window.open(`${apiBase}${path}?token=${encodeURIComponent(token)}`, '_blank');
}

function Logo() {
  return <div className="logo" aria-label="Payhours"><span className="logo-mark">p</span><span className="logo-word">Payhours</span></div>;
}

function HiddenAmount({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return <button className="hidden-amount" onMouseEnter={() => setShown(true)} onMouseLeave={() => setShown(false)} onClick={() => setShown((current) => !current)}>{shown ? `$${value}` : 'Hover to view'}</button>;
}

function Footer({ compact = false }: { compact?: boolean }) {
  return <footer className={clsx('footer', compact && 'compact')}>EULA | Privacy | (c) Payhours Inc., {currentYear}</footer>;
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [mode, setMode] = useState<LoginMode>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(localStorage.getItem('payhours-email') || 'anil.suhagiya@example.com');
  const [password, setPassword] = useState('Payhours1!');
  const [customerId, setCustomerId] = useState('A07998');
  const [employeeNumber, setEmployeeNumber] = useState('0006');
  const [error, setError] = useState('');

  async function submit() {
    try {
      setError('');
      const result = mode === 'email'
        ? await api<{ token: string }>('/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) })
        : await api<{ token: string }>('/auth/login-customer-id', undefined, { method: 'POST', body: JSON.stringify({ customerId, employeeNumber, password }) });
      localStorage.setItem('payhours-token', result.token);
      onLogin(result.token);
    } catch {
      setError('Login failed. Check the seeded credentials or run the seed script.');
    }
  }

  return <main className="login-page"><div className="login-tools"><span>EN</span><button>?</button></div><div className="login-wrap"><Logo /><section className="login-card"><h1>{mode === 'email' ? 'Log in with an email address' : 'Log in with Customer ID'}</h1>{mode === 'email' ? <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label> : <><label>Customer ID<input value={customerId} onChange={(event) => setCustomerId(event.target.value)} /></label><label>Employee Number<input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} /></label></>}<div className="field-row"><span>Password</span><a href="#forgot">Forgot your password?</a></div><label className="password-input"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} /><button type="button" onClick={() => setShowPassword((value) => !value)}>View</button></label><label className="check"><input type="checkbox" onChange={(event) => event.target.checked && localStorage.setItem('payhours-email', email)} />Remember email</label>{error && <p className="error">{error}</p>}<button className="primary" onClick={submit}>Log in</button><div className="divider"><span>OR</span></div><button className="secondary" onClick={() => setMode(mode === 'email' ? 'customer' : 'email')}>{mode === 'email' ? 'Log in with Customer ID' : 'Log in with an email address'}</button></section></div><Footer compact /></main>;
}

function Shell({ children, page, setPage, companies, current }: { children: React.ReactNode; page: Page; setPage: (page: Page) => void; companies: CompanyChoice[]; current?: EmployeeProfile }) {
  const [collapsed, setCollapsed] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const company = current?.company;
  const nav = [['home', 'Home'], ['pay', 'Pay'], ['documents', 'Documents'], ['profile', 'Profile']] as const;
  return <div className="app-shell"><aside className={clsx('sidebar', collapsed && 'collapsed')}><Logo />{nav.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><span>{label.charAt(0)}</span>{!collapsed && label}</button>)}<button className="collapse" onClick={() => setCollapsed((value) => !value)}>{collapsed ? '>' : '< Collapse'}</button></aside><div className="app-main"><header className="topbar"><button title="Notifications">Bell</button><button title="Help">?</button><span>EN</span><button className="company-pill" onClick={() => setSwitcher((value) => !value)}>{(company?.legalName || 'Company').slice(0, 13)}... v</button><button title="Logout" onClick={() => localStorage.removeItem('payhours-token')}>Logout</button>{switcher && <div className="switcher"><strong>{company?.legalName} - {company?.customerId} | Logged into personal account</strong><h3>Start using the new email login</h3><p>Email login</p><p>Account switcher - Navigate between multiple accounts</p><a onClick={() => setPage('profile')}>Get started</a>{companies.map((choice) => <button key={choice.employeeId}>{choice.companyName} - {choice.customerId}</button>)}</div>}</header><main className="content">{children}</main><Footer /></div></div>;
}

function Home({ setPage, profile, payStatements }: { setPage: (page: Page) => void; profile?: EmployeeProfile; payStatements: PayStatement[] }) {
  const latest = payStatements[0];
  return <div className="grid-home"><section className="hello-card"><p>Hello, <em>{profile?.legalFirstName || 'Employee'}</em></p><h1>{profile?.legalFirstName} {profile?.legalLastName}</h1></section><button className="tile" onClick={() => setPage('profile')}><span>Person</span><b>Profile</b></button><button className="tile pay-tile" onClick={() => setPage('payDetail')} disabled={!latest}><span>{latest?.isUnread && <i>*</i>}Mail</span><b>Last Pay: {latest ? formatDate(latest.payDate) : 'No pay statements'}</b></button><button className="tile" onClick={() => setPage('taxForms')}><span>Doc</span><b>Tax Forms</b></button><section className="bulletins"><h2>Company Bulletins</h2><p>There are no bulletins at this time.</p></section></div>;
}

function Toolbar({ title }: { title: string }) {
  return <div className="toolbar"><h1>{title}</h1><label>Select Year<select><option>2024</option></select></label><button>...</button></div>;
}

function Pay({ setPage, token, payStatements }: { setPage: (page: Page) => void; token: string; payStatements: PayStatement[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <section className="panel"><Toolbar title="PAY STATEMENTS" /><button className="download-selected" disabled={!selected.length} onClick={() => selected.forEach((id) => downloadPdf(`/employee/pay-statements/${id}/download`, token))}>Download Selected</button><table><thead><tr><th><input type="checkbox" checked={selected.length === payStatements.length && payStatements.length > 0} onChange={(event) => setSelected(event.target.checked ? payStatements.map((p) => p.id) : [])} /></th><th>Pay Date</th><th>Pay Period</th><th>Type</th><th>Net Pay</th><th /></tr></thead><tbody>{payStatements.map((p) => <tr key={p.id}><td><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected(selected.includes(p.id) ? selected.filter((id) => id !== p.id) : [...selected, p.id])} /></td><td><a onClick={() => setPage('payDetail')}>{formatDate(p.payDate)}</a></td><td>{p.payPeriodNumber}</td><td>{p.type}</td><td><HiddenAmount value={p.netPay} /></td><td><button onClick={() => downloadPdf(`/employee/pay-statements/${p.id}/download`, token)}>Download PDF</button><button onClick={() => setPage('payDetail')}>›</button></td></tr>)}</tbody></table></section>;
}

function PayDetail({ token, payStatements }: { token: string; payStatements: PayStatement[] }) {
  const [open, setOpen] = useState('Gross Earnings');
  const latest = payStatements[0];
  if (!latest) return <section className="panel">No pay statement data found in the database.</section>;
  return <section className="panel detail"><div className="toolbar"><h1>&lt; PAY STATEMENT</h1><button onClick={() => downloadPdf(`/employee/pay-statements/${latest.id}/download`, token)}>Download PDF</button><button>...</button></div><div className="detail-head"><label>PAY DATE:<select defaultValue={latest.id}>{payStatements.map((p) => <option key={p.id} value={p.id}>{formatDate(p.payDate)}</option>)}</select></label><div><b>NET PAY</b><HiddenAmount value={latest.netPay} /></div><div><b>YEAR TO DATE</b><HiddenAmount value={latest.yearToDateNetPay} /></div></div>{['Gross Earnings', 'Deductions', 'Additional Statement Information'].map((name) => <section className="accordion" key={name}><button onClick={() => setOpen(open === name ? '' : name)}>{open === name ? 'v' : '>'} {name}</button>{open === name && <div>{name === 'Gross Earnings' && latest.grossEarnings.map((line) => <p key={line.code}>{line.code} {line.description}<HiddenAmount value={line.amount} /></p>)}{name === 'Deductions' && latest.deductions.map((line) => <p key={line.code}>{line.code} {line.description}<HiddenAmount value={line.amount} /></p>)}{name.includes('Additional') && latest.additionalInfo.map((line) => <p key={line.key}>{line.key}: {line.value}</p>)}</div>}</section>)}</section>;
}

function Documents({ setPage, token, forms }: { setPage: (page: Page) => void; token: string; forms: TaxForm[] }) {
  return <div className="documents"><aside><b>Documents</b><button onClick={() => setPage('taxForms')}>&gt; Tax forms</button></aside><TaxForms token={token} forms={forms} /></div>;
}

function TaxForms({ token, forms }: { token: string; forms: TaxForm[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <section className="panel"><Toolbar title="TAX FORMS" /><button className="download-selected" disabled={!selected.length} onClick={() => selected.forEach((id) => downloadPdf(`/employee/tax-forms/${id}/download`, token))}>Download Selected</button><table><thead><tr><th><input type="checkbox" checked={selected.length === forms.length && forms.length > 0} onChange={(event) => setSelected(event.target.checked ? forms.map((f) => f.id) : [])} /></th><th>Tax Form Type</th><th>Tax Year</th><th /></tr></thead><tbody>{forms.map((form) => <tr key={form.id}><td><input type="checkbox" checked={selected.includes(form.id)} onChange={() => setSelected(selected.includes(form.id) ? [] : [form.id])} /></td><td>{form.formType}</td><td>{form.taxYear}</td><td><button onClick={() => downloadPdf(`/employee/tax-forms/${form.id}/download`, token)}>Download PDF</button><button>›</button></td></tr>)}</tbody></table></section>;
}

function Profile({ profile }: { profile?: EmployeeProfile }) {
  const [changed, setChanged] = useState(false);
  const sections = ['Personal Information', 'Emergency Contacts', 'Employee Information', 'Login Information', 'Two-Factor Authentication'];
  const [open, setOpen] = useState('');
  return <section className="panel profile"><div className="toolbar"><h1>PROFILE</h1><button onClick={() => setChanged(false)}>RESET</button><button disabled={!changed}>SAVE</button></div>{sections.map((section) => <section className="accordion" key={section}><button onClick={() => setOpen(open === section ? '' : section)}>{open === section ? 'v' : '>'} {section}</button>{open === section && <ProfileSection name={section} profile={profile} onChange={() => setChanged(true)} />}</section>)}</section>;
}

function ProfileSection({ name, profile, onChange }: { name: string; profile?: EmployeeProfile; onChange: () => void }) {
  const address = profile?.addresses?.[0];
  if (name === 'Login Information') return <div className="form-grid"><label>Username<input readOnly value={profile?.employeeNumber || ''} /></label><label>Current Password<input type="password" /></label><div className="helper">A strong password must contain: Seven characters. Must have (3) of the following (4): One uppercase letter / At least one lowercase letter / One number / One symbol [!@#$%^&*()_+]. Must NOT contain: Single or double quotes / Your username / The left angle-bracket character ("&lt;") / The pipe character (|)</div><label>New Password<input type="password" /></label><label>Confirm New Password<input type="password" /></label></div>;
  if (name === 'Two-Factor Authentication') return <div><label className="check"><input type="checkbox" onChange={onChange} />Enable two-factor authentication</label><div className="qr">QR</div></div>;
  if (name === 'Employee Information') return <div className="form-grid"><label>Employee Number<input readOnly value={profile?.employeeNumber || ''} /></label><label>Occupation<input readOnly value={profile?.occupation || ''} /></label><label>Start Date<input readOnly value={profile?.startDate?.slice(0, 10) || ''} /></label><label>Seniority<input readOnly value={profile?.seniorityDate?.slice(0, 10) || ''} /></label><label>Primary Earning<input readOnly value={profile?.primaryEarningCode || ''} /></label><label>Pay Group<input readOnly value={profile?.payGroup || ''} /></label><label>Tax Province<input readOnly value={profile?.taxProvince || ''} /></label><label>WCB Number<input readOnly value={profile?.wcbNumber || ''} /></label><label>Federal<input readOnly value={`$${profile?.personalTaxCredits?.federalClaimAmount || ''}`} /></label><label>Provincial<input readOnly value={`$${profile?.personalTaxCredits?.provincialClaimAmount || ''}`} /></label></div>;
  return <div className="form-grid"><label>Legal First Name<input defaultValue={profile?.legalFirstName || ''} onChange={onChange} /></label><label>Middle Name<input defaultValue={profile?.middleName || ''} onChange={onChange} /></label><label>Legal Last Name<input defaultValue={profile?.legalLastName || ''} onChange={onChange} /></label><label>SIN<input readOnly value={profile?.sin || ''} /></label><label>Street Address<input defaultValue={address?.street || ''} onChange={onChange} /></label><label>City<input defaultValue={address?.city || ''} onChange={onChange} /></label><label>Province<input defaultValue={address?.province || ''} onChange={onChange} /></label><label>Postal Code<input defaultValue={address?.postalCode || ''} onChange={onChange} /></label></div>;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('payhours-token') || '');
  const [page, setPage] = useState<Page>('home');
  const [profile, setProfile] = useState<EmployeeProfile>();
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [payStatements, setPayStatements] = useState<PayStatement[]>([]);
  const [forms, setForms] = useState<TaxForm[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api<{ employee: EmployeeProfile; companies: CompanyChoice[] }>('/employee/context', token),
      api<{ statements: PayStatement[] }>('/employee/pay-statements?year=2024', token),
      api<{ forms: TaxForm[] }>('/employee/tax-forms?year=2024', token)
    ]).then(([context, pay, tax]) => {
      setProfile(context.employee);
      setCompanies(context.companies);
      setPayStatements(pay.statements);
      setForms(tax.forms);
      setLoadError('');
    }).catch(() => setLoadError('Could not load data from the database. Make sure the server is running and seed data exists.'));
  }, [token]);

  const screen = useMemo(() => {
    if (loadError) return <section className="panel error">{loadError}</section>;
    if (page === 'home') return <Home setPage={setPage} profile={profile} payStatements={payStatements} />;
    if (page === 'pay') return <Pay setPage={setPage} token={token} payStatements={payStatements} />;
    if (page === 'payDetail') return <PayDetail token={token} payStatements={payStatements} />;
    if (page === 'documents') return <Documents setPage={setPage} token={token} forms={forms} />;
    if (page === 'taxForms') return <TaxForms token={token} forms={forms} />;
    return <Profile profile={profile} />;
  }, [forms, loadError, page, payStatements, profile, token]);

  if (!token) return <Login onLogin={setToken} />;
  return <Shell page={page} setPage={setPage} companies={companies} current={profile}>{screen}</Shell>;
}
