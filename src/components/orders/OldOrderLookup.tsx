// ---------------------------------------------------------------------------
// Previous-order lookup on the New Order page.
//   - debounced search (350 ms, needs 10+ digits) — never per keystroke
//   - searches a pre-built index covering BOTH the imported old history AND
//     current orders created from it (the order chain)
//   - every matching order is listed (newest current orders first), the user
//     picks the exact one to use as the immediate parent/previous order
//   - unknown numbers → quiet "No previous order found."
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OldOrderRecord, Order } from '../../types';
import { createPreviousIndex, entryChainValue, type PreviousOrderEntry } from '../../services/oldOrders';
import { normalizePhone, phoneSearchable } from '../../lib/normalizePhone';
import { Button } from '../ui';

export function OldOrderLookup({ whatsapp, records, orders, excludeOrderId, baseNumber, chosenNumber, onPick }: {
  whatsapp: string;
  records: OldOrderRecord[];
  /** current orders (order chain entries are included in the results) */
  orders: Order[];
  /** when editing, exclude that order from its own search */
  excludeOrderId?: string;
  /** current auto number (base only) — decides the chain level contributed
   *  by imported records whose own base equals it */
  baseNumber?: string | null;
  /** chain value currently applied to the form (highlighted) */
  chosenNumber?: string | null;
  onPick: (entry: PreviousOrderEntry) => void;
}) {
  const index = useMemo(() => createPreviousIndex(records, orders), [records, orders]);
  const [results, setResults] = useState<PreviousOrderEntry[] | null>(null); // null = not yet searched
  const [searched, setSearched] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!phoneSearchable(whatsapp)) {
      setResults(null);
      setSearched(false);
      return;
    }
    setSearched(false);
    timer.current = window.setTimeout(() => {
      setResults(index.find(whatsapp, excludeOrderId));
      setSearched(true);
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [whatsapp, index, excludeOrderId]);

  if (!searched) return null;
  if (!results || results.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
        No previous order found.
      </div>
    );
  }

  const phone = normalizePhone(whatsapp);
  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-strong)', borderRadius: 9, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ padding: '5px 10px', fontWeight: 700, fontSize: 12, background: 'var(--primary-soft)', color: 'var(--primary-dark)' }}>
        Previous Orders Found — {results.length} Order{results.length === 1 ? '' : 's'}
        {results.some((r) => r.kind === 'order') && <span style={{ fontWeight: 400 }}> (incl. {results.filter((r) => r.kind === 'order').length} recent)</span>}
      </div>
      <div style={{ maxHeight: 210, overflowY: 'auto' }}>
        {results.map((rec) => {
          // chain value this row contributes when picked (null = no previous
          // order portion — the auto base number stays plain)
          const chain = entryChainValue(rec, baseNumber);
          const active = chain !== null && chain === chosenNumber;
          return (
            <div
              key={rec.id}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
                borderTop: '1px solid var(--border)', background: active ? 'var(--primary-soft)' : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <b className="mono" style={{ fontSize: 12.5 }}>{rec.orderNumber}</b>
                  {rec.name && <span style={{ fontSize: 12, fontWeight: 600 }}>{rec.name}</span>}
                  {rec.kind === 'order' && <span style={{ fontSize: 10.5, color: 'var(--secondary)' }}>recent order</span>}
                  {active && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ used</span>}
                </div>
                {rec.address && (
                  <div className="small muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.address}</div>
                )}
                <div className="small muted" style={{ fontSize: 11.5 }}>
                  WhatsApp: {phone}{rec.mobile ? ` · Mobile: ${rec.mobile}` : ''}
                </div>
                {chain !== null && chain !== rec.orderNumber && (
                  <div className="small muted" style={{ fontSize: 11.5 }}>
                    Reusable Previous Order: <span className="mono">{chain}</span>
                  </div>
                )}
              </div>
              <Button size="sm" variant={active ? 'secondary' : 'outline'} onClick={() => onPick(rec)}>
                Use This Order
              </Button>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', background: '#fff' }}>
        Phone {phone} · choosing an order makes it the immediate previous order
      </div>
    </div>
  );
}
