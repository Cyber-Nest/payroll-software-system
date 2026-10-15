import { useEffect, useState } from 'react';

type Role = { id: string; index: number; name: string; fullForm: string; description: string; users: number; status: 'Active' | 'Inactive'; permissions: string[] };
type Draft = Pick<Role, 'name' | 'fullForm' | 'description' | 'status' | 'permissions'>;
type Dialog = { mode: 'view' | 'edit' | 'delete' | 'create'; role?: Role };
const emptyDraft: Draft = { name: '', fullForm: '', description: '', status: 'Active', permissions: [] };
const permissionOptions = ['employee.view', 'employee.create', 'employee.edit', 'employee.sin.view', 'employee.compensation.view', 'payroll.view', 'payroll.prepare', 'payroll.approve', 'payroll.reverse', 'tax.view', 'tax.manage', 'reports.view', 'reports.export', 'bank.view', 'bank.edit', 'users.manage', 'audit.view', 'bulletins.manage', 'self.context.view', 'self.context.switch', 'self.profile.view', 'self.profile.edit', 'self.security.edit', 'self.pay.view', 'self.tax.view', 'self.bulletins.view'];
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function EmployerRolesSection({ token }: { token: string }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [dialog, setDialog] = useState<Dialog>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function request<T>(path = '', options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBase}/employer/settings/roles${path}`, {
      ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not complete the role action.');
    return data as T;
  }
  useEffect(() => {
    let current = true;
    request<{ roles: Role[] }>().then((data) => current && setRoles(data.roles))
      .catch((cause: Error) => current && setError(cause.message)).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [token]);
  useEffect(() => {
    if (!dialog || busy) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setDialog(undefined); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dialog, busy]);
  const open = async (role: Role, mode: 'view' | 'edit' | 'delete') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { role: current } = await request<{ role: Role }>(`/${encodeURIComponent(role.id)}`);
      setDialog({ role: current, mode }); setDraft({ ...current, permissions: [...current.permissions] });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await request<{ roles: Role[] }>(dialog?.mode === 'create' ? '' : `/${encodeURIComponent(dialog!.role!.id)}`, {
        method: dialog?.mode === 'create' ? 'POST' : 'PUT', body: JSON.stringify(draft)
      });
      setRoles(result.roles); setDialog(undefined); setNotice('Role saved.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      const result = await request<{ roles: Role[] }>(`/${encodeURIComponent(dialog!.role!.id)}`, { method: 'DELETE' });
      setRoles(result.roles); setDialog(undefined); setNotice('Role deleted.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const owner = dialog?.role?.id === 'Company Owner';
  const editing = dialog?.mode === 'edit' || dialog?.mode === 'create';
  return <section className="settings-card employer-roles-section">
    <header className="settings-card-head"><div><h2>Roles</h2><p>View, edit and delete roles for your organization. Changes save immediately.</p></div>
      <button type="button" className="run-payroll" disabled={busy || loading} onClick={() => { setDialog({ mode: 'create' }); setDraft({ ...emptyDraft }); setError(''); setNotice(''); }}>Add Role</button>
    </header>
    {!dialog && error && <p role="alert" className="field-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading roles...</p> : <div className="settings-table employer-roles-table"><table>
      <thead><tr>{['#', 'Role Name', 'Full Form', 'Description', 'Users', 'Status', 'Actions'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{roles.map((role) => <tr key={role.id}>
        <td>{role.index}</td><td>{role.name}</td><td>{role.fullForm}</td><td>{role.description}</td><td>{role.users}</td><td>{role.status}</td>
        <td><div className="employer-role-actions"><button type="button" disabled={busy} onClick={() => open(role, 'view')}>View</button><button type="button" disabled={busy} onClick={() => open(role, 'edit')}>Edit</button><button type="button" className="danger-button" disabled={busy} onClick={() => open(role, 'delete')}>Delete</button></div></td>
      </tr>)}</tbody>
    </table>{!roles.length && <p>No roles found.</p>}</div>}
    {dialog && <div className="employer-role-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="employer-role-title" className="employer-role-dialog">
      <header><h2 id="employer-role-title">{dialog.mode === 'create' ? 'Add Role' : `${dialog.mode === 'view' ? 'View' : dialog.mode === 'edit' ? 'Edit' : 'Delete'} Role: ${dialog.role?.name}`}</h2>
        <button type="button" autoFocus disabled={busy} aria-label="Close role details" onClick={() => { setDialog(undefined); setError(''); }}>Close</button></header>
      {error && <p role="alert" className="field-error">{error}</p>}
      {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="settings-fields two">
          <label>Role Name<input required minLength={2} maxLength={80} value={draft.name} disabled={!!dialog.role && (!dialog.role.id.startsWith('custom-role-') || dialog.role.users > 0)} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Full Form<input required minLength={2} maxLength={120} value={draft.fullForm} onChange={(event) => setDraft({ ...draft, fullForm: event.target.value })} /></label>
          <label>Description<textarea maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label>Status<select disabled={owner} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft['status'] })}><option>Active</option><option>Inactive</option></select></label>
        </div>
        {owner && <p>The Super Admin role remains active with its existing permissions.</p>}
        <h3>Permissions</h3><div className="employer-role-permissions">{permissionOptions.map((permission) => <label key={permission}><input type="checkbox" disabled={owner} checked={draft.permissions.includes(permission)} onChange={(event) => setDraft({ ...draft, permissions: event.target.checked ? [...draft.permissions, permission] : draft.permissions.filter((item) => item !== permission) })} />{permission}</label>)}</div>
        <footer><button type="button" disabled={busy} onClick={() => { setDialog(undefined); setError(''); }}>Cancel</button><button type="submit" className="run-payroll" disabled={busy}>{busy ? 'Saving...' : 'Save Role'}</button></footer>
      </form> : dialog.mode === 'view' ? <>
        <dl><dt>Full Form</dt><dd>{dialog.role?.fullForm}</dd><dt>Description</dt><dd>{dialog.role?.description || '-'}</dd><dt>Status</dt><dd>{dialog.role?.status}</dd><dt>Assigned Users</dt><dd>{dialog.role?.users}</dd></dl>
        <h3>Permissions</h3><ul>{dialog.role?.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>{!dialog.role?.permissions.length && <p>No permissions assigned.</p>}
        <footer><button type="button" onClick={() => { setDialog({ ...dialog, mode: 'edit' }); setError(''); }}>Edit Role</button></footer>
      </> : <>
        <p>{owner ? 'The Super Admin role cannot be deleted.' : dialog.role?.users ? 'Reassign all users from this role before deleting it.' : `Delete ${dialog.role?.name} from this organization?`}</p>
        <footer><button type="button" disabled={busy} onClick={() => { setDialog(undefined); setError(''); }}>Cancel</button><button type="button" className="danger-button" disabled={busy || owner || !!dialog.role?.users} onClick={remove}>{busy ? 'Deleting...' : 'Delete Role'}</button></footer>
      </>}
    </section></div>}
  </section>;
}
