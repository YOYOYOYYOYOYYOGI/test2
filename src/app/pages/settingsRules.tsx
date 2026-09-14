// ---------------------------------------------------------------------------
// Settings → "Delivery Rules" + "Duplicates" tabs.
// Both rule builders edit a local draft and persist only on Save, exactly
// like the other settings tabs.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { CompareOp, DeliveryCondition, DeliveryRule, MatchingRule, OrderField } from '../../types';
import { makeId } from '../../lib/constants';
import { deliveryFieldOptions, AMOUNT_FIELD } from '../../lib/delivery';
import { matchingFieldOptions, matchingFieldLabel, MATCH_MODE_LABELS } from '../../lib/matching';
import { Badge, Button, Card, Field, Input, Select, Toggle } from '../../components/ui';

type DeliveryDraft = { defaultCharge: number; rules: DeliveryRule[] };
type MatchingDraft = { rules: MatchingRule[] };

const OPS: { value: CompareOp; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not equals' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'lessThan', label: 'Less than' },
  { value: 'contains', label: 'Contains' },
];

function num(raw: string, fallback = 0): number {
  const n = parseFloat(raw.replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : fallback;
}

// ---------------------------------------------------------------------------
export function DeliveryRulesTab() {
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const pick = (s: typeof settings): DeliveryDraft => ({
    defaultCharge: s.delivery?.defaultCharge ?? 0,
    rules: (s.delivery?.rules ?? []).map((r) => ({
      ...r,
      conditions: r.conditions.map((c) => ({ ...c })),
    })),
  });
  const [draft, setDraft] = useState<DeliveryDraft>(() => pick(settings));
  useEffect(() => setDraft(pick(settings)), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));

  const setRule = (i: number, patch: Partial<DeliveryRule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) }));
  const setCond = (ri: number, ci: number, patch: Partial<DeliveryCondition>) =>
    setRule(ri, { conditions: draft.rules[ri].conditions.map((c, x) => (x === ci ? { ...c, ...patch } : c)) });
  const addRule = () =>
    setDraft((d) => ({
      ...d,
      rules: [...d.rules, { id: makeId(), charge: 0, conditions: [{ id: makeId(), field: fields[0]?.id ?? AMOUNT_FIELD, op: 'equals', value: '' }] }],
    }));
  const moveRule = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const rules = d.rules.slice();
      const j = i + dir;
      if (j < 0 || j >= rules.length) return d;
      [rules[i], rules[j]] = [rules[j], rules[i]];
      return { ...d, rules };
    });
  const removeRule = (i: number) => setDraft((d) => ({ ...d, rules: d.rules.filter((_, ri) => ri !== i) }));

  const save = async () => {
    await useAppStore.getState().persist({ settings: { ...settings, delivery: { defaultCharge: draft.defaultCharge, rules: draft.rules } } });
    toast('success', 'Delivery charge rules saved');
  };

  const fieldOptions = deliveryFieldOptions(fields);

  return (
    <div style={{ maxWidth: 760 }}>
      <Card title="Delivery Charge Rules"
        actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>Save</Button>}>
        <div className="card-pad col" style={{ gap: 12 }}>
          <p className="hint" style={{ margin: 0 }}>
            Rules run top-to-bottom on every order; the <b>first rule whose conditions all match</b> sets the
            delivery charge. If nothing matches, the <b>default charge</b> below is used. Charge is added to the
            order as <span className="mono">Subtotal + Delivery = Grand Total</span> and is written to the order,
            the label, the Excel export and the spreadsheet (Delivery Charge / Total columns).
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: '240px 1fr' }}>
            <Field label="Default delivery charge (₹)" hint="Used when no rule matches — 0 = free">
              <Input type="number" min={0} step="1" value={draft.defaultCharge || ''} placeholder="0"
                onChange={(e) => setDraft((d) => ({ ...d, defaultCharge: num(e.target.value) }))} />
            </Field>
            <div className="col" style={{ justifyContent: 'center' }}>
              <span className="hint">Example: rules below decide — if none matches, every order pays this.</span>
            </div>
          </div>
        </div>
      </Card>

      {draft.rules.map((rule, ri) => (
        <Card key={rule.id} title={
          <span className="row" style={{ gap: 8 }}>
            Rule {ri + 1}
            {ri === 0 && draft.rules.length > 1 && <Badge color="gray">first match wins</Badge>}
          </span>
        }
          actions={
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" disabled={ri === 0} title="Move up (higher priority)" onClick={() => moveRule(ri, -1)}>↑</Button>
              <Button size="sm" variant="ghost" disabled={ri === draft.rules.length - 1} title="Move down (lower priority)" onClick={() => moveRule(ri, 1)}>↓</Button>
              <Button size="sm" variant="ghost" title="Delete rule" onClick={() => removeRule(ri)}>✕</Button>
            </div>
          }>
          <div className="card-pad col" style={{ gap: 8 }}>
            {rule.conditions.map((cond, ci) => {
              const field = fields.find((f) => f.id === cond.field);
              return (
                <div key={cond.id}>
                  <div className="row row-wrap" style={{ gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ width: 210 }}>
                      <Select value={cond.field} onChange={(e) => setCond(ri, ci, { field: e.target.value })}>
                        {fieldOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </Select>
                    </div>
                    <div style={{ width: 140 }}>
                      <Select value={cond.op} onChange={(e) => setCond(ri, ci, { op: e.target.value as CompareOp })}>
                        {OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </div>
                    <div style={{ width: 170 }}>
                      {field && field.type === 'dropdown' && field.options && field.options.length > 0 && cond.field !== AMOUNT_FIELD ? (
                        <Select value={cond.value} onChange={(e) => setCond(ri, ci, { value: e.target.value })}>
                          <option value="">— select —</option>
                          {field.options.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
                        </Select>
                      ) : (
                        <Input
                          type={cond.field === AMOUNT_FIELD ? 'number' : 'text'}
                          min={0} step="1"
                          placeholder={cond.field === AMOUNT_FIELD ? 'e.g. 600' : 'e.g. Gujarat'}
                          value={cond.value}
                          onChange={(e) => setCond(ri, ci, { value: e.target.value })}
                        />
                      )}
                    </div>
                    {ci > 0 ? (
                      <Button size="sm" variant="ghost" title="Remove condition" onClick={() => setRule(ri, { conditions: rule.conditions.filter((_, x) => x !== ci) })}>✕</Button>
                    ) : <span className="hint" style={{ paddingBottom: 6 }}>{rule.conditions.length > 1 ? 'AND' : ''}</span>}
                  </div>
                  {ci < rule.conditions.length - 1 && <div className="small muted" style={{ padding: '4px 0 0 2px' }}>AND</div>}
                </div>
              );
            })}
            <div className="row" style={{ gap: 8, alignItems: 'flex-end', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
              <Field label="Then delivery charge (₹)"><Input type="number" min={0} step="1" value={rule.charge || ''} placeholder="100" onChange={(e) => setRule(ri, { charge: num(e.target.value) })} style={{ width: 160 }} /></Field>
              <Button size="sm" variant="ghost" onClick={() => setRule(ri, { conditions: [...rule.conditions, { id: makeId(), field: AMOUNT_FIELD, op: 'lessThan', value: '' }] })}>+ Add condition (AND)</Button>
            </div>
          </div>
        </Card>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <Button variant="outline" icon={<span>+</span>} onClick={addRule}>Add Rule</Button>
      </div>
      {draft.rules.length === 0 && (
        <p className="hint" style={{ marginTop: 10 }}>No rules yet — add one, e.g. <span className="mono">State Equals Gujarat AND Order Amount Less than 600 → ₹100</span>.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MatchingRulesTab() {
  const settings = useAppStore((s) => s.settings);
  const fields = useAppStore((s) => s.fields);
  const pick = (s: typeof settings): MatchingDraft => ({
    rules: (s.matching?.rules ?? []).map((r) => ({ ...r })),
  });
  const [draft, setDraft] = useState<MatchingDraft>(() => pick(settings));
  useEffect(() => setDraft(pick(settings)), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(settings));

  const fieldOptions = matchingFieldOptions(fields);
  const setRule = (i: number, patch: Partial<MatchingRule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) }));
  const addRule = () =>
    setDraft((d) => ({
      ...d,
      rules: [...d.rules, { id: makeId(), fieldId: fieldOptions[0]?.id ?? '', mode: 'exact', enabled: true }],
    }));
  const removeRule = (i: number) => setDraft((d) => ({ ...d, rules: d.rules.filter((_, ri) => ri !== i) }));

  const save = async () => {
    await useAppStore.getState().persist({ settings: { ...settings, matching: { rules: draft.rules } } });
    toast('success', 'Duplicate matching rules saved');
  };

  const fieldById = (id: string): OrderField | undefined => fields.find((f) => f.id === id);

  return (
    <div style={{ maxWidth: 760 }}>
      <Card title="Duplicate / Matching Rules"
        actions={<Button size="sm" variant="primary" disabled={!dirty} onClick={() => void save()}>Save</Button>}>
        <div className="card-pad col" style={{ gap: 12 }}>
          <p className="hint" style={{ margin: 0 }}>
            Before an order is saved, every <b>enabled</b> rule compares the value you typed for that field
            against all existing orders. A match shows <b>“Matching … found”</b> with the existing order —
            you can view it or continue anyway. Duplicates are never created silently.
          </p>
          {fieldOptions.length === 0 && (
            <p className="hint">No matchable fields yet — add fields on the Fields &amp; Columns page (e.g. Transaction ID, Email, Phone).</p>
          )}
        </div>
      </Card>

      {draft.rules.map((rule, ri) => {
        const f = fieldById(rule.fieldId);
        return (
          <div key={rule.id} className="card card-pad" style={{ marginBottom: 10 }}>
            <div className="row row-wrap" style={{ gap: 8 }}>
              <div style={{ width: 220 }}>
                <Select value={rule.fieldId} onChange={(e) => setRule(ri, { fieldId: e.target.value })}>
                  {fieldOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  {!fieldOptions.some((o) => o.id === rule.fieldId) && <option value={rule.fieldId}>{rule.fieldId} (deleted field)</option>}
                </Select>
              </div>
              <div style={{ width: 190 }}>
                <Select value={rule.mode} onChange={(e) => setRule(ri, { mode: e.target.value as MatchingRule['mode'] })}>
                  {(Object.keys(MATCH_MODE_LABELS) as MatchingRule['mode'][]).map((m) => <option key={m} value={m}>{MATCH_MODE_LABELS[m]}</option>)}
                </Select>
              </div>
              <Toggle checked={rule.enabled} onChange={(v) => setRule(ri, { enabled: v })} label={<span className="small">{rule.enabled ? 'On' : 'Off'}</span>} />
              <div style={{ marginLeft: 'auto' }}>
                <Button size="sm" variant="ghost" title="Delete rule" onClick={() => removeRule(ri)}>✕</Button>
              </div>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {rule.enabled
                ? <>Warn when a new order's <b>{matchingFieldLabel(rule.fieldId, fields)}</b> {modeVerb(rule.mode)} an existing order{f ? (f.type === 'phone' || String(f.key).includes('Whatsapp') || String(f.key).includes('Mobile')) ? ' — phones compared as typed (e.g. 9876543210)' : '' : ''}.</>
                : <>Disabled — <b>{matchingFieldLabel(rule.fieldId, fields)}</b> is not checked.</>}
            </div>
          </div>
        );
      })}

      <div className="row" style={{ marginTop: 12 }}>
        <Button variant="outline" icon={<span>+</span>} onClick={addRule} disabled={fieldOptions.length === 0}>Add Rule</Button>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Tip: the order number already has its own built-in duplicate check — these rules add more (Transaction ID, Phone, Email, any custom field…).
      </p>
    </div>
  );
}

function modeVerb(m: MatchingRule['mode']): string {
  switch (m) {
    case 'exact': return 'exactly matches a value in';
    case 'insensitive': return 'matches (ignoring case) a value in';
    default: return 'appears inside / contains a value in';
  }
}
