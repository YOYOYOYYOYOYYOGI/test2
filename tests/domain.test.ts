// ---------------------------------------------------------------------------
// WhatsApp clipboard parser + validators + label model tests
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { parseWhatsAppMessage } from '../src/lib/whatsappParser';
import { validatePhone, validatePincode, validateEmail, normalizePhone, computeTotal } from '../src/lib/format';
import { buildLabelModel } from '../src/components/label/labelModel';
import { defaultSettings, makeId } from '../src/lib/constants';
import type { Order, OrderField } from '../src/types';

describe('whatsapp parser', () => {
  it('parses a labeled message', () => {
    const r = parseWhatsAppMessage(`Customer: Rahul Patel
WhatsApp: 9876543210
Address: 123 Main Road
City: Ahmedabad
Pincode: 380001
Product: Night Cream x2
Product: Face Serum x1
Payment Status: Paid`);
    expect(r.customer?.name).toBe('Rahul Patel');
    expect(r.customer?.whatsapp).toBe('9876543210');
    expect(r.customer?.city).toBe('Ahmedabad');
    expect(r.customer?.pincode).toBe('380001');
    expect(r.products).toEqual([
      { name: 'Night Cream', quantity: 2 },
      { name: 'Face Serum', quantity: 1 },
    ]);
    expect(r.payment?.status).toBe('Paid');
    expect(r.matched.length).toBeGreaterThanOrEqual(4);
  });

  it('parses compact product lines without labels', () => {
    const r = parseWhatsAppMessage('Rahul\nNight Cream x2\nFace Serum x1\npaid');
    expect(r.products?.length).toBe(2);
  });

  it('rejects gibberish', () => {
    const r = parseWhatsAppMessage('lorem ipsum dolor sit amet');
    expect(r.matched.length).toBe(0);
  });
});

describe('validators', () => {
  it('accepts Indian mobile numbers in several formats', () => {
    expect(validatePhone('9876543210')).toBeNull();
    expect(validatePhone('+91 98765 43210')).toBeNull();
    expect(validatePhone('0 98765 43210')).toBeNull();
  });
  it('rejects invalid numbers', () => {
    expect(validatePhone('12345')).toMatch(/10|15/);
    expect(validatePhone('1234567890')).toMatch(/valid/); // starts with 1
  });
  it('normalizes numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210');
  });
  it('validates pincodes and emails', () => {
    expect(validatePincode('380001')).toBeNull();
    expect(validatePincode('38001')).toBeTruthy();
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('nope')).toBeTruthy();
  });
  it('computes totals from product lines', () => {
    const products = {
      a: { quantity: 2, price: 499 },
      b: { quantity: 1, price: 699 },
    };
    expect(computeTotal(products)).toBe(1697);
  });
});

describe('label model', () => {
  const f = (name: string, key: string): OrderField => ({
    id: makeId(), name, type: key === 'customerAddress' ? 'textarea' : 'text', required: true, key, order: 0,
  });
  const mkOrder = (): Order => ({
    id: makeId(),
    orderNumber: 'ORD-1001',
    customer: {
      name: 'Rahul Patel', whatsapp: '9876543210', mobile: '9876543210',
      address: '123 Main Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380001',
    },
    products: {
      'p-night': { productId: 'p-night', productName: 'Night Cream', quantity: 2, price: 499 },
      'p-serum': { productId: 'p-serum', productName: 'Face Serum', quantity: 1, price: 699 },
    },
    paymentStatus: 'Paid',
    paymentMethod: 'UPI',
    transactionId: '',
    paymentAmount: '',
    orderStatus: 'New',
    notes: '',
    totalAmount: 1697,
    printed: 'Not Printed',
    printedAt: null,
    createdAt: 0,
    updatedAt: 0,
  });

  it('lists every product with its quantity', () => {
    const settings = defaultSettings();
    const fields = [
      f('Order Number', 'orderNumber'),
      f('Customer Name', 'customerName'),
      f('WhatsApp Number', 'customerWhatsapp'),
      f('Mobile Number', 'customerMobile'),
      f('Address', 'customerAddress'),
      f('Payment Status', 'paymentStatus'),
    ];
    settings.labelFields = fields.map((x) => x.id);
    const m = buildLabelModel(mkOrder(), settings, fields);
    expect(m.products).toHaveLength(2);
    expect(m.products[0].quantity).toBe(2);
    expect(m.products[1].quantity).toBe(1);
    expect(m.customerName).toBe('Rahul Patel');
    expect(m.address.join(' ')).toContain('Gujarat');
    expect(m.payment.status).toBe('Paid');
    // WhatsApp + Mobile are rows; Address is folded into the address block
    expect(m.lines.map((l) => l.label)).toContain('WhatsApp');
  });
});
