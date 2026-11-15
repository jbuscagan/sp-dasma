'use client';
// Window that explains a possible discrepancy and lists the related records.
import { Button, Modal } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useSession } from '@/features/auth/session';
import { fmtLong } from '@/lib/dates';
import type { Entry } from '@/lib/types';
import { TYPES, displayName } from '@/features/transmittal/config';
import { type Issue } from '../discrepancies';

export function ChecksDialog({ entry, issues, byId, openFlags, onRemarks, onClose }: { entry: Entry | null; issues: Issue[]; byId: Map<string, Entry>; openFlags: number; onRemarks: (e: Entry) => void; onClose: () => void }) {
  const { committeeName } = useSession();
  if (!entry) return null;
  return (
    <Modal open onClose={onClose} title={`Checks — ${displayName(entry).split('\n').pop()}`} footer={<><Button variant="secondary" onClick={() => onRemarks(entry)}><Icon name="flag" size={14} />Remarks</Button><Button onClick={onClose}>Close</Button></>}>
      <div className="space-y-4">
        {issues.map((i) => (
          <div key={i.kind}>
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300"><Icon name="alert" size={15} />{i.text}</div>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {i.related.map((id) => {
                const r = byId.get(id);
                if (!r) return null;
                return (
                  <li key={id} className="px-3 py-1.5">
                    <b>{displayName(r).split('\n').pop()}</b> · {r.contact_number || 'no number'}
                    <div className="text-xs text-muted">{committeeName(r.committee_id)} · {TYPES[r.type].label} · received {fmtLong(r.date_received)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {openFlags > 0 && <p className="text-sm">{openFlags} open remark(s) — click <b>Remarks</b> to read or resolve them.</p>}
      </div>
    </Modal>
  );
}
