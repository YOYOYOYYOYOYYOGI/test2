// ---------------------------------------------------------------------------
// Products export/import round-trip + duplicate protection
// ---------------------------------------------------------------------------
import { describe, expect, it, beforeAll } from 'vitest';
import { LS, storage } from '../src/services/storage';
import { DemoDriver } from '../src/services/spreadsheet/demoDriver';
import { makeDefaultSettingsWithTemplate } from '../src/services/config';
import { parseXlsxRows } from '../src/lib/tableImport';
import {
  applyProductImport,
  exportProductsBlob,
  planProductImport,
  productsFilename,
  productsSheetRows,
} from '../src/services/dataExchange';
import type { Product } from '../src/types';

beforeAll(async () => {
  DemoDriver.resetDemoGrid();
  await storage.area.clear();
  await storage.remove([LS.orders, LS.nextOrderNumber, LS.pendingOps, LS.sheetHeaders, LS.lastRow]);
});

const now = Date.now();
const base = (id: string, name: string, extra: Partial<Product> = {}): Product => ({
  id, name, sku: '', price: 0, active: true, createdAt: now,
  ...extra,
});

describe('Products export', () => {
  it('export filename carries the date and the sheet holds all product fields', async () => {
    const products: Product[] = [
      base('pr1', 'Night Cream', { sku: 'NC001', price: 500, labelName: 'NC', active: true, createdAt: 1 }),
      base('pr2', 'Face Serum', { sku: 'FS001', price: 699, labelName: 'Face Serum', active: false, createdAt: 2 }),
    ];
    expect(productsFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const blob = exportProductsBlob(products);
    const rows = await parseXlsxRows(await blob.arrayBuffer());
    expect(rows[0]).toEqual(['Product ID', 'Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position', 'Created At']);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['pr1', 'Night Cream', 'NC001', '500', 'NC', 'Active', '1', '1970-01-01']);
    expect(rows[2][0]).toBe('pr2');
    expect(rows[2][1]).toBe('Face Serum');
    expect(rows[2][6]).toBe('2'); // position = array index 1-based
    expect(rows[2][7]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('price stays a plain string (no scientific notation) for long order numbers / phones', async () => {
    const rows = productsSheetRows([
      base('pr1', 'Long Number Kit', { sku: '14031', price: 499, createdAt: 1 }),
      base('pr2', 'Phone Product', { price: 699, createdAt: 1 }),
    ]);
    expect(rows[1][2]).toBe('14031');
  });
});

describe('Products import — round-trip, update and duplicate protection', () => {
  const products: Product[] = [
    base('pr1', 'Night Cream', { sku: 'NC001', price: 500, active: true }),
    base('pr2', 'Face Serum', { sku: 'FS001', price: 699, active: true }),
  ];

  it('re-importing the exported file changes nothing (idempotent)', async () => {
    const blob = exportProductsBlob(products);
    const rows = await parseXlsxRows(await blob.arrayBuffer());
    const plan = planProductImport(products, rows);
    expect(plan.actions.filter((a) => a.action === 'update').length).toBe(2);
    expect(plan.actions.filter((a) => a.action === 'new').length).toBe(0);
    const next = applyProductImport(products, plan);
    expect(next).toEqual(products);
  });

  it('single row updates Night Cream 500 → 550 — no duplicate is created', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position', 'Created At'],
      ['', 'Night Cream', 'NC001', '550', '', '', '', ''],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.newCount).toBe(0);
    expect(plan.updateCount).toBe(1);
    expect(plan.duplicateCount).toBe(0);
    const next = applyProductImport(products, plan);
    expect(next).toHaveLength(2); // no duplicate
    const nc = next.find((p) => p.id === 'pr1');
    expect(nc?.price).toBe(550);
    expect(nc?.name).toBe('Night Cream');
  });

  it('a repeated row in the same file counts as duplicate and is skipped', async () => {
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position'],
      ['Night Cream', 'NC001', '600', '', 'Active', ''],
      ['Night Cream', 'NC001', '600', '', 'Active', ''],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.duplicateCount).toBe(1);
    expect(plan.updateCount).toBe(1);
    const next = applyProductImport(products, plan);
    expect(next.find((p) => p.id === 'pr1')?.price).toBe(600);
    expect(next).toHaveLength(2);
  });

  it('optional cells missing from the row never erase current data', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'SKU', 'Price', 'Label Name', 'Status', 'Position'],
      ['', 'Night Cream', 'NC001', '', '', 'Inactive', ''],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.updateCount).toBe(1);
    const next = applyProductImport(products, plan);
    const nc = next.find((p) => p.id === 'pr1');
    expect(nc?.price).toBe(500); // untouched
    expect(nc?.active).toBe(false); // Status WAS present → applies
  });

  it('price blanks keep the old price (treats the header column as absent)', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'SKU', 'Label Name', 'Status', 'Position'],
      ['', 'Night Cream', 'NC001', '', '', ''],
    ];
    const plan = planProductImport(products, rows);
    const next = applyProductImport(products, plan);
    expect(next.find((p) => p.id === 'pr1')?.price).toBe(500);
  });

  it('update keeps the internal id and the catalogue order', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'SKU', 'Price'],
      ['', 'Night Cream', 'NC001', '550'],
    ];
    const next = applyProductImport(products, planProductImport(products, rows));
    expect(next[0].id).toBe('pr1');
    expect(next[1].id).toBe('pr2');
  });

  it('new rows are created; status Active by default; price column absent is fine', async () => {
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Status', 'Position'],
      ['Sunscreen SPF50', 'SUN001', 'Active', '5'],
      ['Lip Balm', 'LB002', 'Inactive', '6'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.newCount).toBe(2);
    expect(plan.updateCount).toBe(0);
    const next = applyProductImport(products, plan);
    expect(next).toHaveLength(4);
    const sun = next.find((p) => p.sku === 'SUN001');
    expect(sun?.name).toBe('Sunscreen SPF50');
    expect(sun?.active).toBe(true);
    expect(sun?.price).toBe(0);
    expect(sun?.createdAt).toBeDefined();
    const lip = next.find((p) => p.sku === 'LB002');
    expect(lip?.active).toBe(false);
    // existing products keep their exact positions; new rows are appended in file order
    expect(next.map((p) => p.id)).toEqual(['pr1', 'pr2', sun!.id, lip!.id]);
  });

  it('when the file id collides with an existing different product, a fresh id is generated', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'SKU', 'Price'],
      ['pr2', 'Shampoo', 'SH001', '299'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.newCount).toBe(1);
    const next = applyProductImport(products, plan);
    const shampoo = next.find((p) => p.sku === 'SH001');
    expect(shampoo).toBeDefined();
    expect(shampoo?.id).not.toBe('pr2'); // collision → regenerated
    // and the original pr2 is untouched (not matched by that foreign id)
    expect(next.filter((p) => p.name === 'Face Serum')).toHaveLength(1);
  });

  it('case/whitespace-insensitive matching still finds the product', async () => {
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Price'],
      ['  night   cream ', ' nc001 ', '425'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.updateCount).toBe(1);
    const next = applyProductImport(products, plan);
    expect(next.find((p) => p.id === 'pr1')?.price).toBe(425);
    // no accidental new product
    expect(next).toHaveLength(2);
  });

  it('row without name and SKU is a problem row, nothing changes', async () => {
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Price'],
      ['', '', '100'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.problemCount).toBe(1);
    const next = applyProductImport(products, plan);
    expect(next).toEqual(products);
  });

  it('applies multiple rows in one pass: 2 updates + 1 new', async () => {
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Price', 'Status'],
      ['Night Cream', 'NC001', '575', 'Active'],
      ['Face Serum', 'FS001', '725', 'Active'],
      ['New Toner', 'TN001', '350', 'Active'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.newCount).toBe(1);
    expect(plan.updateCount).toBe(2);
    const next = applyProductImport(products, plan);
    expect(next).toHaveLength(3);
    expect(next.find((p) => p.id === 'pr1')?.price).toBe(575);
    expect(next.find((p) => p.id === 'pr2')?.price).toBe(725);
    expect(next.find((p) => p.name === 'New Toner')).toBeDefined();
  });

  it('matches by Product ID when SKU column is missing', async () => {
    const rows: string[][] = [
      ['Product ID', 'Product Name', 'Price'],
      ['pr2', 'Face Serum', '750'],
    ];
    const plan = planProductImport(products, rows);
    expect(plan.updateCount).toBe(1);
    const next = applyProductImport(products, plan);
    expect(next.find((p) => p.id === 'pr2')?.price).toBe(750);
    expect(next).toHaveLength(2);
  });

  it('never creates a duplicate of a product whose SKU matches after case folding', async () => {
    const prods = [base('pr1', 'Night Cream', { sku: 'nc001', price: 500, active: true })];
    const rows: string[][] = [
      ['Product Name', 'SKU', 'Price'],
      ['night cream', 'NC001', '540'],
    ];
    const next = applyProductImport(prods, planProductImport(prods, rows));
    expect(next).toHaveLength(1);
    expect(next[0].price).toBe(540);
  });
});
