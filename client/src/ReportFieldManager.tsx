import { useEffect, useState } from 'react';

type Definition = { id?: string; name: string; description: string; source: string; fields: string[]; fieldLabels?: Record<string, string>; dateRange: string; fromDate: string; toDate: string; employeeIds: string[] };
type Preview = { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string | number>>; totalRows: number };
type Props = {
  reports: Definition[]; templates: Definition[]; fields: Record<string, Record<string, string>>;
  employees: Array<{ id: string; name: string; employeeNumber: string }>;
  schedules: Array<{ reportId: string; name: string; enabled: boolean }>;
  onCreate: () => void; onSave: (collection: string, definition: Definition) => Promise<void>;
  onPreview: (definition: Definition) => Promise<Preview>;
};
const details: Record<string, { type: string; example: string; description: string }> = {
  employeeNumber: { type: 'Text', example: 'E001', description: 'Employee reference number from the employer employee profile.' },
  employeeName: { type: 'Text', example: 'Alex Morgan', description: 'Legal first and last name from the employee profile.' },
  email: { type: 'Text', example: 'alex@example.com', description: 'Company email address. Blank when no company email is recorded.' },
  department: { type: 'Text', example: 'Operations', description: 'Department recorded in the employee employment profile.' },
  jobTitle: { type: 'Text', example: 'Payroll Specialist', description: 'Occupation or job title from the employee profile.' },
  province: { type: 'Text', example: 'MB', description: 'Employee tax province recorded on the profile.' },
  startDate: { type: 'Date', example: '2026-01-15', description: 'Employee start date. Employee report date filters apply to this date.' },
  payDate: { type: 'Date', example: '2026-10-15', description: 'Pay date on the pay statement. Payroll and deduction date filters apply to this date.' },
  grossPay: { type: 'Currency', example: '2500.00', description: 'Gross pay on the statement, using its total earnings line when needed.' },
  deductions: { type: 'Currency', example: '525.00', description: 'Sum of individual statement deductions. The TOTAL line is excluded to prevent double counting.' },
  netPay: { type: 'Currency', example: '1975.00', description: 'Net pay recorded on the pay statement.' },
  code: { type: 'Text', example: 'CPP', description: 'Deduction code on an individual statement line. TOTAL rows are excluded.' },
  description: { type: 'Text', example: 'CPP contribution', description: 'Description of the individual deduction line on the pay statement.' },
  amount: { type: 'Currency', example: '140.00', description: 'Amount of the individual deduction line, in payroll currency.' }
};
const sources: Record<string, string> = { employees: 'Employee profiles', payroll: 'Pay statements', deductions: 'Pay statement deduction lines' };
export default function ReportFieldManager(props: Props) {
  const [selection, setSelection] = useState('');
  const [draft, setDraft] = useState<Definition>();
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const choices = [...props.reports.map((item) => ({ key: `definitions:${item.id}`, item, kind: 'Report' })), ...props.templates.map((item) => ({ key: `templates:${item.id}`, item, kind: 'Template' }))];
  const choose = (key: string) => { const found = choices.find((choice) => choice.key === key); setSelection(key); setDraft(found ? { ...found.item, fields: [...found.item.fields], fieldLabels: { ...found.item.fieldLabels } } : undefined); setPreview(undefined); setError(''); setNotice(''); };
  useEffect(() => { if (!selection && choices.length) choose(choices[0].key); }, [props.reports, props.templates]);
  const change = (next: Partial<Definition>) => { setDraft((current) => current ? { ...current, ...next } : current); setPreview(undefined); setNotice(''); setError(''); };
  const perform = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } };
  if (!choices.length) return <section className="admin-panel"><h3>Manage Report Fields</h3><p>Create a report or save a template to configure its columns, headings and order.</p><button className="run-payroll" onClick={props.onCreate}>Create Custom Report</button></section>;
  const labels = props.fields[draft?.source || ''] || {};
  const visible = Object.entries(labels).filter(([key, label]) => (!onlySelected || draft?.fields.includes(key)) && `${key} ${label} ${details[key]?.description}`.toLowerCase().includes(search.toLowerCase()));
  const linked = selection.startsWith('definitions:') ? props.schedules.filter((schedule) => schedule.reportId === draft?.id) : [];
  const valid = Boolean(draft?.fields.length && draft.fields.every((key) => !Object.prototype.hasOwnProperty.call(draft.fieldLabels || {}, key) || Boolean(draft.fieldLabels?.[key]?.trim())));
  const prepared = draft ? { ...draft, fieldLabels: Object.fromEntries(draft.fields.filter((key) => draft.fieldLabels?.[key]?.trim()).map((key) => [key, draft.fieldLabels![key].trim()])) } : undefined;
  const move = (index: number, offset: number) => { if (!draft) return; const fields = [...draft.fields]; [fields[index], fields[index + offset]] = [fields[index + offset], fields[index]]; change({ fields }); };
  return <div className="report-field-manager">
    <section className="admin-panel"><h3>Manage Report Fields</h3><p>Configure which columns appear, rename headings and choose their export order. Changes affect previews and CSV, Excel and PDF downloads.</p>
      <label>Report or Template<select disabled={busy} value={selection} onChange={(event) => choose(event.target.value)}>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.kind}: {choice.item.name}</option>)}</select></label>
      {draft && <><div className="report-field-summary"><div><span>Data source</span><strong>{sources[draft.source]}</strong></div><div><span>Selected columns</span><strong>{draft.fields.length} of {Object.keys(labels).length}</strong></div><div><span>Row structure</span><strong>{draft.source === 'employees' ? 'One row per employee' : draft.source === 'payroll' ? 'One row per pay statement' : 'One row per deduction line'}</strong></div><div><span>Date filter</span><strong>{draft.dateRange === 'custom' ? `${draft.fromDate} to ${draft.toDate}` : ({ all: 'All dates', year: 'Year to date', last30: 'Last 30 days' }[draft.dateRange] || draft.dateRange)}</strong></div></div>
      <p>{draft.description || 'No description provided.'}</p><details><summary>Employee scope and schedule impact</summary><p>{draft.employeeIds.length ? draft.employeeIds.map((id) => { const employee = props.employees.find((item) => item.id === id); return employee ? `${employee.name} (${employee.employeeNumber})` : 'Employee no longer available'; }).join(', ') : 'All employees belonging to this employer.'}</p><p>{selection.startsWith('templates:') ? 'Changes apply to this template. Reports previously created from it keep their own fields.' : linked.length ? `${linked.length} linked schedule(s): ${linked.map((schedule) => `${schedule.name} (${schedule.enabled ? 'active' : 'paused'})`).join(', ')}. Future generated files use the saved columns. Existing downloads keep their original content.` : 'No linked schedules. Existing generated downloads keep their original content.'}</p><p>Date filters apply to {draft.source === 'employees' ? 'employee start date' : 'statement pay date'}. Superseded statements are excluded. Currency values use the stored payroll amounts; blank profile fields remain blank.</p></details></>}
    </section>
    {error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status" className="success-note">{notice}</p>}
    {draft && <><section className="admin-panel"><h3>Field Catalog</h3><p>Choose columns using the checkboxes. Examples below are illustrative; preview displays employer records.</p><div className="head-actions"><label>Find a field<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, key or description" /></label><label><input type="checkbox" checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)} />Selected fields only</label><button disabled={busy} onClick={() => change({ fields: Object.keys(labels) })}>Select All</button><button disabled={busy} onClick={() => change({ fields: [] })}>Clear Selection</button></div>
      <div className="settings-table"><table><thead><tr>{['Include', 'Field / Key', 'Type', 'Description', 'Example'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(([key, label]) => <tr key={key}><td><input type="checkbox" aria-label={`Include ${label}`} disabled={busy} checked={draft.fields.includes(key)} onChange={(event) => change({ fields: event.target.checked ? [...draft.fields, key] : draft.fields.filter((field) => field !== key) })} /></td><td><strong>{label}</strong><br /><code>{key}</code></td><td>{details[key]?.type || 'Text'}</td><td>{details[key]?.description}</td><td>{details[key]?.example}</td></tr>)}</tbody></table></div>{!visible.length && <p>No fields match your search.</p>}
    </section>
    <section className="admin-panel"><h3>Column Headings and Order</h3><p>Columns are exported from top to bottom in this list. Heading changes leave the underlying data unchanged.</p><ol className="report-column-editor">{draft.fields.map((key, index) => <li key={key}><span className="report-column-number">{index + 1}</span><label>{labels[key]}<input aria-label={`Heading for ${labels[key]}`} disabled={busy} maxLength={60} value={draft.fieldLabels?.[key] ?? labels[key]} onChange={(event) => change({ fieldLabels: { ...draft.fieldLabels, [key]: event.target.value } })} /></label><div className="head-actions"><button aria-label={`Move ${labels[key]} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>Move Up</button><button aria-label={`Move ${labels[key]} down`} disabled={busy || index === draft.fields.length - 1} onClick={() => move(index, 1)}>Move Down</button><button disabled={busy} onClick={() => change({ fields: draft.fields.filter((field) => field !== key) })}>Remove</button></div></li>)}</ol>{!draft.fields.length && <p>Select at least one field to preview or save.</p>}
      <div className="head-actions"><button disabled={busy} onClick={() => choose(selection)}>Reset to Saved</button><button disabled={busy} onClick={() => change({ fieldLabels: {} })}>Restore Default Headings</button><button disabled={busy || !valid} onClick={() => perform(async () => { setPreview(await props.onPreview(prepared!)); })}>Preview Changes</button><button className="run-payroll" disabled={busy || !valid} onClick={() => perform(async () => { await props.onSave(selection.split(':')[0], prepared!); setNotice('Fields, headings and column order saved.'); })}>{busy ? 'Working...' : 'Save Report Fields'}</button></div>
    </section>
    {preview && <section className="admin-panel"><h3>Live Preview</h3><p>{preview.totalRows} matching rows. Showing up to 100 rows with your current unsaved column settings.</p><div className="settings-table"><table><thead><tr>{preview.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{preview.columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>)}</tbody></table></div>{!preview.totalRows && <p>No records match the saved employee/date filters. Change those filters in the report editor.</p>}</section>}
    <section className="admin-panel"><h3>Export Details</h3><p>CSV and Excel contain full cell values. PDF fits columns on landscape pages and shortens long text to fit. Report previews show the first 100 rows; exports support up to 5,000 matching rows. Narrow the employee/date filter for larger datasets. Daily, weekly and monthly schedules evaluate relative date ranges at generation time.</p></section>
    </>}
  </div>;
}
