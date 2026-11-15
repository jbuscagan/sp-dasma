'use client';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Field } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { deleteEmployee, removeSignature, saveEmployee, signatureDataUrl, uploadSignature, type Employee } from './api';

function SignaturePreview({ path }: { path: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    signatureDataUrl(path).then(setSrc);
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="e-signature" className="h-10 max-w-[140px] rounded border border-line bg-white object-contain p-0.5" /> : <span className="text-xs text-muted">loading…</span>;
}

/** Employees of this office (their DTRs are saved under this office automatically). */
export function Employees({ committeeId, employees }: { committeeId: string; employees: Employee[] }) {
  const [draft, setDraft] = useState({ name: '', position: '', dept: 'SP' });
  const [editing, setEditing] = useState<Employee | null>(null);
  const [error, setError] = useState('');

  const wrap = (fn: () => Promise<unknown>) => async () => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const add = wrap(async () => {
    if (!draft.name.trim()) throw new Error("Type the new person's name first.");
    await saveEmployee({ ...draft, committee_id: committeeId });
    setDraft((d) => ({ ...d, name: '', position: '' }));
  });

  return (
    <div className="space-y-4">
      {error && <Alert kind="error">{error}</Alert>}
      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Name"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Position"><input className="input" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} /></Field>
        <Field label="Department"><input className="input" value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })} /></Field>
        <div className="flex items-end"><Button className="w-full" onClick={add}>＋ Add employee</Button></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Name</th><th>Position</th><th>Department</th><th>Active</th><th>E-signature</th><th /></tr>
          </thead>
          <tbody>
            {employees.map((e) =>
              editing?.id === e.id ? (
                <tr key={e.id}>
                  <td><input className="input" value={editing.name} onChange={(x) => setEditing({ ...editing, name: x.target.value })} /></td>
                  <td><input className="input" value={editing.position ?? ''} onChange={(x) => setEditing({ ...editing, position: x.target.value })} /></td>
                  <td><input className="input" value={editing.dept ?? ''} onChange={(x) => setEditing({ ...editing, dept: x.target.value })} /></td>
                  <td colSpan={2} />
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" onClick={wrap(async () => { await saveEmployee(editing); setEditing(null); })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </td>
                </tr>
              ) : (
                <tr key={e.id}>
                  <td className="font-medium">{e.name}</td>
                  <td>{e.position}</td>
                  <td>{e.dept}</td>
                  <td>
                    <button onClick={wrap(() => saveEmployee({ ...e, active: !e.active }))}>
                      <Badge color={e.active ? 'green' : 'gray'}>{e.active ? 'Active' : 'Inactive'}</Badge>
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {e.signature_path && <SignaturePreview key={e.signature_path} path={e.signature_path} />}
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand-700 hover:border-brand-500 hover:bg-brand-50">
                        <Icon name="upload" size={14} />
                        {e.signature_path ? 'Replace e-signature' : 'Upload e-signature'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(x) => {
                            const f = x.target.files?.[0];
                            if (f) wrap(() => uploadSignature(f, e))();
                          }}
                        />
                      </label>
                      {e.signature_path && (
                        <button className="text-xs text-red-600 hover:underline" onClick={wrap(() => removeSignature(e))}>Remove</button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600"
                      onClick={() => confirm(`Delete ${e.name} and all of their attendance?`) && wrap(() => deleteEmployee(e.id))()}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {!employees.length && <p className="p-6 text-center text-sm text-muted">No employees yet.</p>}
      </div>
      <p className="text-xs text-muted">Upload each employee’s e-signature once here; it is printed above their name on every DTR. Tip: a PNG with a transparent background looks best.</p>
    </div>
  );
}
