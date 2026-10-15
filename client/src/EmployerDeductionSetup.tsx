import { useEffect, useState } from 'react';

type Employee = { id: string; name: string; employeeNumber: string };
type Draft = { code: string; name: string; description: string; calculationMethod: 'fixed' | 'percentage'; value: string; employeeScope: 'all' | 'selected'; employeeIds: string[]; effectivePayDate: string; status: 'active' | 'inactive' };
type Deduction = Omit<Draft, 'calculationMethod'> & { id: string; kind: 'statutory' | 'custom'; calculationMethod: string };
const initial: Draft = { code: '', name: '', description: '', calculationMethod: 'fixed', value: '', employeeScope: 'all', employeeIds: [], effectivePayDate: '', status: 'active' };
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function EmployerDeductionSetup({ token }: { token: string }) {
  const [items, setItems] = useState<Deduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [editingId, setEditingId] = useState('');
  const [open, setOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [viewedStatutory, setViewedStatutory] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBase}/employer/settings/deductions${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Could not save deduction.');
    return body;
  }
  useEffect(() => {
    let current = true;
    request<{ deductions: Deduction[]; employees: Employee[] }>().then((data) => { if (current) { setItems(data.deductions); setEmployees(data.employees); } })
      .catch((cause: Error) => current && setError(cause.message)).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [token]);
  const edit = (item?: Deduction, view = false) => {
    setEditingId(item?.id || ''); setReadOnly(view); setViewedStatutory(item?.kind === 'statutory'); setSearch(''); setError(''); setNotice('');
    setDraft(item ? { ...item, calculationMethod: item.calculationMethod === 'percentage' ? 'percentage' : 'fixed', employeeScope: item.employeeScope === 'selected' ? 'selected' : 'all', employeeIds: [...item.employeeIds] } : { ...initial });
    setOpen(true);
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await request<{ deduction: Deduction }>(editingId ? `/${editingId}` : '', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify({ ...draft, value: Number(draft.value), employeeIds: draft.employeeScope === 'all' ? [] : draft.employeeIds }) });
      setItems((current) => editingId ? current.map((item) => item.id === editingId ? result.deduction : item) : [...current, result.deduction]);
      setOpen(false); setNotice('Deduction saved. It applies to calculated payrolls on or after the selected pay date.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="settings-card deduction-setup">
    <header className="settings-card-head"><div><h2>Deduction Setup</h2><p>Configure deductions, employee eligibility and the first applicable pay date.</p></div><button type="button" className="run-payroll" disabled={loading || busy} onClick={() => edit()}>Add Deduction</button></header>
    {notice && <p role="status">{notice}</p>}{!open && error && <p role="alert" className="field-error">{error}</p>}
    {loading ? <p>Loading deductions...</p> : <div className="settings-table"><table>
      <colgroup>{Array.from({ length: 9 }, (_, index) => <col key={index} style={{ width: `${100 / 9}%` }} />)}</colgroup>
      <thead><tr>{['Code', 'Deduction', 'Type', 'Calculation', 'Value', 'Employees', 'From Pay Date', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.code}</td><td>{item.name}</td><td>{item.kind === 'statutory' ? 'Statutory' : 'Custom'}</td>
        <td>{item.calculationMethod === 'percentage' ? 'Percentage of gross pay' : item.calculationMethod === 'fixed' ? 'Fixed amount per pay' : 'Automatic'}</td>
        <td>{item.kind === 'statutory' ? 'Automatic' : item.calculationMethod === 'percentage' ? `${item.value}%` : `$${Number(item.value).toFixed(2)}`}</td>
        <td>{item.employeeScope === 'all' ? 'All employees' : item.employeeIds.map((id) => employees.find((employee) => employee.id === id)?.name || 'Unavailable employee').join(', ')}</td>
        <td>{item.effectivePayDate || (item.kind === 'statutory' ? 'Automatic' : 'Set a starting date')}</td><td>{item.status === 'active' ? 'Active' : 'Inactive'}</td>
        <td><div className="employer-role-actions"><button type="button" onClick={() => edit(item, true)}>View</button>{item.kind === 'custom' && <button type="button" onClick={() => edit(item)}>Edit</button>}</div></td>
      </tr>)}{!items.length && <tr><td colSpan={9}>No deductions configured. Add a deduction to get started.</td></tr>}</tbody>
    </table></div>}
    {open && <div className="employer-role-backdrop"><section className="employer-role-dialog" role="dialog" aria-modal="true" aria-labelledby="deduction-form-title">
      <header><h2 id="deduction-form-title">{readOnly ? 'View Deduction' : editingId ? 'Edit Deduction' : 'Add Deduction'}</h2><button type="button" autoFocus disabled={busy} onClick={() => setOpen(false)}>Close</button></header>
      {error && <p role="alert" className="field-error">{error}</p>}
      {readOnly && viewedStatutory ? <dl><dt>Deduction</dt><dd>{draft.name} ({draft.code})</dd><dt>Description</dt><dd>{draft.description || 'Statutory deduction calculated automatically by payroll.'}</dd><dt>Calculation</dt><dd>Automatic statutory payroll calculation</dd><dt>Status</dt><dd>{draft.status === 'active' ? 'Active' : 'Inactive'}</dd></dl> : <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={readOnly || busy} className="deduction-form-fields"><div className="settings-fields two">
          <label>Deduction Name<input required minLength={2} maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Code<input required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} /></label>
          <label>Calculation Method<select value={draft.calculationMethod} onChange={(event) => setDraft({ ...draft, calculationMethod: event.target.value as Draft['calculationMethod'] })}><option value="fixed">Fixed amount per pay</option><option value="percentage">Percentage of gross pay</option></select></label>
          <label>{draft.calculationMethod === 'percentage' ? 'Percentage (%)' : 'Amount ($)'}<input required type="number" min="0" max={draft.calculationMethod === 'percentage' ? 100 : undefined} step="0.01" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label>
          <label>Applicable for All Employees?<select value={draft.employeeScope} onChange={(event) => setDraft({ ...draft, employeeScope: event.target.value as Draft['employeeScope'] })}><option value="all">Yes — all employees</option><option value="selected">No — select employees</option></select></label>
          <label>Applicable From Pay Date<input required type="date" value={draft.effectivePayDate} onChange={(event) => setDraft({ ...draft, effectivePayDate: event.target.value })} /></label>
          <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label>Description<textarea maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        </div>
        {draft.employeeScope === 'selected' && <section><h3>Select Employees ({draft.employeeIds.length})</h3><input aria-label="Search employee names" placeholder="Search by employee name or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="deduction-employee-list">{employees.filter((employee) => `${employee.name} ${employee.employeeNumber}`.toLowerCase().includes(search.toLowerCase())).map((employee) => <label key={employee.id}><input type="checkbox" checked={draft.employeeIds.includes(employee.id)} onChange={(event) => setDraft({ ...draft, employeeIds: event.target.checked ? [...draft.employeeIds, employee.id] : draft.employeeIds.filter((id) => id !== employee.id) })} />{employee.name} ({employee.employeeNumber})</label>)}</div>
          {!employees.length && <p>No employees are available for this employer.</p>}
        </section>}</fieldset>
        {!readOnly && <p>Custom deductions are taken after tax on each pay date from the selected date onward. Saved pay statements retain their recorded amounts.</p>}
        <footer><button type="button" disabled={busy} onClick={() => setOpen(false)}>{readOnly ? 'Close' : 'Cancel'}</button>{!readOnly && <button type="submit" className="run-payroll" disabled={busy || (draft.employeeScope === 'selected' && !draft.employeeIds.length)}>{busy ? 'Saving...' : 'Save Deduction'}</button>}</footer>
      </form>}
    </section></div>}
  </section>;
}
