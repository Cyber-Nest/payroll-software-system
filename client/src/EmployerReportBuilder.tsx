import { useEffect, useState } from 'react';

type Definition = { id?: string; name: string; description: string; source: string; fields: string[]; dateRange: string; fromDate: string; toDate: string; employeeIds: string[] };
type Schedule = { id?: string; name: string; reportId: string; frequency: string; format: string; nextRunAt: string; enabled: boolean; recipients: string[]; lastRunAt?: string; lastError?: string };
type Run = { id: string; reportName: string; status: string; format: string; rowCount: number; filename?: string; createdAt: string; delivery: string; error?: string; deliveryError?: string };
type Options = { fields: Record<string, Record<string, string>>; employees: Array<{ id: string; name: string; employeeNumber: string }>; emailConfigured: boolean };
type Preview = { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string | number>>; totalRows: number };
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const blankReport = (): Definition => ({ name: '', description: '', source: 'employees', fields: ['employeeNumber', 'employeeName', 'department'], dateRange: 'all', fromDate: '', toDate: '', employeeIds: [] });
const blankSchedule = (): Schedule => ({ name: '', reportId: '', frequency: 'monthly', format: 'csv', nextRunAt: new Date(Date.now() + 3600000).toISOString().slice(0, 16), enabled: true, recipients: [] });
const templates = [
  { name: 'Employee Directory', source: 'employees', fields: ['employeeNumber', 'employeeName', 'email', 'department', 'jobTitle'] },
  { name: 'Payroll Register', source: 'payroll', fields: ['employeeNumber', 'employeeName', 'payDate', 'grossPay', 'deductions', 'netPay'] },
  { name: 'Deduction Detail', source: 'deductions', fields: ['employeeNumber', 'employeeName', 'payDate', 'code', 'description', 'amount'] }
];

