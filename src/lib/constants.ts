import type {
  FieldType,
  FieldValueKind,
  LabelSizeId,
  Order,
  OrderStatusValue,
  PaymentMethodValue,
  PaymentStatusValue,
  Product,
  Settings,
} from '../types';

export const APP_NAME = 'Order Label Manager';

// --- Design tokens (kept in sync with styles/design.css) --------------------
export const COLORS = {
  primary: '#F66916',
  secondary: '#0987D1',
  text: '#0F172A',
  muted: '#64748B',
  bg: '#F7F9FC',
  border: '#E7EDF5',
  white: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
};

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry',
  'Chandigarh', 'Andaman & Nicobar Islands', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep',
];

export const PAYMENT_STATUSES: PaymentStatusValue[] = ['Paid', 'COD', 'Pending', 'Failed', 'Refunded'];
export const PAYMENT_METHODS: PaymentMethodValue[] = ['UPI', 'Cash', 'Bank Transfer', 'Card', 'COD', 'Other'];
export const ORDER_STATUSES: OrderStatusValue[] = [
  'New', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned',
];
export const PRINTED_STATUSES = ['Not Printed', 'Printed'] as const;
/** The statuses included by the "Print New Orders" shortcut */
export const NEW_ORDER_STATUSES = ['New'] as const;

// --- Label sizes -------------------------------------------------------------
export const LABEL_SIZES = {
  '4x6': { id: '4x6' as LabelSizeId, label: '4 × 6 inch (101.6 × 152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  a6: { id: 'a6' as LabelSizeId, label: 'A6 (105 × 148 mm)', widthMm: 105, heightMm: 148 },
  '100x150': { id: '100x150' as LabelSizeId, label: '100 × 150 mm', widthMm: 100, heightMm: 150 },
  a4: { id: 'a4' as LabelSizeId, label: 'A4 (full page)', widthMm: 210, heightMm: 297 },
  custom: { id: 'custom' as LabelSizeId, label: 'Custom', widthMm: 100, heightMm: 150 },
} as const;

// --- Field types -------------------------------------------------------------
export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio' },
  { value: 'currency', label: 'Currency (₹)' },
  { value: 'product', label: 'Product' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'paymentStatus', label: 'Payment Status' },
  { value: 'orderStatus', label: 'Order Status' },
];

export const DEFAULT_FIELD_TYPES: Record<string, FieldType> = {
  'Order Number': 'text',
  'Customer Name': 'text',
  'WhatsApp Number': 'phone',
  'Mobile Number': 'phone',
  Address: 'textarea',
  City: 'text',
  State: 'dropdown',
  Pincode: 'text',
  'Payment Status': 'paymentStatus',
  'Payment Method': 'dropdown',
  'Transaction ID': 'text',
  'Payment Amount': 'currency',
  'Order Status': 'orderStatus',
  Notes: 'textarea',
};

export const FIELD_KEY_HINTS: Record<string, FieldValueKind | undefined> = {
  'Order Number': 'orderNumber',
  'Customer Name': 'customerName',
  'WhatsApp Number': 'customerWhatsapp',
  'Mobile Number': 'customerMobile',
  Address: 'customerAddress',
  City: 'customerCity',
  State: 'customerState',
  Pincode: 'customerPincode',
  'Payment Status': 'paymentStatus',
  'Payment Method': 'paymentMethod',
  'Transaction ID': 'transactionId',
  'Payment Amount': 'paymentAmount',
  'Order Status': 'orderStatus',
  Notes: 'notes',
};

// --- Defaults ----------------------------------------------------------------
export const DEFAULT_BUSINESS_NAME = 'My Business';

export function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultSettings(): Settings {
  return {
    business: {
      name: DEFAULT_BUSINESS_NAME,
      phone: '',
      whatsapp: '',
      email: '',
      address: '',
      gst: '',
      website: '',
      logoDataUrl: '',
    },
    spreadsheet: {
      provider: 'google',
      connected: false,
      connection: null,
    },
    order: {
      prefix: 'ORD-',
      startNumber: 1001,
      padding: 0,
      autoNumber: true,
      manualNumbering: false,
      defaultPaymentStatus: 'Pending',
      defaultOrderStatus: 'New',
    },
    products: {},
    labels: {
      sizeId: '4x6',
      widthMm: 101.6,
      heightMm: 152.4,
      showBusinessHeader: true,
      showCustomer: true,
      showAddress: true,
      showProducts: true,
      showPayment: true,
      showOrderNumber: true,
      showQrCode: true,
      showBarcode: false,
      showFooter: true,
      footerText: 'Thank you for your order!',
      showLogo: true,
      logoWidth: 96,
      fontFamily: 'Inter',
      fontSize: 13,
      // empty = every part follows the global font size; per-part values can
      // be added to override it
      fontSizes: {},
    },
    labelFields: [],
    mappings: {},
    includedFields: [],
    delivery: { defaultCharge: 0, rules: [] },
    matching: { rules: [] },
    printUpdatesStatus: true,
    demoMode: false,
    clipboardParsing: true,
  };
}

