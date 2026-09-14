// ---------------------------------------------------------------------------
// Reusable UI primitives
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { useToastStore } from '../store/appStore';
import { IconCheck, IconX } from './icons';

// ---------- Button ----------
type BtnVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = 'outline', size = 'md', block, icon, children, className = '', ...rest }: BtnProps) {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : variant === 'outline' ? 'btn-outline' : variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : 'btn-danger-outline',
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    block ? 'btn-block' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ title, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="btn btn-ghost btn-icon" title={title} aria-label={title} {...rest} />;
}

// ---------- Inputs ----------
interface FieldWrapProps { label?: ReactNode; required?: boolean; error?: string; hint?: ReactNode; className?: string; children: ReactNode; htmlFor?: string; }
export function Field({ label, required, error, hint, className = '', children, htmlFor }: FieldWrapProps) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { invalid?: boolean; }
export function Input({ invalid, className = '', ...rest }: InputProps) {
  return <input className={`input ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { invalid?: boolean; }
export function TextArea({ invalid, className = '', ...rest }: TextAreaProps) {
  return <textarea className={`textarea ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { invalid?: boolean; }
export function Select({ invalid, className = '', children, ...rest }: SelectProps) {
  return (
    <select className={`select ${invalid ? 'invalid' : ''} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={`check-label ${className}`}>
      <input type="checkbox" className="cb" {...rest} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="check-label" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <input type="checkbox" className="cb" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- Cards ----------
/** White card. Use `.card-pad` class on children for padding. */
export function Card({ children, className = '', title, actions, pad }: { children?: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <div className={`card ${pad ? '' : ''} ${className}`}>
      {title !== undefined && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {pad ? <div className="card-pad">{children}</div> : children}
    </div>
  );
}

export function SectionCard({ icon, title, children, actions, className = '' }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`section-card ${className}`}>
      <div className="sec-head">
        {icon}
        <span>{title}</span>
        {actions && <div style={{ marginLeft: 'auto' }} className="row">{actions}</div>}
      </div>
      <div className="sec-body">{children}</div>
    </section>
  );
}

// ---------- Badge ----------
type BadgeColor = 'gray' | 'orange' | 'blue' | 'green' | 'red' | 'amber' | 'purple';
export function Badge({ color = 'gray', children, title }: { color?: BadgeColor; children: ReactNode; title?: string }) {
  return <span className={`badge ${color}`} title={title}>{children}</span>;
}

export function paymentBadgeColor(status: string): BadgeColor {
  switch (status) {
    case 'Paid': return 'green';
    case 'COD': return 'blue';
    case 'Pending': return 'amber';
    case 'Failed': return 'red';
    case 'Refunded': return 'purple';
    default: return 'gray';
  }
}

export function orderStatusColor(status: string): BadgeColor {
  switch (status) {
    case 'New': return 'orange';
    case 'Confirmed': return 'blue';
    case 'Processing': return 'purple';
    case 'Packed': return 'amber';
    case 'Shipped': return 'blue';
    case 'Delivered': return 'green';
    case 'Cancelled': return 'red';
    case 'Returned': return 'red';
    default: return 'gray';
  }
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer, wide, closeOnBackdrop = true }: {
  open: boolean; onClose: () => void; title?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean; closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        {title !== undefined && (
          <div className="modal-head">
            <h3 style={{ fontSize: 15 }}>{title}</h3>
            <IconButton onClick={onClose} title="Close"><IconX width={16} /></IconButton>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" /> : null} {confirmLabel}
          </Button>
        </>
      }>
      <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.55 }}>{message}</div>
    </Modal>
  );
}

// ---------- Empty / spinner ----------
export function EmptyState({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon ?? '📦'}</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {sub && <div style={{ maxWidth: 420, margin: '0 auto', fontSize: 13 }}>{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function LoadingCenter({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading-center"><span className="spinner" />{label}</div>;
}

// ---------- Toasts ----------
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div className="toast-title">
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {t.kind === 'success' && <IconCheckCircleS />}
              {t.kind === 'error' && <span style={{ color: 'var(--danger)' }}>⚠️</span>}
              {t.kind === 'info' && <span style={{ color: 'var(--secondary)' }}>ℹ️</span>}
              {t.kind === 'loading' && <span className="spinner" />}
              {t.title}
            </span>
            <button className="toast-close" onClick={() => dismiss(t.id)}><IconX width={13} /></button>
          </div>
          {t.message && <div className="toast-msg">{t.message}</div>}
          {t.actions && t.actions.length > 0 && (
            <div className="toast-actions">
              {t.actions.map((a, i) => (
                <Button key={i} size="sm" variant={a.kind === 'primary' ? 'primary' : a.kind === 'danger' ? 'dangerOutline' : 'outline'} onClick={() => { dismiss(t.id); a.onClick(); }}>{a.label}</Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function IconCheckCircleS() {
  return <IconCheck width={15} style={{ color: 'var(--success)' }} />;
}

// ---------- Misc ----------
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const items: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i += 1) items.push(i);
  return (
    <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 5 }}>
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</Button>
      {items.map((p) => (
        <Button key={p} size="sm" variant={p === page ? 'primary' : 'ghost'} onClick={() => onChange(p)}>{p}</Button>
      ))}
      <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</Button>
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 180): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function downloadFile(name: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function useWhyChanged(_label: string) { void 0; }

export function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export { IconCheck };
