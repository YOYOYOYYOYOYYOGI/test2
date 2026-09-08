// ---------------------------------------------------------------------------
// Old-customer lookup on the New Order page. Debounced (350 ms) search that
// only runs once 10+ digits are typed, against a pre-built in-memory index
// (never a per-keystroke scan of the imported data, never Google Sheets).
// Shows EVERY old order for the number; the user picks which one to use.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OldOrderRecord } from '../../types';
import { indexOldOrders, findOldByWhatsapp } from '../../services/oldOrders';
import { phoneSearchable } from '../../lib/normalizePhone';
import { Button } from '../ui';

export function OldOrderLookup({ whatsapp, records, chosenNumber, onPick }: {
  whatsapp: string;
  records: OldOrderRecord[];
  /** old order number currently applied to the form (highlighted) */
  chosenNumber?: string | null;
  onPick: (rec: OldOrderRecord) => void;
}) {
  const index = useMemo(() => indexOldOrders(records), [records]);
  const [results, setResults] = useState<OldOrderRecord[] | null>(null); // null = not yet searched
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
      setResults(findOldByWhatsapp(index, whatsapp));
      setSearched(true);
    }, 350);
    return () => window.clearTimeout(timer.current);
  }, [whatsapp, index]);

  if (!searched) return null;
  if (!results || results.length === 0) {
    return (
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
        No previous order found.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-strong)', borderRadius: 9, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ padding: '5px 10px', fontWeight: 700, fontSize: 12, background: 'var(--primary-soft)', color: 'var(--primary-dark)' }}>
        Previous Orders Found · {results.length} order{results.length === 1 ? '' : 's'}
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto' }}>
        {results.map((rec) => {
          const active = rec.orderNumber === chosenNumber;
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
                  {active && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ used</span>}
                </div>
                {rec.address && (
                  <div className="small muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec.address}</div>
                )}
              </div>
              <Button size="sm" variant={active ? 'secondary' : 'outline'} onClick={() => onPick(rec)}>
                Use This Order
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
