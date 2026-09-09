// ---------------------------------------------------------------------------
// First-run setup wizard:
//   Welcome → Connect spreadsheet (Google Sheets / Demo) → Order Fields →
//   Products → Done
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, toast } from '../../../store/appStore';
import { LS, storage, inExtension } from '../../../services/storage';
import { bgListSpreadsheets, bgListWorksheets, bgRunSheetOp } from '../../../services/messaging';
import { defaultSettings, DEFAULT_DEMO_PRODUCTS, demoOrders } from '../../../lib/constants';
import type { Order, OrderField, Settings } from '../../../types';
import { Button, Field, Select } from '../../../components/ui';
import { FieldBuilder } from '../../../components/fields/FieldBuilder';
import { ProductTableEditor } from '../../../components/products/ProductTableEditor';
import { navigate } from '../../router';
import { LogoMark } from '../../Shell';

type Step = 'welcome' | 'connect' | 'fields' | 'products' | 'done';
type ConnChoice = '' | 'google' | 'demo';

export function SetupWizard() {
  const store = useAppStore();
  const [step, setStep] = useState<Step>('welcome');
  const [busy, setBusy] = useState(false);

  const completeSetup = useCallback(async () => {
    await storage.set(LS.setupDone, true);
    await store.refreshConfig();
    navigate('dashboard');
  }, [store]);

  return (
    <div className="wizard-wrap">
      <div className="wizard">
        <div className="wizard-steps steps">
          {(['welcome', 'connect', 'fields', 'products', 'done'] as Step[]).map((s) => {
            const order = ['welcome', 'connect', 'fields', 'products', 'done'];
            const idx = order.indexOf(s);
            const cur = order.indexOf(step);
            return <div key={s} className={`step ${idx === cur ? 'on' : ''} ${idx < cur ? 'done' : ''}`} />;
          })}
        </div>
        {step === 'welcome' && (
          <WelcomeStep onNext={() => setStep('connect')} />
        )}
        {step === 'connect' && (
          <ConnectStep busy={busy} setBusy={setBusy} onNext={() => setStep('fields')} onBack={() => setStep('welcome')} />
        )}
        {step === 'fields' && (
          <FieldsStep onNext={() => setStep('products')} onBack={() => setStep('connect')} />
        )}
        {step === 'products' && (
          <ProductsStep onNext={() => setStep('done')} onBack={() => setStep('fields')} />
        )}
        {step === 'done' && <DoneStep onFinish={completeSetup} />}
      </div>
    </div>
  );
}

function WizardBody({ children }: { children: import('react').ReactNode }) {
  return <div className="wizard-body">{children}</div>;
}

// ---------------------------------------------------------------------------
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <WizardBody>
      <div style={{ textAlign: 'center', padding: '18px 6px 6px' }}>
        <LogoMark size={64} />
        <h1 style={{ fontSize: 26, margin: '14px 0 8px' }}>Welcome to Order Label Manager</h1>
        <p className="muted" style={{ maxWidth: 470, margin: '0 auto', fontSize: 14.5, lineHeight: 1.6 }}>
          Manage WhatsApp orders, save customer information to your spreadsheet, and generate printable labels — from one place.
        </p>
        <div style={{ marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={onNext}>Get Started</Button>
        </div>
      </div>
    </WizardBody>
  );
}