export default function EmployerReportBuilder({ token, section, action, onCreateReport }: { token: string; section: string; action: string; onCreateReport: () => void }) {
  const scheduled = section === 'Scheduled Reports';
  const [reports, setReports] = useState<Definition[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [options, setOptions] = useState<Options>({ fields: {}, employees: [], emailConfigured: false });
  const [view, setView] = useState(action === 'Delivery History' ? 'history' : action === 'Report Templates' ? 'templates' : action === 'Manage Report Fields' || action === 'Create Custom Report' ? 'report-form' : action === 'Create Schedule' ? 'schedule-form' : 'list');
  const [report, setReport] = useState<Definition>(blankReport);
  const [schedule, setSchedule] = useState<Schedule>(blankSchedule);
  const [recipients, setRecipients] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const [format, setFormat] = useState('csv');
  const [query, setQuery] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [allEmployees, setAllEmployees] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBase}/employer/reports/builder${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Report action failed.'); return data;
  }
  async function load() {
    const [meta, saved, automation, history] = await Promise.all([
      request<Options>('/options'), request<{ reports: Definition[] }>('/definitions'), request<{ schedules: Schedule[] }>('/schedules'), request<{ runs: Run[] }>('/runs')
    ]);
    setOptions(meta); setReports(saved.reports); setSchedules(automation.schedules); setRuns(history.runs);
  }
  useEffect(() => { let current = true; void load().catch((cause: Error) => current && setError(cause.message)).finally(() => current && setLoading(false)); return () => { current = false; }; }, [token]);
  const perform = async (work: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } };
  const reportBody = () => ({ ...report, fromDate: report.dateRange === 'custom' ? report.fromDate : undefined, toDate: report.dateRange === 'custom' ? report.toDate : undefined });
  const editReport = (item?: Definition) => { setReport(item ? { ...blankReport(), ...item } : blankReport()); setAllEmployees(!item?.employeeIds.length); setPreview(undefined); setView('report-form'); setError(''); };
  const update = (next: Partial<Definition>) => { setReport((current) => ({ ...current, ...next })); setPreview(undefined); };
  const editSchedule = (item?: Schedule) => { setSchedule(item ? { ...item, nextRunAt: new Date(item.nextRunAt).toISOString().slice(0, 16) } : { ...blankSchedule(), reportId: reports[0]?.id || '' }); setRecipients(item?.recipients.join(', ') || ''); setView('schedule-form'); setError(''); };
  async function download(run: Run) {
    const response = await fetch(`${apiBase}/employer/reports/builder/runs/${run.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Could not download the generated report.');
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = run.filename || 'report'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const run = (path: string) => perform(async () => { const result = await request<{ run: Run }>(path, { method: 'POST', body: JSON.stringify({ format }) }); await download(result.run); await load(); setNotice(result.run.delivery === 'failed' ? `Report generated; email delivery failed: ${result.run.deliveryError}` : 'Report generated and downloaded.'); });
  const date = (value?: string) => value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '-';
  const visibleReports = reports.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="report-builder">
    <header className="employee-head"><div><h2>{section}</h2><p>{scheduled ? 'Generate saved reports automatically. Reports are retained in run history for download.' : 'Choose your fields and filters, preview results, and save reusable reports.'}</p></div>
      <div className="head-actions"><button disabled={loading || busy} onClick={() => perform(load)}>Refresh</button><button className="run-payroll" disabled={loading || busy} onClick={() => scheduled ? editSchedule() : editReport()}>{scheduled ? 'Create Schedule' : 'Create Custom Report'}</button></div>
    </header>
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
    <nav className="access-tabs"><button onClick={() => setView('list')}>{scheduled ? 'Manage Schedules' : 'Saved Custom Reports'}</button>{!scheduled && <><button onClick={() => setView('templates')}>Report Templates</button><button onClick={() => editReport()}>Manage Report Fields</button></>}<button onClick={() => setView('history')}>{scheduled ? 'Delivery History' : 'Run History'}</button></nav>
    {loading ? <p>Loading saved reports and schedules...</p> : <>
    {view === 'report-form' && <section className="admin-panel"><h3>{report.id ? 'Edit Custom Report' : 'Create Custom Report'}</h3>
      <label>Load saved report to edit fields<select value={report.id || ''} onChange={(event) => editReport(reports.find((item) => item.id === event.target.value))}><option value="">New report</option>{reports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await request(report.id ? `/definitions/${report.id}` : '/definitions', { method: report.id ? 'PUT' : 'POST', body: JSON.stringify(reportBody()) }); await load(); setView('list'); setNotice('Custom report saved.'); }); }}>
        <fieldset disabled={busy}><div className="settings-fields two">
          <label>Report Name<input required minLength={2} maxLength={90} value={report.name} onChange={(event) => update({ name: event.target.value })} /></label>
          <label>Data Source<select value={report.source} onChange={(event) => update({ source: event.target.value, fields: Object.keys(options.fields[event.target.value] || {}).slice(0, 3) })}><option value="employees">Employees</option><option value="payroll">Payroll / Pay Statements</option><option value="deductions">Deductions</option></select></label>
          <label>Description<input maxLength={500} value={report.description} onChange={(event) => update({ description: event.target.value })} /></label>
          <label>{report.source === 'employees' ? 'Start Date Filter' : 'Pay Date Filter'}<select value={report.dateRange} onChange={(event) => update({ dateRange: event.target.value })}><option value="all">All dates</option><option value="last30">Last 30 days</option><option value="year">Year to date</option><option value="custom">Custom range</option></select></label>
          {report.dateRange === 'custom' && <><label>From<input required type="date" value={report.fromDate} onChange={(event) => update({ fromDate: event.target.value })} /></label><label>To<input required type="date" min={report.fromDate} value={report.toDate} onChange={(event) => update({ toDate: event.target.value })} /></label></>}
        </div>
        <h3>Report Fields</h3><div className="report-builder-checks">{Object.entries(options.fields[report.source] || {}).map(([key, label]) => <label key={key}><input type="checkbox" checked={report.fields.includes(key)} onChange={(event) => update({ fields: event.target.checked ? [...report.fields, key] : report.fields.filter((field) => field !== key) })} />{label}</label>)}</div>
        <h3>Employees</h3><label><input type="checkbox" checked={allEmployees} onChange={(event) => { setAllEmployees(event.target.checked); update({ employeeIds: [] }); }} />All employees</label>
        <input placeholder="Search employee name or ID" aria-label="Filter report employees" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
        <div className="deduction-employee-list">{options.employees.filter((employee) => `${employee.name} ${employee.employeeNumber}`.toLowerCase().includes(employeeSearch.toLowerCase())).map((employee) => <label key={employee.id}><input type="checkbox" checked={report.employeeIds.includes(employee.id)} onChange={(event) => { setAllEmployees(false); update({ employeeIds: event.target.checked ? [...report.employeeIds, employee.id] : report.employeeIds.filter((id) => id !== employee.id) }); }} />{employee.name} ({employee.employeeNumber})</label>)}</div>
        {!allEmployees && !report.employeeIds.length && <p>Choose at least one employee.</p>}
        </fieldset><footer className="head-actions"><button type="button" disabled={busy} onClick={() => setView('list')}>Cancel</button><button type="button" disabled={busy || !report.fields.length || (!allEmployees && !report.employeeIds.length)} onClick={() => perform(async () => { setPreview(await request<Preview>('/preview', { method: 'POST', body: JSON.stringify(reportBody()) })); })}>Preview</button><button type="submit" className="run-payroll" disabled={busy || !report.fields.length || (!allEmployees && !report.employeeIds.length)}>Save Report</button></footer>
      </form>
      {preview && <div><h3>Preview: {preview.totalRows} rows (first 100 shown)</h3><div className="settings-table"><table><thead><tr>{preview.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{preview.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>)}</tbody></table></div>{!preview.totalRows && <p>No records match these filters.</p>}</div>}
    </section>}
    {view === 'schedule-form' && <section className="admin-panel"><h3>{schedule.id ? 'Edit Schedule' : 'Create Schedule'}</h3>{!reports.length ? <p>Create a saved custom report first. <button onClick={onCreateReport}>Create Custom Report</button></p> : <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { await request(schedule.id ? `/schedules/${schedule.id}` : '/schedules', { method: schedule.id ? 'PUT' : 'POST', body: JSON.stringify({ ...schedule, reportId: schedule.reportId || reports[0].id, nextRunAt: new Date(`${schedule.nextRunAt}Z`).toISOString(), recipients: recipients.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean) }) }); await load(); setView('list'); setNotice('Schedule saved.'); }); }}>
      <fieldset disabled={busy}><div className="settings-fields two">
        <label>Schedule Name<input required minLength={2} value={schedule.name} onChange={(event) => setSchedule({ ...schedule, name: event.target.value })} /></label>
        <label>Saved Report<select required value={schedule.reportId || reports[0].id} onChange={(event) => setSchedule({ ...schedule, reportId: event.target.value })}>{reports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Frequency<select value={schedule.frequency} onChange={(event) => setSchedule({ ...schedule, frequency: event.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>Next Run (UTC)<input required type="datetime-local" value={schedule.nextRunAt} onChange={(event) => setSchedule({ ...schedule, nextRunAt: event.target.value })} /></label>
        <label>Format<select value={schedule.format} onChange={(event) => setSchedule({ ...schedule, format: event.target.value })}><option value="csv">CSV</option><option value="excel">Excel (.xls)</option><option value="pdf">PDF</option></select></label>
        <label>Optional Email Recipients<input placeholder="Separate email addresses with commas" value={recipients} onChange={(event) => setRecipients(event.target.value)} /></label>
        <label><input type="checkbox" checked={schedule.enabled} onChange={(event) => setSchedule({ ...schedule, enabled: event.target.checked })} />Active schedule</label>
      </div><p>All run times are UTC. Leave email recipients empty for in-app delivery.{!options.emailConfigured && ' Email delivery is not configured.'}</p></fieldset>
      <footer className="head-actions"><button type="button" disabled={busy} onClick={() => setView('list')}>Cancel</button><button type="submit" className="run-payroll" disabled={busy}>Save Schedule</button></footer>
    </form>}</section>}
    {view === 'templates' && <div className="report-grid">{templates.map((template) => <section className="admin-panel" key={template.source}><h3>{template.name}</h3><p>{template.fields.map((key) => options.fields[template.source]?.[key]).join(', ')}</p><button onClick={() => { editReport(); setReport({ ...blankReport(), ...template }); }}>Use Template</button></section>)}</div>}
    {view === 'list' && <section className="admin-panel"><div className="head-actions"><input aria-label="Search saved reports or schedules" placeholder="Search by name" value={query} onChange={(event) => setQuery(event.target.value)} />{!scheduled && <label>Download Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="csv">CSV</option><option value="excel">Excel (.xls)</option><option value="pdf">PDF</option></select></label>}</div>
      <div className="settings-table"><table><thead><tr>{(scheduled ? ['Schedule', 'Report', 'Frequency', 'Next Run (UTC)', 'Status / Last Error', 'Delivery', 'Actions'] : ['Name', 'Source', 'Fields', 'Date Filter', 'Employee Scope', 'Actions']).map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{scheduled ? schedules.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).map((item) => <tr key={item.id}><td>{item.name}</td><td>{reports.find((report) => report.id === item.reportId)?.name || 'Unavailable report'}</td><td>{item.frequency} / {item.format}</td><td>{date(item.nextRunAt)}</td><td>{item.enabled ? 'Active' : 'Paused'}{item.lastError && <p className="field-error">{item.lastError}</p>}</td><td>{item.recipients.length ? item.recipients.join(', ') : 'In-app download'}</td><td><div className="employer-role-actions"><button disabled={busy} onClick={() => editSchedule(item)}>Edit</button><button disabled={busy} onClick={() => perform(async () => { await request(`/schedules/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ enabled: !item.enabled }) }); await load(); })}>{item.enabled ? 'Pause' : 'Resume'}</button><button disabled={busy} onClick={() => run(`/schedules/${item.id}/run`)}>Run Now</button><button disabled={busy} className="danger-button" onClick={() => { if (window.confirm(`Delete schedule "${item.name}"?`)) void perform(async () => { await request(`/schedules/${item.id}`, { method: 'DELETE' }); await load(); }); }}>Delete</button></div></td></tr>) : visibleReports.map((item) => <tr key={item.id}><td>{item.name}<p>{item.description}</p></td><td>{item.source}</td><td>{item.fields.map((key) => options.fields[item.source]?.[key]).join(', ')}</td><td>{item.dateRange === 'custom' ? `${item.fromDate} to ${item.toDate}` : item.dateRange}</td><td>{item.employeeIds.length ? `${item.employeeIds.length} selected` : 'All employees'}</td><td><div className="employer-role-actions"><button disabled={busy} onClick={() => editReport(item)}>View / Edit</button><button disabled={busy} onClick={() => run(`/definitions/${item.id}/run`)}>Run &amp; Download</button><button disabled={busy} className="danger-button" onClick={() => { if (window.confirm(`Delete report "${item.name}"?`)) void perform(async () => { await request(`/definitions/${item.id}`, { method: 'DELETE' }); await load(); }); }}>Delete</button></div></td></tr>)}</tbody>
      </table></div>{(scheduled ? !schedules.length : !reports.length) && <p>No {scheduled ? 'schedules' : 'saved reports'} yet.</p>}
    </section>}
    {view === 'history' && <section className="admin-panel"><h3>Report Run History</h3><p>Latest 100 runs. Download completed reports even if email delivery failed.</p><div className="settings-table"><table><thead><tr>{['Report', 'Generated (UTC)', 'Status', 'Rows', 'Delivery', 'Details', 'Download'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{runs.map((item) => <tr key={item.id}><td>{item.reportName}</td><td>{date(item.createdAt)}</td><td>{item.status}</td><td>{item.rowCount}</td><td>{item.delivery === 'not_requested' ? 'In-app' : item.delivery}</td><td>{item.error || item.deliveryError || '-'}</td><td>{item.status === 'completed' && <button disabled={busy} onClick={() => perform(() => download(item))}>{item.format.toUpperCase()}</button>}</td></tr>)}</tbody></table></div>{!runs.length && <p>No report runs yet.</p>}</section>}
    </>}
  </section>;
}
