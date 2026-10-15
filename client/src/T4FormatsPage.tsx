import { useEffect, useState } from 'react';

type FormatFields = {
  name: string;
  description: string;
  headerTitle: string;
  headerStyle: 'plain' | 'band';
  accentColor: string;
  showLogo: boolean;
  footerText: string;
};
type Format = FormatFields & { id: string };
const defaults: FormatFields = {
  name: '', description: '', headerTitle: 'T4 STATEMENT', headerStyle: 'plain',
  accentColor: '#0D1F33', showLogo: true, footerText: ''
};
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function request(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}/super-admin/t4-formats${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Could not complete the T4 format request.');
  }
  return response;
}

export default function T4FormatsPage({ token }: { token: string }) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [selectedId, setSelectedId] = useState('standard');
  const [editingId, setEditingId] = useState('standard');
  const [form, setForm] = useState<FormatFields>(defaults);
  const [savedForm, setSavedForm] = useState<FormatFields>(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewVersion, setPreviewVersion] = useState(0);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);
  const editable = editingId && editingId !== 'standard';

  const edit = (format: Format) => {
    const { id, ...fields } = format;
    setEditingId(id); setForm(fields); setSavedForm(fields); setError(''); setNotice('');
  };

  useEffect(() => {
    let current = true;
    setLoading(true);
    request('', token).then((response) => response.json()).then((data: { formats: Format[]; selectedId: string }) => {
      if (!current) return;
      setFormats(data.formats); setSelectedId(data.selectedId);
      const format = data.formats.find((item) => item.id === data.selectedId) || data.formats[0];
      if (format) edit(format);
    }).catch((cause: Error) => current && setError(cause.message)).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    setPreviewLoading(true); setPreviewError(''); setPreviewUrl('');
    const timer = window.setTimeout(async () => {
      try {
        const response = await request('/preview', token, { method: 'POST', body: JSON.stringify(form), signal: controller.signal });
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob); setPreviewUrl(url); setPreviewLoading(false);
      } catch (cause) {
        if (!controller.signal.aborted) { setPreviewError((cause as Error).message); setPreviewLoading(false); }
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [form, token, previewVersion]);

  const update = <K extends keyof FormatFields>(key: K, value: FormatFields[K]) => {
    setForm((current) => ({ ...current, [key]: value })); setNotice('');
  };

  const save = async () => {
    if (form.name.trim().length < 2) { setError('Enter a format name with at least two characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await request(editable ? `/${editingId}` : '', token, { method: editable ? 'PUT' : 'POST', body: JSON.stringify(form) });
      const { format } = await response.json() as { format: Format };
      setFormats((current) => editable ? current.map((item) => item.id === format.id ? format : item) : [...current, format]);
      edit(format);
      setNotice(format.id === selectedId ? 'Format saved. Future T4 downloads use these changes.' : 'Format saved. Select “Use this format” to make it the platform default, or assign it to an employer.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const select = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/${editingId}/select`, token, { method: 'POST' });
      setSelectedId(editingId); setNotice('Default T4 format selected. Future downloads use this format unless an employer has its own selection.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  return <section className="module-page t4-formats-page">
    <header className="employee-head"><div><h1>T4 Formats</h1><p>Add and edit T4 presentation formats, preview changes, and select the platform default.</p></div>
      <button className="run-payroll" disabled={loading || busy} onClick={() => {
        setEditingId(''); setForm({ ...defaults }); setSavedForm({ ...defaults }); setError(''); setNotice('');
      }}>Add New Format</button>
    </header>
    {error && <p className="t4-format-error" role="alert">{error}</p>}
    {notice && <p className="success-note" role="status">{notice}</p>}
    {loading ? <p>Loading T4 formats...</p> : <>
      <section className="admin-panel t4-format-library">
        <h2>Saved Formats</h2>
        <p>Platform default: <b>{formats.find((item) => item.id === selectedId)?.name || 'Standard T4'}</b></p>
        <div className="t4-format-cards">{formats.map((format) => <button key={format.id} disabled={busy}
          className={editingId === format.id ? 'selected' : ''} onClick={() => edit(format)} aria-pressed={editingId === format.id}>
          <b>{format.name}</b><span>{format.description || 'T4 presentation format'}</span>
          {selectedId === format.id && <small>Platform default</small>}
        </button>)}</div>
      </section>
      <div className="t4-format-workspace">
        <section className="admin-panel t4-format-editor">
          <h2>{editable ? 'Edit Format' : editingId === 'standard' ? 'Customize Standard Format' : 'New Format'}</h2>
          {editingId === 'standard' && <p>Save your changes as a new format to keep the standard format available.</p>}
          <label>Format Name<input maxLength={80} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label>Description<textarea maxLength={250} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
          <label>Header Title<input maxLength={32} value={form.headerTitle} onChange={(event) => update('headerTitle', event.target.value)} /></label>
          <label>Header Style<select value={form.headerStyle} onChange={(event) => update('headerStyle', event.target.value as FormatFields['headerStyle'])}>
            <option value="plain">Plain</option><option value="band">Color Band</option>
          </select></label>
          <label>Accent Color<input type="color" value={form.accentColor} onChange={(event) => update('accentColor', event.target.value)} /></label>
          <label className="t4-format-toggle"><input type="checkbox" checked={form.showLogo} onChange={(event) => update('showLogo', event.target.checked)} />Show Payhours Logo</label>
          <label>Footer Message<textarea maxLength={120} rows={2} value={form.footerText} onChange={(event) => update('footerText', event.target.value)} /></label>
          <p>{dirty ? 'Unsaved changes are shown in the preview.' : 'Preview shows the saved settings.'}</p>
          <div className="head-actions">
            <button className="run-payroll" disabled={busy || form.name.trim().length < 2 || !form.headerTitle.trim()} onClick={save}>{busy ? 'Saving...' : editable ? 'Save Changes' : 'Save as New Format'}</button>
            <button disabled={busy || !editingId || dirty || selectedId === editingId} onClick={select}>{selectedId === editingId ? 'Current Default' : 'Use This Format'}</button>
          </div>
          <small>Saved formats can also be selected in Super Admin → Add/Edit Employer → T4 &amp; Year-End Format.</small>
        </section>
        <section className="admin-panel t4-format-preview">
          <header className="employee-head"><div><h2>Live PDF Preview</h2><p>Sample data · updates as you edit</p></div>
            <button onClick={() => setPreviewVersion((value) => value + 1)}>Refresh Preview</button>
          </header>
          {previewLoading && <p role="status">Updating preview...</p>}
          {previewError && <p role="alert" className="t4-format-error">{previewError}</p>}
          {previewUrl && <><iframe title="T4 format PDF preview" src={previewUrl} /><a href={previewUrl} target="_blank" rel="noreferrer">Open Preview in New Tab</a></>}
        </section>
      </div>
    </>}
  </section>;
}
