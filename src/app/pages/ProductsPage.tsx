// ---------------------------------------------------------------------------
// Products — catalogue management with per-product spreadsheet qty columns
// ---------------------------------------------------------------------------
import { useAppStore, toast } from '../../store/appStore';
import type { Product } from '../../types';
import { Card } from '../../components/ui';
import { ProductTableEditor } from '../../components/products/ProductTableEditor';

export function ProductsPage({ go }: { go: (r: string) => void }) {
  const products = useAppStore((s) => s.products);
  const settings = useAppStore((s) => s.settings);
  const persist = useAppStore((s) => s.persist);

  const included = settings.products?.included ?? products.filter((p) => p.active).map((p) => p.id);

  const toggleColumn = async (productId: string, include: boolean) => {
    const list = (included ?? []).filter((id) => id !== productId);
    if (include) list.push(productId);
    await persist({ settings: { ...settings, products: { ...(settings.products ?? {}), included: list } } });
    toast('success', include ? 'Column will be created on next save' : 'Column removed from future rows', { message: include ? 'Existing columns are never deleted.' : undefined });
  };

  const onChange = async (next: Product[]) => {
    const known = new Set(next.map((p) => p.id));
    const active = new Set(next.filter((p) => p.active).map((p) => p.id));
    const keep = (included ?? []).filter((id) => known.has(id) && active.has(id));
    for (const p of next) if (p.active && !keep.includes(p.id)) keep.push(p.id);
    await persist({ products: next, settings: { ...settings, products: { ...(settings.products ?? {}), included: keep } } });
    toast('success', 'Products saved');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <div className="sub">Products you sell — each one gets a “<b>Name Qty</b>” column in the spreadsheet and prints on labels with its quantity.</div>
        </div>
      </div>
      <Card>
        <ProductTableEditor
          products={products}
          onChange={(next) => void onChange(next)}
          spreadsheetColumnIds={included}
          onToggleSpreadsheetColumn={(id, inc) => void toggleColumn(id, inc)}
        />
      </Card>
      <p className="hint" style={{ marginTop: 10 }}>
        Columns such as <span className="code-chip">Night Cream Qty</span> are added to the connected spreadsheet only for products whose checkbox is on. New orders always write <b>0</b> for products not in the order.
      </p>
      <p className="hint">
        💡 Tip: disable the checkbox to keep a discontinued product in the catalogue (so old labels still resolve) without new spreadsheet columns.
      </p>
      {!settings.spreadsheet.connected && !settings.demoMode && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => go('settings')}>
          Connect spreadsheet first → every Save Order will sync these columns
        </button>
      )}
    </div>
  );
}
