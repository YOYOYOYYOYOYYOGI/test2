// ---------------------------------------------------------------------------
// Products — catalogue management with per-product spreadsheet qty columns
// ---------------------------------------------------------------------------
import { useRef, useState } from 'react';
import { useAppStore, toast } from '../../store/appStore';
import type { Product } from '../../types';
import { Card, Button, Modal } from '../../components/ui';
import { IconDownload, IconUpload } from '../../components/icons';
import { ProductTableEditor } from '../../components/products/ProductTableEditor';
import { fileToRows } from '../../lib/tableImport';
import {
  applyProductImport,
  exportProductsBlob,
  planProductImport,
  productsFilename,
  type ProductImportPlan,
} from '../../services/dataExchange';
import { downloadBlob } from '../../services/excelExport';

export function ProductsPage({ go }: { go: (r: string) => void }) {
  const products = useAppStore((s) => s.products);
  const settings = useAppStore((s) => s.settings);
  const persist = useAppStore((s) => s.persist);
  const [editorKey, setEditorKey] = useState(0);
  const [fileBusy, setFileBusy] = useState<'export' | 'import' | null>(null);
  const [pendingPlan, setPendingPlan] = useState<ProductImportPlan | null>(null);
  const [pendingName, setPendingName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const included = settings.products?.included ?? products.filter((p) => p.active).map((p) => p.id);

  const toggleColumn = async (productId: string, include: boolean) => {
    const list = (included ?? []).filter((id) => id !== productId);
    if (include) list.push(productId);
    await persist({ settings: { ...settings, products: { ...(settings.products ?? {}), included: list } } });
    toast('success', include ? 'Column will be created on next save' : 'Column removed from future rows', { message: include ? 'Existing columns are never deleted.' : undefined });
  };

  /** Persist a product list and keep the qty-column inclusion list in sync
   *  (new active products get a column id; removed ones are dropped). */
  const saveProducts = async (next: Product[]) => {
    const known = new Set(next.map((p) => p.id));
    const active = new Set(next.filter((p) => p.active).map((p) => p.id));
    const keep = (included ?? []).filter((id) => known.has(id) && active.has(id));
    for (const p of next) if (p.active && !keep.includes(p.id)) keep.push(p.id);
    await persist({ products: next, settings: { ...settings, products: { ...(settings.products ?? {}), included: keep } } });
  };

  const onChange = async (next: Product[]) => {
    await saveProducts(next);
    toast('success', 'Products saved');
  };

  // ----- Export / Import -----
  const exportProducts = async () => {
    if (fileBusy) return;
    setFileBusy('export');
    try {
      downloadBlob(productsFilename(), exportProductsBlob(products));
      toast('success', `${productsFilename()} downloaded — ${products.length} product${products.length === 1 ? '' : 's'}.`, {
        message: 'Product master only (no orders). Reuse it on another computer via Import Products.',
      });
    } catch (e) {
      toast('error', 'Export failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setFileBusy(null);
    }
  };

  const pickImportFile = async (file: File) => {
    if (fileBusy) return;
    setFileBusy('import');
    try {
      const rows = await fileToRows(file);
      if (rows.length === 0) throw new Error('The file is empty.');
      const plan = planProductImport(products, rows);
      if (plan.actions.length === 0 && plan.problemCount === 0) {
        const headerText = rows[0]?.join(', ') || '(no header row)';
        throw new Error(`Required column missing: Product Name or SKU. Found header: ${headerText}`);
      }
      setPendingPlan(plan);
      setPendingName(file.name);
    } catch (e) {
      toast('error', 'Could not read that file', { message: e instanceof Error ? e.message : 'Use an exported products .xlsx or .csv file.' });
    } finally {
      setFileBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doImport = async () => {
    if (!pendingPlan) return;
    setFileBusy('import');
    try {
      const next = applyProductImport(products, pendingPlan);
      const newIds = new Set(next.filter((p) => !products.some((x) => x.id === p.id)).map((p) => p.id));
      const created = newIds.size;
      await saveProducts(next);
      setEditorKey((k) => k + 1); // remount the editor so fresh values show
      toast('success', `${next.length} products stored successfully.`, {
        message: `${pendingPlan.newCount} new product${pendingPlan.newCount === 1 ? '' : 's'} created${created === pendingPlan.newCount ? '' : ` (${created} reusing original ids)`} · ${pendingPlan.updateCount} existing updated${pendingPlan.duplicateCount ? ` · ${pendingPlan.duplicateCount} duplicate rows skipped` : ''}${pendingPlan.problemCount ? ` · ${pendingPlan.problemCount} rows skipped` : ''}.`,
      });
      setPendingPlan(null);
    } catch (e) {
      toast('error', 'Import failed', { message: e instanceof Error ? e.message : undefined });
    } finally {
      setFileBusy(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="sub">Products you sell — each one gets a “<b>Name Qty</b>” column in the spreadsheet and prints on labels with its quantity.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickImportFile(f); else e.target.value = ''; }}
          />
          <Button variant="outline" icon={<IconUpload width={14} />} disabled={fileBusy !== null} onClick={() => fileRef.current?.click()}>
            {fileBusy === 'import' ? <span className="spinner" /> : 'Import Products'}
          </Button>
          <Button variant="primary" icon={<IconDownload width={14} />} disabled={fileBusy !== null} onClick={() => void exportProducts()}>
            {fileBusy === 'export' ? <span className="spinner" /> : 'Export Products'}
          </Button>
        </div>
      </div>
      <Card>
        <ProductTableEditor
          key={editorKey}
          products={products}
          onChange={(next) => void onChange(next)}
          spreadsheetColumnIds={included}
          onToggleSpreadsheetColumn={(id, inc) => void toggleColumn(id, inc)}
        />
      </Card>
      <p className="hint" style={{ marginTop: 10 }}>
        Product order = the order shown in the picker, Excel, dashboard Product Sales and (for new columns) the spreadsheet — drag the <b>≡</b> handle or use <b>↑/↓</b> on the Products page.
        Columns such as <span className="code-chip">Night Cream Qty</span> are added to the connected spreadsheet only for products whose checkbox is on. New orders always write <b>0</b> for products not in the order.
      </p>
      <p className="hint">
        💡 <b>Export Products</b> downloads <span className="mono">products-YYYY-MM-DD.xlsx</span> (real Excel file, product master only). <b>Import Products</b> matches existing products by <b>SKU → Product ID → Name</b> and updates them — it never creates duplicates. Historical order lines are never changed.
      </p>
      <p className="hint">
        💡 Tip: disable the checkbox to keep a discontinued product in the catalogue (so old labels still resolve) without new spreadsheet columns.
      </p>
      {!settings.spreadsheet.connected && !settings.demoMode && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => go('settings')}>
          Connect spreadsheet first → every Save Order will sync these columns
        </button>
      )}

      {/* Import preview — nothing is stored before the confirm */}
      <Modal open={Boolean(pendingPlan)} onClose={() => setPendingPlan(null)} title={`Review products (${pendingName})`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingPlan(null)}>Cancel</Button>
            <Button variant="primary" disabled={fileBusy === 'import' || (pendingPlan?.actions.length ?? 0) === 0} onClick={() => void doImport()}>
              {fileBusy === 'import' ? <span className="spinner" /> : `Import ${(pendingPlan?.newCount ?? 0) + (pendingPlan?.updateCount ?? 0)} Product${(pendingPlan?.newCount ?? 0) + (pendingPlan?.updateCount ?? 0) === 1 ? '' : 's'}`}
            </Button>
          </>
        }>
        {pendingPlan && (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 6px' }}>
              <b>Products Found:</b> {pendingPlan.newCount + pendingPlan.updateCount + pendingPlan.duplicateCount}{' '}
              · <b>New:</b> {pendingPlan.newCount} · <b>Existing to Update:</b> {pendingPlan.updateCount} · <b>Duplicates:</b> {pendingPlan.duplicateCount}
            </p>
            {pendingPlan.problemCount > 0 && (
              <p className="hint" style={{ margin: '0 0 6px' }}>{pendingPlan.problemCount} row{pendingPlan.problemCount === 1 ? '' : 's'} skipped (no name/SKU).</p>
            )}
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="tbl" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr><th>Product Name</th><th>SKU</th><th className="num">Price</th><th>Label Name</th><th>Status</th><th className="num">Position</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {pendingPlan.actions.slice(0, 12).map((a, i) => (
                    <tr key={i}>
                      <td>{a.view.name}</td>
                      <td className="mono">{a.view.sku || '—'}</td>
                      <td className="num">{a.view.price > 0 ? `₹${a.view.price}` : '—'}</td>
                      <td>{a.view.labelName || '—'}</td>
                      <td>{a.view.active ? 'Active' : 'Inactive'}</td>
                      <td className="num">{a.row?.position || '—'}</td>
                      <td>{a.action === 'new' ? <span style={{ color: 'var(--secondary)', fontWeight: 700 }}>New</span> : a.action === 'update' ? <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Update</span> : <span className="muted">duplicate</span>}</td>
                    </tr>
                  ))}
                  {pendingPlan.actions.length > 12 && <tr><td colSpan={7} className="muted small">… and {pendingPlan.actions.length - 12} more</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ margin: '8px 0 0' }}>
              Matching: SKU → Product ID → Name. Existing products are updated in place (internal IDs kept — orders are safe); the displayed product order is preserved.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
