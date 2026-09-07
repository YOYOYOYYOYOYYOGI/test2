// ---------------------------------------------------------------------------
// ErrorBoundary — last line of defence: if any page crashes, show a readable
// message (+ collapsible technical details) instead of a dead white screen.
// ---------------------------------------------------------------------------
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // keep the full stack for the on-screen "Technical details" disclosure
    const e = new Error(error.message);
    e.name = error.name;
    e.stack = `${error.stack ?? ''}\n\nComponent stack:\n${info.componentStack ?? ''}`;
    this.setState({ error: e });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    return (
      <div style={{ maxWidth: 720, margin: '48px auto', padding: '26px 28px', background: '#ffffff', border: '1px solid #fecaca', borderRadius: 14, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', color: '#0f172a' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.09em', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 8 }}>Something went wrong</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{err.name}: {err.message || '(no message)'}</div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.55, margin: '0 0 14px' }}>
          Your orders and settings are safe — they live in Chrome storage / your spreadsheet, not in this page.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            onClick={() => { window.location.hash = ''; window.location.reload(); }}
            style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            ↻ Reload the app
          </button>
          {typeof chrome !== 'undefined' && chrome.runtime?.reload && (
            <button
              onClick={() => { void chrome.runtime.reload(); }}
              style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              ↻ Reload extension
            </button>
          )}
        </div>
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#475569', userSelect: 'none' }}>Technical details (for support)</summary>
          <pre style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', padding: 10, borderRadius: 8, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{err.stack}</pre>
        </details>
      </div>
    );
  }
}