// ---------------------------------------------------------------------------
function ConnectStep({ busy, setBusy, onNext, onBack }: { busy: boolean; setBusy: (b: boolean) => void; onNext: () => void; onBack: () => void }) {
  const store = useAppStore();
  const settings = useAppStore((s) => s.settings);
  const [choice, setChoice] = useState<ConnChoice>(settings.spreadsheet.connected ? 'google' : '');
  const [sheetList, setSheetList] = useState<{ id: string; name: string }[] | null>(null);
  const [worksheets, setWorksheets] = useState<string[] | null>(null);
  const [sheetId, setSheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [worksheet, setWorksheet] = useState('');

  const googleSignedIn = settings.spreadsheet.connected;

  const connectGoogle = async () => {
    if (!inExtension()) {
      toast('error', 'Google sign-in needs the Chrome extension', { message: 'This preview runs outside Chrome. Load the built extension (dist folder) in Chrome, or use Demo Mode below to try the full flow.' });
      return;
    }
    setBusy(true);
    try {
      const { bgAuthConnect } = await import('../../../services/messaging');
      const res = await bgAuthConnect();
      if (res && typeof res === 'object' && 'email' in res) {
        toast('success', 'Google account connected', { message: (res as { email?: string }).email ? `Signed in as ${(res as { email?: string }).email}` : undefined });
        await store.refreshConfig();
        setChoice('google');
      }
    } catch (e) {
      toast('error', 'Unable to connect Google account', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const refreshSheets = async () => {
    setBusy(true);
    try {
      const list = await bgListSpreadsheets();
      setSheetList(list);
      if (list.length > 0) {
        setSheetId(list[0].id);
        setSheetName(list[0].name);
        void loadWorksheets(list[0].id);
      } else {
        setSheetList([]);
        toast('info', 'No spreadsheets found', { message: 'Create a spreadsheet in Google Sheets first, then click refresh.' });
      }
    } catch (e) {
      toast('error', 'Unable to list spreadsheets', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const loadWorksheets = async (spreadsheetId: string) => {
    try {
      const w = await bgListWorksheets(spreadsheetId);
      setWorksheets(w);
      setWorksheet(w[0] ?? '');
    } catch (e) {
      toast('error', 'Unable to read worksheets', { message: e instanceof Error ? e.message : undefined });
    }
  };

  const pickSheet = async (id: string) => {
    setSheetId(id);
    const meta = sheetList?.find((s) => s.id === id);
    setSheetName(meta?.name ?? '');
    await loadWorksheets(id);
  };

  const saveConnection = async () => {
    if (!sheetId || !worksheet) {
      toast('error', 'Select a spreadsheet and a worksheet first.');
      return;
    }
    setBusy(true);
    try {
      const { bgSaveConnection } = await import('../../../services/messaging');
      await bgSaveConnection({ spreadsheetId: sheetId, spreadsheetName: sheetName || 'Spreadsheet', worksheetName: worksheet });
      toast('success', 'Spreadsheet connected');
      await store.refreshConfig();
      onNext();
    } catch (e) {
      toast('error', 'Unable to save the connection', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const useDemo = async () => {
    // seed demo products + sample orders, switch to demo provider
    setBusy(true);
    try {
      const now = Date.now();
      const curFields = store.fields.length ? store.fields : (await import('../../../services/config')).defaultFieldTemplate();
      // fixed ids keep sample orders matched to products
      const curProducts = DEFAULT_DEMO_PRODUCTS.map((p) => ({ ...p, createdAt: now }));
      const demoOrdersList: Order[] = demoOrders();
      const s: Settings = { ...defaultSettings(), ...store.settings, demoMode: true, business: store.settings.business, spreadsheet: { provider: 'demo', connected: false, connection: null } };
      if (!s.order) s.order = defaultSettings().order;
      if (!s.products) s.products = {};
      s.products.included = curProducts.map((p) => p.id);
      if (!s.includedFields || !s.includedFields.length) s.includedFields = curFields.map((f) => f.id);
      await storage.setMany({
        [LS.settings]: s,
        [LS.products]: curProducts,
        [LS.fields]: curFields,
        [LS.orders]: demoOrdersList,
      });
      await store.refreshConfig();
      await store.refreshOrders();
      toast('success', 'Demo mode ready', { message: 'A sample spreadsheet, 5 products and 4 sample orders were created locally.' });
      onNext();
    } catch (e) {
      toast('error', 'Demo setup failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const connected = googleSignedIn && choice === 'google';

  return (
    <>
      <div className="wizard-body" style={{ paddingBottom: 10 }}>
        <h1 style={{ fontSize: 21 }}>Connect Spreadsheet</h1>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Orders are stored in <b>Google Sheets</b> (or a local demo sheet). The admin creates the columns <b>once</b> — every order after that is appended as a new row.
        </p>

        {!connected && (
          <div className="col" style={{ gap: 10, marginTop: 18 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>📊</div>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>Google Sheets</div>
                <div className="hint" style={{ margin: '3px 0 10px' }}>Connect your Google account and choose the spreadsheet where orders will be stored.</div>
                {googleSignedIn ? (
                  <Button variant="secondary" size="sm" onClick={() => { setChoice('google'); }}>Continue as {settings.spreadsheet.connection?.email ?? 'connected account'}</Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={connectGoogle} disabled={busy}>
                    {busy ? <span className="spinner" /> : null} Connect Google Account
                  </Button>
                )}
              </div>
            </div>
            <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 12, padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 30, lineHeight: 1 }}>🧪</div>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>Try Demo Mode</div>
                <div className="hint" style={{ margin: '3px 0 10px' }}>No Google account needed. A sample spreadsheet, products and orders are created on this computer so you can explore the whole workflow.</div>
                <Button size="sm" onClick={useDemo} disabled={busy}>{busy ? <span className="spinner" /> : null} Start Demo Mode</Button>
              </div>
            </div>
            {!inExtension() && (
              <p className="hint" style={{ background: 'var(--secondary-soft)', padding: '9px 12px', borderRadius: 8 }}>
                ⚠️ You are previewing outside Chrome — Google sign-in requires the packaged extension. Demo Mode works here.
              </p>
            )}
          </div>
        )}

        {connected && (
          <div className="col" style={{ gap: 12, marginTop: 18 }}>
            <div style={{ background: 'var(--success-soft)', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 13px', fontSize: 13 }}>
              ✅ Google account connected{settings.spreadsheet.connection?.email ? ` — ${settings.spreadsheet.connection.email}` : ''}
              <Button size="sm" variant="ghost" style={{ marginLeft: 10 }} onClick={connectGoogle}>Switch account</Button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" variant={sheetList ? 'ghost' : 'primary'} onClick={refreshSheets} disabled={busy}>
                {busy ? <span className="spinner" /> : null} {sheetList ? 'Refresh spreadsheets' : 'Choose Spreadsheet'}
              </Button>
            </div>
            {sheetList !== null && (
              <Field label="Spreadsheet">
                <Select value={sheetId} onChange={(e) => void pickSheet(e.target.value)}>
                  {sheetList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  {sheetList.length === 0 && <option value="">No spreadsheets found</option>}
                </Select>
              </Field>
            )}
            {worksheets !== null && sheetId && (
              <Field label="Worksheet / tab">
                <Select value={worksheet} onChange={(e) => setWorksheet(e.target.value)}>
                  {worksheets.map((w) => <option key={w} value={w}>{w}</option>)}
                  {worksheets.length === 0 && <option value="">No worksheets found</option>}
                </Select>
              </Field>
            )}
          </div>
        )}
      </div>
      <div className="wizard-foot">
        <Button variant="ghost" onClick={() => { if (connected) setChoice(''); else onBack(); }}>
          Back
        </Button>
        {connected && (
          <Button variant="primary" onClick={saveConnection} disabled={busy || !sheetId}>
            {busy ? <span className="spinner" /> : null} Continue
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function FieldsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const store = useAppStore();
  const fields = useAppStore((s) => s.fields);
  const settings = useAppStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const doneOnce = useRef(false);

  useEffect(() => {
    // ensure spreadsheet columns exist when this step is open (mounts fresh
    // every time the user navigates here)
    if (doneOnce.current) return;
    const conn = settings.spreadsheet.connection;
    if (!settings.spreadsheet.connected || !conn?.spreadsheetId) return;
    doneOnce.current = true;
    void (async () => {
      setBusy(true);
      try {
        await bgRunSheetOp({ kind: 'ensureSchema', fields, products: store.products, settings });
      } catch {
        // columns are also ensured on every Save Order — non-fatal here
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveFields = async (next: OrderField[]) => {
    const included = new Set(settings.includedFields?.length ? settings.includedFields : fields.map((f) => f.id));
    const labelSel = settings.labelFields;
    await store.persist({
      fields: next,
      settings: {
        ...settings,
        includedFields: next.filter((f) => included.has(f.id)).map((f) => f.id),
        labelFields: labelSel.length ? labelSel : next.filter((f) => ['customerName', 'customerWhatsapp', 'customerMobile', 'paymentStatus'].includes(String(f.key))).map((f) => f.id),
      },
    });
  };

  return (
    <>
      <div className="wizard-body">
        <h1 style={{ fontSize: 21 }}>Order Fields</h1>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Create the information you collect for every order. Each field becomes a <b>spreadsheet column</b> — you only do this once. Every order you enter later is added as a <b>new row</b>.
        </p>
        <div style={{ marginTop: 14 }}>
          <FieldBuilder embedded fields={fields} onChange={(f) => void saveFields(f)} />
        </div>
        {busy && <p className="hint" style={{ marginTop: 8 }}><span className="spinner" /> Syncing columns to the spreadsheet…</p>}
      </div>
      <div className="wizard-foot">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>Continue to products →</Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function ProductsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const store = useAppStore();
  const persistProducts = async (products: import('../../../types').Product[]) => {
    const settings = { ...store.settings };
    if (!settings.products) settings.products = {};
    const prev = settings.products.included ?? [];
    const known = new Set(products.map((p) => p.id));
    const activeNew = new Set(products.filter((p) => p.active).map((p) => p.id));
    // keep previous inclusion choices for products that still exist & are active
    const merged = prev.filter((id) => activeNew.has(id) && known.has(id));
    for (const p of products) {
      if (p.active && !merged.includes(p.id)) merged.push(p.id);
    }
    settings.products.included = merged;
    await store.persist({ products, settings });
  };
  return (
    <>
      <div className="wizard-body">
        <h1 style={{ fontSize: 21 }}>Products</h1>
        <p className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          Add the products you sell (e.g. Night Cream, Face Serum). Each product gets its own <b>“Product Qty” column</b> in the spreadsheet and appears on labels with its quantity.
        </p>
        <div style={{ marginTop: 14 }}>
          <ProductTableEditor
            products={store.products}
            onChange={(products) => void persistProducts(products)}
            spreadsheetColumnIds={store.settings.products?.included}
            onToggleSpreadsheetColumn={async (productId, include) => {
              const settings = { ...store.settings };
              if (!settings.products) settings.products = {};
              const list = (settings.products.included ?? store.products.map((p) => p.id)).filter((id) => id !== productId);
              if (include) list.push(productId);
              settings.products.included = list;
              await store.persist({ settings });
            }}
          />
        </div>
      </div>
      <div className="wizard-foot">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>Finish setup →</Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function DoneStep({ onFinish }: { onFinish: () => void }) {
  const store = useAppStore();
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    // create the columns in the spreadsheet right away so the owner sees them
    try {
      if (!store.settings.demoMode && store.settings.spreadsheet.connected) {
        await bgRunSheetOp({ kind: 'ensureSchema', fields: store.fields, products: store.products, settings: store.settings });
      }
    } catch (e) {
      toast('info', 'Columns will be created automatically when you save your first order.', { message: e instanceof Error ? e.message : undefined });
    }
    await onFinish();
  };

  return (
    <>
      <WizardBody>
        <div style={{ textAlign: 'center', padding: '20px 6px 10px' }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <h1 style={{ fontSize: 23, margin: '10px 0 8px' }}>You're all set{store.settings.demoMode ? ' (demo mode)' : ''}!</h1>
          <p className="muted" style={{ maxWidth: 480, margin: '0 auto', lineHeight: 1.65 }}>
            {store.settings.demoMode
              ? 'Sample products and orders are ready. Try opening an order and generating a label.'
              : `Orders will be saved to “${store.settings.spreadsheet.connection?.spreadsheetName ?? 'your spreadsheet'}” → worksheet “${store.settings.spreadsheet.connection?.worksheetName ?? 'Orders'}”.`}
          </p>
          <div style={{ marginTop: 26 }}>
            <Button variant="primary" size="lg" onClick={finish} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Create my first order
            </Button>
          </div>
        </div>
      </WizardBody>
    </>
  );
}
