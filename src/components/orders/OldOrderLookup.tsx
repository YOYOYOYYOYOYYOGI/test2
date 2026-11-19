// ---------------------------------------------------------------------------
// Previous-order lookup on the New Order page (shown under the WhatsApp and
// Mobile fields — search matches the stored WhatsApp OR Mobile of history).
//   - debounced search (350 ms, needs 10+ digits) — never per keystroke
//   - searches a pre-built index covering BOTH the imported old history AND
//     current orders, by WhatsApp number OR Mobile number (digits matched as
//     TEXT — nothing is ever turned into a number / scientific notation)
//   - every matching order is listed with its COMPLETE order number and saved
//     details (current orders newest first); the owner explicitly selects one
//     entry as the optional history parent — no latest order is auto-selected
//   - unknown numbers → quiet "No previous order found."
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OldOrderRecord, Order } from '../../types';
import { createPreviousIndex, type PreviousOrderEntry } from '../../services/oldOrders';
import { phoneSearchable } from '../../lib/normalizePhone';
import { Button } from '../ui';

export function OldOrderLookup({ phone, records, orders, excludeOrderId, chosenNumber, automaticMode = false, onPick }: {
  phone: string;
  records: OldOrderRecord[];
  /** current orders (order chain entries are included in the results) */
  orders: Order[];
  /** when editing, exclude that order from its own search */
  excludeOrderId?: string;
  /** complete order number currently applied to the form (highlighted) */
  chosenNumber?: string | null;
  /** affects explanatory copy only; selection behavior is the same */
  automaticMode?: boolean;
  onPick: (entry: PreviousOrderEntry) => void;
}) {
  const index = useMemo(() => createPreviousIndex(records, orders), [records, orders]);
  const [results, setResults] = useState<PreviousOrderEntry[] | null>(null); // null = not yet searched
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!phoneSearchable(phone)) {
      setResults(null);
      setSearched(false);
      return;
    }
    setSearched(false);
    timer.current = window.setTimeout(() => {
      setResults(index.find(phone, excludeOrderId));
      setSearched(true);
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [phone, index, excludeOrderId]);

  if (!searched) return null;
  if (!results || results.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
        No previous order found.
      </div>
    );
  }

  const pick = (rec: PreviousOrderEntry) => {
    onPick(rec);
  };

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-strong)', borderRadius: 9, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ padding: '5px 10px', fontWeight: 700, fontSize: 12, background: 'var(--primary-soft)', color: 'var(--primary-dark)' }}>
        Previous Orders Found — {results.length} Order{results.length === 1 ? '' : 's'}
        {results.some((r) => r.kind === 'order') && <span style={{ fontWeight: 400 }}> (incl. {results.filter((r) => r.kind === 'order').length} recent)</span>}
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {results.map((rec, i) => {
          const active = Boolean(chosenNumber) && normalizeOrderNumberEq(rec.orderNumber, chosenNumber);
          return (
            <div
              key={rec.id}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
                borderTop: '1px solid var(--border)', background: active ? 'var(--primary-soft)' : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="small muted" style={{ fontSize: 10.5 }}>{i + 1}.</span>
                  <b className="mono" style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{rec.orderNumber}</b>
                  {rec.name && <span style={{ fontSize: 12, fontWeight: 600 }}>{rec.name}</span>}
                  {rec.kind === 'order' && <span style={{ fontSize: 10.5, color: 'var(--secondary)' }}>recent order</span>}
                  {active && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ selected</span>}
                </div>
                {rec.address && (
                  <div className="small muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Address: {rec.address}</div>
                )}
                <div className="small muted" style={{ fontSize: 11.5 }}>
                  WhatsApp: {rec.whatsapp || '—'}{rec.mobile ? ` · Mobile: ${rec.mobile}` : ''}
                  {(rec.city || rec.state || rec.pincode) && ` · ${[rec.city, rec.state, rec.pincode].filter(Boolean).join(', ')}`}
                </div>
              </div>
              <Button size="sm" variant={active ? 'secondary' : 'outline'} onClick={() => pick(rec)}>
                {active ? 'Selected' : 'Select This Order'}
              </Button>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', background: '#fff' }}>
        Searching WhatsApp + Mobile · {automaticMode
          ? 'select one order as the only history suffix for this automatic number'
          : 'selecting an order loads its full number into the editable field — you change the beginning yourself'}
      </div>
    </div>
  );
}

function normalizeOrderNumberEq(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = String(a ?? '').trim().toLowerCase();
  const nb = String(b ?? '').trim().toLowerCase();
  return Boolean(na && na === nb);
}
