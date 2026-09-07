// ---------------------------------------------------------------------------
// Field builder — admin creates/edits/reorders the fields that become
// spreadsheet columns and order-form inputs.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { FieldOption, FieldType, OrderField } from '../../types';
import { FIELD_KEY_HINTS, FIELD_TYPE_OPTIONS, makeId } from '../../lib/constants';
import { Button, Checkbox, Field, Input, Modal, Select, TextArea } from '../ui';
import { IconDrag, IconEdit, IconPlus, IconTrash } from '../icons';

export function fieldTypeLabel(t: FieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

/** keep columnHeader so renames never silently detach from the old column */
function renamed(field: OrderField, nextName: string): OrderField {
  const clean = nextName.trim();
  const old = (field.columnHeader || field.name).trim();
  if (!clean || clean.toLowerCase() === old.toLowerCase()) {
    return { ...field, name: clean || field.name, columnHeader: clean ? undefined : field.columnHeader };
  }
  // renaming: remember the previous column so data keeps landing there until
  // the admin remaps in Fields & Columns
  return { ...field, name: clean, columnHeader: old };
}

export function FieldEditorModal({ field, onSave, onClose, allowKeySelect }: {
  field: OrderField | null;
  onSave: (f: OrderField) => void;
  onClose: () => void;
  allowKeySelect?: boolean;
}) {
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [required, setRequired] = useState(field?.required ?? false);
  const [options, setOptions] = useState<FieldOption[]>(field?.options ?? []);
  const [column, setColumn] = useState(field?.columnHeader ?? '');
  const [key, setKey] = useState<string>(field?.key ?? 'custom');
  const [err, setErr] = useState('');

  const isEditing = Boolean(field);

  // auto-bind well-known names (City → customer.city, Payment Status → …)
  useEffect(() => {
    if (!field) {
      const hint = FIELD_KEY_HINTS[name.trim()];
      if (hint) setKey(hint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const save = () => {
    if (!name.trim()) { setErr('Field name is required.'); return; }
    if (!isEditing && /[;,\n]/.test(name)) { setErr('Avoid ; , and line breaks in the name.'); return; }
    const cleanOptions = type === 'dropdown' || type === 'radio'
      ? options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)
      : undefined;
    if ((type === 'dropdown' || type === 'radio') && (!cleanOptions || cleanOptions.length === 0)) {
      setErr('Add at least one option.');
      return;
    }
    const base: OrderField = {
      id: field?.id ?? makeId(),
      name: name.trim(),
      type,
      required,
      key: field && !allowKeySelect ? field.key ?? 'custom' : key || 'custom',
      options: cleanOptions,
      columnHeader: column.trim() || undefined,
      order: field?.order ?? 0,
    };
    onSave(isEditing && name.trim() !== (field as OrderField).name ? renamed(base, name.trim()) : base);
    onClose();
  };

  const keyHint = (t: FieldType): string => {
    switch (t) {
      case 'text': case 'textarea': return 'Text value';
      case 'number': return 'Whole number';
      case 'phone': return 'Phone (10–15 digits)';
      case 'email': return 'Email address';
      case 'date': return 'YYYY-MM-DD';
      case 'checkbox': return 'Yes / No';
      case 'currency': return 'Amount in ₹';
      case 'product': return 'Product summary of the order';
      case 'quantity': return 'Total item count of the order';
      case 'paymentStatus': return 'Paid / COD / Pending / Failed / Refunded';
      case 'orderStatus': return 'New / Confirmed / Processing / Packed / Shipped / Delivered / Cancelled / Returned';
      default: return '—';
    }
  };

  return (
    <Modal open onClose={onClose} title={isEditing ? 'Edit field' : 'Add field'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{isEditing ? 'Save field' : 'Add field'}</Button></>}>
      <div className="col" style={{ gap: 12 }}>
        <Field label="Field name" required error={err ? err : undefined}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="e.g. Order Number, Customer Name…" autoFocus />
        </Field>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Field type" hint={keyHint(type)}>
            <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox checked={required} onChange={(e) => setRequired(e.target.checked)} label={<b>Required field</b>} />
          </div>
        </div>
        {(type === 'dropdown' || type === 'radio') && (
          <Field label={`${type === 'dropdown' ? 'Dropdown' : 'Radio'} options`} hint="One option per line">
            <TextArea value={options.map((o) => o.label).join('\n')} onChange={(e) => setOptions(e.target.value.split('\n').map((label) => ({ id: makeId(), label })))} />
          </Field>
        )}
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Spreadsheet column" hint="Optional override — defaults to the field name.">
            <Input value={column} onChange={(e) => setColumn(e.target.value)} placeholder="Same as field name" />
          </Field>
          <Field label="Stored as" hint={field?.key && field.key !== 'custom' ? `Bound to order.${field.key}` : 'Saved as a custom value'}>
            <Input value={field?.key && field.key !== 'custom' ? String(field.key) : 'custom'} disabled />
          </Field>
        </div>
        <p className="hint">
          💡 Fields become spreadsheet columns. Every new order becomes one new row below.
          Renaming a field never renames or deletes an existing column — use the column mapping on the Fields & Columns page instead.
        </p>
      </div>
    </Modal>
  );
}

export function FieldBuilder({ fields, onChange, embedded }: {
  fields: OrderField[];
  onChange: (next: OrderField[]) => void;
  /** compact mode used inside the wizard */
  embedded?: boolean;
}) {
  const [editor, setEditor] = useState<{ field: OrderField | null } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);

  const update = (next: OrderField[]) => onChange(next.map((f, i) => ({ ...f, order: i })));

  const handleDrop = (ev: DragEvent, targetIndex: number) => {
    ev.preventDefault();
    setDragIndex(null);
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...sorted];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    update(next);
  };

  const remove = (id: string) => {
    if (!confirm('Delete this field? Existing spreadsheet columns and order history are kept — only this field stops being used.')) return;
    update(sorted.filter((f) => f.id !== id));
  };

  const head: ReactNode = (
    <div className="row spread" style={{ gap: 8, flexWrap: 'wrap' }}>
      <div className="row">
        <Button size="sm" variant="primary" icon={<IconPlus width={14} />} onClick={() => setEditor({ field: null })}>Add field</Button>
      </div>
      <span className="hint">{fields.length} field{fields.length === 1 ? '' : 's'} → {fields.length} spreadsheet column{fields.length === 1 ? '' : 's'}</span>
    </div>
  );

  return (
    <div className="col" style={{ gap: 8 }}>
      {head}
      {sorted.length === 0 && (
        <div className="empty" style={{ padding: 26 }}><div className="icon">🗂️</div>No fields yet — add your first field above.</div>
      )}
      {sorted.map((f, i) => (
        <div
          key={f.id}
          className={`row ${dragIndex === i ? 'dragging' : ''}`}
          style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 10px', gap: 10, flexWrap: 'wrap' }}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={() => setDragIndex(null)}
        >
          <span className="fb-handle" title="Drag to reorder"><IconDrag width={15} /></span>
          <div style={{ flex: '1 1 160px', minWidth: 130 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.name}</div>
            <div className="small muted">{fieldTypeLabel(f.type)}</div>
          </div>
          {!embedded && (
            <div style={{ width: 90 }}>
              <div className="small muted" style={{ marginBottom: 2 }}>Required</div>
              <Checkbox checked={f.required} onChange={(e) => update(sorted.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)))} />
            </div>
          )}
          {embedded ? <Checkbox label="Required" checked={f.required} onChange={(e) => update(sorted.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)))} /> : null}
          <div className="row" style={{ marginLeft: 'auto' }}>
            <Button size="sm" variant="ghost" icon={<IconEdit width={13} />} onClick={() => setEditor({ field: f })}>Edit</Button>
            <Button size="sm" variant="ghost" icon={<IconTrash width={13} />} onClick={() => remove(f.id)} style={{ color: 'var(--danger)' }} />
          </div>
        </div>
      ))}
      {editor && <FieldEditorModal field={editor.field} onSave={(f) => {
        if (editor.field) update(sorted.map((x) => (x.id === f.id ? f : x)));
        else update([...sorted, f]);
      }} onClose={() => setEditor(null)} />}
    </div>
  );
}