export const DEFAULT_DEMO_PRODUCTS: Product[] = [
  { id: 'prod-night-cream', name: 'Night Cream', sku: 'NC001', price: 499, labelName: 'Night Cream', active: true, createdAt: Date.now() },
  { id: 'prod-day-cream', name: 'Day Cream', sku: 'DC001', price: 449, labelName: 'Day Cream', active: true, createdAt: Date.now() },
  { id: 'prod-face-serum', name: 'Face Serum', sku: 'FS001', price: 699, labelName: 'Face Serum', active: true, createdAt: Date.now() },
  { id: 'prod-sunscreen', name: 'Sunscreen', sku: 'SS001', price: 549, labelName: 'Sunscreen', active: true, createdAt: Date.now() },
  { id: 'prod-face-wash', name: 'Face Wash', sku: 'FW001', price: 349, labelName: 'Face Wash', active: true, createdAt: Date.now() },
];

/** Columns the demo / sample spreadsheet starts with */
export const DEMO_COLUMNS = [
  'Order Number', 'Customer Name', 'WhatsApp Number', 'Mobile Number', 'Address', 'City', 'State',
  'Pincode', 'Products', 'Payment Status', 'Payment Method', 'Payment Amount', 'Order Status',
  'Night Cream Qty', 'Day Cream Qty', 'Face Serum Qty', 'Sunscreen Qty', 'Face Wash Qty',
  'Delivery Charge', 'Total', 'Previous Order Number', 'Label Status', 'Printed At', 'Created At', 'Updated At',
];

export function demoOrders(): Order[] {
  const now = Date.now();
  const mk = (
    orderNumber: string, name: string, wa: string, mobile: string, city: string, products: [string, number][],
    paymentStatus: PaymentStatusValue, total: number, createdOffsetMs: number, printed = false,
  ): Order => {
    const lines = new Date(now - createdOffsetMs).toISOString();
    const id = `demo-${orderNumber.toLowerCase()}`;
    return {
      id,
      orderNumber,
      customer: {
        name, whatsapp: wa, mobile,
        address: `${Math.floor(Math.random() * 900) + 10} Main Road`, city,
        state: 'Gujarat', pincode: '380001',
      },
      products: Object.fromEntries(
        products.map(([pid, qty]) => {
          const p = DEFAULT_DEMO_PRODUCTS.find((x) => x.id === pid)!;
          return [
            pid,
            { productId: pid, productName: p.name, sku: p.sku, quantity: qty, price: p.price, labelName: p.labelName },
          ];
        }),
      ),
      paymentStatus,
      paymentMethod: paymentStatus === 'COD' ? 'COD' : 'UPI',
      transactionId: paymentStatus === 'COD' ? '' : `TXN${Math.floor(Math.random() * 900000) + 100000}`,
      paymentAmount: '',
      orderStatus: 'New',
      notes: '',
      totalAmount: total,
      printed: printed ? 'Printed' : 'Not Printed',
      printedAt: printed ? now - createdOffsetMs + 3600_000 : null,
      createdAt: now - createdOffsetMs,
      updatedAt: now - createdOffsetMs,
      spreadsheetRow: undefined,
      syncedAt: null,
      customFields: {},
    };
  };
  return [
    mk('ORD-1001', 'Rahul Patel', '9876543210', '9876543210', 'Ahmedabad', [['prod-night-cream', 2]], 'Paid', 998, 0),
    mk('ORD-1002', 'Priya Shah', '9988776655', '9988776655', 'Surat', [['prod-night-cream', 1], ['prod-face-serum', 1]], 'COD', 1198, 2 * 3600_000),
    mk('ORD-1003', 'Amit Desai', '9999999999', '9999999999', 'Vadodara', [['prod-day-cream', 2], ['prod-sunscreen', 1]], 'Paid', 1447, 6 * 3600_000),
    mk('ORD-1004', 'Neha Gupta', '9123456780', '9123456780', 'Rajkot', [['prod-face-wash', 2], ['prod-night-cream', 1]], 'Pending', 1197, 26 * 3600_000),
  ];
}

/** Maps a row of the demo sheet back to an order (for the Orders page in demo mode). */
export function demoOrderNumber(n: number): string {
  return `${defaultSettings().order.prefix}${defaultSettings().order.startNumber + n - 1}`;
}

export const CURRENCY_SYMBOL = '₹';

export function formatMoney(n: number): string {
  return `${CURRENCY_SYMBOL}${new Intl.NumberFormat('en-IN').format(n)}`;
}

export function formatDate(ts: number | null | undefined, includeTime = false): string {
  if (!ts) return '—';
  const d = new Date(ts);
  try {
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    if (!includeTime) return date;
    return `${date}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
