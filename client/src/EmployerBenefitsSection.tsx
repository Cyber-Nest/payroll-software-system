import { useEffect, useState } from 'react';

type Employee = { id: string; name: string; employeeNumber: string };
type Fields = { name: string; type: string; coverageOrValue: string; description: string; employeeScope: 'all' | 'selected'; employeeIds: string[]; applicableFrom: string; status: 'active' | 'inactive' };
type Benefit = Fields & { id: string; source: 'plan' | 'employee' };
const empty: Fields = { name: '', type: 'Health', coverageOrValue: '', description: '', employeeScope: 'all', employeeIds: [], applicableFrom: '', status: 'active' };
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function EmployerBenefitsSection({ token }: { token: string }) {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<Fields>(empty);
  const [selected, setSelected] = useState<Benefit>();
  const [mode, setMode] = useState<'add' | 'edit' | 'view'>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBase}/employer/settings/benefits${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Could not complete the benefit action.');
    return body;
  }
  useEffect(() => {
    let current = true;
    request<{ benefits: Benefit[]; employees: Employee[] }>().then((data) => { if (current) { setBenefits(data.benefits); setEmployees(data.employees); } })
      .catch((cause: Error) => current && setError(cause.message)).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [token]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setMode(undefined); };
    if (!mode) return;
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [mode, busy]);
  const open = (nextMode: 'add' | 'edit' | 'view', item?: Benefit) => {
    setMode(nextMode); setSelected(item); setForm(item ? { ...item, employeeIds: [...item.employeeIds] } : { ...empty }); setError(''); setNotice(''); setSearch('');
  };
  const save = async () => {
    if (busy || (mode !== 'add' && mode !== 'edit')) return;
    setBusy(true); setError('');
    try {
      const { benefit } = await request<{ benefit: Benefit }>(selected ? `/${encodeURIComponent(selected.id)}` : '', {
        method: selected ? 'PATCH' : 'POST', body: JSON.stringify({ ...form, employeeIds: form.employeeScope === 'all' ? [] : form.employeeIds })
      });
      setBenefits((current) => selected ? current.map((item) => item.id === selected.id ? benefit : item) : [...current, benefit]);
      setMode(undefined); setNotice('Benefit saved.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const legacy = selected?.source === 'employee';
  const remove = async (item: Benefit) => {
    if (busy) return;
    const scope = item.source === 'employee' ? 'this employee' : item.employeeScope === 'all' ? 'all employees covered by this benefit' : 'the selected employees';
    if (!window.confirm(`Delete "${item.name}" for ${scope}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setBenefits((current) => current.filter((benefit) => benefit.id !== item.id));
      setMode(undefined); setSelected(undefined); setNotice('Benefit deleted.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const readOnly = mode === 'view';
  const employeeNames = (ids: string[]) => ids.map((id) => {
    const employee = employees.find((item) => item.id === id);
    return employee ? `${employee.name} (${employee.employeeNumber})` : 'Unavailable employee';
  }).join(', ');
  return <div className="employer-benefits-manager">
    <div className="benefit-manager-actions"><button type="button" className="run-payroll" disabled={busy || loading} onClick={() => open('add')}>Add Benefit</button></div>
    {!mode && error && <p role="alert" className="field-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p>Checking benefits...</p>}
    {benefits.length > 0 && <section className="settings-card"><header className="settings-card-head"><div><h2>Employee Benefits</h2><p>Configured benefits and existing employee enrollments.</p></div></header>
      <div className="settings-table"><table><colgroup>{Array.from({ length: 7 }, (_, index) => <col key={index} style={{ width: `${100 / 7}%` }} />)}</colgroup>
        <thead><tr>{['Benefit', 'Type', 'Coverage / Value', 'Employees', 'Applicable From', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{benefits.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.type}</td><td>{item.coverageOrValue}</td><td>{item.employeeScope === 'all' ? 'All employees (including new employees)' : employeeNames(item.employeeIds)}</td><td>{item.applicableFrom || 'Not recorded'}</td><td>{item.status === 'active' ? 'Active' : 'Inactive'}</td>
          <td><div className="employer-role-actions"><button type="button" disabled={busy} onClick={() => open('view', item)}>View</button><button type="button" disabled={busy} onClick={() => open('edit', item)}>Edit</button><button type="button" className="danger-button" disabled={busy} onClick={() => remove(item)}>Delete</button></div></td></tr>)}</tbody>
      </table></div>
    </section>}
    {mode && <div className="employer-role-backdrop"><section className="employer-role-dialog" role="dialog" aria-modal="true" aria-labelledby="benefit-form-title">
      <header><h2 id="benefit-form-title">{mode === 'add' ? 'Add Benefit' : mode === 'edit' ? 'Edit Benefit' : 'View Benefit'}</h2><button type="button" autoFocus disabled={busy} onClick={() => setMode(undefined)}>Close</button></header>
      {error && <p role="alert" className="field-error">{error}</p>}
      <form onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (!readOnly && !busy && submitter instanceof HTMLButtonElement && submitter.dataset.action === 'save-benefit') void save();
      }}><fieldset disabled={readOnly || busy} className="deduction-form-fields"><div className="settings-fields two">
        <label>Benefit Name<input required minLength={2} maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Health', 'Insurance', 'Wellness', 'Retirement', 'Deduction', 'Taxable Benefit', 'Other'].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Coverage / Value<input required maxLength={200} placeholder="For example, Family coverage or $500 annually" value={form.coverageOrValue} onChange={(event) => setForm({ ...form, coverageOrValue: event.target.value })} /></label>
        <label>Applicable From Date<input required type="date" value={form.applicableFrom} onChange={(event) => setForm({ ...form, applicableFrom: event.target.value })} /></label>
        <label>Apply to All Employees?<select disabled={legacy} value={form.employeeScope} onChange={(event) => setForm({ ...form, employeeScope: event.target.value as Fields['employeeScope'] })}><option value="all">Yes - all employees</option><option value="selected">No - selected employees</option></select></label>
        <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Fields['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label>Description<textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div>
      {form.employeeScope === 'selected' && <section><h3>Employees</h3>{legacy ? <p>{employeeNames(form.employeeIds)}. This enrollment belongs to this employee; add a new benefit to cover other employees.</p> : <>
        <input aria-label="Search benefit employees" placeholder="Search employee name or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="deduction-employee-list">{employees.filter((employee) => `${employee.name} ${employee.employeeNumber}`.toLowerCase().includes(search.toLowerCase())).map((employee) => <label key={employee.id}><input type="checkbox" checked={form.employeeIds.includes(employee.id)} onChange={(event) => setForm({ ...form, employeeIds: event.target.checked ? [...form.employeeIds, employee.id] : form.employeeIds.filter((id) => id !== employee.id) })} />{employee.name} ({employee.employeeNumber})</label>)}</div>
        {!employees.length && <p>No employees are available for this employer.</p>}
      </>}</section>}</fieldset>
      {!readOnly && <p>Use Deduction Setup to configure any payroll deductions for employee contributions.</p>}
      <footer><button type="button" disabled={busy} onClick={() => setMode(undefined)}>{readOnly ? 'Close' : 'Cancel'}</button>{readOnly ? <button key="edit-benefit" type="button" onClick={(event) => { event.preventDefault(); setMode('edit'); }}>Edit Benefit</button> : <button key="save-benefit" type="submit" data-action="save-benefit" className="run-payroll" disabled={busy || (form.employeeScope === 'selected' && !form.employeeIds.length)}>{busy ? 'Saving...' : 'Save Benefit'}</button>}</footer>
      </form>
    </section></div>}
  </div>;
}
