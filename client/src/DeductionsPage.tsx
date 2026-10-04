import { useEffect, useMemo, useState } from 'react';

type Line = { code: string; description: string; type: 'Statutory' | 'Voluntary'; amount: string };
type RecordItem = {
  id: string; employeeId: string; employeeNumber: string; employeeName: string;
  employmentType: string; jobTitle?: string; deductionStartDate?: string;
  startDate?: string; periodStart?: string; periodEnd?: string;
  payDate: string; total: string; statutory: string; voluntary: string; lines: Line[];
};
type StatutoryType = {
  code: 'FTAX' | 'PTAX' | 'CPP' | 'EI';
  displayCode: string;
  name: string;
  calculationMethod: string;
  category: string;
  description: string;
};
type ProvinceCode = 'AB' | 'BC' | 'MB' | 'SK' | 'ON';
type DeductionSettings = Record<string, { calculationMethod?: string; province?: ProvinceCode }>;
type CustomDeductionType = { id: string; code: string; name: string; description: string; provinces: string[]; calculationMethod: 'fixed' | 'percentage'; value: string; status: 'active' | 'inactive' };
const provinces: Array<{ code: ProvinceCode; name: string; detail: string }> = [
  { code: 'AB', name: 'Alberta', detail: 'Alberta brackets and TD1AB claim' },
  { code: 'BC', name: 'British Columbia', detail: 'British Columbia brackets and TD1BC claim' },
  { code: 'MB', name: 'Manitoba', detail: 'Manitoba brackets and TD1MB claim' },
  { code: 'SK', name: 'Saskatchewan', detail: 'Saskatchewan brackets and TD1SK claim' },
  { code: 'ON', name: 'Ontario', detail: 'Ontario brackets, surtax, health premium and TD1ON claim' }
];
const statutoryTypes: StatutoryType[] = [
  { code: 'FTAX', displayCode: 'FEDTAX', name: 'Income Tax (Federal)', calculationMethod: 'CRA Tax Tables', category: 'Federal Income Tax', description: "Federal income tax calculated using CRA tax tables based on employee income, TD1 and pay frequency." },
  { code: 'PTAX', displayCode: 'PROVTAX', name: 'Income Tax (Provincial)', calculationMethod: 'CRA Tax Tables', category: 'Provincial Income Tax', description: 'Provincial income tax calculated using the province of employment, taxable income and provincial TD1 claim.' },
  { code: 'CPP', displayCode: 'CPP', name: 'CPP (Employee)', calculationMethod: 'CRA Rules', category: 'Canada Pension Plan', description: 'CPP contribution calculated from pensionable earnings, the basic exemption and annual YTD limits.' },
  { code: 'EI', displayCode: 'EI', name: 'EI (Employee)', calculationMethod: 'CRA Rules', category: 'Employment Insurance', description: 'EI premium calculated from insurable earnings and the annual YTD employee premium limit.' }
];
const money = (value: string | number) => `$${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded';
const periodKey = (item: RecordItem) => `${item.periodStart || ''}|${item.periodEnd || ''}`;
const amountFor = (item: RecordItem, codes: string[]) => money(
  item.lines.filter((line) => codes.includes(line.code)).reduce((total, line) => total + Number(line.amount), 0)
);
const incomeTaxAmountFor = (item: RecordItem, code: 'FTAX' | 'PTAX') => money(
  item.lines
    .filter((line) => line.code === code)
    .reduce((total, line) => total + Number(line.amount), 0)
);

function DeductionPreview({ item, history, tab, onTabChange, onClose, onEditEmployee }: {
  item: RecordItem;
  history: RecordItem[];
  tab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;
  onEditEmployee?: (employeeId: string) => void;
}) {
  const otherCount = item.lines.filter((line) => ['PRE', 'POST'].includes(line.code)).length;
  return <aside className="deductions-detail">
    <header className="deductions-detail-header">
      <span className="avatar-sm">{item.employeeName.charAt(0)}</span>
      <div><b>{item.employeeName}</b><small>{[item.employmentType !== 'Not recorded' ? item.employmentType : '', item.jobTitle].filter(Boolean).join(' | ') || item.employeeNumber}</small></div>
      <button type="button" className="deductions-close" title="Close preview" aria-label="Close preview" onClick={onClose}>×</button>
    </header>
    <nav aria-label="Employee deduction details">{['Current Deductions', 'Deduction History', 'Employee Details'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => onTabChange(name)}>{name}</button>)}</nav>
    {tab === 'Current Deductions' ? <>
      <p className="deductions-period"><span aria-hidden="true">ⓘ</span><span>Pay Period: {date(item.periodStart)} - {date(item.periodEnd)}<br />Pay Date: {date(item.payDate)}</span></p>
      <h3>Deductions Breakdown</h3>
      <table><thead><tr><th>Deduction Type</th><th>Type</th><th>Amount</th></tr></thead><tbody>{item.lines.map((line) => <tr key={line.code}><td>{line.description}</td><td>{line.type}</td><td>{money(line.amount)}</td></tr>)}<tr className="deductions-total"><th colSpan={2}>Total Deductions</th><th>{money(item.total)}</th></tr></tbody></table>
      <section className="deductions-settings"><div className="deductions-settings-head"><h3>Deduction Settings</h3>{onEditEmployee && <button type="button" onClick={() => onEditEmployee(item.employeeId)}>Edit</button>}</div><dl><dt>Other Deductions</dt><dd>{otherCount} recorded</dd><dt>Start Date</dt><dd>{date(item.deductionStartDate)}</dd></dl></section>
    </> : tab === 'Deduction History' ? <table><thead><tr><th>Pay Date</th><th>Total</th></tr></thead><tbody>{history.map((record) => <tr key={record.id}><td>{date(record.payDate)}</td><td>{money(record.total)}</td></tr>)}</tbody></table> : <dl><dt>Employee code</dt><dd>{item.employeeNumber}</dd><dt>Employment type</dt><dd>{item.employmentType}</dd><dt>Job title</dt><dd>{item.jobTitle || 'Not recorded'}</dd><dt>Start date</dt><dd>{date(item.startDate)}</dd></dl>}
  </aside>;
}

export default function DeductionsPage({ token, onEditEmployee }: { token: string; onEditEmployee?: (employeeId: string) => void }) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Deduction Types');
  const [typeFilter, setTypeFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState('');
  const [detailTab, setDetailTab] = useState('Current Deductions');
  const [addingType, setAddingType] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState<StatutoryType['code']>('FTAX');
  const [notice, setNotice] = useState('');
  const [configuredCodes, setConfiguredCodes] = useState<string[]>([]);
  const [savingType, setSavingType] = useState(false);
  const [selectedTypeCode, setSelectedTypeCode] = useState<StatutoryType['code']>('FTAX');
  const [typeSearch, setTypeSearch] = useState('');
  const [typeStatus, setTypeStatus] = useState('');
  const [deductionSettings, setDeductionSettings] = useState<DeductionSettings>({});
  const [province, setProvince] = useState<ProvinceCode>('AB');
  const [editingType, setEditingType] = useState(false);
  const [customTypes, setCustomTypes] = useState<CustomDeductionType[]>([]);
  const [openTypeMenu, setOpenTypeMenu] = useState<StatutoryType['code'] | ''>('');
  const [employeeCodeFilter, setEmployeeCodeFilter] = useState<StatutoryType['code'] | ''>('');

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    fetch(`${apiBase}/employer/deductions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load deductions');
        return response.json() as Promise<{ records: RecordItem[]; employeeCount: number; configuredStatutoryDeductions: string[]; statutoryDeductionSettings: DeductionSettings; defaultProvince: ProvinceCode; customDeductionTypes: CustomDeductionType[] }>;
      })
      .then((result) => { setRecords(result.records); setEmployeeCount(result.employeeCount); setConfiguredCodes(result.configuredStatutoryDeductions || []); setDeductionSettings(result.statutoryDeductionSettings || {}); setCustomTypes(result.customDeductionTypes || []); setProvince(result.defaultProvince || 'AB'); setSelectedId(result.records[0]?.id || ''); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load deductions'));
  }, [token]);

  const periods = useMemo(() => Array.from(new Set(records.map(periodKey))), [records]);
  const currentPeriod = periods[0] || '';
  const currentRecords = records.filter((item) => periodKey(item) === currentPeriod);
  const activeEmployees = new Set(currentRecords.filter((item) => Number(item.total) > 0).map((item) => item.employeeId)).size;
  const total = currentRecords.reduce((sum, item) => sum + Number(item.total), 0);
  const activeCodes = new Set(currentRecords.flatMap((item) => item.lines.map((line) => line.code)));
  const filtered = records.filter((item) =>
    (tab === 'Deduction History' || periodKey(item) === (periodFilter || currentPeriod)) &&
    (!typeFilter || item.lines.some((line) => line.type === typeFilter)) &&
    (!employeeCodeFilter || item.lines.some((line) => line.code === employeeCodeFilter || (employeeCodeFilter === 'CPP' && line.code === 'CPP2'))) &&
    item.employeeName.toLowerCase().includes(search.toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const actualPage = Math.min(page, pages);
  const visible = filtered.slice((actualPage - 1) * pageSize, actualPage * pageSize);
  const selected = selectedId === '__closed__' ? undefined : filtered.find((item) => item.id === selectedId) || visible[0];
  const history = records.filter((item) => item.employeeId === selected?.employeeId);
  const selectedStatutoryType = statutoryTypes.find((item) => item.code === newTypeCode)!;
  const selectedType = statutoryTypes.find((item) => item.code === selectedTypeCode) || statutoryTypes[0];
  const typeRows = statutoryTypes.filter((item) =>
    (!typeStatus || (typeStatus === 'Active' ? configuredCodes.includes(item.code) || activeCodes.has(item.code) : !configuredCodes.includes(item.code) && !activeCodes.has(item.code))) &&
    `${item.name} ${item.displayCode} ${item.description}`.toLowerCase().includes(typeSearch.toLowerCase())
  );
  const usedBy = (code: StatutoryType['code']) => new Set(currentRecords.filter((item) => item.lines.some((line) => line.code === code || (code === 'CPP' && line.code === 'CPP2'))).map((item) => item.employeeId)).size;
  const showEmployeesUsing = (code: StatutoryType['code']) => {
    setEmployeeCodeFilter(code);
    setTab('Employee Deductions');
    setSearch('');
    setPeriodFilter('');
    setPage(1);
    setOpenTypeMenu('');
  };
  const editStatutoryType = (code: StatutoryType['code']) => {
    setNewTypeCode(code);
    setProvince(deductionSettings[code]?.province || province);
    setEditingType(true);
    setAddingType(true);
  };
  const saveStatutoryType = async () => {
    setSavingType(true);
    setError('');
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBase}/employer/deduction-types`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newTypeCode, ...(newTypeCode === 'PTAX' ? { province } : {}) })
      });
      const result = await response.json() as { configuredStatutoryDeductions?: string[]; statutoryDeductionSettings?: DeductionSettings; message?: string };
      if (!response.ok) throw new Error(result.message || 'Could not save deduction type');
      setConfiguredCodes(result.configuredStatutoryDeductions || []);
      setDeductionSettings(result.statutoryDeductionSettings || {});
      setNotice(`${selectedStatutoryType.name} was ${editingType ? 'updated' : 'added'}${newTypeCode === 'PTAX' ? ` for ${provinces.find((item) => item.code === province)?.name}` : ''}.`);
      setAddingType(false);
      setEditingType(false);
      setTab('Deduction Types');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save deduction type');
    } finally {
      setSavingType(false);
    }
  };

  if (addingType) return <section className="module-page deductions-page deduction-type-form-page">
    <header className="deductions-title deduction-form-title"><p>Deductions <b>›</b> Deduction Types <b>›</b> {editingType ? 'Edit' : 'Add'} Deduction Type</p><h1>{editingType ? 'Edit' : 'Add'} Deduction Type</h1><span>{editingType ? 'Update the statutory deduction calculation settings.' : 'Create a new statutory deduction type to use in payroll.'}</span></header>
    {error && <p className="success-note" role="alert">{error}</p>}
    <form className="deduction-type-form" onSubmit={(event) => { event.preventDefault(); void saveStatutoryType(); }}>
      <div className="deduction-form-sections">
        <section><h2>Basic Information</h2><div className="deduction-type-fields"><label>Deduction Name *<select value={newTypeCode} disabled={editingType} onChange={(event) => setNewTypeCode(event.target.value as StatutoryType['code'])}>{statutoryTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Deduction Code *<input value={selectedStatutoryType.displayCode} readOnly /><small>Short code used for reports and paystubs</small></label><label>Type *<input value="Statutory" readOnly /></label><label>Category *<input value={selectedStatutoryType.category} readOnly /></label></div></section>
        <section><h2>Calculation Settings</h2><div className="deduction-type-fields"><label>Calculation Method *<input value={selectedStatutoryType.calculationMethod} readOnly /></label><label>Default Amount *<input value="Automatic" readOnly /></label>{newTypeCode === 'PTAX' && <label>Province of Employment *<select value={province} onChange={(event) => setProvince(event.target.value as ProvinceCode)}>{provinces.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select><small>{provinces.find((item) => item.code === province)?.detail}</small></label>}</div><p className="deduction-logic-note"><b>Automatic calculation:</b> {selectedStatutoryType.description}{newTypeCode === 'PTAX' ? ` The ${province} tax table is applied using annualized taxable income and the employee's provincial TD1 claim.` : ''}</p></section>
        <section><h2>Applicability</h2><div className="deduction-type-fields"><label>Apply To Employment Type<select defaultValue="All Types"><option>All Types</option><option>Full Time</option><option>Part Time</option></select></label><label>Apply To Pay Frequency<select defaultValue="All Pay Frequencies"><option>All Pay Frequencies</option><option>Weekly</option><option>Biweekly</option><option>Monthly</option></select></label><label>Apply To Employees<select defaultValue="All Employees"><option>All Employees</option></select></label><label className="deduction-checkbox"><input type="checkbox" defaultChecked /> Set as Default for New Employees</label></div></section>
        <section><h2>Payroll &amp; Reporting</h2><div className="deduction-type-fields"><label className="deduction-checkbox"><input type="checkbox" defaultChecked /> Show on Employee Paystub</label><label className="deduction-checkbox"><input type="checkbox" defaultChecked /> Include in CRA Reports</label></div><label>Description<textarea value={selectedStatutoryType.description} readOnly /></label></section>
      </div>
      <aside className="deduction-form-aside"><section><h2>Preview</h2><div className="deduction-paystub-preview"><b>Employee Paystub Preview</b><span>Deductions</span><p><strong>{selectedStatutoryType.name}</strong><strong>Auto</strong></p><p><strong>Total Deductions</strong><strong>Calculated</strong></p></div></section><section><h2>Important Information</h2><ul><li>Only government-required statutory deductions can be added.</li><li>Amounts use current CRA tax tables and annual limits.</li><li>Calculations use employee TD1 claims and province of employment.</li><li>YTD contributions prevent CPP and EI over-deductions.</li></ul></section></aside>
      <footer><button type="button" onClick={() => { setAddingType(false); setEditingType(false); }}>Cancel</button><button type="submit" disabled={savingType}>{savingType ? 'Saving...' : editingType ? 'Update Deduction Type' : 'Save Deduction Type'}</button></footer>
    </form>
  </section>;

  return <section className="module-page deductions-page">
    <header className="deductions-title deductions-page-title"><div><h1>{tab === 'Deduction Types' ? 'Deduction Types' : 'Deductions'}</h1><p>{tab === 'Deduction Types' ? 'View deduction types managed by the Payhours super administrator.' : 'Review statutory payroll deductions and historical amounts.'}</p></div></header>
    {error && <p className="success-note" role="alert">{error}</p>}
    {notice && <p className="success-note" role="status">{notice}</p>}
    {tab === 'Deduction Types' ? <div className="deductions-metrics deduction-type-metrics">
      <article><span>▤</span><div><small>Total Deduction Types</small><strong>{statutoryTypes.length}</strong><small>4 Statutory</small></div></article>
      <article><span>✓</span><div><small>Active Types</small><strong>{statutoryTypes.filter((item) => configuredCodes.includes(item.code) || activeCodes.has(item.code)).length}</strong><small>System managed</small></div></article>
      <article><span>◷</span><div><small>Used in Payroll</small><strong>{statutoryTypes.filter((item) => usedBy(item.code) > 0).length}</strong><small>{statutoryTypes.filter((item) => usedBy(item.code) === 0).length} not in use</small></div></article>
      <article><span>♙</span><div><small>Employees with Deductions</small><strong>{activeEmployees}</strong><small>{employeeCount ? Math.round(activeEmployees / employeeCount * 100) : 0}% of employees</small></div></article>
    </div> : <div className="deductions-metrics">
      <article><span>▤</span><div><small>Total Deductions</small><strong>{money(total)}</strong><small>{currentRecords[0] ? date(currentRecords[0].payDate) : 'No pay period'}</small></div></article>
      <article><span>♙</span><div><small>Employees with Deductions</small><strong>{activeEmployees} / {employeeCount}</strong><small>{employeeCount ? Math.round(activeEmployees / employeeCount * 100) : 0}% of employees</small></div></article>
      <article><span>$</span><div><small>Average Deductions (Per Employee)</small><strong>{money(activeEmployees ? total / activeEmployees : 0)}</strong></div></article>
      <article><span>◴</span><div><small>Active Deduction Types</small><strong>{statutoryTypes.filter((line) => activeCodes.has(line.code)).length}</strong><small>Statutory deductions only</small></div></article>
    </div>}
    <nav className="deductions-tabs" aria-label="Deduction views">{['Employee Deductions', 'Deduction Types', 'Deduction History'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setEmployeeCodeFilter(''); setOpenTypeMenu(''); setPage(1); }}>{name}</button>)}</nav>
    {tab === 'Deduction Types' ? <section className="deduction-types-view">
      <nav className="deduction-type-tabs"><button className="active">All Deduction Types</button><button>Statutory Deductions</button></nav>
      {customTypes.length > 0 && <section className="assigned-deduction-types"><header><h2>Employer Custom Deductions</h2><p>Assigned and managed by the Payhours super administrator.</p></header><table><thead><tr><th>Name</th><th>Code</th><th>Provinces</th><th>Calculation</th><th>Status</th></tr></thead><tbody>{customTypes.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.description}</small></td><td>{item.code}</td><td>{item.provinces.join(', ')}</td><td>{item.calculationMethod === 'percentage' ? `${item.value}% of gross pay` : money(item.value)}</td><td><span className={`status ${item.status === 'active' ? 'paid' : 'draft'}`}>{item.status}</span></td></tr>)}</tbody></table></section>}
      <div className="deduction-type-filters"><label>Type<select><option>All Types</option><option>Statutory</option></select></label><label>Status<select value={typeStatus} onChange={(event) => setTypeStatus(event.target.value)}><option value="">All Statuses</option><option>Active</option><option>Inactive</option></select></label><label>Search<input placeholder="Search by name, code or description..." value={typeSearch} onChange={(event) => setTypeSearch(event.target.value)} /></label><button type="button" onClick={() => { setTypeStatus(''); setTypeSearch(''); }}>Clear Filters</button></div>
      <div className="deduction-type-layout">
        <div className="deduction-type-table"><table><thead><tr><th>#</th><th>Deduction Name</th><th>Code</th><th>Type</th><th>Calculation Method</th><th>Default Amount</th><th>Status</th><th>Used By</th><th>Actions</th></tr></thead><tbody>{typeRows.map((item, index) => <tr key={item.code} className={selectedType.code === item.code ? 'selected' : ''}><td>{index + 1}</td><td><b>{item.name}</b></td><td>{item.displayCode}</td><td><span className="type-pill">Statutory</span></td><td>{item.calculationMethod}</td><td>Auto</td><td><span className="status paid">Active</span></td><td>{usedBy(item.code)}</td><td className="deduction-type-actions"><button type="button" title={`Actions for ${item.name}`} aria-label={`Actions for ${item.name}`} aria-expanded={openTypeMenu === item.code} onClick={() => { setSelectedTypeCode(item.code); setOpenTypeMenu(openTypeMenu === item.code ? '' : item.code); }}>•••</button>{openTypeMenu === item.code && <div className="deduction-type-menu"><button type="button" onClick={() => { setSelectedTypeCode(item.code); setOpenTypeMenu(''); }}>View details</button><button type="button" onClick={() => showEmployeesUsing(item.code)}>View employees ({usedBy(item.code)})</button></div>}</td></tr>)}</tbody></table></div>
        <aside className="deduction-type-detail">
          <header><span>GOV</span><div><h2>{selectedType.name}</h2><p>{selectedType.displayCode} · Statutory Deduction</p></div></header>
          <nav><b>Details</b><span>Used By ({usedBy(selectedType.code)})</span></nav>
          <dl><dt>Name</dt><dd>{selectedType.name}</dd><dt>Code</dt><dd>{selectedType.displayCode}</dd><dt>Type</dt><dd><span className="type-pill">Statutory</span></dd><dt>Calculation Method</dt><dd>{selectedType.calculationMethod}</dd><dt>Default Amount</dt><dd>Automatic (Based on employee income)</dd>{selectedType.code === 'PTAX' && <><dt>Province</dt><dd>{provinces.find((item) => item.code === deductionSettings.PTAX?.province)?.name || 'Employee province'}</dd></>}<dt>Status</dt><dd><span className="status paid">Active</span></dd><dt>Description</dt><dd>{selectedType.description}</dd><dt>Last Updated</dt><dd>Current CRA configuration</dd></dl>
          <footer><span className="locked-setting">Managed by Super Admin</span></footer>
        </aside>
      </div>
      <footer className="deductions-pagination"><span>Showing 1 - {typeRows.length} of {typeRows.length} deduction types</span><div><button disabled>‹</button><span>1</span><button disabled>›</button><select><option>10 / page</option></select></div></footer>
    </section> : <>
      {employeeCodeFilter && <div className="deduction-active-filter"><span>Showing employees using <b>{statutoryTypes.find((item) => item.code === employeeCodeFilter)?.name}</b></span><button type="button" onClick={() => setEmployeeCodeFilter('')}>Clear</button></div>}
      <div className="deductions-filters">
        <label>Deduction Type<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="">All Types</option><option>Statutory</option></select></label>
        {tab !== 'Deduction History' && <label>Pay Period<select value={periodFilter || currentPeriod} onChange={(event) => { setPeriodFilter(event.target.value); setPage(1); }}>{periods.map((period) => <option key={period} value={period}>{period.split('|').map(date).join(' - ')}</option>)}</select></label>}
        <label>Search<input aria-label="Search by employee name" placeholder="Search by employee name..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
        <button onClick={() => { setTypeFilter(''); setPeriodFilter(''); setSearch(''); setPage(1); }}>Clear Filters</button>
      </div>
      <div className="deductions-layout">
        <div className="deductions-table-wrap"><table><thead><tr><th>#</th><th>Employee</th><th>Total Deductions</th><th>CPP</th><th>EI</th><th>Income Tax (Fed)</th><th>Income Tax (Prov)</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((item, index) => <tr key={item.id} className={selected?.id === item.id ? 'selected' : ''}><td>{(actualPage - 1) * pageSize + index + 1}</td><td><span className="avatar-sm">{item.employeeName.charAt(0)}</span><span><b>{item.employeeName}</b><small>{item.employeeNumber}</small></span></td><td>{money(item.total)}</td><td>{amountFor(item, ['CPP', 'CPP2'])}</td><td>{amountFor(item, ['EI'])}</td><td>{incomeTaxAmountFor(item, 'FTAX')}</td><td>{incomeTaxAmountFor(item, 'PTAX')}</td><td><span className="status paid">Recorded</span></td><td><button onClick={() => { setSelectedId(item.id); setDetailTab('Current Deductions'); }}>View</button></td></tr>)}{!visible.length && <tr><td colSpan={9}>No deduction records found.</td></tr>}</tbody></table></div>
        {selected && <DeductionPreview item={selected} history={history} tab={detailTab} onTabChange={setDetailTab} onClose={() => setSelectedId('__closed__')} onEditEmployee={onEditEmployee} />}
      </div>
      <footer className="deductions-pagination"><span>Showing {filtered.length ? (actualPage - 1) * pageSize + 1 : 0} - {Math.min(actualPage * pageSize, filtered.length)} of {filtered.length} records</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span>{actualPage} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button><select aria-label="Records per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select></div></footer>
    </>}
  </section>;
}
